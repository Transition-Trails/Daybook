/**
 * Adds optional source notes to the Daybook Fonts catalog.
 *
 * Safe to re-run. Existing font records keep NULL notes until an editor adds
 * provenance or usage guidance through the catalog form.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-font-notes
 */
import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE fonts
      ADD COLUMN IF NOT EXISTS notes TEXT;
    `);
    console.log("✓ fonts.notes is ready");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});