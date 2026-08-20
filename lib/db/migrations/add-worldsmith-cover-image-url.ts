/**
 * Idempotent migration: add cover_image_url column to worldsmith_worlds.
 *
 * Stores the object-storage path of the hero background image uploaded
 * from FocusedWorldView in WorldSmithHome.
 *
 * Usage:
 *   npx tsx lib/db/migrations/add-worldsmith-cover-image-url.ts
 */

import pg from "pg";

export async function migrate(connectionString?: string): Promise<void> {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(`
      ALTER TABLE worldsmith_worlds
        ADD COLUMN IF NOT EXISTS cover_image_url text;
    `);
    console.log("[add-worldsmith-cover-image-url] ✓ cover_image_url column ready");
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
