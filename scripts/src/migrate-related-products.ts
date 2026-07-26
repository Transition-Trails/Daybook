/**
 * One-shot migration: related_products → editions
 *
 * Reads every non-deleted row from related_products and upserts it into
 * editions with the correct productType derived from the legacy `kind` field.
 * The ORIGINAL ID is preserved so every existing foreign-key reference
 * (owned-catalog attachable list, edition.products[], storeInsertsTable, etc.)
 * continues to resolve without any change to calling code.
 *
 * Safe to re-run: ON CONFLICT DO NOTHING makes it fully idempotent.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-related-products
 */
import { pool } from "@workspace/db";

/** Derive productType from the legacy `kind` text field.
 *  kind examples: "Notebook · notes", "Journal · bullet", "Memory keeping · scrapbook"
 */
function kindToProductType(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("journal"))  return "journal";
  if (k.includes("memory"))   return "memory-keeping";
  return "notebook"; // default for all notebook / unknown variants
}

async function main() {
  console.log("migrate-related-products — inserting related_products rows into editions…\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Load all non-deleted related_products rows
    const { rows: products } = await client.query<{
      id:                  string;
      name:                string;
      status:              string;
      kind:                string;
      price:               number | null;
      global_available:    boolean;
      origin:              string;
      authored_by_store_id: string | null;
    }>(
      `SELECT id, name, status, kind, price, global_available, origin, authored_by_store_id
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
      const productType = kindToProductType(rp.kind ?? "");

      // Preserve the original ID so existing references resolve unchanged.
      const { rowCount } = await client.query(
        `INSERT INTO editions
           (id, name, status, tier, origin, product_type,
            price_low, price_high, global_available, authored_by_store_id,
            sections, themes, packs, inserts, products,
            created_at, updated_at)
         VALUES
           ($1, $2, $3, 'basic', $4, $5,
            $6, $6, $7, $8,
            '{}'::text[], '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
            NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          rp.id,
          rp.name,
          rp.status === "live" ? "live" : "draft",
          rp.origin,
          productType,
          rp.price ?? 0,
          rp.global_available ?? true,
          rp.authored_by_store_id ?? null,
        ],
      );

      if (rowCount && rowCount > 0) {
        console.log(`  created  ${rp.id}  "${rp.name}"  (${productType})`);
        created++;
      } else {
        console.log(`  skipped  ${rp.id}  (already in editions)`);
        skipped++;
      }
    }

    await client.query("COMMIT");
    console.log(`\nDone — ${created} created, ${skipped} skipped.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main().catch(console.error).finally(() => process.exit());
