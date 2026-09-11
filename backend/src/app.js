require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const auth = require('./middleware/auth');
const authRoutes = require('./routes/auth.routes');
const healthRoutes = require('./routes/health.routes');
const conversationsRoutes = require('./routes/conversations.routes');
const statsRoutes = require('./routes/stats.routes');
const ordersRoutes = require('./routes/orders.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const contactsRoutes = require('./routes/contacts.routes');
const errorHandler = require('./middleware/errorHandler');

// خطأ CORS يتجاوز السياق العادي (err بلا status) — نعالجه قبل errorHandler العام
function corsErrorHandler(err, req, res, next) {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  return next(err);
}

const app = express();

app.use(helmet());

// CORS مضيّق: نسمح فقط لأصول الواجهة المذكورة في FRONTEND_URL (Netlify URL).
// ممنوع '*' في الإنتاج — نقصد نمنع أي موقع آخر يستدعي الـ API.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // الطلبات بلا أصل (same-origin / خوادم) مسموحة
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
  })
);

app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
// كل الراوترات التالية محمية بـ JWT (مع بديل X-API-Key للسكريبتات الخارجية فقط)
app.use('/api/conversations', auth, conversationsRoutes);
app.use('/api/stats', auth, statsRoutes);
app.use('/api/orders', auth, ordersRoutes);
app.use('/api/analytics', auth, analyticsRoutes);
app.use('/api/contacts', auth, contactsRoutes);

app.use(express.static(path.join(__dirname, '../../frontend')));

app.use(corsErrorHandler);
app.use(errorHandler.notFound);
app.use(errorHandler.errorHandler);

module.exports = app;