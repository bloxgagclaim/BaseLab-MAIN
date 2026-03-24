const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { handleValidation } = require('../middleware/validate');

router.get('/', (req, res) => {
  try {
    const { category, search, sort, minPrice, maxPrice, minQty, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let where = ['in_stock = 1'];
    const params = [];

    if (category) {
      where.push('category = ?');
      params.push(category);
    }

    if (search) {
      where.push('(name LIKE ? OR description LIKE ? OR sku LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (minPrice) {
      where.push('price >= ?');
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      where.push('price <= ?');
      params.push(parseFloat(maxPrice));
    }

    if (minQty) {
      if (minQty === 'under12') {
        where.push('min_qty < 12');
      } else if (minQty === '12to24') {
        where.push('min_qty >= 12 AND min_qty <= 24');
      } else if (minQty === 'bundles') {
        where.push('min_qty = 1');
      }
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    let orderBy = 'sort_order ASC';
    switch (sort) {
      case 'price_asc': orderBy = 'price ASC'; break;
      case 'price_desc': orderBy = 'price DESC'; break;
      case 'savings': orderBy = '(original_price - price) DESC'; break;
      case 'name': orderBy = 'name ASC'; break;
      case 'featured':
      default: orderBy = 'sort_order ASC'; break;
    }

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM products ${whereClause}`).get(...params);
    const total = countRow.total;
    const pages = Math.ceil(total / limitNum);

    const products = db.prepare(`
      SELECT *,
        ROUND((original_price - price) / original_price * 100) as discount_percent,
        ROUND(original_price - price, 2) as savings_per_unit
      FROM products ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({ products, total, page: pageNum, limit: limitNum, pages });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:idOrSku', (req, res) => {
  try {
    const { idOrSku } = req.params;
    let product;

    if (/^\d+$/.test(idOrSku)) {
      product = db.prepare('SELECT *, ROUND((original_price - price) / original_price * 100) as discount_percent, ROUND(original_price - price, 2) as savings_per_unit FROM products WHERE id = ?').get(parseInt(idOrSku, 10));
    } else {
      product = db.prepare('SELECT *, ROUND((original_price - price) / original_price * 100) as discount_percent, ROUND(original_price - price, 2) as savings_per_unit FROM products WHERE sku = ?').get(idOrSku);
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.get('/:id/related', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const related = db.prepare(`
      SELECT *, ROUND((original_price - price) / original_price * 100) as discount_percent,
        ROUND(original_price - price, 2) as savings_per_unit
      FROM products
      WHERE category = ? AND id != ? AND in_stock = 1
      ORDER BY sort_order ASC LIMIT 4
    `).all(product.category, product.id);

    res.json({ products: related });
  } catch (err) {
    console.error('Get related error:', err);
    res.status(500).json({ error: 'Failed to fetch related products' });
  }
});

router.post('/', requireAuth, adminOnly, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('sku').trim().notEmpty().withMessage('SKU is required'),
  body('category').isIn(['glass', 'ceramic', 'metal', 'bundles', 'supplies', 'specialty']).withMessage('Invalid category'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('originalPrice').isFloat({ min: 0 }).withMessage('Original price must be a positive number'),
  body('minQty').isInt({ min: 1 }).withMessage('Min qty must be at least 1'),
], handleValidation, (req, res) => {
  try {
    const { name, sku, category, categoryLabel, price, originalPrice, minQty, unit, badge, badgeType, description, gradient, icon, inStock, sortOrder } = req.body;

    const existingSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
    if (existingSku) {
      return res.status(409).json({ error: 'SKU already exists' });
    }

    const result = db.prepare(`
      INSERT INTO products (sku, name, category, category_label, price, original_price, min_qty, unit, badge, badge_type, description, gradient, icon, in_stock, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sku, name, category, categoryLabel || category, price, originalPrice,
      minQty || 1, unit || 'ea', badge || null, badgeType || null,
      description || '', gradient || 'linear-gradient(135deg,#f8fafc,#e2e8f0)',
      icon || '📦', inStock !== undefined ? (inStock ? 1 : 0) : 1,
      sortOrder || 0
    );

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(product);
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.patch('/:id', requireAuth, adminOnly, (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const fields = [];
    const values = [];
    const allowedFields = {
      name: 'name', sku: 'sku', category: 'category', categoryLabel: 'category_label',
      price: 'price', originalPrice: 'original_price', minQty: 'min_qty', unit: 'unit',
      badge: 'badge', badgeType: 'badge_type', description: 'description', gradient: 'gradient',
      icon: 'icon', inStock: 'in_stock', sortOrder: 'sort_order',
    };

    for (const [key, col] of Object.entries(allowedFields)) {
      if (req.body[key] !== undefined) {
        fields.push(`${col} = ?`);
        let val = req.body[key];
        if (key === 'inStock') val = val ? 1 : 0;
        values.push(val);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push("updated_at = datetime('now')");
    values.push(parseInt(req.params.id, 10));

    db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id, 10));
    res.json(updated);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/:id', requireAuth, adminOnly, (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id, 10));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    db.prepare("UPDATE products SET in_stock = 0, updated_at = datetime('now') WHERE id = ?").run(parseInt(req.params.id, 10));
    res.json({ message: 'Product deactivated' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to deactivate product' });
  }
});

module.exports = router;
