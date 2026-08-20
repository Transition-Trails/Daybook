/**
 * migrate-worldsmith-stories — creates Story, Act, Encounter, Journal Prompt tables.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-worldsmith-stories
 *
 * SAFE: uses CREATE TABLE IF NOT EXISTS; idempotent.
 */
import { pool } from "@workspace/db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Stories ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ws_stories (
        id          TEXT PRIMARY KEY,
        world_id    TEXT NOT NULL,
        title       TEXT NOT NULL,
        summary     TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'draft',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_by  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_stories_world_idx ON ws_stories(world_id);`);
    console.log("  ✓ ws_stories");

    // ── Story Acts ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ws_story_acts (
        id          TEXT PRIMARY KEY,
        story_id    TEXT NOT NULL REFERENCES ws_stories(id) ON DELETE CASCADE,
        world_id    TEXT NOT NULL,
        act_number  INTEGER NOT NULL DEFAULT 1,
        title       TEXT NOT NULL,
        tagline     TEXT NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_story_acts_story_idx ON ws_story_acts(story_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_story_acts_world_idx ON ws_story_acts(world_id);`);
    console.log("  ✓ ws_story_acts");

    // ── Encounters ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ws_encounters (
        id                  TEXT PRIMARY KEY,
        act_id              TEXT NOT NULL REFERENCES ws_story_acts(id) ON DELETE CASCADE,
        location_record_id  TEXT,
        trigger_text        TEXT NOT NULL DEFAULT '',
        description         TEXT NOT NULL DEFAULT '',
        roll_type           TEXT,
        outcome_text        TEXT NOT NULL DEFAULT '',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_encounters_act_idx ON ws_encounters(act_id);`);
    console.log("  ✓ ws_encounters");

    // ── Journal Prompts ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ws_journal_prompts (
        id          TEXT PRIMARY KEY,
        record_id   TEXT NOT NULL,
        story_id    TEXT REFERENCES ws_stories(id) ON DELETE SET NULL,
        prompt_text TEXT NOT NULL,
        hint_label  TEXT NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_journal_prompts_record_idx ON ws_journal_prompts(record_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_journal_prompts_story_idx ON ws_journal_prompts(story_id);`);
    console.log("  ✓ ws_journal_prompts");

    // ── Canon Record → Story Act links ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ws_canon_record_story_links (
        canon_record_id TEXT NOT NULL,
        story_id        TEXT NOT NULL REFERENCES ws_stories(id) ON DELETE CASCADE,
        act_id          TEXT REFERENCES ws_story_acts(id) ON DELETE SET NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (canon_record_id, story_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_crsl_record_idx ON ws_canon_record_story_links(canon_record_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS ws_crsl_story_idx ON ws_canon_record_story_links(story_id);`);
    console.log("  ✓ ws_canon_record_story_links");

    await client.query("COMMIT");
    console.log("\n✅  WorldSmith Stories migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed — rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
