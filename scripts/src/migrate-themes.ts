/**
 * migrate-themes — consolidates 9 colour-only theme shells into 4 genuine
 * bundled themes, each carrying multiple palettes, a font pairing, and a
 * starter background.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-themes
 *
 * SAFE: soft-deletes deprecated theme rows only; all palette rows are preserved;
 * existing planner configs that reference a deprecated themeId still resolve
 * because the generation system does a raw SELECT without a status filter.
 * Previously generated PDFs are not touched.
 *
 * Before → After summary
 * ──────────────────────────────────────────────────────────────────────────────
 * Warm Earth  (t1, was Terracotta/starter/live/$0)  → + Sunrise palette
 * Botanicals  (t2, was Sage Calm /starter/live/$0)  → + Forest palette
 * Deep Ocean  (t3, was Ocean     /licensed/draft/$4) → + Ocean Mist palette
 * Velvet Night(t5, was Plum      /licensed/draft/$5) → + Crimson Dusk + Smoky Quartz palettes
 *
 * Soft-deleted: t4 Sunrise, t6 Forest, th_8b7796f44866 Ocean Mist,
 *               th_c0002647ec4c Crimson Dusk, th_bfe83c2cbec2 StaffRenamed,
 *               test-theme-noglobal-tcumc5nv No-Global Theme
 */
import { pool } from "@workspace/db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Step 1: Add is_primary column if it doesn't exist ────────────────────
    console.log("1. Adding is_primary column to theme_palettes…");
    await client.query(`
      ALTER TABLE theme_palettes
        ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // ── Step 2: Rename surviving themes + set font pairings ──────────────────
    console.log("2. Renaming and enriching surviving themes…");

    const themeUpdates = [
      {
        id: "t1",
        name: "Warm Earth",
        fontPairing: JSON.stringify({ heading: "Playfair Display", subheading: "Playfair Display", body: "Lato", accent: "Playfair Display SC" }),
      },
      {
        id: "t2",
        name: "Botanicals",
        fontPairing: JSON.stringify({ heading: "Cormorant Garamond", subheading: "Cormorant Garamond", body: "Source Sans Pro", accent: "Cormorant SC" }),
      },
      {
        id: "t3",
        name: "Deep Ocean",
        fontPairing: JSON.stringify({ heading: "Spectral", subheading: "Spectral", body: "Work Sans", accent: "Spectral SC" }),
      },
      {
        id: "t5",
        name: "Velvet Night",
        fontPairing: JSON.stringify({ heading: "Crimson Pro", subheading: "Crimson Pro", body: "Instrument Sans", accent: "Cinzel" }),
      },
    ];

    for (const t of themeUpdates) {
      await client.query(
        "UPDATE themes SET name=$1, font_pairing=$2 WHERE id=$3",
        [t.name, t.fontPairing, t.id],
      );
      console.log(`   ✅  ${t.id} → "${t.name}"`);
    }

    // ── Step 3: Mark existing single-palette entries as primary ──────────────
    console.log("3. Marking existing palette entries as primary…");
    await client.query(`
      UPDATE theme_palettes SET is_primary = TRUE
      WHERE theme_id IN ('t1', 't2', 't3', 't5');
    `);

    // ── Step 4: Add additional palettes to surviving themes ───────────────────
    // t1 Warm Earth   → + Sunrise   (pal_51548fd3690e)
    // t2 Botanicals   → + Forest    (pal_e3ba28bde919)
    // t3 Deep Ocean   → + Ocean Mist(pal_df305e227b73)
    // t5 Velvet Night → + Crimson Dusk (pal_c0df5bbd07c2), + Smoky Quartz (pal_9f1b36a00c64)
    console.log("4. Linking additional palettes to bundled themes…");

    const paletteLinks = [
      { themeId: "t1", paletteId: "pal_51548fd3690e", position: 1, isPrimary: false }, // Sunrise
      { themeId: "t2", paletteId: "pal_e3ba28bde919", position: 1, isPrimary: false }, // Forest
      { themeId: "t3", paletteId: "pal_df305e227b73", position: 1, isPrimary: false }, // Ocean Mist
      { themeId: "t5", paletteId: "pal_c0df5bbd07c2", position: 1, isPrimary: false }, // Crimson Dusk
      { themeId: "t5", paletteId: "pal_9f1b36a00c64", position: 2, isPrimary: false }, // Smoky Quartz
    ];

    for (const l of paletteLinks) {
      await client.query(
        `INSERT INTO theme_palettes (theme_id, palette_id, position, is_primary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ON CONSTRAINT theme_palette_uq
         DO UPDATE SET position = EXCLUDED.position, is_primary = EXCLUDED.is_primary`,
        [l.themeId, l.paletteId, l.position, l.isPrimary],
      );
    }
    console.log(`   ✅  Added ${paletteLinks.length} palette links`);

    // ── Step 5: Link starter backgrounds to themes ────────────────────────────
    // Warm Cream → Warm Earth, Botanicals
    // Fog White  → Deep Ocean
    // Charcoal   → Velvet Night
    console.log("5. Linking starter backgrounds to themes…");

    const bgLinks = [
      { themeId: "t1", bgId: "bg_starter_warm_cream", position: 0 },
      { themeId: "t2", bgId: "bg_starter_fog_white",  position: 0 },
      { themeId: "t3", bgId: "bg_starter_fog_white",  position: 0 },
      { themeId: "t3", bgId: "bg_starter_soft_grid",  position: 1 },
      { themeId: "t5", bgId: "bg_starter_charcoal",   position: 0 },
    ];

    for (const b of bgLinks) {
      // Skip if background doesn't exist yet (seed might not have run)
      const { rows } = await client.query("SELECT id FROM backgrounds WHERE id=$1", [b.bgId]);
      if (!rows.length) {
        console.log(`   ⚠️   Background ${b.bgId} not found — skipping`);
        continue;
      }
      await client.query(
        `INSERT INTO theme_backgrounds (theme_id, background_id, position)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT theme_background_uq DO NOTHING`,
        [b.themeId, b.bgId, b.position],
      );
    }
    console.log(`   ✅  Background links done`);

    // ── Step 6: Soft-delete deprecated colour-only theme shells ───────────────
    const deprecated = [
      "t4",                          // Sunrise (palette stays; theme shell redundant)
      "t6",                          // Forest  (palette stays; theme shell redundant)
      "th_8b7796f44866",             // Ocean Mist
      "th_c0002647ec4c",             // Crimson Dusk
      "th_bfe83c2cbec2",             // StaffRenamed (test data)
      "test-theme-noglobal-tcumc5nv",// No-Global Theme (test data)
    ];
    console.log("6. Soft-deleting deprecated theme shells…");
    const { rowCount } = await client.query(
      `UPDATE themes SET status = 'deleted' WHERE id = ANY($1)`,
      [deprecated],
    );
    console.log(`   ✅  ${rowCount} theme(s) marked deleted`);

    await client.query("COMMIT");

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n✅  Migration complete.");
    const { rows: surviving } = await client.query(
      `SELECT t.id, t.name, t.status, t.origin, t.price,
              COUNT(tp.id) AS palette_count
       FROM themes t
       LEFT JOIN theme_palettes tp ON tp.theme_id = t.id
       WHERE t.status != 'deleted'
       GROUP BY t.id
       ORDER BY t.name`,
    );
    console.log("\nSurviving themes:");
    for (const row of surviving) {
      console.log(`  ${row.id}  "${row.name}"  status=${row.status}  origin=${row.origin}  price=${row.price}  palettes=${row.palette_count}`);
    }

    const { rows: paletteRows } = await client.query(
      `SELECT t.name AS theme_name, p.name AS palette_name, tp.is_primary
       FROM theme_palettes tp
       JOIN themes t ON t.id = tp.theme_id
       JOIN palettes p ON p.id = tp.palette_id
       WHERE t.status != 'deleted'
       ORDER BY t.name, tp.position`,
    );
    console.log("\nPalette associations:");
    for (const row of paletteRows) {
      console.log(`  ${row.theme_name}  →  ${row.palette_name}${row.is_primary ? "  [primary]" : ""}`);
    }

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
