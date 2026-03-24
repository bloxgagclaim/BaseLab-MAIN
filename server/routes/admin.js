const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { handleValidation } = require('../middleware/validate');

router.use(requireAuth);
router.use(adminOnly);

router.get('/dashboard', (req, res) => {
  try {
    const totalOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status != 'cancelled'").get().cnt;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(total), 0) as rev FROM orders WHERE status IN ('paid','processing','shipped','delivered')").get().rev;
    const pendingOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'pending'").get().cnt;
    const totalUsers = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'").get().cnt;
    const totalProducts = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE in_stock = 1").get().cnt;

    const recentOrders = db.prepare(`
      SELECT o.uuid, o.total, o.status, o.created_at, o.payment_method,
        u.email as user_email,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC LIMIT 5
    `).all();

    const topProducts = db.prepare(`
      SELECT oi.name, oi.sku, p.category, p.price,
        SUM(oi.qty) as units_sold,
        ROUND(SUM(oi.price * oi.qty), 2) as revenue
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY oi.sku
      ORDER BY units_sold DESC LIMIT 5
    `).all();

    res.json({
      totalOrders,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      pendingOrders,
      totalUsers,
      totalProducts,
      recentOrders: recentOrders.map(o => ({
        uuid: o.uuid,
        total: o.total,
        status: o.status,
        createdAt: o.created_at,
        paymentMethod: o.payment_method,
        userEmail: o.user_email || 'Guest',
        itemCount: o.item_count,
      })),
      topProducts: topProducts.map(p => ({
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        unitsSold: p.units_sold,
        revenue: p.revenue,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/users', (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let where = [];
    const params = [];

    if (search) {
      where.push('(email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (role) {
      where.push('role = ?');
      params.push(role);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM users ${whereClause}`).get(...params).cnt;
    const pages = Math.ceil(total / limitNum);

    const users = db.prepare(`
      SELECT id, uuid, email, first_name, last_name, company, phone, role, is_verified, created_at
      FROM users ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      users: users.map(u => ({
        id: u.id,
        uuid: u.uuid,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        company: u.company,
        phone: u.phone,
        role: u.role,
        isVerified: !!u.is_verified,
        createdAt: u.created_at,
      })),
      total,
      page: pageNum,
      pages,
    });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { role, isVerified } = req.body;
    const fields = [];
    const values = [];

    if (role !== undefined) {
      if (!['customer', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      fields.push('role = ?');
      values.push(role);
    }

    if (isVerified !== undefined) {
      fields.push('is_verified = ?');
      values.push(isVerified ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push("updated_at = datetime('now')");
    values.push(user.id);

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT id, uuid, email, first_name, last_name, role, is_verified FROM users WHERE id = ?').get(user.id);
    res.json({
      id: updated.id,
      uuid: updated.uuid,
      email: updated.email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      role: updated.role,
      isVerified: !!updated.is_verified,
    });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.get('/promo-codes', (req, res) => {
  try {
    const codes = db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
    res.json(codes.map(c => ({
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value,
      minOrder: c.min_order,
      maxUses: c.max_uses,
      uses: c.uses,
      expiresAt: c.expires_at,
      isActive: !!c.is_active,
      createdAt: c.created_at,
    })));
  } catch (err) {
    console.error('Get promo codes error:', err);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});

router.post('/promo-codes', [
  body('code').trim().notEmpty().withMessage('Code is required'),
  body('type').isIn(['percent', 'fixed']).withMessage('Type must be percent or fixed'),
  body('value').isFloat({ min: 0 }).withMessage('Value must be positive'),
], handleValidation, (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses, expiresAt } = req.body;

    const existing = db.prepare('SELECT id FROM promo_codes WHERE code = ?').get(code);
    if (existing) {
      return res.status(409).json({ error: 'Promo code already exists' });
    }

    const result = db.prepare(`
      INSERT INTO promo_codes (code, type, value, min_order, max_uses, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code.toUpperCase(), type, value, minOrder || 0, maxUses || null, expiresAt || null);

    const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      id: promo.id,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      minOrder: promo.min_order,
      maxUses: promo.max_uses,
      uses: promo.uses,
      expiresAt: promo.expires_at,
      isActive: !!promo.is_active,
    });
  } catch (err) {
    console.error('Create promo code error:', err);
    res.status(500).json({ error: 'Failed to create promo code' });
  }
});

router.patch('/promo-codes/:id', (req, res) => {
  try {
    const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!promo) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    const fields = [];
    const values = [];
    const allowed = ['code', 'type', 'value', 'minOrder', 'maxUses', 'expiresAt', 'isActive'];
    const colMap = { code: 'code', type: 'type', value: 'value', minOrder: 'min_order', maxUses: 'max_uses', expiresAt: 'expires_at', isActive: 'is_active' };

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${colMap[key]} = ?`);
        let val = req.body[key];
        if (key === 'isActive') val = val ? 1 : 0;
        if (key === 'code') val = val.toUpperCase();
        values.push(val);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(promo.id);
    db.prepare(`UPDATE promo_codes SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(promo.id);
    res.json({
      id: updated.id,
      code: updated.code,
      type: updated.type,
      value: updated.value,
      minOrder: updated.min_order,
      maxUses: updated.max_uses,
      uses: updated.uses,
      expiresAt: updated.expires_at,
      isActive: !!updated.is_active,
    });
  } catch (err) {
    console.error('Update promo code error:', err);
    res.status(500).json({ error: 'Failed to update promo code' });
  }
});

router.delete('/promo-codes/:id', (req, res) => {
  try {
    const promo = db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!promo) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    db.prepare('DELETE FROM promo_codes WHERE id = ?').run(promo.id);
    res.json({ message: 'Promo code deleted' });
  } catch (err) {
    console.error('Delete promo code error:', err);
    res.status(500).json({ error: 'Failed to delete promo code' });
  }
});

module.exports = router;
