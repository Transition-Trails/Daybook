/**
 * patch-world-prod-spec-db — sets the correct Notion production-spec DB ID
 * on all worldsmith worlds.
 *
 * Run: pnpm --filter @workspace/scripts run patch-world-prod-spec-db
 */
import { pool } from "@workspace/db";

// From https://app.notion.com/p/19097db31e7c4e8cb45c1b21cf414497
const CORRECT_DB_ID = "19097db3-1e7c-4e8c-b45c-1b21cf414497";

const before = await pool.query(
  "SELECT id, name, notion_production_db_id FROM worldsmith_worlds ORDER BY name"
);
console.log("\nWorldsmith worlds (before):");
for (const row of before.rows) {
  console.log(`  ${row.name} (${row.id})  →  ${row.notion_production_db_id ?? "(null)"}`);
}

const updated = await pool.query(
  `UPDATE worldsmith_worlds
   SET notion_production_db_id = $1
   WHERE notion_production_db_id IS DISTINCT FROM $1
   RETURNING id, name`,
  [CORRECT_DB_ID]
);

if (updated.rows.length > 0) {
  console.log(`\n✓ Updated notion_production_db_id → ${CORRECT_DB_ID} on:`);
  for (const r of updated.rows) console.log(`    ${r.name} (${r.id})`);
} else {
  console.log(`\n✓ Already set correctly — no rows changed.`);
}

await pool.end();
