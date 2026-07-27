/**
 * Idempotent migration: add set_id column to stickers_library and backfill
 * existing generated sets from the name-prefix heuristic.
 *
 * Logic:
 *  1. ALTER TABLE … ADD COLUMN IF NOT EXISTS set_id TEXT
 *  2. For every row whose name contains " — " and whose set_id is still NULL,
 *     set set_id to the text before the first " — ".
 *     e.g. "Date coverup — 1" → set_id = "Date coverup"
 *
 * Idempotent: running more than once is safe — the ADD COLUMN is guarded by
 * IF NOT EXISTS and the UPDATE only touches rows where set_id IS NULL.
 */
import pg from "pg";

export async function migrate(connectionString?: string): Promise<{
  backfilled: number;
  report: string;
}> {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const pool = new pg.Pool({ connectionString: url });
  try {
    // Step 1: add the column (safe to call multiple times)
    await pool.query(`
      ALTER TABLE stickers_library
      ADD COLUMN IF NOT EXISTS set_id TEXT;
    `);

    // Step 2: backfill rows where name matches the " — " separator pattern
    const result = await pool.query(`
      UPDATE stickers_library
      SET set_id = SUBSTRING(name FROM 1 FOR POSITION(' — ' IN name) - 1)
      WHERE name LIKE '% — %'
        AND set_id IS NULL;
    `);

    const n = result.rowCount ?? 0;
    return {
      backfilled: n,
      report: `set_id column added. Backfilled ${n} row${n !== 1 ? "s" : ""}.`,
    };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrate()
    .then(({ report }) => { console.log(report); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
