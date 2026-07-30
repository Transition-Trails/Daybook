/**
 * seed-kit-vgj.ts — Victorian Garden Journal (VGJ) kit catalog seed.
 *
 * Creates 8 themed palette+theme+background kits designed around a Victorian
 * botanical / nature-journaling aesthetic. Each kit ships with:
 *   - 1 platform palette (6 colors: ink, paper, accent, secondary, tertiary, quaternary)
 *   - 1 platform theme referencing that palette
 *   - 3 placeholder background rows (type: "texture", assetRef: null, status: "draft")
 *     These are ready to be populated via the AI background generation route
 *     POST /stores/:storeId/backgrounds/generate.
 *   - theme_palettes + theme_backgrounds join rows
 *
 * Run:   pnpm --filter @workspace/scripts run seed-kit-vgj
 *
 * All rows use the "vgj_" id prefix for easy identification and cleanup.
 * Safe to re-run — uses `onConflictDoNothing`.
 */

import { db, pool } from "@workspace/db";
import {
  palettesTable,
  backgroundsTable,
  themesTable,
  themePalettesTable,
  themeBackgroundsTable,
} from "@workspace/db";

// ── Kit definitions ────────────────────────────────────────────────────────────

const KITS = [
  {
    id: "vgj_01_botanica",
    name: "Botanica Regency",
    description: "Muted sage and dusty rose inspired by Regency-era botanical plates.",
    colors: ["#2A3428", "#F5EFE0", "#8FAF7E", "#C9967A", "#6B8F71", "#D4B896"],
    backgrounds: [
      { id: "vgj_bg_01_a", name: "Botanica: Aged Cream Linen" },
      { id: "vgj_bg_01_b", name: "Botanica: Sage Watercolour Wash" },
      { id: "vgj_bg_01_c", name: "Botanica: Dusty Rose Parchment" },
    ],
  },
  {
    id: "vgj_02_fern",
    name: "Fern & Fossil",
    description: "Deep forest greens and earthy ochres evoking pressed fern collections.",
    colors: ["#1B3A2A", "#EEE8D5", "#4A7C59", "#B8A45A", "#2D5C40", "#D4C87A"],
    backgrounds: [
      { id: "vgj_bg_02_a", name: "Fern & Fossil: Forest Floor Paper" },
      { id: "vgj_bg_02_b", name: "Fern & Fossil: Ochre Linen Weave" },
      { id: "vgj_bg_02_c", name: "Fern & Fossil: Pressed Leaf Texture" },
    ],
  },
  {
    id: "vgj_03_midnight",
    name: "Midnight Orchid",
    description: "Deep indigo and velvet plum for an opulent night-blooming garden feel.",
    colors: ["#1A1035", "#F0EAF5", "#6B4FA0", "#A86FAE", "#3D2A6B", "#E8D4F0"],
    backgrounds: [
      { id: "vgj_bg_03_a", name: "Midnight Orchid: Velvet Indigo" },
      { id: "vgj_bg_03_b", name: "Midnight Orchid: Plum Damask" },
      { id: "vgj_bg_03_c", name: "Midnight Orchid: Moonlit Parchment" },
    ],
  },
  {
    id: "vgj_04_ivory",
    name: "Ivory & Umber",
    description: "Warm ivory and raw umber — the neutral palette of a naturalist's notebook.",
    colors: ["#3D2B1A", "#FAF6EE", "#C4A882", "#8B6545", "#D9C9B0", "#6B4E30"],
    backgrounds: [
      { id: "vgj_bg_04_a", name: "Ivory & Umber: Raw Notebook Paper" },
      { id: "vgj_bg_04_b", name: "Ivory & Umber: Umber Grid Texture" },
      { id: "vgj_bg_04_c", name: "Ivory & Umber: Aged Ivory Field Notes" },
    ],
  },
  {
    id: "vgj_05_crimson",
    name: "Crimson Herbarium",
    description: "Rich crimson and warm sepia evoking Victorian herbarium specimens.",
    colors: ["#2A0A0A", "#FFF5F0", "#C0392B", "#9B5E48", "#8B1A1A", "#E8C4B8"],
    backgrounds: [
      { id: "vgj_bg_05_a", name: "Crimson Herbarium: Specimen Paper" },
      { id: "vgj_bg_05_b", name: "Crimson Herbarium: Sepia Annotation" },
      { id: "vgj_bg_05_c", name: "Crimson Herbarium: Foxed Ivory" },
    ],
  },
  {
    id: "vgj_06_cobalt",
    name: "Cobalt & Cream",
    description: "Classic cobalt blue and cream — the look of fine Wedgwood botanical china.",
    colors: ["#0D2B6E", "#F8F4ED", "#1E4D9B", "#4A7BC4", "#0A2050", "#C8D8F0"],
    backgrounds: [
      { id: "vgj_bg_06_a", name: "Cobalt & Cream: Delft Tile Paper" },
      { id: "vgj_bg_06_b", name: "Cobalt & Cream: Wedgwood Linen" },
      { id: "vgj_bg_06_c", name: "Cobalt & Cream: Blueprint Draft" },
    ],
  },
  {
    id: "vgj_07_amber",
    name: "Amber Conservatory",
    description: "Warm amber and copper, like afternoon light through a Victorian glasshouse.",
    colors: ["#3A1E00", "#FEFBF0", "#C47A20", "#E8A84A", "#8B4A00", "#F5D88A"],
    backgrounds: [
      { id: "vgj_bg_07_a", name: "Amber Conservatory: Warm Glass Texture" },
      { id: "vgj_bg_07_b", name: "Amber Conservatory: Copper Leaf Paper" },
      { id: "vgj_bg_07_c", name: "Amber Conservatory: Apricot Silk Weave" },
    ],
  },
  {
    id: "vgj_08_moonrise",
    name: "Moonrise Moss",
    description: "Soft silver-green and deep slate — a dusk garden under the rising moon.",
    colors: ["#1C2B28", "#F0F4F0", "#5C7A6A", "#A0B8A8", "#3A5248", "#D4E4DC"],
    backgrounds: [
      { id: "vgj_bg_08_a", name: "Moonrise Moss: Dusk Linen" },
      { id: "vgj_bg_08_b", name: "Moonrise Moss: Slate Watercolour" },
      { id: "vgj_bg_08_c", name: "Moonrise Moss: Silver Fern Imprint" },
    ],
  },
] as const;

// ── Seed ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nSeeding ${KITS.length} Victorian Garden Journal kits…`);

  for (const kit of KITS) {
    const paletteId = `${kit.id}_palette`;
    const themeId = kit.id;

    // 1. Palette
    await db
      .insert(palettesTable)
      .values({
        id: paletteId,
        name: kit.name,
        colors: kit.colors as unknown as string[],
        status: "live",
        origin: "licensed" as const,
        globalAvailable: true,
        authoredByStoreId: null,
      })
      .onConflictDoNothing();

    // 2. Background placeholder rows (assetRef: null until generated via AI route)
    for (const bg of kit.backgrounds) {
      await db
        .insert(backgroundsTable)
        .values({
          id: bg.id,
          name: bg.name,
          type: "texture",
          assetRef: null,
          status: "draft",
          origin: "licensed" as const,
          globalAvailable: true,
          authoredByStoreId: null,
        })
        .onConflictDoNothing();
    }

    // 3. Theme
    await db
      .insert(themesTable)
      .values({
        id: themeId,
        name: kit.name,
        desc: kit.description,
        colors: kit.colors as unknown as string[],
        status: "draft",
        origin: "licensed" as const,
        globalAvailable: true,
        authoredByStoreId: null,
      })
      .onConflictDoNothing();

    // 4. Link palette → theme
    await db
      .insert(themePalettesTable)
      .values({
        themeId,
        paletteId,
        isPrimary: true,
        position: 0,
      })
      .onConflictDoNothing();

    // 5. Link backgrounds → theme
    for (let i = 0; i < kit.backgrounds.length; i++) {
      await db
        .insert(themeBackgroundsTable)
        .values({
          themeId,
          backgroundId: kit.backgrounds[i].id,
          position: i,
        })
        .onConflictDoNothing();
    }

    console.log(`  ✓ ${kit.name}  (palette: ${paletteId}  ·  theme: ${themeId}  ·  ${kit.backgrounds.length} backgrounds)`);
  }

  console.log("\nDone. 8 VGJ kits seeded.");
  console.log("Note: background assetRef values are null — run the AI background generation");
  console.log("      route (POST /stores/:storeId/backgrounds/generate) to populate them,");
  console.log("      then PATCH /backgrounds/:id to update assetRef on each row.");
}

run()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => pool.end());
