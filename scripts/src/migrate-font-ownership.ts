/**
 * Adds the optional authoring-store reference needed to scope owned fonts.
 *
 * Safe to re-run. Existing platform fonts remain unowned.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-font-ownership
 */
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE fonts
      ADD COLUMN IF NOT EXISTS authored_by_store_id TEXT
      REFERENCES stores(id) ON DELETE SET NULL;
    `);
    console.log("✓ fonts.authored_by_store_id is ready");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});