/**
 * migrate-notebooks — one-shot migration that turns the 4 legacy
 * related_products rows (notebooks / journals) into proper edition
 * catalog entries with productType set.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-notebooks
 *
 * Safe to re-run: INSERT … ON CONFLICT DO NOTHING so already-migrated
 * rows are silently skipped.
 */
import { pool } from "@workspace/db";

/** Derive an edition productType from the related-product kind string. */
function kindToProductType(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("journal"))  return "journal";
  if (k.includes("memory"))   return "memory-keeping";
  return "notebook"; // covers "Notebook · notes", "Notebook · trackers", etc.
}

async function main() {
  console.log("📚  migrate-notebooks — creating editions from related_products…\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Load all non-deleted related products
    const { rows: products } = await client.query<{
      id: string; name: string; status: string; kind: string;
      price: number | null; global_available: boolean; origin: string;
    }>(
      `SELECT id, name, status, kind, price, global_available, origin
       FROM related_products
       WHERE status <> 'deleted'
       ORDER BY id`,
    );

    if (products.length === 0) {
      console.log("  No related_products rows found — nothing to migrate.");
      await client.query("COMMIT");
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const rp of products) {
      const productType = kindToProductType(rp.kind);
      const editionId   = `ed-nb-${rp.id}`;

      const { rowCount } = await client.query(
        `INSERT INTO editions
           (id, name, status, tier, origin, product_type,
            price_low, price_high, global_available,
            sections, themes, packs, inserts, products,
            created_at, updated_at)
         VALUES
           ($1, $2, $3, 'basic', $4, $5,
            $6, $6, $7,
            '{}'::text[], '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
            NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          editionId,
          rp.name,
          rp.status === "live" ? "live" : "draft",
          rp.origin,
          productType,
          rp.price,
          rp.global_available,
        ],
      );

      if (rowCount && rowCount > 0) {
        console.log(`  ✓ created  ${editionId}  "${rp.name}"  (${productType})`);
        created++;
      } else {
        console.log(`  — skipped  ${editionId}  (already exists)`);
        skipped++;
      }
    }

    await client.query("COMMIT");
    console.log(`\n  Done — ${created} created, ${skipped} skipped.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main().catch(console.error).finally(() => process.exit());
