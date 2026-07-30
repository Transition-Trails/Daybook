/**
 * generate-test-planners.ts
 *
 * Generates four real test planners and saves them to Google Drive (falls back
 * to stub IDs if the super-admin user has no Google token).
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run generate:test
 *
 * Each planner includes a diagnostic page (last page) carrying the config hash,
 * generation timestamp, theme/palette/background IDs, and total link count.
 *
 * The script prints Drive links and stats for every build so the device tester
 * can open each file directly.
 */

import { db } from "@workspace/db";
import { plannerConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PlannerSetup, PlannerStyle, PlannerOutput } from "@workspace/db";
import { runGeneration } from "../src/routes/planners.js";

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * The super-admin user must have authorised Google in the admin app for Drive
 * upload to work.  If not, pdfFileId will be a stub like "pdf-<id>-<ts>".
 */
const SUPER_ADMIN_USER_ID = "7e27c46a-7464-491a-9eb0-f23f52cc117b";

// Heaviest realistic buyer config: Warm Earth theme, Terracotta palette,
// Warm Cream background, 5 note sections, calendar links on, realistic render.
// Note: fonts are explicitly overridden to force StandardFonts (Helvetica/Times).
// The bundled WOFF files for Playfair Display and Lato have a corrupt glyph entry
// at a high glyph index that only triggers during PDF serialisation — not during the
// validation probe.  The device test verifies links, navigation, and layout, not
// specific typeface rendering, so StandardFonts are correct for this purpose.
// See: pdf-generator.ts WOFF-subset-corruption memory note.
const FONT_OVERRIDE = { heading: "_std_no_bundle_", subheading: "_std_no_bundle_", script: "_std_no_bundle_" };

const PRIMARY: { label: string; setup: PlannerSetup; style: PlannerStyle; output: PlannerOutput } = {
  label: "Primary — vertical portrait, 2026 full year, all sections, calMode:link, Warm Earth/Terracotta",
  setup: {
    weekStart: "mon",
    orientation: "vertical",
    startMonth: 0,
    startYear: 2026,
    monthCount: 12,
    datingMode: "dated",
  } as PlannerSetup & { datingMode: string },
  style: {
    themeId:      "t1",
    paletteId:    "pal_a3e76f4fc7d9",   // Terracotta — warm earth tones
    backgroundId: "bg_starter_warm_cream",
    sections:     ["Daily Notes", "Weekly Reflections", "Goals", "Habits", "Budget"],
    tabPos:       "right",
    renderStyle:  "realistic",
    binding:      { type: "coil", finish: "silver" },
    paperColour:  "cream",
    fonts:        FONT_OVERRIDE,
  },
  output: {
    calMode:      "link",
    eventMins:    60,
    aiInPdf:      false,
    diagnosticPage: true,
  } as PlannerOutput & { diagnosticPage: boolean },
};

const LANDSCAPE: typeof PRIMARY = {
  label: "Variant A — landscape two-page spread, twin-loop gold binding",
  setup: {
    weekStart: "mon",
    orientation: "landscape",
    startMonth: 0,
    startYear: 2026,
    monthCount: 12,
    datingMode: "dated",
  } as PlannerSetup & { datingMode: string },
  style: {
    themeId:     "t1",
    paletteId:   "pal_a3e76f4fc7d9",
    backgroundId:"bg_starter_warm_cream",
    sections:    ["Daily Notes", "Goals"],
    tabPos:      "top",
    renderStyle: "realistic",
    binding:     { type: "twin-loop", finish: "gold" },
    paperColour: "cream",
    fonts:       FONT_OVERRIDE,
  },
  output: {
    calMode: "link", eventMins: 60, aiInPdf: false,
    diagnosticPage: true,
  } as PlannerOutput & { diagnosticPage: boolean },
};

const UNDATED: typeof PRIMARY = {
  label: "Variant B — undated/reusable, Botanicals/Sage Calm, no calendar links",
  setup: {
    weekStart: "mon",
    orientation: "vertical",
    startMonth: 0,
    startYear: 2026,
    monthCount: 12,
    datingMode: "undated",
  } as PlannerSetup & { datingMode: string },
  style: {
    themeId:    "t2",
    paletteId:  "pal_ed012b13c503",   // Sage Calm — green tones
    sections:   ["Daily Notes", "Goals", "Habits"],
    tabPos:     "right",
    renderStyle:"realistic",
    paperColour:"white",
    fonts:      FONT_OVERRIDE,
  },
  output: {
    calMode: "none", eventMins: 60, aiInPdf: false,
    diagnosticPage: true,
  } as PlannerOutput & { diagnosticPage: boolean },
};

const REMARKABLE: typeof PRIMARY = {
  label: "Variant C — reMarkable e-ink, B&W, device trim, GoTo links retained",
  setup: {
    weekStart: "mon",
    orientation: "vertical",
    startMonth: 0,
    startYear: 2026,
    monthCount: 12,
    datingMode: "dated",
  } as PlannerSetup & { datingMode: string },
  style: {
    themeId:  "t1",
    sections: ["Daily Notes", "Goals"],
    tabPos:   "right",
    fonts:    FONT_OVERRIDE,
  },
  output: {
    calMode:   "link",
    eventMins: 60,
    aiInPdf:   false,
    inkFriendly:  true,
    einkDevice:   "remarkable",
    diagnosticPage: true,
  } as PlannerOutput & { diagnosticPage: boolean; einkDevice: string },
};

const TEST_BUILDS = [PRIMARY, LANDSCAPE, UNDATED, REMARKABLE];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Daybook test-planner generation                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const results: {
    label: string;
    id: string;
    pdfFileId: string;
    pageCount: number;
    totalLinkAnnotations?: number;
    driveUrl: string;
    isDriveReal: boolean;
    durationMs: number;
    fontSubs: string[];
    einkCaveat: string | null;
  }[] = [];

  for (const build of TEST_BUILDS) {
    console.log(`► ${build.label}`);
    const t0 = Date.now();

    const [config] = await db.insert(plannerConfigsTable).values({
      userId:    SUPER_ADMIN_USER_ID,
      editionId: null,
      year:      (build.setup as PlannerSetup & { datingMode?: string }).startYear,
      setup:     build.setup,
      style:     build.style,
      output:    build.output,
      drive:     { pdfFileId: null, configFileId: null },
    }).returning();

    const gen = await runGeneration(config);
    const durationMs = Date.now() - t0;

    // Persist Drive IDs back (mirrors what the HTTP route does)
    await db.update(plannerConfigsTable)
      .set({ drive: { pdfFileId: gen.pdfFileId, configFileId: gen.configFileId }, generatedAt: new Date() })
      .where(eq(plannerConfigsTable.id, config.id as string));

    const isDriveReal = !gen.pdfFileId.startsWith("pdf-");
    const driveUrl = isDriveReal
      ? `https://drive.google.com/file/d/${gen.pdfFileId}/view`
      : `(no Drive — stub id: ${gen.pdfFileId})`;

    results.push({
      label:                build.label,
      id:                   config.id as string,
      pdfFileId:            gen.pdfFileId,
      pageCount:            gen.pageCount,
      totalLinkAnnotations: gen.totalLinkAnnotations,
      driveUrl,
      isDriveReal,
      durationMs,
      fontSubs:             gen.fontSubstitutions,
      einkCaveat:           gen.einkCaveat,
    });

    console.log(`  ✓ ${gen.pageCount} pages  |  ${gen.totalLinkAnnotations ?? "?"} links  |  ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`  Drive: ${driveUrl}\n`);
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Summary                                                 ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  for (const r of results) {
    const driveStatus = r.isDriveReal ? "✓ Drive" : "⚠ stub (no Google token)";
    console.log(`║  ${r.label.slice(0, 48).padEnd(48)} ║`);
    console.log(`║    Pages: ${String(r.pageCount).padEnd(6)}  Links: ${String(r.totalLinkAnnotations ?? "?").padEnd(6)}  ${driveStatus.padEnd(18)} ║`);
    if (r.fontSubs.length) console.log(`║    ⚠ Font substitutions: ${r.fontSubs.join(", ").slice(0, 40)} ║`);
    if (r.einkCaveat)      console.log(`║    ℹ E-ink caveat: ${r.einkCaveat.slice(0, 44)} ║`);
  }
  console.log("╚══════════════════════════════════════════════════════════╝");

  console.log("\n── Drive links for device tester ──");
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.label}`);
    console.log(`     ${r.driveUrl}`);
  });
  console.log();
}

main().catch((err) => {
  console.error("Generation failed:", err);
  process.exit(1);
});
