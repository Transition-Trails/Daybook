/**
 * Idempotent migration: add notion_retries JSONB column to worldsmith_runs.
 *
 * Stores structured per-request retry events (attempt, path, reason, delay_ms)
 * so admins can spot rate-limiting patterns in the WorldSmith run log.
 *
 * Usage:
 *   npx tsx lib/db/migrations/add-worldsmith-notion-retries.ts
 */

import pg from "pg";

export async function migrate(connectionString?: string): Promise<void> {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(`
      ALTER TABLE worldsmith_runs
        ADD COLUMN IF NOT EXISTS notion_retries jsonb;
    `);
    console.log("[add-worldsmith-notion-retries] ✓ notion_retries column ready");
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
