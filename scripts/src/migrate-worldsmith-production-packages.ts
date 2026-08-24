/**
 * Adds the final-artwork idempotency record and audit fields.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-worldsmith-production-packages
 * SAFE: all DDL is additive and idempotent.
 */
import { pool } from "@workspace/db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE worldsmith_runs
        ADD COLUMN IF NOT EXISTS generated_filename TEXT,
        ADD COLUMN IF NOT EXISTS notion_upload_id TEXT;

      CREATE TABLE IF NOT EXISTS worldsmith_production_packages (
        id                      TEXT PRIMARY KEY,
        production_spec_id      TEXT NOT NULL,
        prompt_hash             TEXT NOT NULL,
        provider                TEXT NOT NULL,
        model_name              TEXT NOT NULL,
        model_version           TEXT NOT NULL DEFAULT '',
        effective_size          TEXT NOT NULL,
        quality                 TEXT NOT NULL,
        filename                TEXT NOT NULL,
        visual_asset_notion_id  TEXT,
        notion_upload_id        TEXT,
        provider_request_id     TEXT,
        estimated_cost_usd      REAL,
        actual_cost_usd         REAL,
        status                  TEXT NOT NULL DEFAULT 'generating',
        production_art_status   TEXT NOT NULL DEFAULT 'not_started',
        error                   TEXT,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS worldsmith_production_packages_identity_idx
        ON worldsmith_production_packages (
          production_spec_id, prompt_hash, provider, model_name,
          model_version, effective_size, quality
        );
      CREATE INDEX IF NOT EXISTS worldsmith_production_packages_spec_idx
        ON worldsmith_production_packages (production_spec_id);
    `);
    await client.query("COMMIT");
    console.log("✓ WorldSmith production package schema is ready.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("WorldSmith production package migration failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();