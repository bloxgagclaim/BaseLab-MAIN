const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { softAuth } = require('../middleware/auth');

router.use(softAuth);

function getSessionId(req, res) {
  let sessionId = req.cookies?.blSessionId;
  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie('blSessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  return sessionId;
}

function getCartItems(userId, sessionId) {
  let items;
  if (userId) {
    items = db.prepare(`
      SELECT ci.id as cartItemId, ci.qty, ci.product_id,
        p.id, p.sku, p.name, p.category, p.category_label, p.price, p.original_price,
        p.min_qty, p.unit, p.badge, p.badge_type, p.description, p.gradient, p.icon, p.in_stock
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.user_id = ?
      ORDER BY ci.added_at DESC
    `).all(userId);
  } else {
    items = db.prepare(`
      SELECT ci.id as cartItemId, ci.qty, ci.product_id,
        p.id, p.sku, p.name, p.category, p.category_label, p.price, p.original_price,
        p.min_qty, p.unit, p.badge, p.badge_type, p.description, p.gradient, p.icon, p.in_stock
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.session_id = ?
      ORDER BY ci.added_at DESC
    `).all(sessionId);
  }

  return items.map(item => ({
    cartItemId: item.cartItemId,
    product: {
      id: item.product_id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      categoryLabel: item.category_label,
      price: item.price,
      originalPrice: item.original_price,
      minQty: item.min_qty,
      unit: item.unit,
      badge: item.badge,
      badgeType: item.badge_type,
      description: item.description,
      gradient: item.gradient,
      icon: item.icon,
      inStock: item.in_stock,
    },
    qty: item.qty,
    lineTotal: parseFloat((item.price * item.qty).toFixed(2)),
    lineSavings: parseFloat(((item.original_price - item.price) * item.qty).toFixed(2)),
  }));
}

function buildCartResponse(items) {
  const subtotal = parseFloat(items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
  const shipping = subtotal >= 200 ? 0 : 14.99;
  const tax = parseFloat((subtotal * 0.08).toFixed(2));
  const savings = parseFloat(items.reduce((s, i) => s + i.lineSavings, 0).toFixed(2));
  const total = parseFloat((subtotal + shipping + tax).toFixed(2));
  const itemCount = items.reduce((s, i) => s + i.qty, 0);

  return { items, subtotal, shipping, tax, savings, total, itemCount };
}

router.get('/', (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const items = getCartItems(req.user?.userId, sessionId);
    res.json(buildCartResponse(items));
  } catch (err) {
    console.error('Get cart error:', err);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

router.post('/items', (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const { productId, qty } = req.body;

    if (!productId || !qty || qty < 1) {
      return res.status(400).json({ error: 'Product ID and quantity are required' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND in_stock = 1').get(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found or out of stock' });
    }

    const effectiveQty = Math.max(qty, product.min_qty);

    if (req.user?.userId) {
      const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.userId, productId);
      if (existing) {
        db.prepare("UPDATE cart_items SET qty = qty + ?, added_at = datetime('now') WHERE id = ?").run(effectiveQty, existing.id);
      } else {
        db.prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)').run(req.user.userId, productId, effectiveQty);
      }
    } else {
      const existing = db.prepare('SELECT * FROM cart_items WHERE session_id = ? AND product_id = ?').get(sessionId, productId);
      if (existing) {
        db.prepare("UPDATE cart_items SET qty = qty + ?, added_at = datetime('now') WHERE id = ?").run(effectiveQty, existing.id);
      } else {
        db.prepare('INSERT INTO cart_items (session_id, product_id, qty) VALUES (?, ?, ?)').run(sessionId, productId, effectiveQty);
      }
    }

    const items = getCartItems(req.user?.userId, sessionId);
    res.json(buildCartResponse(items));
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

router.patch('/items/:productId', (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const productId = parseInt(req.params.productId, 10);
    const { qty } = req.body;

    if (!qty || qty < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const effectiveQty = Math.max(qty, product.min_qty);

    if (req.user?.userId) {
      db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?').run(effectiveQty, req.user.userId, productId);
    } else {
      db.prepare('UPDATE cart_items SET qty = ? WHERE session_id = ? AND product_id = ?').run(effectiveQty, sessionId, productId);
    }

    const items = getCartItems(req.user?.userId, sessionId);
    res.json(buildCartResponse(items));
  } catch (err) {
    console.error('Update cart error:', err);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

router.delete('/items/:productId', (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const productId = parseInt(req.params.productId, 10);

    if (req.user?.userId) {
      db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.userId, productId);
    } else {
      db.prepare('DELETE FROM cart_items WHERE session_id = ? AND product_id = ?').run(sessionId, productId);
    }

    const items = getCartItems(req.user?.userId, sessionId);
    res.json(buildCartResponse(items));
  } catch (err) {
    console.error('Remove from cart error:', err);
    res.status(500).json({ error: 'Failed to remove from cart' });
  }
});

router.delete('/', (req, res) => {
  try {
    const sessionId = getSessionId(req, res);

    if (req.user?.userId) {
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.userId);
    } else {
      db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);
    }

    res.json({ items: [], subtotal: 0, shipping: 14.99, tax: 0, savings: 0, total: 14.99, itemCount: 0 });
  } catch (err) {
    console.error('Clear cart error:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

router.post('/transfer', (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const sessionItems = db.prepare('SELECT * FROM cart_items WHERE session_id = ?').all(sessionId);

    for (const item of sessionItems) {
      const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.userId, item.product_id);
      if (existing) {
        db.prepare('UPDATE cart_items SET qty = qty + ? WHERE id = ?').run(item.qty, existing.id);
      } else {
        db.prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)').run(req.user.userId, item.product_id, item.qty);
      }
    }

    db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);

    const items = getCartItems(req.user.userId, null);
    res.json(buildCartResponse(items));
  } catch (err) {
    console.error('Transfer cart error:', err);
    res.status(500).json({ error: 'Failed to transfer cart' });
  }
});

module.exports = router;
