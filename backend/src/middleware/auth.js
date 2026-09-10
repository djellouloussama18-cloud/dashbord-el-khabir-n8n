const jwt = require('jsonwebtoken');

const expectedKey = () => {
  const key = process.env.DASHBOARD_API_KEY;
  return typeof key === 'string' ? key : '';
};

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i += 1) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function auth(req, res, next) {
  // 1. Check JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || 'secret';
    try {
      const decoded = jwt.verify(token, secret);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
  }

  // 2. Check x-api-key fallback
  const provided = req.headers['x-api-key'];
  if (expectedKey() && safeEqual(provided, expectedKey())) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = auth;