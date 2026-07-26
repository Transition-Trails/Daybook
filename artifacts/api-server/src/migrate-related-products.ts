/**
 * One-shot migration: merge related_products rows into the editions table.
 *
 * Safe to re-run — uses IF NOT EXISTS for ALTER statements and
 * ON CONFLICT DO NOTHING for inserts, so existing data is never overwritten.
 *
 * Run with:
 *   cd artifacts/api-server && npx tsx src/migrate-related-products.ts
 *   -- or --
 *   pnpm --filter @workspace/api-server run migrate-related-products
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { relatedProductsTable } from "@workspace/db";

async function main() {
  console.log("▶ Step 1: add product_type + binding columns to editions");
  await db.execute(sql`
    ALTER TABLE editions
      ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'planner',
      ADD COLUMN IF NOT EXISTS binding jsonb
  `);
  console.log("  ✓ editions.product_type, editions.binding");

  console.log("▶ Step 2: add product_type column to planner_configs");
  await db.execute(sql`
    ALTER TABLE planner_configs
      ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'planner'
  `);
  console.log("  ✓ planner_configs.product_type");

  console.log("▶ Step 3: read all related_products rows");
  const products = await db.select().from(relatedProductsTable);
  console.log(`  found ${products.length} row(s)`);

  console.log("▶ Step 4: upsert into editions (ON CONFLICT DO NOTHING)");
  let inserted = 0;
  let skipped = 0;

  for (const p of products) {
    const kind = (p.kind ?? "").toLowerCase();
    let productType = "notebook";
    if (kind.includes("journal")) productType = "journal";
    else if (kind.includes("memory")) productType = "memory-keeping";

    try {
      await db.execute(sql`
        INSERT INTO editions (
          id, name, status, tier, sections,
          price_low, price_high,
          themes, packs, inserts, products,
          art,
          global_available, origin, authored_by_store_id,
          product_type, binding,
          created_at, updated_at
        )
        VALUES (
          ${p.id},
          ${p.name},
          ${p.status},
          'basic',
          ARRAY[]::text[],
          ${p.price},
          ${p.price},
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          '{"cover":null,"first":null,"divider":null,"weekly":null,"daily":null,"notes":null}'::jsonb,
          ${p.globalAvailable},
          ${p.origin},
          ${p.authoredByStoreId ?? null},
          ${productType},
          '{"type":"coil","finish":"silver"}'::jsonb,
          ${p.createdAt?.toISOString() ?? new Date().toISOString()},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `);
      console.log(`  ✓ ${p.id}  "${p.name}"  → ${productType}`);
      inserted++;
    } catch (err) {
      console.log(`  ⚠ skipped ${p.id} "${p.name}": ${err}`);
      skipped++;
    }
  }

  console.log(`\n✅ Migration complete — inserted: ${inserted}, skipped: ${skipped}`);
}

main()
  .catch((err) => { console.error("Migration failed:", err); process.exit(1); })
  .finally(() => process.exit(0));
