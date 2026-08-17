/**
 * migrate-canon-records-v4
 *
 * Adds relation-edge columns to ws_canon_records (added by task #279):
 *   • from_entity_id   TEXT  nullable  — source canon record for REL/MTF edges
 *   • to_entity_id     TEXT  nullable  — target canon record for REL/MTF edges
 *   • emotional_valence TEXT nullable  — edge label (e.g. "trust", "tension")
 *
 * Safe to re-run (ADD COLUMN IF NOT EXISTS).
 *
 * Run:
 *   pnpm --filter @workspace/scripts run migrate-canon-records-v4
 */
import { pool } from "@workspace/db";

await pool.query(`
  ALTER TABLE ws_canon_records
    ADD COLUMN IF NOT EXISTS from_entity_id    TEXT,
    ADD COLUMN IF NOT EXISTS to_entity_id      TEXT,
    ADD COLUMN IF NOT EXISTS emotional_valence TEXT;
`);
console.log("✓ ws_canon_records: from_entity_id, to_entity_id, emotional_valence");

await pool.end();
console.log("\n✅ Canon Records v4 migration complete.");
