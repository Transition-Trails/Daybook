/**
 * migrate-style-guides-db-col — adds notion_style_guides_db_id to worldsmith_worlds
 * Run: pnpm --filter @workspace/scripts run migrate-style-guides-db-col
 */
import { pool } from "@workspace/db";

await pool.query(`
  ALTER TABLE worldsmith_worlds
  ADD COLUMN IF NOT EXISTS notion_style_guides_db_id TEXT;
`);
console.log("✓ notion_style_guides_db_id column added (or already existed).");
await pool.end();
