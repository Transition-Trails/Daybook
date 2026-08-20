/**
 * migrate-worldsmith — creates worldsmith_runs and worldsmith_assets tables.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-worldsmith
 *
 * SAFE: uses CREATE TABLE IF NOT EXISTS; idempotent.
 */
import { pool } from "@workspace/db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── worldsmith_runs ───────────────────────────────────────────────────────
    console.log("1. Creating worldsmith_runs table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS worldsmith_runs (
        id                    TEXT PRIMARY KEY,
        production_spec_id    TEXT NOT NULL,
        operation             TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'pending',
        dry_run               BOOLEAN NOT NULL DEFAULT FALSE,
        payload_version       TEXT,
        compiled_prompt       TEXT,
        prompt_hash           TEXT,
        compiled_prompt_status TEXT,
        visual_asset_notion_id TEXT,
        asset_id              TEXT,
        asset_version         TEXT,
        provider              TEXT,
        model_name            TEXT,
        model_version         TEXT,
        generation_settings   JSONB,
        seed                  TEXT,
        provider_request_id   TEXT,
        cost_usd              REAL,
        drive_file_id         TEXT,
        drive_folder_id       TEXT,
        drive_url             TEXT,
        daybook_asset_id      TEXT,
        errors                JSONB,
        warnings              JSONB,
        failed_stage          TEXT,
        error_code            TEXT,
        resolved_source_ids   JSONB,
        retry_count           INTEGER NOT NULL DEFAULT 0,
        initiated_by          TEXT,
        started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at          TIMESTAMPTZ
      );
    `);

    // ── worldsmith_assets ─────────────────────────────────────────────────────
    console.log("2. Creating worldsmith_assets table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS worldsmith_assets (
        id                          TEXT PRIMARY KEY,
        asset_name                  TEXT NOT NULL,
        asset_type                  TEXT NOT NULL,
        world                       TEXT NOT NULL,
        volume                      TEXT,
        component_type              TEXT NOT NULL,
        current_version             TEXT NOT NULL DEFAULT 'v001',
        filename                    TEXT,
        production_spec_notion_id   TEXT,
        visual_asset_notion_id      TEXT,
        drive_file_id               TEXT,
        drive_url                   TEXT,
        prompt_hash                 TEXT,
        generation_provider         TEXT,
        model_name                  TEXT,
        provider_request_id         TEXT,
        readiness_state             TEXT NOT NULL DEFAULT 'Under Review',
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── Indexes ───────────────────────────────────────────────────────────────
    console.log("3. Creating indexes…");
    await client.query(`
      CREATE INDEX IF NOT EXISTS worldsmith_runs_spec_idx
        ON worldsmith_runs (production_spec_id);
      CREATE INDEX IF NOT EXISTS worldsmith_runs_status_idx
        ON worldsmith_runs (status);
      CREATE INDEX IF NOT EXISTS worldsmith_assets_prompt_hash_idx
        ON worldsmith_assets (prompt_hash);
    `);

    // ── cover_image_url on worldsmith_worlds ──────────────────────────────────
    console.log("4. Adding cover_image_url column to worldsmith_worlds (if missing)…");
    await client.query(`
      ALTER TABLE worldsmith_worlds
        ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
    `);

    await client.query("COMMIT");
    console.log("✓ WorldSmith tables created successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
