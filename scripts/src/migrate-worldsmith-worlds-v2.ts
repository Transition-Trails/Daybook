/**
 * migrate-worldsmith-worlds-v2
 *
 * Adds four "World Bible" aesthetic-identity columns to ws_worlds:
 *   • visual_palette     TEXT  nullable  — dominant hues, light quality, tonal range
 *   • prose_voice        TEXT  nullable  — tense, person, sentence rhythm, register
 *   • atmospheric_notes  TEXT  nullable  — ambient mood, emotional texture
 *   • material_world     TEXT  nullable  — textures, surfaces, physical substances
 *
 * Safe to re-run (ADD COLUMN IF NOT EXISTS).
 *
 * Run:
 *   pnpm --filter @workspace/scripts run migrate-worldsmith-worlds-v2
 */
import { pool } from "@workspace/db";

await pool.query(`
  ALTER TABLE worldsmith_worlds
    ADD COLUMN IF NOT EXISTS visual_palette    TEXT,
    ADD COLUMN IF NOT EXISTS prose_voice       TEXT,
    ADD COLUMN IF NOT EXISTS atmospheric_notes TEXT,
    ADD COLUMN IF NOT EXISTS material_world    TEXT;
`);
console.log("✓ ws_worlds: visual_palette, prose_voice, atmospheric_notes, material_world");

await pool.end();
console.log("\n✅ WorldSmith worlds v2 migration complete.");
