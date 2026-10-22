require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  const cols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bot_post_keywords' AND column_name LIKE 'media%' ORDER BY column_name"
  );
  console.log('columns:', JSON.stringify(cols.rows));

  const cons = await pool.query(
    "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'bot_post_keywords'::regclass AND conname LIKE '%media%'"
  );
  console.log('constraints:', JSON.stringify(cons.rows, null, 2));

  process.exit(0);
}

main().catch((e) => {
  console.log('ERR', e && e.message, e && e.code);
  process.exit(0);
});
