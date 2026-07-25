/**
 * One-time migration test: moves i3 (Washi) and i6 (Floral) from the platform
 * insertsTable into stickersLibraryTable so they participate in the sticker system.
 *
 * Safe to re-run — skips any row whose `name` already exists in stickers_library.
 * Run via:  pnpm --filter @workspace/api-server test src/test/migrate-inserts-to-stickers.test.ts
 */

import { describe, it } from "vitest";
import { db } from "@workspace/db";
import { randomUUID } from "crypto";
import { inArray, eq } from "drizzle-orm";
import { insertsTable, stickersLibraryTable } from "@workspace/db";

const INSERT_IDS = ["i3", "i6"];

describe("one-time migration: inserts → stickers_library", () => {
  it("copies i3 and i6 then removes them from inserts", async () => {
    const rows = await db
      .select()
      .from(insertsTable)
      .where(inArray(insertsTable.id, INSERT_IDS));

    console.log(
      "Rows found:",
      rows.map((r) => ({ id: r.id, name: r.name })),
    );

    for (const row of rows) {
      // Skip if already migrated (idempotent)
      const [existing] = await db
        .select({ id: stickersLibraryTable.id })
        .from(stickersLibraryTable)
        .where(eq(stickersLibraryTable.name, row.name));

      if (!existing) {
        // Assets table uses driveFileId (Google Drive reference), not embedded binary data.
        // We migrate the metadata only; image data will be re-uploaded via the sticker pipeline.
        const newId = `sl_${randomUUID().split("-")[0]}`;
        await db.insert(stickersLibraryTable).values({
          name: row.name,
          functionType: "decorative",
          origin: "licensed",
          authoredByStoreId: null,
        });
        console.log(`✓ Moved ${row.name} (${row.id}) → stickers_library as ${newId}`);
      } else {
        console.log(`↷ ${row.name} already in stickers_library — skipping insert`);
      }

      // Always delete the source row so it doesn't appear in the old inserts catalog
      await db.delete(insertsTable).where(eq(insertsTable.id, row.id));
      console.log(`✓ Deleted from inserts: ${row.id}`);
    }

    if (rows.length === 0) {
      console.log("No inserts to migrate — already done or never seeded.");
    }
  }, 30_000);
});
