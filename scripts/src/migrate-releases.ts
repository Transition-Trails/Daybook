/**
 * migrate-releases — creates the releases + release_notes tables
 * and seeds the Daybook 1.0.0 record.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-releases
 *
 * SAFE: uses CREATE TABLE IF NOT EXISTS; idempotent.
 */
import { pool } from "@workspace/db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── releases ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS releases (
        id            SERIAL PRIMARY KEY,
        version       TEXT NOT NULL UNIQUE,
        version_type  TEXT NOT NULL,
        title         TEXT NOT NULL,
        release_date  TIMESTAMPTZ,
        github_sha    TEXT,
        is_published  BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  ✓ releases");

    // ── release_notes ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS release_notes (
        id          SERIAL PRIMARY KEY,
        release_id  INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        note        TEXT NOT NULL
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS release_notes_release_idx ON release_notes(release_id);
    `);
    console.log("  ✓ release_notes");

    // ── Seed: Daybook 1.0.0 (idempotent) ────────────────────────────────────
    const existing = await client.query(
      `SELECT id FROM releases WHERE version = '1.0.0' LIMIT 1`
    );

    if (existing.rows.length === 0) {
      const insertResult = await client.query(`
        INSERT INTO releases (version, version_type, title, release_date, is_published)
        VALUES ('1.0.0', 'major', 'Daybook Platform Launch', NOW(), TRUE)
        RETURNING id;
      `);
      const releaseId: number = insertResult.rows[0].id;

      const notes = [
        "Multi-tenant store platform with owner, staff, and support roles",
        "Planner Studio: dated and undated planner generation with customisable themes, palettes, and backgrounds",
        "Sticker Studio: pack management, SVG cut-path generation, and Cricut export",
        "Marketing Studio: AI-assisted listing copy, social captions, and product mockup generation",
        "Theme Studio: colour shells, palette composer, and background library",
        "WorldSmith Prompt Compiler: Notion-backed narrative asset pipeline for story-world releases",
        "E-ink and Kindle Scribe export profiles with ink-friendly B&W rendering",
        "Platform-wide product recipe engine for defining new product types without new code",
        "Super admin dashboard with live platform stats, store health, and audit log",
        "Transactional email layer (Resend) with per-store rate limiting and webhook support",
      ];

      for (let i = 0; i < notes.length; i++) {
        await client.query(
          `INSERT INTO release_notes (release_id, sort_order, note) VALUES ($1, $2, $3)`,
          [releaseId, i, notes[i]]
        );
      }

      console.log(`  ✓ Seeded Daybook 1.0.0 with ${notes.length} notes (id=${releaseId})`);
    } else {
      console.log("  ✓ Daybook 1.0.0 already seeded — skipping");
    }

    await client.query("COMMIT");
    console.log("\n✓ Releases migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
