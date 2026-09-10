const router = require('express').Router();
const statsRepo = require('../repositories/stats.repo');

function zeroFillLast7() {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return out;
}

router.get('/', async (req, res, next) => {
  try {
    const [
      total_conversations,
      active_today,
      bot_on_count,
      bot_off_count,
      needs_attention_count,
      orders_today,
      orders_total,
      messages_today,
      orders_confirmed_this_week,
      daily_activity,
      conversations_total_distinct,
      active_today_by_date,
      bot_enabled_count,
      bot_disabled_count,
      messages_today_count,
      orders_confirmed_last7,
    ] = await Promise.all([
      statsRepo.totalConversations(),
      statsRepo.activeToday(),
      statsRepo.botOnCount(),
      statsRepo.botOffCount(),
      statsRepo.needsAttentionCount(),
      statsRepo.ordersToday(),
      statsRepo.ordersTotal(),
      statsRepo.messagesToday(),
      statsRepo.ordersConfirmedThisWeek(),
      statsRepo.dailyActivity(),
      statsRepo.totalDistinctConversations(),
      statsRepo.activeTodayByDate(),
      statsRepo.botEnabledCount(),
      statsRepo.botDisabledCount(),
      statsRepo.messagesTodayCount(),
      statsRepo.ordersConfirmedLast7Days(),
    ]);

    const messagesLast7 = Array.isArray(daily_activity) && daily_activity.length === 7
      ? daily_activity.map((d) => ({ date: d.date, count: d.messages_count }))
      : zeroFillLast7();

    const ordersConfirmedLast7 = Array.isArray(orders_confirmed_last7) && orders_confirmed_last7.length === 7
      ? orders_confirmed_last7
      : zeroFillLast7();

    return res.json({
      total_conversations,
      active_today,
      bot_on_count,
      bot_off_count,
      needs_attention_count,
      orders_today,
      orders_total,
      messages_today,
      orders_confirmed_this_week,
      daily_activity,
      conversations: {
        total: conversations_total_distinct,
        activeToday: active_today_by_date,
        botEnabled: bot_enabled_count,
        botDisabled: bot_disabled_count,
      },
      messages: {
        totalToday: messages_today_count,
        last7Days: messagesLast7,
      },
      ordersConfirmed: {
        last7Days: ordersConfirmedLast7,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;