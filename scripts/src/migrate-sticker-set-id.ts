/**
 * Idempotent migration: add set_id column to stickers_library and backfill
 * existing generated sets from the name-prefix heuristic.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-sticker-set-id
 */
import { pool } from "@workspace/db";

// Step 1: add the column (safe to call multiple times — IF NOT EXISTS)
await pool.query(`
  ALTER TABLE stickers_library
  ADD COLUMN IF NOT EXISTS set_id TEXT;
`);

// Step 2: backfill rows whose name contains " — " and whose set_id is still NULL
const result = await pool.query<{ rowCount: number }>(`
  UPDATE stickers_library
  SET set_id = SUBSTRING(name FROM 1 FOR POSITION(' — ' IN name) - 1)
  WHERE name LIKE '% — %'
    AND set_id IS NULL;
`);

const n = result.rowCount ?? 0;
console.log(`set_id column added. Backfilled ${n} row${n !== 1 ? "s" : ""}.`);

// Report distinct set_ids now in the table
const { rows } = await pool.query<{ set_id: string; member_count: string }>(`
  SELECT set_id, COUNT(*) as member_count
  FROM stickers_library
  WHERE set_id IS NOT NULL
  GROUP BY set_id
  ORDER BY member_count DESC
  LIMIT 20;
`);
if (rows.length) {
  console.log("\nDistinct set_ids after backfill:");
  rows.forEach((r) => console.log(`  "${r.set_id}" → ${r.member_count} members`));
} else {
  console.log("No rows backfilled (no stickers with \" — \" in name found).");
}

await pool.end();
