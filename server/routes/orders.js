const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { softAuth, requireAuth } = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { handleValidation } = require('../middleware/validate');
const { createCheckoutSession } = require('../utils/stripe');
const { sendOrderConfirmation } = require('../utils/email');

function generateOrderUuid() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'BL-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

router.post('/', softAuth, [
  body('shipping.firstName').trim().notEmpty().withMessage('First name is required'),
  body('shipping.lastName').trim().notEmpty().withMessage('Last name is required'),
  body('shipping.street').trim().notEmpty().withMessage('Street address is required'),
  body('shipping.city').trim().notEmpty().withMessage('City is required'),
  body('shipping.state').trim().notEmpty().withMessage('State is required'),
  body('shipping.zip').trim().notEmpty().withMessage('ZIP code is required'),
  body('shipping.email').isEmail().withMessage('Valid email is required'),
  body('paymentMethod').isIn(['card', 'paypal', 'net30']).withMessage('Invalid payment method'),
], handleValidation, async (req, res) => {
  try {
    const { shipping, paymentMethod, promoCode, notes } = req.body;

    const sessionId = req.cookies?.blSessionId;
    let cartItems;

    if (req.user?.userId) {
      cartItems = db.prepare(`
        SELECT ci.qty, p.* FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.user_id = ?
      `).all(req.user.userId);
    } else if (sessionId) {
      cartItems = db.prepare(`
        SELECT ci.qty, p.* FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.session_id = ?
      `).all(sessionId);
    } else {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const subtotal = parseFloat(cartItems.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2));
    const shippingCost = subtotal >= 200 ? 0 : 14.99;
    const tax = parseFloat((subtotal * 0.08).toFixed(2));
    let discount = 0;
    let validPromoCode = null;

    if (promoCode) {
      const promo = db.prepare("SELECT * FROM promo_codes WHERE code = ? AND is_active = 1").get(promoCode);
      if (promo) {
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
          return res.status(400).json({ error: 'Promo code has expired' });
        }
        if (promo.max_uses !== null && promo.uses >= promo.max_uses) {
          return res.status(400).json({ error: 'Promo code usage limit reached' });
        }
        if (subtotal < promo.min_order) {
          return res.status(400).json({ error: `Minimum order of $${promo.min_order.toFixed(2)} required for this code` });
        }

        if (promo.type === 'percent') {
          discount = parseFloat((subtotal * promo.value / 100).toFixed(2));
        } else {
          discount = promo.value;
        }
        validPromoCode = promo;
      } else {
        return res.status(400).json({ error: 'Invalid promo code' });
      }
    }

    const total = parseFloat((subtotal + shippingCost + tax - discount).toFixed(2));
    const retailValue = parseFloat(cartItems.reduce((s, i) => s + i.original_price * i.qty, 0).toFixed(2));
    const orderUuid = generateOrderUuid();

    const orderResult = db.prepare(`
      INSERT INTO orders (uuid, user_id, status, payment_method, subtotal, shipping_cost, tax, discount, promo_code, total, retail_value,
        ship_first_name, ship_last_name, ship_company, ship_street, ship_city, ship_state, ship_zip, ship_country, ship_email, ship_phone, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderUuid, req.user?.userId || null, 'pending', paymentMethod,
      subtotal, shippingCost, tax, discount, promoCode || null, total, retailValue,
      shipping.firstName, shipping.lastName, shipping.company || null,
      shipping.street, shipping.city, shipping.state, shipping.zip,
      shipping.country || 'US', shipping.email, shipping.phone || null, notes || null
    );

    const orderId = orderResult.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, sku, name, price, original_price, qty, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertItems = db.transaction((items) => {
      for (const item of items) {
        insertItem.run(orderId, item.id, item.sku, item.name, item.price, item.original_price, item.qty, item.unit);
      }
    });
    insertItems(cartItems);

    if (validPromoCode) {
      db.prepare('UPDATE promo_codes SET uses = uses + 1 WHERE id = ?').run(validPromoCode.id);
    }

    if (req.user?.userId) {
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.userId);
    } else if (sessionId) {
      db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

    sendOrderConfirmation(order, orderItems, req.user);

    if (paymentMethod === 'card' || paymentMethod === 'paypal') {
      try {
        const session = await createCheckoutSession(order, orderItems);
        db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(session.id, orderId);
        return res.status(201).json({ order: formatOrder(order), stripeUrl: session.url });
      } catch (stripeErr) {
        console.error('Stripe session error:', stripeErr.message);
        return res.status(201).json({ order: formatOrder(order), stripeError: 'Payment session could not be created. Please try again.' });
      }
    }

    res.status(201).json({ order: formatOrder(order) });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

function formatOrder(order) {
  return {
    uuid: order.uuid,
    status: order.status,
    paymentMethod: order.payment_method,
    subtotal: order.subtotal,
    shippingCost: order.shipping_cost,
    tax: order.tax,
    discount: order.discount,
    promoCode: order.promo_code,
    total: order.total,
    retailValue: order.retail_value,
    shipping: {
      firstName: order.ship_first_name,
      lastName: order.ship_last_name,
      company: order.ship_company,
      street: order.ship_street,
      city: order.ship_city,
      state: order.ship_state,
      zip: order.ship_zip,
      country: order.ship_country,
      email: order.ship_email,
      phone: order.ship_phone,
    },
    trackingNumber: order.tracking_number,
    notes: order.notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

router.get('/', requireAuth, (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let where = [];
    const params = [];

    if (req.user.role !== 'admin') {
      where.push('o.user_id = ?');
      params.push(req.user.userId);
    }

    if (status) {
      where.push('o.status = ?');
      params.push(status);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM orders o ${whereClause}`).get(...params);
    const total = countRow.total;
    const pages = Math.ceil(total / limitNum);

    const orders = db.prepare(`
      SELECT o.*, u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      orders: orders.map(o => ({
        ...formatOrder(o),
        userEmail: o.user_email,
        userFirstName: o.user_first_name,
        userLastName: o.user_last_name,
        itemCount: o.item_count,
      })),
      total,
      page: pageNum,
      pages,
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/:uuid', requireAuth, (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE uuid = ?').get(req.params.uuid);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (req.user.role !== 'admin' && order.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = db.prepare(`
      SELECT oi.*, p.gradient, p.icon, p.category
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(order.id);

    res.json({
      ...formatOrder(order),
      items: items.map(i => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        price: i.price,
        originalPrice: i.original_price,
        qty: i.qty,
        unit: i.unit,
        lineTotal: parseFloat((i.price * i.qty).toFixed(2)),
        gradient: i.gradient,
        icon: i.icon,
        category: i.category,
      })),
    });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

router.patch('/:uuid/status', requireAuth, adminOnly, [
  body('status').isIn(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).withMessage('Invalid status'),
], handleValidation, (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE uuid = ?').get(req.params.uuid);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { status, trackingNumber } = req.body;
    const updates = ["status = ?", "updated_at = datetime('now')"];
    const values = [status];

    if (trackingNumber !== undefined) {
      updates.push('tracking_number = ?');
      values.push(trackingNumber);
    }

    values.push(order.id);
    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    res.json(formatOrder(updated));
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

router.post('/:uuid/cancel', requireAuth, (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE uuid = ?').get(req.params.uuid);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (req.user.role !== 'admin') {
      if (order.user_id !== req.user.userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (order.status !== 'pending') {
        return res.status(400).json({ error: 'Only pending orders can be cancelled' });
      }
    }

    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(order.id);
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    res.json(formatOrder(updated));
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

module.exports = router;
