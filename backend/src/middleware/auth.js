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

// الحماية الرئيسية للداشبورد: JWT Bearer token موقّع من السيرفر.
// التحقق من الصلاحية (expiry) + التوقيع (signature) جميعًا هنا عبر jwt.verify.
function auth(req, res, next) {
  // 1. JWT Bearer token — الطريقة الأساسية (الداشبورد)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'JWT_SECRET غير مضبوط في السيرفر' });
    }
    try {
      const decoded = jwt.verify(token, secret);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // 2. X-API-Key — بديل للاستعمال البرمجي فقط (سكريبتات/تكاملات خارجية)،
  //    ماشي للداشبورد. الداشبورد دائمًا يرسل JWT Bearer.
  const provided = req.headers['x-api-key'];
  if (provided && expectedKey() && safeEqual(provided, expectedKey())) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = auth;