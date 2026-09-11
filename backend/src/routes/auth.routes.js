const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// أقصى 5 محاولات تسجيل دخول كل 15 دقيقة لكل IP — للحماية من brute-force.
// الرسالة عامة بلا تفاصيل عن عدد المحاولات المتبقية.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.' });
  },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { password } = req.body || {};

    if (typeof password !== 'string' || password.length === 0) {
      return res.status(401).json({ error: 'كلمة السر غير صحيحة' });
    }

    // Trim: Render قد يُنزل مسافة/سطرًا زائدًا في نهاية المتغيّر (يكسر الهاش)
    const passwordHash = (process.env.DASHBOARD_PASSWORD_HASH || '').trim();
    const secret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    if (!passwordHash) {
      return res.status(500).json({ error: 'DASHBOARD_PASSWORD_HASH غير مضبوط في السيرفر' });
    }
    if (!secret) {
      return res.status(500).json({ error: 'JWT_SECRET غير مضبوط في السيرفر' });
    }

    // Trim للمدخلات — المسافات البادئة/التالية لا تُعتبر جزءًا من كلمة السر
    const plainPassword = password.trim();
    // bcrypt.compare(النص العادي, الهاش) — الترتيب مهم، معامله الأول هو النص
    const match = await bcrypt.compare(plainPassword, passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'كلمة السر غير صحيحة' });
    }

    const token = jwt.sign({ role: 'dashboard' }, secret, { expiresIn });
    return res.json({ token });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;