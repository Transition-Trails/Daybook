/**
 * migrate-spec-preview — creates worldsmith_spec_previews table.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-spec-preview
 *
 * SAFE: uses CREATE TABLE IF NOT EXISTS; idempotent.
 */
import { pool } from "@workspace/db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("1. Creating worldsmith_spec_previews table…");
    await client.query(`
      CREATE TABLE IF NOT EXISTS worldsmith_spec_previews (
        id                TEXT PRIMARY KEY,
        spec_page_id      TEXT NOT NULL,
        prompt_hash       TEXT NOT NULL,
        template_version  TEXT NOT NULL DEFAULT 'v1',
        status            TEXT NOT NULL DEFAULT 'pending',
        preview_filename  TEXT,
        provider          TEXT,
        model             TEXT,
        notion_upload_id  TEXT,
        production_item   TEXT,
        previous_status   TEXT,
        new_status        TEXT,
        notion_page_url   TEXT,
        error             TEXT,
        dry_run           BOOLEAN NOT NULL DEFAULT FALSE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    console.log("2. Creating idempotency index…");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_worldsmith_spec_previews_idempotency
        ON worldsmith_spec_previews(spec_page_id, prompt_hash, template_version)
    `);

    await client.query("COMMIT");
    console.log("✓ migrate-spec-preview complete.");
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
