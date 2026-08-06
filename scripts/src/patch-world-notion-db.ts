/**
 * patch-world-notion-db — lists worldsmith worlds and their notion_canon_db_id,
 * and optionally updates them.
 *
 * Run: pnpm --filter @workspace/scripts run patch-world-notion-db
 */
import { pool } from "@workspace/db";

const rows = await pool.query(
  "SELECT id, name, notion_canon_db_id FROM worldsmith_worlds ORDER BY name"
);

console.log("\nWorldsmith worlds:");
for (const row of rows.rows) {
  console.log(`  id=${row.id}  name="${row.name}"  notionCanonDbId=${row.notion_canon_db_id ?? "(null)"}`);
}

// Normalize the correct DB ID from the Notion URL
// https://app.notion.com/p/dc7123b9c6004885967b8cc1b8779e8a?v=…
const CORRECT_DB_ID = "dc7123b9-c600-4885-967b-8cc1b8779e8a";

const updated = await pool.query(
  `UPDATE worldsmith_worlds
   SET notion_canon_db_id = $1
   WHERE notion_canon_db_id IS DISTINCT FROM $1
   RETURNING id, name`,
  [CORRECT_DB_ID]
);

if (updated.rows.length > 0) {
  console.log(`\n✓ Updated notion_canon_db_id → ${CORRECT_DB_ID} on:`);
  for (const r of updated.rows) {
    console.log(`    ${r.name} (${r.id})`);
  }
} else {
  console.log(`\n✓ All worlds already have notion_canon_db_id = ${CORRECT_DB_ID}`);
}

await pool.end();
