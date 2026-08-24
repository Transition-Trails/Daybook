/**
 * migrate-theme-studio — creates the six new catalog tables and six new
 * theme-bundle join tables required by Theme Studio.
 *
 * Safe to re-run: every statement uses CREATE TABLE IF NOT EXISTS.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-theme-studio
 */
import { pool } from "@workspace/db";

async function main() {
  console.log("🎨  migrate-theme-studio — creating new tables…\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Catalog tables ────────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS hardware (
        id                  TEXT        PRIMARY KEY,
        name                TEXT        NOT NULL,
        kind                TEXT        NOT NULL,   -- coil | twin-loop | discs | 3-ring
        finish              TEXT,                   -- brass | silver | black | rose-gold | white
        status              TEXT        NOT NULL DEFAULT 'draft',
        global_available    BOOLEAN     NOT NULL DEFAULT TRUE,
        origin              TEXT        NOT NULL DEFAULT 'licensed',
        authored_by_store_id TEXT       REFERENCES stores(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  ✓ hardware");

    await client.query(`
      CREATE TABLE IF NOT EXISTS accessories (
        id                  TEXT        PRIMARY KEY,
        name                TEXT        NOT NULL,
        kind                TEXT        NOT NULL,   -- clip | tab | bookmark | page-marker
        status              TEXT        NOT NULL DEFAULT 'draft',
        global_available    BOOLEAN     NOT NULL DEFAULT TRUE,
        origin              TEXT        NOT NULL DEFAULT 'licensed',
        authored_by_store_id TEXT       REFERENCES stores(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  ✓ accessories");

    await client.query(`
      CREATE TABLE IF NOT EXISTS fonts (
        id                  TEXT        PRIMARY KEY,
        family_name         TEXT        NOT NULL,
        variants            JSONB       NOT NULL DEFAULT '[]',
        sample_url          TEXT,
        notes               TEXT,
        curated_pairings    JSONB       NOT NULL DEFAULT '[]',
        status              TEXT        NOT NULL DEFAULT 'draft',
        global_available    BOOLEAN     NOT NULL DEFAULT TRUE,
        origin              TEXT        NOT NULL DEFAULT 'licensed',
        authored_by_store_id TEXT       REFERENCES stores(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  ✓ fonts");

    // ── Theme join tables ─────────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS theme_inserts (
        id          SERIAL PRIMARY KEY,
        theme_id    TEXT    NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
        insert_id   TEXT    NOT NULL REFERENCES inserts(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT theme_insert_uq UNIQUE (theme_id, insert_id)
      );
    `);
    console.log("  ✓ theme_inserts");

    await client.query(`
      CREATE TABLE IF NOT EXISTS theme_widgets (
        id          SERIAL PRIMARY KEY,
        theme_id    TEXT    NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
        widget_id   TEXT    NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT theme_widget_uq UNIQUE (theme_id, widget_id)
      );
    `);
    console.log("  ✓ theme_widgets");

    await client.query(`
      CREATE TABLE IF NOT EXISTS theme_covers (
        id          SERIAL PRIMARY KEY,
        theme_id    TEXT    NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
        insert_id   TEXT    NOT NULL REFERENCES inserts(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT theme_cover_uq UNIQUE (theme_id, insert_id)
      );
    `);
    console.log("  ✓ theme_covers");

    await client.query(`
      CREATE TABLE IF NOT EXISTS theme_hardware (
        id           SERIAL PRIMARY KEY,
        theme_id     TEXT    NOT NULL REFERENCES themes(id)   ON DELETE CASCADE,
        hardware_id  TEXT    NOT NULL REFERENCES hardware(id) ON DELETE CASCADE,
        position     INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT theme_hardware_uq UNIQUE (theme_id, hardware_id)
      );
    `);
    console.log("  ✓ theme_hardware");

    await client.query(`
      CREATE TABLE IF NOT EXISTS theme_accessories (
        id             SERIAL PRIMARY KEY,
        theme_id       TEXT    NOT NULL REFERENCES themes(id)      ON DELETE CASCADE,
        accessory_id   TEXT    NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
        position       INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT theme_accessory_uq UNIQUE (theme_id, accessory_id)
      );
    `);
    console.log("  ✓ theme_accessories");

    await client.query(`
      CREATE TABLE IF NOT EXISTS theme_fonts (
        id          SERIAL PRIMARY KEY,
        theme_id    TEXT    NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
        font_id     TEXT    NOT NULL REFERENCES fonts(id)  ON DELETE CASCADE,
        position    INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT theme_font_uq UNIQUE (theme_id, font_id)
      );
    `);
    console.log("  ✓ theme_fonts");

    await client.query("COMMIT");
    console.log("\n  Done — 9 tables created (IF NOT EXISTS).");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main().catch(console.error).finally(() => process.exit());
