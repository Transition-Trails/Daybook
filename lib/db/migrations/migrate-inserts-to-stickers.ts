/**
 * Idempotent migration: move mis-filed insert rows i3 and i6 to stickers_library.
 *
 * i3 "Washi tape strip" (cat: Decorative) → stickers_library, functionType: "decorative"
 * i6 "Floral cover spray" (cat: Cover art) → stickers_library, functionType: "decorative"
 *
 * The migration is idempotent: if the sticker row already exists (checked by name
 * match within stickers_library), the insert row is still deleted but no duplicate
 * sticker is created. Runs standalone — import and call migrate() from a script.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, inArray } from "drizzle-orm";
import { insertsTable, stickersLibraryTable } from "../schema";

const INSERT_IDS = ["i3", "i6"] as const;

export async function migrate(connectionString?: string): Promise<{
  moved: Array<{ oldInsertId: string; newStickerId: string; name: string }>;
  skipped: string[];
  deleted: string[];
  report: string;
}> {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);

  const moved: Array<{ oldInsertId: string; newStickerId: string; name: string }> = [];
  const skipped: string[] = [];
  const deleted: string[] = [];

  try {
    // Fetch the source rows
    const rows = await db
      .select()
      .from(insertsTable)
      .where(inArray(insertsTable.id, INSERT_IDS as unknown as string[]));

    for (const row of rows) {
      // Check idempotency: look for an existing sticker with the same name in the same store
      const [existing] = await db
        .select({ id: stickersLibraryTable.id })
        .from(stickersLibraryTable)
        .where(eq(stickersLibraryTable.name, row.name));

      if (existing) {
        console.log(`[migrate-inserts] SKIP: sticker "${row.name}" already exists as ${existing.id}`);
        skipped.push(row.id);
      } else {
        const [newSticker] = await db
          .insert(stickersLibraryTable)
          .values({
            name: row.name,
            functionType: "decorative",
            status: row.status as "draft" | "live",
            origin: row.origin as "starter" | "licensed" | "owned",
            authoredByStoreId: row.authoredByStoreId ?? null,
            tags: [],
            borderStyle: "none",
            exportTargets: { goodnotes: true, ink: true, cricut: false },
            generationType: null,
            sourceType: "flat-art",
            setLabel: null,
            fileNamePattern: null,
            processedImageData: null,
            cutlineSvg: null,
          })
          .returning();

        moved.push({ oldInsertId: row.id, newStickerId: newSticker.id, name: row.name });
        console.log(`[migrate-inserts] MOVED: insert ${row.id} → sticker ${newSticker.id} ("${row.name}")`);
      }

      // Always delete the original insert row (idempotent — if already moved, clean up)
      await db.delete(insertsTable).where(eq(insertsTable.id, row.id));
      deleted.push(row.id);
      console.log(`[migrate-inserts] DELETED: insert ${row.id}`);
    }

    const report = [
      "=== Insert taxonomy migration report ===",
      `Source rows found: ${rows.length}`,
      `Moved to stickers_library: ${moved.length}`,
      ...moved.map(
        (m) => `  • ${m.oldInsertId} → ${m.newStickerId} ("${m.name}")`,
      ),
      `Skipped (already existed): ${skipped.length}`,
      ...skipped.map((id) => `  • ${id}`),
      `Insert rows deleted: ${deleted.length}`,
      ...deleted.map((id) => `  • ${id}`),
    ].join("\n");

    console.log(report);
    return { moved, skipped, deleted, report };
  } finally {
    await pool.end();
  }
}

// ── CLI entry point ──────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(({ report }) => { console.log("\n" + report); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
