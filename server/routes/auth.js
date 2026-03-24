const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const db = require('../db/database');
const { signAccess, signRefresh, verifyRefresh } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { sendWelcomeEmail } = require('../utils/email');

function storeRefreshToken(userId, token) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt);
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function sanitizeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
], handleValidation, async (req, res) => {
  try {
    const { email, password, firstName, lastName, company } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userUuid = uuidv4();

    const result = db.prepare(`
      INSERT INTO users (uuid, email, password, first_name, last_name, company)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userUuid, email, hashedPassword, firstName, lastName, company || null);

    const userId = result.lastInsertRowid;
    const payload = { userId, uuid: userUuid, email, role: 'customer' };

    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);
    storeRefreshToken(userId, refreshToken);
    setRefreshCookie(res, refreshToken);

    sendWelcomeEmail({ email, first_name: firstName });

    res.status(201).json({
      user: { uuid: userUuid, email, firstName, lastName, role: 'customer' },
      accessToken,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], handleValidation, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = { userId: user.id, uuid: user.uuid, email: user.email, role: user.role };

    const accessToken = signAccess(payload);
    const refreshToken = signRefresh(payload);
    storeRefreshToken(user.id, refreshToken);
    setRefreshCookie(res, refreshToken);

    res.json({
      user: { uuid: user.uuid, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role },
      accessToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    let decoded;
    try {
      decoded = verifyRefresh(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime(\'now\')').get(token);
    if (!stored) {
      return res.status(401).json({ error: 'Refresh token expired or revoked' });
    }

    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(stored.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const payload = { userId: user.id, uuid: user.uuid, email: user.email, role: user.role };
    const newAccessToken = signAccess(payload);
    const newRefreshToken = signRefresh(payload);

    storeRefreshToken(user.id, newRefreshToken);
    setRefreshCookie(res, newRefreshToken);

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
  }
  res.clearCookie('refreshToken', { path: '/' });
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, uuid, email, first_name, last_name, company, phone, role, is_verified, created_at, updated_at FROM users WHERE id = ?').get(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    uuid: user.uuid,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    company: user.company,
    phone: user.phone,
    role: user.role,
    isVerified: user.is_verified,
    createdAt: user.created_at,
  });
});

router.patch('/me', requireAuth, [
  body('firstName').optional().trim(),
  body('lastName').optional().trim(),
  body('company').optional().trim(),
  body('phone').optional().trim(),
], handleValidation, (req, res) => {
  const { firstName, lastName, company, phone } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare(`
    UPDATE users SET
      first_name = COALESCE(?, first_name),
      last_name = COALESCE(?, last_name),
      company = COALESCE(?, company),
      phone = COALESCE(?, phone),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    firstName !== undefined ? firstName : null,
    lastName !== undefined ? lastName : null,
    company !== undefined ? company : null,
    phone !== undefined ? phone : null,
    req.user.userId
  );

  const updated = db.prepare('SELECT id, uuid, email, first_name, last_name, company, phone, role, is_verified, created_at, updated_at FROM users WHERE id = ?').get(req.user.userId);
  res.json({
    uuid: updated.uuid,
    email: updated.email,
    firstName: updated.first_name,
    lastName: updated.last_name,
    company: updated.company,
    phone: updated.phone,
    role: updated.role,
  });
});

router.post('/change-password', requireAuth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number'),
], handleValidation, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hashedPassword, req.user.userId);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.user.userId);

    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
