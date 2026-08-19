/**
 * One-shot migration: add the `world` text column to the editions table.
 *
 * Run with: node scripts/migrate-edition-world.mjs
 * Safe to re-run: ALTER TABLE ... IF NOT EXISTS is idempotent.
 */
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE editions
        ADD COLUMN IF NOT EXISTS world text;
    `);
    await client.query("COMMIT");
    console.log("✓ editions.world column added (or already exists)");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});