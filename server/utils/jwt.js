const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'baselab_access_secret_change_in_prod_32chars';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'baselab_refresh_secret_change_in_prod_32chars';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

function signAccess(payload) {
  return jwt.sign(
    { userId: payload.userId, uuid: payload.uuid, email: payload.email, role: payload.role },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function signRefresh(payload) {
  return jwt.sign(
    { userId: payload.userId, uuid: payload.uuid, email: payload.email, role: payload.role },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
}

function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
