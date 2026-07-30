/**
 * seed-house-clear.ts — Remove all dogfood rows from the Pixel Perfect Plans house store.
 *
 * Deletes every row whose primary key starts with "hs_" from all relevant tables,
 * plus clears store_catalog entries for store-house that reference hs_ item IDs.
 * Theme bundle join rows cascade automatically from their parent theme deletes.
 *
 * SAFE: does NOT touch platform starter/licensed content (t1-t6, p1-p3, etc.),
 *       ci_bad_ QA fixtures, or planner configs for other stores.
 *
 * The artifact guarantee holds: we only delete the SEEDED planner_config row
 * (hs_cfg_2026_daily). Its Drive reference is a placeholder — no real file exists
 * in Drive that could be affected.
 *
 * Run: pnpm --filter @workspace/scripts run seed-house:clear
 */
import { pool } from "@workspace/db";

async function main() {
  console.log("🗑️   Clearing house store dogfood data (hs_* rows)…\n");

  type CountRow = { count: string };

  // Ordered to respect FK constraints.
  // Join tables that CASCADE from themes/packs are handled automatically,
  // but we list them for visibility.
  const steps: Array<{ label: string; sql: string }> = [
    // Join tables first (safe even if cascade already removed them)
    { label: "pack_stickers",          sql: "DELETE FROM pack_stickers WHERE pack_id LIKE 'hs_%'" },
    { label: "theme_palettes",         sql: "DELETE FROM theme_palettes WHERE theme_id LIKE 'hs_%'" },
    { label: "theme_backgrounds",      sql: "DELETE FROM theme_backgrounds WHERE theme_id LIKE 'hs_%'" },
    { label: "theme_packs",            sql: "DELETE FROM theme_packs WHERE theme_id LIKE 'hs_%'" },
    { label: "theme_inserts",          sql: "DELETE FROM theme_inserts WHERE theme_id LIKE 'hs_%'" },
    { label: "theme_covers",           sql: "DELETE FROM theme_covers WHERE theme_id LIKE 'hs_%'" },
    { label: "theme_hardware",         sql: "DELETE FROM theme_hardware WHERE theme_id LIKE 'hs_%'" },
    { label: "theme_accessories",      sql: "DELETE FROM theme_accessories WHERE theme_id LIKE 'hs_%'" },
    { label: "theme_fonts",            sql: "DELETE FROM theme_fonts WHERE theme_id LIKE 'hs_%'" },
    // ticket_replies cascade from tickets; list for visibility
    { label: "ticket_replies",         sql: "DELETE FROM ticket_replies WHERE ticket_id LIKE 'hs_%'" },
    // Operational data
    { label: "tickets",                sql: "DELETE FROM tickets WHERE id LIKE 'hs_%'" },
    { label: "orders",                 sql: "DELETE FROM orders WHERE id LIKE 'hs_%'" },
    { label: "planner_configs",        sql: "DELETE FROM planner_configs WHERE id LIKE 'hs_%'" },
    // store_catalog entries for house-store hs_ items
    { label: "store_catalog (hs_*)",   sql: "DELETE FROM store_catalog WHERE store_id = 'store-house' AND item_id LIKE 'hs_%'" },
    // Catalog items
    { label: "stickers_library",       sql: "DELETE FROM stickers_library WHERE id LIKE 'hs_%'" },
    { label: "sticker_packs",          sql: "DELETE FROM sticker_packs WHERE id LIKE 'hs_%'" },
    { label: "inserts",                sql: "DELETE FROM inserts WHERE id LIKE 'hs_%'" },
    { label: "widgets",                sql: "DELETE FROM widgets WHERE id LIKE 'hs_%'" },
    { label: "themes",                 sql: "DELETE FROM themes WHERE id LIKE 'hs_%'" },
    { label: "palettes",               sql: "DELETE FROM palettes WHERE id LIKE 'hs_%'" },
    { label: "backgrounds",            sql: "DELETE FROM backgrounds WHERE id LIKE 'hs_%'" },
    { label: "editions",               sql: "DELETE FROM editions WHERE id LIKE 'hs_%'" },
  ];

  let total = 0;
  for (const step of steps) {
    const res = await pool.query<CountRow>(
      `WITH deleted AS (${step.sql} RETURNING 1) SELECT count(*) FROM deleted`,
    );
    const n = Number(res.rows[0].count);
    if (n > 0) {
      console.log(`  ✓ ${step.label.padEnd(28)} ${n} row${n !== 1 ? "s" : ""} deleted`);
      total += n;
    }
  }

  if (total === 0) {
    console.log("  (nothing to clear — house store already empty)");
  } else {
    console.log(`\n  Total: ${total} rows removed.`);
  }

  // Confirm no hs_ rows remain in main tables
  const checks = await Promise.all([
    pool.query<CountRow>("SELECT count(*) FROM themes WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM stickers_library WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM editions WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM orders WHERE id LIKE 'hs_%'"),
  ]);
  const remaining = checks.reduce((s, r) => s + Number(r.rows[0].count), 0);
  if (remaining > 0) {
    console.warn(`\n  ⚠️  ${remaining} hs_ rows still present — check for FK constraints preventing deletion.`);
  } else {
    console.log("\n✅  Clear complete — no hs_* rows remain.\n");
  }

  process.exit(0);
}

main().catch(err => {
  console.error("\n❌  Clear failed:", err);
  process.exit(1);
});
