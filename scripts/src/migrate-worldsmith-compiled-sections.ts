/**
 * One-shot migration: add compiled_sections JSONB column to worldsmith_runs.
 * Stores structured per-section prompt records so run history can surface
 * the World Bible summary card without re-running compilation.
 *
 * Run with: pnpm --filter @workspace/scripts run migrate-worldsmith-compiled-sections
 * SAFE: ADD COLUMN IF NOT EXISTS — idempotent.
 */
import { pool } from "@workspace/db";

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

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
