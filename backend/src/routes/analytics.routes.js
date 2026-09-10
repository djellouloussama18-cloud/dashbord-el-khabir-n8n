const router = require('express').Router();
const analyticsRepo = require('../repositories/analytics.repo');

router.get('/', async (req, res, next) => {
  try {
    const period = req.query.period === 'weekly' ? 'weekly' : 'daily';
    let range = parseInt(req.query.range, 10);
    if (!Number.isFinite(range) || range < 1) {
      range = period === 'weekly' ? 8 : 7;
    }
    range = Math.min(range, 52);

    const startExpr = analyticsRepo.periodStartExpr(period, range);

    const [summary, orders, avgResponse, timeseries, bot] = await Promise.all([
      analyticsRepo.summaryMessages(startExpr),
      analyticsRepo.ordersConfirmed(startExpr),
      analyticsRepo.avgResponseTimeSeconds(startExpr),
      period === 'weekly' ? analyticsRepo.timeseriesWeekly(range) : analyticsRepo.timeseriesDaily(range),
      analyticsRepo.botStatus(),
    ]);

    const totalConversations = summary.total_conversations || 0;
    const totalOrders = orders || 0;
    const conversionRate =
      totalConversations > 0
        ? Math.round((totalOrders / totalConversations) * 10000) / 100
        : 0;

    return res.json({
      summary: {
        total_conversations: totalConversations,
        total_messages_inbound: summary.total_messages_inbound || 0,
        total_messages_outbound: summary.total_messages_outbound || 0,
        total_orders_confirmed: totalOrders,
        conversion_rate: conversionRate,
        avg_response_time_seconds: avgResponse !== null && avgResponse !== undefined
          ? Math.round(avgResponse * 100) / 100
          : null,
      },
      timeseries,
      bot_status: {
        bot_enabled_count: bot.bot_enabled_count || 0,
        bot_disabled_count: bot.bot_disabled_count || 0,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;