/**
 * Ink feature-flag migration.
 * Adds ink_enabled (boolean, default false) to store_flags.
 * Safe to re-run (IF NOT EXISTS).
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`
    ALTER TABLE store_flags
      ADD COLUMN IF NOT EXISTS ink_enabled boolean NOT NULL DEFAULT false;
  `);
  console.log("✓ store_flags: ink_enabled column added (default false)");
} finally {
  await pool.end();
}
