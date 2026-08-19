/**
 * migrate-edition-world — adds the `world` text column to the editions table.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-edition-world
 *
 * Safe to re-run: ALTER TABLE … IF NOT EXISTS is idempotent.
 */
import { pool } from "@workspace/db";

async function main() {
  console.log("📚  migrate-edition-world — adding world column to editions…\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE editions
        ADD COLUMN IF NOT EXISTS world text;
    `);
    await client.query("COMMIT");
    console.log("  ✔ editions.world column present (added or already existed).");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
