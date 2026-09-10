const router = require('express').Router();
const pool = require('../config/db');

router.get('/health', async (req, res, next) => {
  let db = false;

  try {
    const result = await pool.query('SELECT 1 AS ok');
    db = result.rows[0].ok === 1;
  } catch (err) {
    db = false;
  }

  return res.json({ status: 'ok', db, timestamp: new Date().toISOString() });
});

module.exports = router;