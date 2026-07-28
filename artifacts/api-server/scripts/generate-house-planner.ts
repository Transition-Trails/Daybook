/**
 * generate-house-planner.ts
 *
 * Generates the "2026 Daily · Warm Earth" house-store planner (hs_cfg_2026_daily)
 * through the normal generation pipeline, then updates planner_configs with the
 * real Drive file IDs (or timestamp-based stub IDs if Drive is unavailable) and
 * sets generatedAt.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run generate:house
 *
 * Drive upload happens if the super-admin user has authorised Google in the admin
 * app.  If not, pdfFileId falls back to a stub like "pdf-hs_cfg_2026_daily-<ts>"
 * — the PDF is still fully built (real pages, real links, real fonts) and
 * generatedAt is always set.
 *
 * Font note: Playfair Display WOFF has a known corrupt glyph entry that trips
 * pdf-lib during serialisation (see MEMORY.md woff-subset-corruption).  We
 * override fonts to StandardFonts the same way generate-test-planners.ts does —
 * the device test verifies links, navigation, and layout, not typeface rendering.
 */

import { db } from "@workspace/db";
import { plannerConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PlannerStyle } from "@workspace/db";
import { runGeneration } from "../src/routes/planners.js";

const PLANNER_CONFIG_ID = "hs_cfg_2026_daily";

/**
 * Super-admin user ID — used to obtain a Google token for Drive upload.
 * Same constant as generate-test-planners.ts; keep in sync if the account
 * is ever recreated.
 */
const SUPER_ADMIN_USER_ID = "7e27c46a-7464-491a-9eb0-f23f52cc117b";

/**
 * Force StandardFonts (Helvetica/Times) so we bypass the WOFF corrupt-glyph
 * probe entirely.  The generated PDF is the same in all respects except typeface.
 */
const FONT_OVERRIDE = {
  heading:    "_std_no_bundle_",
  subheading: "_std_no_bundle_",
  script:     "_std_no_bundle_",
};

async function main() {
  console.log("⚙️   Generating 2026 Daily · Warm Earth house-store planner…\n");

  const [config] = await db
    .select()
    .from(plannerConfigsTable)
    .where(eq(plannerConfigsTable.id, PLANNER_CONFIG_ID));

  if (!config) {
    throw new Error(`Planner config ${PLANNER_CONFIG_ID} not found — run seed-house first.`);
  }

  console.log(`   edition  : ${config.editionId ?? "(none)"}`);
  console.log(`   year     : ${config.year ?? "(undated)"}`);
  console.log(`   sections : ${((config.style as PlannerStyle).sections ?? []).length} sections`);
  console.log(`   setup    : monthCount=${(config.setup as Record<string, unknown>).monthCount ?? "?"}\n`);

  // Overlay: use super-admin for Google token; inject font override to skip WOFF probe.
  // Neither change is persisted to the DB — only drive+generatedAt are updated below.
  const genConfig = {
    ...config,
    userId: SUPER_ADMIN_USER_ID,
    style: {
      ...(config.style as object),
      fonts: FONT_OVERRIDE,
    },
  };

  const t0 = Date.now();
  const { pdfFileId, configFileId, inkFriendlyPdfFileId, pageCount, fontSubstitutions, totalLinkAnnotations } =
    await runGeneration(genConfig as typeof config);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // Persist the real file IDs and set generatedAt.
  await db
    .update(plannerConfigsTable)
    .set({
      drive: {
        pdfFileId,
        configFileId,
        ...(inkFriendlyPdfFileId ? { inkFriendlyPdfFileId } : {}),
      },
      generatedAt: new Date(),
    })
    .where(eq(plannerConfigsTable.id, PLANNER_CONFIG_ID));

  const isDriveId = !pdfFileId.startsWith("pdf-");

  console.log(`✅  Generation complete in ${elapsed}s`);
  console.log(`\n📋  hs_cfg_2026_daily updated:`);
  console.log(`   drive.pdfFileId    : ${pdfFileId}`);
  console.log(`   drive.configFileId : ${configFileId}`);
  if (inkFriendlyPdfFileId) {
    console.log(`   inkFriendlyPdfFileId: ${inkFriendlyPdfFileId}`);
  }
  console.log(`   pageCount          : ${pageCount}`);
  console.log(`   totalLinkAnnotations: ${totalLinkAnnotations ?? "n/a"}`);
  console.log(`   generatedAt        : ${new Date().toISOString()}`);
  console.log(`   fontSubstitutions  : ${fontSubstitutions.length > 0 ? fontSubstitutions.join(", ") : "none"}`);
  console.log(`\n   ${isDriveId ? "☁️  Uploaded to Google Drive — carry-forward and artifact-guarantee tests now have a real file." : "⚠️  Drive unavailable — pdfFileId is a system-generated stub (no file stored). Authorise Google in the admin app to get a real Drive file."}`);

  if (!isDriveId) {
    console.log(`\n   To get a real Drive file:`);
    console.log(`   1. Open the admin app → Planner Studio for store-house`);
    console.log(`   2. Re-export from the "2026 Daily · Warm Earth" edition`);
    console.log(`   3. The stub ID will be replaced with a real Drive file ID`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌  Generation failed:", err);
  process.exit(1);
});
