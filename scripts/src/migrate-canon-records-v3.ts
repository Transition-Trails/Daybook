/**
 * migrate-canon-records-v3
 *
 * Adds three authorial-metadata columns to ws_canon_records:
 *   • narrative_visibility  TEXT  nullable  — background | hinted | explicit
 *   • temporal_scope        TEXT  nullable  — free-text era / phase tag
 *   • canon_stability       TEXT  nullable  — low | medium | high
 *
 * Safe to re-run (ADD COLUMN IF NOT EXISTS).
 *
 * Run:
 *   pnpm --filter @workspace/scripts run migrate-canon-records-v3
 */
import { pool } from "@workspace/db";

await pool.query(`
  ALTER TABLE ws_canon_records
    ADD COLUMN IF NOT EXISTS narrative_visibility TEXT,
    ADD COLUMN IF NOT EXISTS temporal_scope       TEXT,
    ADD COLUMN IF NOT EXISTS canon_stability      TEXT;
`);
console.log("✓ ws_canon_records: narrative_visibility, temporal_scope, canon_stability");

await pool.end();
console.log("\n✅ Canon Records v3 migration complete.");
