/**
 * Seed Theme Studio assets — hardware, accessories, and font families.
 *
 * All rows are origin="starter", status="live", platform-owned (no authoredByStoreId).
 * Run: pnpm --filter @workspace/scripts run seed-theme-assets
 */
import { db } from "@workspace/db";
import { hardwareTable, accessoriesTable, fontsTable } from "@workspace/db";

// ── Hardware ────────────────────────────────────────────────────────────────
// Covers the five binding styles the user specified, plus finish variants.

const HARDWARE_ROWS = [
  // Coil
  { id: "hw_brass_coil",      name: "Brass Coil",           kind: "coil",      finish: "brass"     },
  { id: "hw_black_coil",      name: "Black Coil",           kind: "coil",      finish: "black"     },
  { id: "hw_silver_coil",     name: "Silver Coil",          kind: "coil",      finish: "silver"    },
  { id: "hw_gunmetal_coil",   name: "Gunmetal Coil",        kind: "coil",      finish: "gunmetal"  },
  // Twin-loop
  { id: "hw_black_twin",      name: "Twin-Loop Black",      kind: "twin-loop", finish: "black"     },
  { id: "hw_silver_twin",     name: "Twin-Loop Silver",     kind: "twin-loop", finish: "silver"    },
  { id: "hw_white_twin",      name: "Twin-Loop White",      kind: "twin-loop", finish: "white"     },
  // Discs
  { id: "hw_black_discs",     name: "Black Discs",          kind: "discs",     finish: "black"     },
  { id: "hw_white_discs",     name: "White Discs",          kind: "discs",     finish: "white"     },
  { id: "hw_rose_discs",      name: "Rose Gold Discs",      kind: "discs",     finish: "rose-gold" },
  { id: "hw_silver_discs",    name: "Silver Discs",         kind: "discs",     finish: "silver"    },
  // 3-ring / 6-ring
  { id: "hw_silver_rings",    name: "Silver 3-Ring",        kind: "3-ring",    finish: "silver"    },
  { id: "hw_gold_6ring",      name: "Gold 6-Ring",          kind: "3-ring",    finish: "brass"     },
  { id: "hw_black_rings",     name: "Black 3-Ring",         kind: "3-ring",    finish: "black"     },
] as const;

// ── Accessories ─────────────────────────────────────────────────────────────

const ACCESSORY_ROWS = [
  { id: "acc_ribbon_bookmark", name: "Ribbon Bookmark",   kind: "bookmark"     },
  { id: "acc_kraft_clip",      name: "Kraft Paper Clip",  kind: "clip"         },
  { id: "acc_clear_clip",      name: "Clear Binder Clip", kind: "clip"         },
  { id: "acc_tab_set",         name: "Divider Tab Set",   kind: "tab"          },
  { id: "acc_index_tab",       name: "Index Tab Set",     kind: "tab"          },
  { id: "acc_page_marker",     name: "Page Marker",       kind: "page-marker"  },
  { id: "acc_sticky_marker",   name: "Sticky Page Flag",  kind: "page-marker"  },
  { id: "acc_elastic_black",   name: "Elastic Band Black",kind: "elastic"      },
  { id: "acc_elastic_caramel", name: "Elastic Band Caramel", kind: "elastic"   },
] as const;

// ── Font families ────────────────────────────────────────────────────────────
// Every entry is a Google Font family. curated_pairings records the role this
// font plays in named pairings so Theme Studio can build suggestions.

const FONT_ROWS = [
  {
    id: "font_playfair_display",
    familyName: "Playfair Display",
    variants: [{ weight: "400" }, { weight: "700" }, { weight: "400", style: "italic" as const }],
    curatedPairings: [
      { role: "heading" as const, family: "Playfair Display", weight: "700" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Playfair+Display",
  },
  {
    id: "font_lora",
    familyName: "Lora",
    variants: [{ weight: "400" }, { weight: "700" }, { weight: "400", style: "italic" as const }],
    curatedPairings: [
      { role: "heading" as const, family: "Lora", weight: "700" },
      { role: "body"    as const, family: "Lora", weight: "400" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Lora",
  },
  {
    id: "font_inter",
    familyName: "Inter",
    variants: [{ weight: "400" }, { weight: "500" }, { weight: "600" }, { weight: "700" }],
    curatedPairings: [
      { role: "body" as const, family: "Inter", weight: "400" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Inter",
  },
  {
    id: "font_dm_serif",
    familyName: "DM Serif Display",
    variants: [{ weight: "400" }, { weight: "400", style: "italic" as const }],
    curatedPairings: [
      { role: "heading" as const, family: "DM Serif Display", weight: "400" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/DM+Serif+Display",
  },
  {
    id: "font_dm_sans",
    familyName: "DM Sans",
    variants: [{ weight: "400" }, { weight: "500" }, { weight: "700" }],
    curatedPairings: [
      { role: "body"   as const, family: "DM Sans", weight: "400" },
      { role: "accent" as const, family: "DM Sans", weight: "500" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/DM+Sans",
  },
  {
    id: "font_cormorant",
    familyName: "Cormorant Garamond",
    variants: [{ weight: "300" }, { weight: "400" }, { weight: "600" }, { weight: "300", style: "italic" as const }],
    curatedPairings: [
      { role: "heading" as const, family: "Cormorant Garamond", weight: "300" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Cormorant+Garamond",
  },
  {
    id: "font_nunito_sans",
    familyName: "Nunito Sans",
    variants: [{ weight: "300" }, { weight: "400" }, { weight: "600" }],
    curatedPairings: [
      { role: "body" as const, family: "Nunito Sans", weight: "300" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Nunito+Sans",
  },
  {
    id: "font_source_sans",
    familyName: "Source Sans 3",
    variants: [{ weight: "300" }, { weight: "400" }, { weight: "600" }],
    curatedPairings: [
      { role: "body" as const, family: "Source Sans 3", weight: "400" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Source+Sans+3",
  },
  {
    id: "font_libre_baskerville",
    familyName: "Libre Baskerville",
    variants: [{ weight: "400" }, { weight: "700" }, { weight: "400", style: "italic" as const }],
    curatedPairings: [
      { role: "heading" as const, family: "Libre Baskerville", weight: "700" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Libre+Baskerville",
  },
  {
    id: "font_libre_franklin",
    familyName: "Libre Franklin",
    variants: [{ weight: "300" }, { weight: "400" }, { weight: "600" }],
    curatedPairings: [
      { role: "body" as const, family: "Libre Franklin", weight: "400" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Libre+Franklin",
  },
  {
    id: "font_space_grotesk",
    familyName: "Space Grotesk",
    variants: [{ weight: "300" }, { weight: "400" }, { weight: "600" }],
    curatedPairings: [
      { role: "heading" as const, family: "Space Grotesk", weight: "600" },
      { role: "body"    as const, family: "Space Grotesk", weight: "300" },
    ],
    sampleUrl: "https://fonts.google.com/specimen/Space+Grotesk",
  },
] as const;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding Theme Studio assets…");

  // Hardware — idempotent via onConflictDoNothing (same as all other seeds)
  console.log(`  Inserting ${HARDWARE_ROWS.length} hardware rows…`);
  for (const row of HARDWARE_ROWS) {
    await db
      .insert(hardwareTable)
      .values({ ...row, status: "live", origin: "starter" })
      .onConflictDoNothing();
  }

  // Accessories
  console.log(`  Inserting ${ACCESSORY_ROWS.length} accessory rows…`);
  for (const row of ACCESSORY_ROWS) {
    await db
      .insert(accessoriesTable)
      .values({ ...row, status: "live", origin: "starter" })
      .onConflictDoNothing();
  }

  // Fonts
  console.log(`  Inserting ${FONT_ROWS.length} font family rows…`);
  for (const row of FONT_ROWS) {
    await db
      .insert(fontsTable)
      .values({
        id: row.id,
        familyName: row.familyName,
        variants: row.variants as { weight: string; style?: "normal" | "italic" }[],
        curatedPairings: row.curatedPairings as { role: "heading" | "body" | "accent"; family: string; weight?: string }[],
        sampleUrl: row.sampleUrl,
        status: "live",
        origin: "starter",
        globalAvailable: true,
      })
      .onConflictDoNothing();
  }

  console.log("Done. Theme Studio asset seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
