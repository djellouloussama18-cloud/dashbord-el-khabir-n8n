const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (username !== adminUsername) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    if (!adminHash) {
      return res.status(500).json({ error: 'لم يتم إعداد ADMIN_PASSWORD_HASH في السيرفر' });
    }

    const match = await bcrypt.compare(password, adminHash);
    if (!match) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const secret = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign({ username }, secret, { expiresIn: '7d' });

    return res.json({ token, username });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
