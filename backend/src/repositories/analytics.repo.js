const pool = require('../config/db');

function isConnectionErr(err) {
  return (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === '3D000'
  );
}

/**
 * تعبير SQL لبداية الفترة (بدون مخاطر حقن: period من قائمة بيضاء، range عدد صحيح مُتحقق).
 * daily  : بداية اليوم اللي قبل آخر range أيام
 * weekly : بداية الأسبوع اللي قبل آخر range أسابيع
 */
function periodStartExpr(period, range) {
  if (period === 'weekly') {
    return `date_trunc('week', CURRENT_DATE) - (${range} - 1) * INTERVAL '1 week'`;
  }
  return `CURRENT_DATE - (${range} - 1)`;
}

/** ملخص الرسائل والمحادثات الفريدة داخل الفترة */
async function summaryMessages(startExpr) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT client_id)::int AS total_conversations,
              COUNT(*) FILTER (WHERE direction = 'inbound')::int  AS total_messages_inbound,
              COUNT(*) FILTER (WHERE direction = 'outbound')::int AS total_messages_outbound
         FROM chat_log
        WHERE created_at >= (${startExpr})`
    );
    return rows[0];
  } catch (err) {
    if (isConnectionErr(err)) {
      return { total_conversations: 0, total_messages_inbound: 0, total_messages_outbound: 0 };
    }
    throw err;
  }
}

/** عدد تأكيدات الطلبات داخل الفترة */
async function ordersConfirmed(startExpr) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM event_log
        WHERE event_type = 'order_confirmed'
          AND created_at >= (${startExpr})`
    );
    return rows[0].count;
  } catch (err) {
    if (isConnectionErr(err)) return 0;
    throw err;
  }
}

/**
 * متوسط زمن الرد: لكل رسالة inbound، أقرب outbound لنفس client_id بعدها،
 * ثم متوسط الفارق الزمني (بالثواني). null إن لم توجد ردود.
 */
async function avgResponseTimeSeconds(startExpr) {
  try {
    const { rows } = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (o.min_at - i.created_at)))::float AS avg_seconds
         FROM chat_log i
         JOIN LATERAL (
           SELECT MIN(o.created_at) AS min_at
             FROM chat_log o
            WHERE o.client_id = i.client_id
              AND o.direction = 'outbound'
              AND o.created_at > i.created_at
         ) o ON true
        WHERE i.direction = 'inbound'
          AND i.created_at >= (${startExpr})
          AND o.min_at IS NOT NULL`
    );
    return rows[0].avg_seconds;
  } catch (err) {
    if (isConnectionErr(err)) return null;
    throw err;
  }
}

/** سلسلة زمنية يومية لآخر range أيام */
async function timeseriesDaily(rangeDays) {
  try {
    const { rows } = await pool.query(
      `SELECT d::date::text AS date,
              COALESCE(nc.cnt, 0)::int AS new_conversations,
              COALESCE(ms.cnt, 0)::int AS messages_inbound,
              COALESCE(mo.cnt, 0)::int AS messages_outbound,
              COALESCE(oc.cnt, 0)::int AS orders_confirmed
         FROM generate_series(
                CURRENT_DATE - (($1::int) - 1),
                CURRENT_DATE,
                '1 day') d
         LEFT JOIN (
           SELECT first_date AS date, COUNT(*)::int AS cnt
             FROM (
               SELECT client_id, MIN(created_at::date) AS first_date
                 FROM chat_log
                GROUP BY client_id
             ) fs
            WHERE first_date >= CURRENT_DATE - (($1::int) - 1)
            GROUP BY first_date
         ) nc ON nc.date = d::date
         LEFT JOIN (
           SELECT created_at::date AS date,
                  COUNT(*) FILTER (WHERE direction = 'inbound')::int AS cnt
             FROM chat_log
            WHERE created_at >= CURRENT_DATE - (($1::int) - 1)
            GROUP BY created_at::date
         ) ms ON ms.date = d::date
         LEFT JOIN (
           SELECT created_at::date AS date,
                  COUNT(*) FILTER (WHERE direction = 'outbound')::int AS cnt
             FROM chat_log
            WHERE created_at >= CURRENT_DATE - (($1::int) - 1)
            GROUP BY created_at::date
         ) mo ON mo.date = d::date
         LEFT JOIN (
           SELECT created_at::date AS date, COUNT(*)::int AS cnt
             FROM event_log
            WHERE event_type = 'order_confirmed'
              AND created_at >= CURRENT_DATE - (($1::int) - 1)
            GROUP BY created_at::date
         ) oc ON oc.date = d::date
        ORDER BY d ASC`,
      [rangeDays]
    );
    return rows;
  } catch (err) {
    if (isConnectionErr(err)) return [];
    throw err;
  }
}

/** سلسلة زمنية أسبوعية لآخر range أسابيع */
async function timeseriesWeekly(rangeWeeks) {
  try {
    const { rows } = await pool.query(
      `SELECT to_char(w, 'IYYY-"W"IW') AS date,
              COALESCE(nc.cnt, 0)::int AS new_conversations,
              COALESCE(ms.cnt, 0)::int AS messages_inbound,
              COALESCE(mo.cnt, 0)::int AS messages_outbound,
              COALESCE(oc.cnt, 0)::int AS orders_confirmed
         FROM generate_series(
                date_trunc('week', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 week'),
                date_trunc('week', CURRENT_DATE),
                '1 week') w
         LEFT JOIN (
           SELECT first_week::date AS week, COUNT(*)::int AS cnt
             FROM (
               SELECT client_id, date_trunc('week', MIN(created_at)) AS first_week
                 FROM chat_log
                GROUP BY client_id
             ) fs
            WHERE first_week >= date_trunc('week', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 week')
            GROUP BY first_week
         ) nc ON nc.week = w
         LEFT JOIN (
           SELECT date_trunc('week', created_at)::date AS week,
                  COUNT(*) FILTER (WHERE direction = 'inbound')::int AS cnt
             FROM chat_log
            WHERE created_at >= date_trunc('week', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 week')
            GROUP BY 1
         ) ms ON ms.week = w
         LEFT JOIN (
           SELECT date_trunc('week', created_at)::date AS week,
                  COUNT(*) FILTER (WHERE direction = 'outbound')::int AS cnt
             FROM chat_log
            WHERE created_at >= date_trunc('week', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 week')
            GROUP BY 1
         ) mo ON mo.week = w
         LEFT JOIN (
           SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS cnt
             FROM event_log
            WHERE event_type = 'order_confirmed'
              AND created_at >= date_trunc('week', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 week')
            GROUP BY 1
         ) oc ON oc.week = w
        ORDER BY w ASC`,
      [rangeWeeks]
    );
    return rows;
  } catch (err) {
    if (isConnectionErr(err)) return [];
    throw err;
  }
}

/** حالة البوت (مفعّل/موقوف) */
async function botStatus() {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE bot_enabled = TRUE)::int  AS bot_enabled_count,
              COUNT(*) FILTER (WHERE bot_enabled = FALSE)::int AS bot_disabled_count
         FROM conversation_state`
    );
    return rows[0];
  } catch (err) {
    if (isConnectionErr(err)) return { bot_enabled_count: 0, bot_disabled_count: 0 };
    throw err;
  }
}

module.exports = {
  periodStartExpr,
  summaryMessages,
  ordersConfirmed,
  avgResponseTimeSeconds,
  timeseriesDaily,
  timeseriesWeekly,
  botStatus,
};