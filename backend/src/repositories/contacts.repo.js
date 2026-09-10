const pool = require('../config/db');

const DEMO_CONTACTS = [
  {
    client_id: 'demo-101',
    customer_name: 'أحمد علي',
    state: 'active',
    language: 'msa',
    bot_enabled: true,
    last_message_at: new Date().toISOString(),
    last_message_preview: 'مرحباً، أود الاستفسار عن التسجيل في الأكاديمية.',
    orders_confirmed_count: 2,
    last_order_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    client_id: 'demo-102',
    customer_name: null,
    state: 'waiting_human',
    language: 'ar',
    bot_enabled: false,
    last_message_at: new Date(Date.now() - 3600000).toISOString(),
    last_message_preview: 'هل يوجد تخفيض للمجموعات؟',
    orders_confirmed_count: 0,
    last_order_at: null,
  },
];

function isDbUnavailable(err) {
  return (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === '3D000'
  );
}

/**
 * قائمة جهات الاتصال (كل صف فـ conversation_state = جهة اتصال)،
 * مع عدد الطلبات المؤكدة وآخر طلب من event_log عبر JOIN.
 * جميع القيم تمرر كـ parameters (ILIKE آمن ضد الحقن).
 */
async function list({ search, state, botEnabled, hasOrdered, page, limit }) {
  const conditions = [];
  const params = [];
  let p = 1;

  if (search && search.trim() !== '') {
    const pattern = `%${search.trim()}%`;
    conditions.push(
      `(cs.customer_name ILIKE $${p} OR cs.client_id::text ILIKE $${p})`
    );
    params.push(pattern);
    p += 1;
  }

  if (state) {
    conditions.push(`cs.state = $${p}`);
    params.push(state);
    p += 1;
  }

  if (botEnabled === true || botEnabled === false) {
    conditions.push(`cs.bot_enabled = $${p}`);
    params.push(botEnabled);
    p += 1;
  }

  if (hasOrdered === true) {
    conditions.push('o.orders_confirmed_count > 0');
  } else if (hasOrdered === false) {
    conditions.push('COALESCE(o.orders_confirmed_count, 0) = 0');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const query = `
    SELECT cs.client_id,
           cs.customer_name,
           cs.state,
           cs.language,
           cs.bot_enabled,
           cs.last_message_at,
           cs.last_message_preview,
           COALESCE(o.orders_confirmed_count, 0)::int AS orders_confirmed_count,
           o.last_order_at,
           COUNT(*) OVER () AS __total
      FROM conversation_state cs
      LEFT JOIN (
        SELECT session_id,
               COUNT(*) FILTER (WHERE event_type = 'order_confirmed')::int AS orders_confirmed_count,
               MAX(created_at) FILTER (WHERE event_type = 'order_confirmed') AS last_order_at
          FROM event_log
         GROUP BY session_id
      ) o ON o.session_id = cs.client_id OR o.session_id = '=' || cs.client_id
      ${where}
     ORDER BY cs.last_message_at DESC NULLS LAST
     LIMIT $${p} OFFSET $${p + 1}`;

  try {
    const result = await pool.query(query, params);
    const total = result.rows.length ? Number(result.rows[0].__total) : 0;
    const rows = result.rows.map(({ __total, ...row }) => row);
    return { rows, total };
  } catch (err) {
    if (isDbUnavailable(err)) {
      return { rows: DEMO_CONTACTS.slice(), total: DEMO_CONTACTS.length };
    }
    throw err;
  }
}

/** الحالات المميزة الموجودة فعلياً (لقائمة فلترة "state") */
async function listStates() {
  try {
    const result = await pool.query(
      `SELECT DISTINCT COALESCE(NULLIF(state, ''), 'unknown') AS state
         FROM conversation_state
        ORDER BY state`
    );
    return result.rows.map((r) => r.state);
  } catch (err) {
    if (isDbUnavailable(err)) {
      return ['active', 'waiting_human'];
    }
    throw err;
  }
}

module.exports = { list, listStates };