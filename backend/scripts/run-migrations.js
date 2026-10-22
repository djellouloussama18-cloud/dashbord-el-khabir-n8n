require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const migrationsDir = path.join(__dirname, '..', 'migrations');

const migrations = [
  '002_indexes.sql',
  '003_add_bot_paused_until.sql',
  '004_add_variant_index.sql',
  '005_instagram_platform.sql',
  '006_add_keyword_media.sql',
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    for (const file of migrations) {
      const filePath = path.join(migrationsDir, file);
      if (!fs.existsSync(filePath)) {
        console.log(`[SKIP] ${file} — not found`);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`[RUN]  ${file}...`);
      try {
        await client.query(sql);
        console.log(`[OK]   ${file}`);
      } catch (err) {
        console.error(`[ERR]  ${file}: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
