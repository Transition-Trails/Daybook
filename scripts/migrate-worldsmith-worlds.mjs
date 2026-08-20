/**
 * One-shot migration: create the worldsmith_worlds table.
 * Run with: node scripts/migrate-worldsmith-worlds.mjs
 */
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS worldsmith_worlds (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        code                    TEXT NOT NULL,
        description             TEXT NOT NULL DEFAULT '',
        status                  TEXT NOT NULL DEFAULT 'in_setup',
        cover_color             TEXT NOT NULL DEFAULT 'linear-gradient(135deg, #1B2A4A 0%, #2A4A6A 100%)',
        cover_accent            TEXT NOT NULL DEFAULT '#C87560',
        current_collection      TEXT,
        current_volume          TEXT,
        owner                   TEXT NOT NULL DEFAULT '',
        tags                    JSONB NOT NULL DEFAULT '[]',
        notion_production_db_id TEXT,
        notion_canon_db_id      TEXT,
        notion_style_guide_id   TEXT,
        drive_folder_id         TEXT,
        image_provider          TEXT,
        created_by              TEXT,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query("COMMIT");
    console.log("✓ worldsmith_worlds table created (or already exists)");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
