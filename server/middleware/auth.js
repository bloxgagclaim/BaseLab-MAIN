const { verifyAccess } = require('../utils/jwt');

function softAuth(req, res, next) {
  req.user = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = verifyAccess(token);
      req.user = {
        userId: decoded.userId,
        uuid: decoded.uuid,
        email: decoded.email,
        role: decoded.role,
      };
    } catch (err) {
      // Token invalid or expired — treat as unauthenticated
    }
  }
  next();
}

function requireAuth(req, res, next) {
  softAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  });
}

module.exports = { softAuth, requireAuth };
