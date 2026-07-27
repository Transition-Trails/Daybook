/**
 * Support system v2 migration.
 * Adds close_reason, close_note, closed_at to the tickets table.
 * Safe to re-run (IF NOT EXISTS).
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS close_reason text,
      ADD COLUMN IF NOT EXISTS close_note   text,
      ADD COLUMN IF NOT EXISTS closed_at    timestamptz;
  `);
  console.log("✓ tickets: close_reason, close_note, closed_at added");

  // Index for the patterns query (GROUP BY close_reason WHERE closed_at >= ...)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS tickets_close_reason_idx
      ON tickets (close_reason, closed_at)
      WHERE close_reason IS NOT NULL;
  `);
  console.log("✓ index tickets_close_reason_idx created");
} finally {
  await pool.end();
}
