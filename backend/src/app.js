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

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
  })
);

app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/conversations', auth, conversationsRoutes);
app.use('/api/stats', auth, statsRoutes);
app.use('/api/orders', auth, ordersRoutes);
app.use('/api/analytics', auth, analyticsRoutes);
app.use('/api/contacts', auth, contactsRoutes);

app.use(express.static(path.join(__dirname, '../../frontend')));

app.use(errorHandler.notFound);
app.use(errorHandler.errorHandler);

module.exports = app;