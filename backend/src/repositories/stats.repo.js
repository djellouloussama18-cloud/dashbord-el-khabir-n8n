const pool = require('../config/db');

async function count(query, params = []) {
  try {
    const { rows } = await pool.query(query, params);
    return rows[0].count;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return 0;
    }
    throw err;
  }
}

async function totalConversations() {
  return count(`SELECT COUNT(*)::int AS count FROM conversation_state`);
}

async function activeToday() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM conversation_state
      WHERE last_message_at >= NOW() - INTERVAL '24 hours'`
  );
}

async function botOffCount() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM conversation_state
      WHERE bot_enabled = FALSE`
  );
}

async function needsAttentionCount() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM conversation_state
      WHERE needs_attention = TRUE`
  );
}

async function ordersToday() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM event_log
      WHERE event_type = 'order_confirmed'
        AND created_at::date = CURRENT_DATE`
  );
}

async function ordersTotal() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM event_log
      WHERE event_type = 'order_confirmed'`
  );
}

async function botOnCount() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM conversation_state
      WHERE bot_enabled = TRUE`
  );
}

async function messagesToday() {
  try {
    const { rows } = await pool.query(
      `SELECT direction, COUNT(*)::int AS count
         FROM chat_log
        WHERE created_at::date = CURRENT_DATE
        GROUP BY direction`
    );
    const result = { inbound: 0, outbound: 0 };
    rows.forEach((r) => {
      if (r.direction === 'inbound') result.inbound = r.count;
      if (r.direction === 'outbound') result.outbound = r.count;
    });
    return result;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return { inbound: 0, outbound: 0 };
    }
    throw err;
  }
}

async function ordersConfirmedThisWeek() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM event_log
      WHERE event_type = 'order_confirmed'
        AND created_at >= NOW() - INTERVAL '7 days'`
  );
}

async function dailyActivity() {
  try {
    const { rows } = await pool.query(
      `SELECT d::date::text AS date,
              COALESCE(m.cnt, 0)::int AS messages_count,
              COALESCE(c.cnt, 0)::int AS conversations_count
         FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
         LEFT JOIN (
           SELECT created_at::date AS date, COUNT(*)::int AS cnt
             FROM chat_log
            WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
            GROUP BY created_at::date
         ) m ON m.date = d::date
         LEFT JOIN (
           SELECT last_message_at::date AS date, COUNT(*)::int AS cnt
             FROM conversation_state
            WHERE last_message_at >= CURRENT_DATE - INTERVAL '6 days'
            GROUP BY last_message_at::date
         ) c ON c.date = d::date
        ORDER BY d ASC`
    );
    return rows.map((r) => ({
      date: r.date,
      messages_count: r.messages_count,
      conversations_count: r.conversations_count,
    }));
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return [];
    }
    throw err;
  }
}

async function totalDistinctConversations() {
  return count(
    `SELECT COUNT(DISTINCT client_id)::int AS count
       FROM conversation_state`
  );
}

async function activeTodayByDate() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM conversation_state
      WHERE last_message_at::date = CURRENT_DATE`
  );
}

async function botEnabledCount() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM conversation_state
      WHERE bot_enabled IS NOT FALSE`
  );
}

async function botDisabledCount() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM conversation_state
      WHERE bot_enabled = FALSE`
  );
}

async function messagesTodayCount() {
  return count(
    `SELECT COUNT(*)::int AS count
       FROM chat_log
      WHERE created_at::date = CURRENT_DATE`
  );
}

async function ordersConfirmedLast7Days() {
  try {
    const { rows } = await pool.query(
      `SELECT d::date::text AS date,
              COALESCE(e.cnt, 0)::int AS count
         FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
         LEFT JOIN (
           SELECT created_at::date AS date, COUNT(*)::int AS cnt
             FROM event_log
            WHERE event_type = 'order_confirmed'
              AND created_at >= CURRENT_DATE - INTERVAL '6 days'
            GROUP BY created_at::date
         ) e ON e.date = d::date
        ORDER BY d ASC`
    );
    return rows.map((r) => ({ date: r.date, count: r.count }));
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return [];
    }
    throw err;
  }
}

module.exports = {
  totalConversations,
  activeToday,
  botOnCount,
  botOffCount,
  needsAttentionCount,
  ordersToday,
  ordersTotal,
  messagesToday,
  ordersConfirmedThisWeek,
  dailyActivity,
  totalDistinctConversations,
  activeTodayByDate,
  botEnabledCount,
  botDisabledCount,
  messagesTodayCount,
  ordersConfirmedLast7Days,
};