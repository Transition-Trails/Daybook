/**
 * migrate-worldsmith-worlds-v3
 *
 * Adds the hero cover image column to ws_worlds:
 *   • cover_image_url  TEXT  nullable  — object-storage path for the hero cover image
 *
 * Safe to re-run (ADD COLUMN IF NOT EXISTS).
 *
 * Run:
 *   pnpm --filter @workspace/scripts run migrate-worldsmith-worlds-v3
 */
import { pool } from "@workspace/db";

await pool.query(`
  ALTER TABLE worldsmith_worlds
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
`);
console.log("✓ ws_worlds: cover_image_url");

await pool.end();
console.log("\n✅ WorldSmith worlds v3 migration complete.");
