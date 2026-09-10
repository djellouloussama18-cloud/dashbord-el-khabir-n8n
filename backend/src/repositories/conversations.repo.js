const pool = require('../config/db');

const SELECT_CONVERSATION_COLUMNS = `
       cs.client_id,
       cs.customer_name,
       cs.phone,
       cs.platform,
       cs.bot_enabled,
       cs.needs_attention,
       cs.state,
       cs.notes,
       cs.last_message_at,
       cs.last_message_preview,
       cs.bot_paused_until,
       EXISTS (
         SELECT 1 FROM event_log
         WHERE session_id = cs.client_id
           AND event_type = 'order_confirmed'
       ) AS has_order`;

const DEMO_CONVERSATIONS = [
  {
    client_id: 'demo-101',
    customer_name: 'أحمد علي',
    phone: '+212612345678',
    platform: 'whatsapp',
    bot_enabled: true,
    needs_attention: false,
    state: 'active',
    notes: 'معاينة تجريبية (قاعدة البيانات غير متصلة محلياً)',
    last_message_at: new Date().toISOString(),
    last_message_preview: 'مرحباً، أود الاستفسار عن التسجيل في الأكاديمية.',
    has_order: true,
  },
  {
    client_id: 'demo-102',
    customer_name: 'سارة المغربي',
    phone: '+212698765432',
    platform: 'whatsapp',
    bot_enabled: false,
    needs_attention: true,
    state: 'waiting_human',
    notes: 'تحتاج رد مباشر من الدعم',
    last_message_at: new Date(Date.now() - 3600000).toISOString(),
    last_message_preview: 'هل يوجد تخفيض للمجموعات؟',
    has_order: false,
  }
];

async function fetchFacebookName(clientId) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const version = process.env.FB_API_VERSION || 'v21.0';
  if (!token || !clientId || clientId.startsWith('demo-')) return null;

  const cleanId = clientId.replace(/^=/, '');

  // 1. Direct PSID lookup
  try {
    const url = `https://graph.facebook.com/${version}/${cleanId}?fields=first_name,last_name,name&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.name) {
      await pool.query(
        'UPDATE conversation_state SET customer_name = $1, updated_at = NOW() WHERE client_id = $2',
        [data.name, clientId]
      ).catch(() => {});
      return data.name;
    }
  } catch (err) {}

  // 2. Fallback to /me/conversations participant lookup (100% reliable for Page Messaging)
  try {
    const convUrl = `https://graph.facebook.com/${version}/me/conversations?fields=participants,senders&access_token=${token}`;
    const res = await fetch(convUrl);
    const data = await res.json();

    if (data && data.data) {
      for (const item of data.data) {
        const participants = (item.participants && item.participants.data) || [];
        const match = participants.find(p => String(p.id) === String(cleanId) && p.name && !p.name.includes('Dz store'));
        if (match) {
          const resolvedName = match.name.trim();
          await pool.query(
            'UPDATE conversation_state SET customer_name = $1, updated_at = NOW() WHERE client_id = $2',
            [resolvedName, clientId]
          ).catch(() => {});
          return resolvedName;
        }
      }
    }
  } catch (err) {}

  return null;
}

async function list({ search, filter, page, limit }) {
  const conditions = [];
  const params = [];
  let p = 1;

  if (search && search.trim() !== '') {
    const pattern = `%${search.trim()}%`;
    conditions.push(
      `(cs.customer_name ILIKE $${p} OR cs.phone ILIKE $${p} OR cs.client_id::text ILIKE $${p})`
    );
    params.push(pattern);
    p += 1;
  }

  if (filter === 'bot_on') {
    conditions.push('cs.bot_enabled = TRUE');
  } else if (filter === 'bot_off') {
    conditions.push('cs.bot_enabled = FALSE');
  } else if (filter === 'needs_attention') {
    conditions.push('cs.needs_attention = TRUE');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const query = `
    SELECT ${SELECT_CONVERSATION_COLUMNS},
           COUNT(*) OVER () AS __total
      FROM conversation_state cs
      ${where}
     ORDER BY cs.last_message_at DESC NULLS LAST
     LIMIT $${p} OFFSET $${p + 1}`;

  try {
    const result = await pool.query(query, params);
    const total = result.rows.length ? Number(result.rows[0].__total) : 0;
    const rows = result.rows.map(({ __total, ...row }) => row);

    // Auto-resolve missing customer names via FB Graph API
    await Promise.all(
      rows.map(async (row) => {
        if (!row.customer_name || row.customer_name === row.client_id) {
          const resolvedName = await fetchFacebookName(row.client_id);
          if (resolvedName) row.customer_name = resolvedName;
        }
      })
    );

    return { rows, total };
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return { rows: DEMO_CONVERSATIONS, total: DEMO_CONVERSATIONS.length };
    }
    throw err;
  }
}

async function findById(clientId) {
  const query = `
    SELECT ${SELECT_CONVERSATION_COLUMNS}
      FROM conversation_state cs
     WHERE cs.client_id = $1 OR cs.client_id = '=' || $1`;

  try {
    const result = await pool.query(query, [clientId]);
    const row = result.rows[0] || DEMO_CONVERSATIONS.find(c => c.client_id === clientId) || null;

    if (row && (!row.customer_name || row.customer_name === row.client_id)) {
      const resolvedName = await fetchFacebookName(clientId);
      if (resolvedName) row.customer_name = resolvedName;
    }

    return row;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return DEMO_CONVERSATIONS.find(c => c.client_id === clientId) || DEMO_CONVERSATIONS[0];
    }
    throw err;
  }
}

async function findMessages(clientId, { limit = null, before = null } = {}) {
  const cleanId = (clientId || '').replace(/^=/, '');
  try {
    const result = await pool.query(
      `SELECT direction, message_text, message_type, created_at
         FROM chat_log
        WHERE (client_id = $1 OR client_id = '=' || $1 OR LTRIM(client_id, '=') = $1)
          AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
        ORDER BY created_at ASC
        LIMIT $3`,
      [cleanId, before, limit]
    );
    return result.rows;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return [
        { direction: 'inbound', message_text: 'السلام عليكم ورحمة الله', message_type: 'text', created_at: new Date(Date.now() - 7200000).toISOString() },
        { direction: 'outbound', message_text: 'أهلاً بك في أكاديمية الخبير! كيف يمكنني مساعدتك اليوم؟', message_type: 'text', created_at: new Date(Date.now() - 7100000).toISOString() },
        { direction: 'inbound', message_text: 'مرحباً، أود الاستفسار عن التسجيل في الأكاديمية.', message_type: 'text', created_at: new Date(Date.now() - 3600000).toISOString() },
      ];
    }
    throw err;
  }
}

async function findEvents(clientId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT event_type, created_at
         FROM event_log
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [clientId, limit]
    );
    return result.rows.reverse();
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return [
        { event_type: 'session_started', created_at: new Date(Date.now() - 7200000).toISOString() },
        { event_type: 'bot_replied', created_at: new Date(Date.now() - 7100000).toISOString() }
      ];
    }
    throw err;
  }
}

async function updateBotEnabled(clientId, enabled, tx = null) {
  const target = tx || pool;
  const result = await target.query(
    `INSERT INTO conversation_state (client_id, bot_enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (client_id)
     DO UPDATE SET bot_enabled = EXCLUDED.bot_enabled, updated_at = NOW()
     RETURNING client_id, bot_enabled, updated_at`,
    [clientId, enabled]
  );
  return result.rows[0];
}

async function logAuditEntry(clientId, action, changedBy, tx = null) {
  const target = tx || pool;
  await target.query(
    `INSERT INTO bot_toggle_audit_log (client_id, action, changed_by, changed_at)
     VALUES ($1, $2, $3, NOW())`,
    [clientId, action, changedBy]
  );
}

async function toggleBotEnabled(clientId, enabled, changedBy) {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await updateBotEnabled(clientId, enabled, client);
      await logAuditEntry(clientId, enabled ? 'enabled' : 'disabled', changedBy, client);
      await client.query('COMMIT');
      return row;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      const demo = DEMO_CONVERSATIONS.find(c => c.client_id === clientId);
      if (demo) demo.bot_enabled = enabled;
      return { client_id: clientId, bot_enabled: enabled, updated_at: new Date().toISOString() };
    }
    throw err;
  }
}

async function updateNotes(clientId, notes) {
  try {
    const result = await pool.query(
      `UPDATE conversation_state SET notes = $1, updated_at = NOW()
        WHERE client_id = $2
        RETURNING client_id, notes, updated_at`,
      [notes, clientId]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      const demo = DEMO_CONVERSATIONS.find(c => c.client_id === clientId);
      if (demo) demo.notes = notes;
      return { client_id: clientId, notes, updated_at: new Date().toISOString() };
    }
    throw err;
  }
}

async function insertMessage(clientId, text) {
  try {
    const result = await pool.query(
      `INSERT INTO chat_log (client_id, direction, message_text, message_type, created_at)
       VALUES ($1, 'outbound', $2, 'human_reply', NOW())
       RETURNING direction, message_text, message_type, created_at`,
      [clientId, text]
    );
    await pool.query(
      `UPDATE conversation_state
         SET last_message_at = NOW(),
             last_message_preview = LEFT($2, 200),
             updated_at = NOW()
       WHERE client_id = $1`,
      [clientId, text]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      return { direction: 'outbound', message_text: text, message_type: 'human_reply', created_at: new Date().toISOString() };
    }
    throw err;
  }
}

async function pauseBot(clientId, durationMinutes) {
  try {
    const result = await pool.query(
      `UPDATE conversation_state
         SET bot_paused_until = NOW() + ($2 || ' minutes')::INTERVAL,
             updated_at = NOW()
       WHERE client_id = $1
       RETURNING client_id, bot_enabled, bot_paused_until, updated_at`,
      [clientId, String(durationMinutes)]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000') {
      const demo = DEMO_CONVERSATIONS.find(c => c.client_id === clientId);
      if (demo) demo.bot_paused_until = new Date(Date.now() + durationMinutes * 60000).toISOString();
      return { client_id: clientId, bot_paused_until: demo?.bot_paused_until || new Date(Date.now() + durationMinutes * 60000).toISOString() };
    }
    throw err;
  }
}

async function getLatestOrder(clientId) {
  try {
    const result = await pool.query(
      `SELECT order_id, total, status, created_at
         FROM orders
        WHERE client_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [clientId]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000' || err.code === '42P01') {
      const demo = DEMO_CONVERSATIONS.find(c => c.client_id === clientId);
      if (demo?.has_order) {
        return { order_id: 'ORD-2024-001', total: 1499, status: 'confirmed', created_at: new Date(Date.now() - 86400000).toISOString() };
      }
      return null;
    }
    throw err;
  }
}

async function autoReEnablePaused() {
  try {
    const result = await pool.query(
      `UPDATE conversation_state
         SET bot_paused_until = NULL, updated_at = NOW()
       WHERE bot_paused_until IS NOT NULL
         AND bot_paused_until < NOW()
       RETURNING client_id`
    );
    return result.rows;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === '3D000' || err.code === '42P01') {
      return [];
    }
    throw err;
  }
}

module.exports = {
  list,
  findById,
  findMessages,
  findEvents,
  updateBotEnabled,
  logAuditEntry,
  toggleBotEnabled,
  updateNotes,
  insertMessage,
  pauseBot,
  getLatestOrder,
  autoReEnablePaused,
};