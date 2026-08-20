/**
 * One-shot migration: add compiled_sections JSONB column to worldsmith_runs.
 * This stores the structured per-section prompt records so that run history
 * can surface the World Bible summary card without re-running compilation.
 *
 * Run with: node scripts/migrate-worldsmith-compiled-sections.mjs
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
      ALTER TABLE worldsmith_runs
        ADD COLUMN IF NOT EXISTS compiled_sections JSONB;
    `);

    await client.query("COMMIT");
    console.log("✓ worldsmith_runs.compiled_sections column added (or already exists)");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
