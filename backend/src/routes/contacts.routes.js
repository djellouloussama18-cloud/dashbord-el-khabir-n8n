const router = require('express').Router();
const contactsRepo = require('../repositories/contacts.repo');

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return n;
}

function parseBool(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

router.get('/states', async (req, res, next) => {
  try {
    const states = await contactsRepo.listStates();
    return res.json({ states });
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const state =
      typeof req.query.state === 'string' && req.query.state.trim() !== ''
        ? req.query.state.trim()
        : null;
    const botEnabled = parseBool(req.query.bot_enabled);
    const hasOrdered = parseBool(req.query.has_ordered);
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 200);

    const { rows, total } = await contactsRepo.list({
      search,
      state,
      botEnabled,
      hasOrdered,
      page,
      limit,
    });

    return res.json({ contacts: rows, total, page, limit });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;