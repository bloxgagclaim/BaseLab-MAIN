require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

require('./db/database');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.APP_URL || 'http://localhost:3000', credentials: true }));

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many requests' } }));
app.use('/api', rateLimit({ windowMs: 1 * 60 * 1000, max: 120 }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart',     require('./routes/cart'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/stripe',   require('./routes/stripe'));

const db = require('./db/database');

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/newsletter', (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    db.prepare('INSERT OR IGNORE INTO newsletter (email) VALUES (?)').run(email.toLowerCase().trim());
    res.json({ message: 'Subscribed successfully!' });
  } catch (err) {
    console.error('Newsletter error:', err);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

app.post('/api/promo/validate', (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) {
      return res.status(400).json({ valid: false, message: 'Promo code is required' });
    }

    const promo = db.prepare("SELECT * FROM promo_codes WHERE code = ? AND is_active = 1").get(code.toUpperCase());
    if (!promo) {
      return res.json({ valid: false, message: 'Invalid promo code' });
    }

    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.json({ valid: false, message: 'Promo code has expired' });
    }

    if (promo.max_uses !== null && promo.uses >= promo.max_uses) {
      return res.json({ valid: false, message: 'Promo code usage limit reached' });
    }

    if (subtotal < promo.min_order) {
      return res.json({ valid: false, message: `Minimum order of $${promo.min_order.toFixed(2)} required` });
    }

    let discount = 0;
    if (promo.type === 'percent') {
      discount = parseFloat((subtotal * promo.value / 100).toFixed(2));
    } else {
      discount = promo.value;
    }

    res.json({
      valid: true,
      discount,
      type: promo.type,
      value: promo.value,
      message: promo.type === 'percent' ? `${promo.value}% off applied!` : `$${promo.value.toFixed(2)} off applied!`,
    });
  } catch (err) {
    console.error('Promo validate error:', err);
    res.status(500).json({ valid: false, message: 'Failed to validate promo code' });
  }
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BaseLab running → http://localhost:${PORT}`));
