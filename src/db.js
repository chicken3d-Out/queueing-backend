const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  // Fail loudly at startup rather than on the first request — same
  // philosophy as the original PHP app's "die safely if .env is missing"
  // check, just moved earlier in the lifecycle.
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's managed Postgres requires SSL for external connections; the
  // internal connection (same Render private network) doesn't need it, but
  // enabling it either way is harmless and avoids environment-specific bugs.
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // A background/idle client error should not crash the whole process.
  console.error('Unexpected PostgreSQL pool error', err);
});

module.exports = { pool };
