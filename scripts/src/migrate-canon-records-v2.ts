/**
 * migrate-canon-records-v2
 * Adds the three new Canon Record fields, two world fields, and the
 * ws_canon_record_relations table required for transitive register cascade.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-canon-records-v2
 * SAFE: all statements use IF NOT EXISTS / idempotent.
 */
import { pool } from "@workspace/db";

// ── ws_canon_records: three new columns ──────────────────────────────────────
await pool.query(`
  ALTER TABLE ws_canon_records
    ADD COLUMN IF NOT EXISTS emotional_register TEXT,
    ADD COLUMN IF NOT EXISTS sensory_clauses     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS register_locked     BOOLEAN NOT NULL DEFAULT FALSE;
`);
console.log("✓ ws_canon_records: emotional_register, sensory_clauses, register_locked");

// ── worldsmith_worlds: two new columns ───────────────────────────────────────
await pool.query(`
  ALTER TABLE worldsmith_worlds
    ADD COLUMN IF NOT EXISTS world_rules         JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS style_guide_version INTEGER NOT NULL DEFAULT 1;
`);
console.log("✓ worldsmith_worlds: world_rules, style_guide_version");

// ── ws_canon_record_relations: new table ─────────────────────────────────────
await pool.query(`
  CREATE TABLE IF NOT EXISTS ws_canon_record_relations (
    from_record_id  TEXT NOT NULL REFERENCES ws_canon_records(id) ON DELETE CASCADE,
    to_record_id    TEXT NOT NULL REFERENCES ws_canon_records(id) ON DELETE CASCADE,
    relation_type   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (from_record_id, to_record_id)
  );
  CREATE INDEX IF NOT EXISTS ws_canon_rel_from_idx ON ws_canon_record_relations(from_record_id);
  CREATE INDEX IF NOT EXISTS ws_canon_rel_to_idx   ON ws_canon_record_relations(to_record_id);
`);
console.log("✓ ws_canon_record_relations: table + indexes");

await pool.end();
console.log("\n✅ Canon Records v2 migration complete.");
