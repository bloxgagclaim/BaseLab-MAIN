const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.use(requireAuth);

router.get('/me/addresses', (req, res) => {
  try {
    const addresses = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC').all(req.user.userId);
    res.json(addresses.map(a => ({
      id: a.id,
      firstName: a.first_name,
      lastName: a.last_name,
      company: a.company,
      street: a.street,
      city: a.city,
      state: a.state,
      zip: a.zip,
      country: a.country,
      isDefault: !!a.is_default,
      createdAt: a.created_at,
    })));
  } catch (err) {
    console.error('Get addresses error:', err);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

router.post('/me/addresses', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('street').trim().notEmpty().withMessage('Street is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('zip').trim().notEmpty().withMessage('ZIP code is required'),
], handleValidation, (req, res) => {
  try {
    const { firstName, lastName, company, street, city, state, zip, country, isDefault } = req.body;

    if (isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.userId);
    }

    const result = db.prepare(`
      INSERT INTO addresses (user_id, first_name, last_name, company, street, city, state, zip, country, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.userId, firstName, lastName, company || null, street, city, state, zip, country || 'US', isDefault ? 1 : 0);

    const address = db.prepare('SELECT * FROM addresses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      id: address.id,
      firstName: address.first_name,
      lastName: address.last_name,
      company: address.company,
      street: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip,
      country: address.country,
      isDefault: !!address.is_default,
    });
  } catch (err) {
    console.error('Add address error:', err);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

router.patch('/me/addresses/:id', (req, res) => {
  try {
    const address = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(parseInt(req.params.id, 10), req.user.userId);
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }

    const { firstName, lastName, company, street, city, state, zip, country, isDefault } = req.body;

    if (isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.userId);
    }

    const fields = [];
    const values = [];

    if (firstName !== undefined) { fields.push('first_name = ?'); values.push(firstName); }
    if (lastName !== undefined) { fields.push('last_name = ?'); values.push(lastName); }
    if (company !== undefined) { fields.push('company = ?'); values.push(company || null); }
    if (street !== undefined) { fields.push('street = ?'); values.push(street); }
    if (city !== undefined) { fields.push('city = ?'); values.push(city); }
    if (state !== undefined) { fields.push('state = ?'); values.push(state); }
    if (zip !== undefined) { fields.push('zip = ?'); values.push(zip); }
    if (country !== undefined) { fields.push('country = ?'); values.push(country); }
    if (isDefault !== undefined) { fields.push('is_default = ?'); values.push(isDefault ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(address.id);
    db.prepare(`UPDATE addresses SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM addresses WHERE id = ?').get(address.id);
    res.json({
      id: updated.id,
      firstName: updated.first_name,
      lastName: updated.last_name,
      company: updated.company,
      street: updated.street,
      city: updated.city,
      state: updated.state,
      zip: updated.zip,
      country: updated.country,
      isDefault: !!updated.is_default,
    });
  } catch (err) {
    console.error('Update address error:', err);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

router.delete('/me/addresses/:id', (req, res) => {
  try {
    const address = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(parseInt(req.params.id, 10), req.user.userId);
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }

    db.prepare('DELETE FROM addresses WHERE id = ?').run(address.id);
    res.json({ message: 'Address deleted' });
  } catch (err) {
    console.error('Delete address error:', err);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

router.get('/me/wishlist', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT w.id as wishlist_id, w.added_at, p.*,
        ROUND((p.original_price - p.price) / p.original_price * 100) as discount_percent,
        ROUND(p.original_price - p.price, 2) as savings_per_unit
      FROM wishlist w
      JOIN products p ON w.product_id = p.id
      WHERE w.user_id = ?
      ORDER BY w.added_at DESC
    `).all(req.user.userId);

    res.json(items);
  } catch (err) {
    console.error('Get wishlist error:', err);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

router.post('/me/wishlist', [
  body('productId').isInt().withMessage('Product ID is required'),
], handleValidation, (req, res) => {
  try {
    const { productId } = req.body;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    db.prepare('INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)').run(req.user.userId, productId);
    res.json({ added: true });
  } catch (err) {
    console.error('Add to wishlist error:', err);
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
});

router.delete('/me/wishlist/:productId', (req, res) => {
  try {
    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.user.userId, parseInt(req.params.productId, 10));
    res.json({ removed: true });
  } catch (err) {
    console.error('Remove from wishlist error:', err);
    res.status(500).json({ error: 'Failed to remove from wishlist' });
  }
});

router.get('/me/orders', (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let where = ['user_id = ?'];
    const params = [req.user.userId];

    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM orders ${whereClause}`).get(...params);
    const total = countRow.total;
    const pages = Math.ceil(total / limitNum);

    const orders = db.prepare(`
      SELECT *,
        (SELECT COUNT(*) FROM order_items WHERE order_id = orders.id) as item_count
      FROM orders ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      orders: orders.map(o => ({
        uuid: o.uuid,
        status: o.status,
        paymentMethod: o.payment_method,
        subtotal: o.subtotal,
        shippingCost: o.shipping_cost,
        tax: o.tax,
        discount: o.discount,
        total: o.total,
        itemCount: o.item_count,
        createdAt: o.created_at,
      })),
      total,
      page: pageNum,
      pages,
    });
  } catch (err) {
    console.error('Get user orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

module.exports = router;
