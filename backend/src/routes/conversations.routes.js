const router = require('express').Router();
const conversationsRepo = require('../repositories/conversations.repo');

const VALID_FILTERS = ['all', 'bot_on', 'bot_off', 'needs_attention'];

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return n;
}

router.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    let filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    if (!VALID_FILTERS.includes(filter)) filter = 'all';
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 30), 200);

    const { rows, total } = await conversationsRepo.list({
      search,
      filter: filter === 'all' ? null : filter,
      page,
      limit,
    });

    return res.json({ conversations: rows, total, page, limit });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const clientId = req.params.id;

    const conversation = await conversationsRepo.findById(clientId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const [messages, events] = await Promise.all([
      conversationsRepo.findMessages(clientId),
      conversationsRepo.findEvents(clientId, 10),
    ]);

    return res.json({ conversation, messages, events });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/toggle', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const enabled = req.body && req.body.enabled;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be a boolean' });
    }

    const changedBy =
      req.body && typeof req.body.changed_by === 'string' && req.body.changed_by.trim() !== ''
        ? req.body.changed_by.trim()
        : 'admin';

    const row = await conversationsRepo.toggleBotEnabled(clientId, enabled, changedBy);
    return res.json(row);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/reply', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const text = req.body && typeof req.body.text === 'string' ? req.body.text.trim() : '';

    if (!text) {
      return res.status(400).json({ error: '"text" is required and must be non-empty' });
    }
    if (text.length > 4000) {
      return res.status(400).json({ error: '"text" must be at most 4000 characters' });
    }

    const conversation = await conversationsRepo.findById(clientId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const platform = (conversation.platform || '').toLowerCase();
    const psid = conversation.client_id;

    if (platform === 'facebook' || platform === 'instagram') {
      const token = process.env.FB_PAGE_ACCESS_TOKEN;
      if (!token) {
        return res.status(500).json({ error: 'FB_PAGE_ACCESS_TOKEN is not configured on the server' });
      }

      const fbRes = await fetch(
        `https://graph.facebook.com/${process.env.FB_API_VERSION || 'v21.0'}/me/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { id: psid },
            message: { text },
          }),
        }
      );

      const fbBody = await fbRes.json();

      if (!fbRes.ok) {
        const detail = (fbBody && fbBody.error && fbBody.error.message) || JSON.stringify(fbBody);
        return res.status(502).json({
          error: `Failed to send message via ${platform}: ${detail}`,
        });
      }
    }

    const message = await conversationsRepo.insertMessage(clientId, text);
    return res.json(message);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/notes', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const notes = req.body && req.body.notes;

    if (typeof notes !== 'string') {
      return res.status(400).json({ error: '"notes" must be a string' });
    }
    if (notes.length > 2000) {
      return res.status(400).json({ error: '"notes" must be at most 2000 characters' });
    }

    const row = await conversationsRepo.updateNotes(clientId, notes);
    if (!row) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json(row);
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const durationMinutes = req.body && typeof req.body.duration_minutes === 'number'
      ? req.body.duration_minutes
      : null;

    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 1440) {
      return res.status(400).json({ error: '"duration_minutes" must be between 1 and 1440' });
    }

    const conversation = await conversationsRepo.findById(clientId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const row = await conversationsRepo.pauseBot(clientId, durationMinutes);
    return res.json(row);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/order', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const order = await conversationsRepo.getLatestOrder(clientId);
    if (!order) {
      return res.status(404).json({ error: 'No order found' });
    }
    return res.json(order);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;