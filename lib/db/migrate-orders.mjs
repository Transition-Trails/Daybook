/**
 * Orders table migration.
 * Creates the orders table if it does not exist.
 * Safe to re-run.
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id              text PRIMARY KEY,
      store_id        text NOT NULL,
      buyer_user_id   text REFERENCES users(id),
      buyer_email     text NOT NULL,
      buyer_name      text,
      items           jsonb NOT NULL DEFAULT '[]',
      total_cents     integer NOT NULL DEFAULT 0,
      currency        text NOT NULL DEFAULT 'usd',
      download_links  jsonb NOT NULL DEFAULT '[]',
      resend_token    text UNIQUE,
      receipt_sent_at timestamptz,
      created_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ orders table created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS orders_store_id_idx ON orders (store_id);
    CREATE INDEX IF NOT EXISTS orders_buyer_user_id_idx ON orders (buyer_user_id) WHERE buyer_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS orders_resend_token_idx ON orders (resend_token) WHERE resend_token IS NOT NULL;
  `);
  console.log("✓ orders indexes created");
} finally {
  await pool.end();
}
