/**
 * CI test-persona seed.
 *
 * Creates five deterministic accounts, two stores, good catalog fixtures owned
 * by storeA (used by isolation / RBAC invariant tests), and deliberately broken
 * "ci_bad_*" fixtures so the quality-checker invariant test can assert that a
 * checker run against clean data does NOT pass silently.
 *
 * Safe to re-run — every insert uses onConflictDoNothing().
 *
 * Run: pnpm --filter @workspace/scripts run seed:ci
 *
 * Persona summary:
 *   super@ci.test       — platform super_admin
 *   owner.a@ci.test     — owner of ci_store_a
 *   staff.a@ci.test     — staff of ci_store_a
 *   owner.b@ci.test     — owner of ci_store_b  (cross-store isolation tests)
 *   buyer@ci.test       — no store membership   (buyer persona)
 *
 * Good fixtures (ci_store_a owns all of these):
 *   ci_theme_a          — live owned theme
 *   ci_pack_a           — live owned sticker pack
 *   ci_palette_a        — live owned palette
 *   ci_background_a     — live owned background
 *   ci_edition_a        — draft owned edition
 *
 * Bad fixtures (quality-checker MUST fail each one):
 *   ci_bad_theme        — theme with an empty colors[] (required slot missing)
 *   ci_bad_pack         — sticker pack with no stickers and no instruction sheet
 *   ci_bad_asset        — asset with transparent=false (background pixels remain)
 *   ci_bad_edition      — edition whose art.cover references a non-existent asset
 *   ci_bad_recipe       — recipe with a "Blocks release" engine gap (blocks publish)
 *   ci_bad_planner_cfg  — planner config with a .test-TLD hyperlink that cannot resolve
 */
import { db } from "@workspace/db";
import {
  usersTable,
  storesTable,
  storeMembersTable,
  storeFlagsTable,
  themesTable,
  stickerPacksTable,
  stickersTable,
  assetsTable,
  editionsTable,
  plannerConfigsTable,
  productRecipesTable,
  palettesTable,
  backgroundsTable,
} from "@workspace/db";

// ── Deterministic IDs (never change — tests reference them by name) ───────────

export const CI_IDS = {
  // personas
  superAdmin: "ci_super_admin",
  ownerA:     "ci_owner_a",
  staffA:     "ci_staff_a",
  ownerB:     "ci_owner_b",
  buyer:      "ci_buyer",
  // stores
  storeA:     "ci_store_a",
  storeB:     "ci_store_b",
  // good fixtures — storeA-owned catalog items
  themeA:       "ci_theme_a",
  packA:        "ci_pack_a",
  paletteA:     "ci_palette_a",
  backgroundA:  "ci_background_a",
  editionA:     "ci_edition_a",
  // bad fixtures — deliberately broken; quality-checker must flag each one
  badTheme:      "ci_bad_theme",
  badPack:       "ci_bad_pack",
  badAsset:      "ci_bad_asset",      // also used as a sticker asset
  badEdition:    "ci_bad_edition",
  badRecipe:     "ci_bad_recipe",
  badPlannerCfg: "ci_bad_planner_cfg",
} as const;

// ── Ghost drive-file ID used by the bad edition ───────────────────────────────
// This ID does not exist in the assets table — simulates a soft-deleted asset.
const GHOST_DRIVE_FILE_ID = "ci_ghost_drive_file_deleted_asset";

async function main() {
  console.log("🧪 Seeding CI test personas and fixtures…");

  // ── Users ─────────────────────────────────────────────────────────────────
  await db
    .insert(usersTable)
    .values([
      { id: CI_IDS.superAdmin, email: "super@ci.test",   name: "CI Super Admin", platformRole: "super_admin" },
      { id: CI_IDS.ownerA,     email: "owner.a@ci.test", name: "CI Owner A" },
      { id: CI_IDS.staffA,     email: "staff.a@ci.test", name: "CI Staff A" },
      { id: CI_IDS.ownerB,     email: "owner.b@ci.test", name: "CI Owner B" },
      { id: CI_IDS.buyer,      email: "buyer@ci.test",   name: "CI Buyer" },
    ])
    .onConflictDoNothing();
  console.log("  ✓ users (5 CI personas)");

  // ── Stores ────────────────────────────────────────────────────────────────
  await db
    .insert(storesTable)
    .values([
      { id: CI_IDS.storeA, name: "CI Store A", slug: "ci-store-a", ownerUserId: CI_IDS.ownerA, subscriptionActive: true, defaultMode: "curated" },
      { id: CI_IDS.storeB, name: "CI Store B", slug: "ci-store-b", ownerUserId: CI_IDS.ownerB, subscriptionActive: true, defaultMode: "curated" },
    ])
    .onConflictDoNothing();
  console.log("  ✓ stores (ci_store_a, ci_store_b)");

  // ── Store memberships ─────────────────────────────────────────────────────
  await db
    .insert(storeMembersTable)
    .values([
      { storeId: CI_IDS.storeA, userId: CI_IDS.ownerA, role: "owner" },
      { storeId: CI_IDS.storeA, userId: CI_IDS.staffA, role: "staff" },
      { storeId: CI_IDS.storeB, userId: CI_IDS.ownerB, role: "owner" },
    ])
    .onConflictDoNothing();
  console.log("  ✓ memberships");

  // ── Store flags (storeFlagsTable uses boolean columns, one row per store) ──
  // storeA: ai studios + marketing enabled
  await db
    .insert(storeFlagsTable)
    .values({ storeId: CI_IDS.storeA, aiEnabled: true })
    .onConflictDoNothing();
  // storeB: no special flags (clean isolation baseline)
  await db
    .insert(storeFlagsTable)
    .values({ storeId: CI_IDS.storeB })
    .onConflictDoNothing();
  console.log("  ✓ store flags");

  // ─────────────────────────────────────────────────────────────────────────
  // GOOD FIXTURES — owned by ci_store_a, used by isolation / RBAC specs
  // ─────────────────────────────────────────────────────────────────────────

  await db
    .insert(themesTable)
    .values({
      id:               CI_IDS.themeA,
      name:             "CI Theme A",
      colors:           ["#1B2A4A", "#C87560"],
      status:           "live",
      origin:           "owned",
      authoredByStoreId: CI_IDS.storeA,
    })
    .onConflictDoNothing();

  await db
    .insert(stickerPacksTable)
    .values({
      id:               CI_IDS.packA,
      name:             "CI Pack A",
      status:           "live",
      origin:           "owned",
      authoredByStoreId: CI_IDS.storeA,
      attestation:      "own-or-licensed",
      instructionSheetFileId: "ci_pack_a_sheet",
    })
    .onConflictDoNothing();

  await db
    .insert(palettesTable)
    .values({
      id:               CI_IDS.paletteA,
      name:             "CI Palette A",
      colors:           ["#1B2A4A", "#C87560", "#FAFBFC"],
      status:           "live",
      origin:           "owned",
      authoredByStoreId: CI_IDS.storeA,
    })
    .onConflictDoNothing();

  await db
    .insert(backgroundsTable)
    .values({
      id:               CI_IDS.backgroundA,
      name:             "CI Background A",
      type:             "color",
      status:           "live",
      origin:           "owned",
      authoredByStoreId: CI_IDS.storeA,
    })
    .onConflictDoNothing();

  await db
    .insert(editionsTable)
    .values({
      id:               CI_IDS.editionA,
      name:             "CI Edition A",
      status:           "draft",
      origin:           "owned",
      authoredByStoreId: CI_IDS.storeA,
      themes:           [CI_IDS.themeA],
      packs:            [],
      inserts:          [],
      products:         [],
    })
    .onConflictDoNothing();
  console.log("  ✓ good fixtures (theme_a, pack_a, palette_a, background_a, edition_a)");

  // ─────────────────────────────────────────────────────────────────────────
  // BAD FIXTURES — deliberately broken; quality-checker MUST fail each one.
  // If the checker passes any of these, the checker itself is broken.
  // ─────────────────────────────────────────────────────────────────────────

  // 1. Bad theme: colors[] is empty — required slot has no value.
  //    Quality checker rule: theme.colors.length === 0 → FAIL "empty required slot"
  await db
    .insert(themesTable)
    .values({
      id:     CI_IDS.badTheme,
      name:   "ci_bad_theme — empty colors slot",
      colors: [],
      status: "live",
      origin: "licensed",
    })
    .onConflictDoNothing();

  // 2. Bad pack: no stickers, no instruction sheet.
  //    Quality checker rule: pack has no stickers AND no instructionSheetFileId → FAIL "no index sheet"
  await db
    .insert(stickerPacksTable)
    .values({
      id:     CI_IDS.badPack,
      name:   "ci_bad_pack — no stickers, no index sheet",
      status: "live",
      origin: "licensed",
      // instructionSheetFileId intentionally omitted (null)
    })
    .onConflictDoNothing();

  // 3. Bad asset: transparent=false — sticker has background pixels remaining.
  //    Quality checker rule: asset.transparent === false where asset is used as a sticker → FAIL
  await db
    .insert(assetsTable)
    .values({
      id:          CI_IDS.badAsset,
      driveFileId: "ci_bad_asset_drive_file",
      kind:        "png",
      transparent: false,  // ← the bad property
      tags:        ["ci", "bad"],
      source:      "upload",
    })
    .onConflictDoNothing();

  // Link the bad asset into the bad pack as a sticker so the checker can find
  // it via the stickers → assets join.
  await db
    .insert(stickersTable)
    .values({
      packId:  CI_IDS.badPack,
      assetId: CI_IDS.badAsset,
      name:    "ci_bad_sticker",
      position: 0,
    })
    .onConflictDoNothing();

  // 4. Bad edition: art.cover references a drive file ID that has no
  //    corresponding row in the assets table (simulating a soft-deleted asset).
  //    Quality checker rule: edition.art.cover exists but asset not found → FAIL "orphaned asset ref"
  await db
    .insert(editionsTable)
    .values({
      id:     CI_IDS.badEdition,
      name:   "ci_bad_edition — orphaned asset reference",
      status: "live",
      origin: "licensed",
      themes: [],
      packs:  [],
      inserts: [],
      products: [],
      // Provide all EditionArt fields; cover is the ghost reference the checker finds.
      art: {
        cover:   GHOST_DRIVE_FILE_ID,  // ← no matching assets row (the bad condition)
        first:   null,
        divider: null,
        weekly:  null,
        daily:   null,
        notes:   null,
      } as unknown as import("@workspace/db").EditionArt,
    })
    .onConflictDoNothing();

  // 5. Bad recipe: engine gap with severity "Blocks release".
  //    This recipe can be saved as draft but the publish gate must return 409.
  //    Quality checker rule: claudeBrief.engineGaps[].severity === "Blocks release" → FAIL
  await db
    .insert(productRecipesTable)
    .values({
      id:       CI_IDS.badRecipe,
      name:     "ci_bad_recipe — blocking engine gap",
      category: "planner",
      parts:    [],
      status:   "draft",
      claudeBrief: {
        assistantGrounding: "CI test recipe — do not use in production.",
        engineGaps: [
          {
            severity:    "Blocks release",
            description: "CI-injected blocking gap — publish must return 409",
            gap:         "ci_test_gap",
          },
        ],
      },
    })
    .onConflictDoNothing();

  // 6. Bad planner config: output.sampleLinks contains a .test-TLD URL that
  //    can never resolve. (The .test TLD is reserved by RFC 2606 for testing.)
  //    Quality checker rule: sampleLinks[].href uses a .test domain → FAIL "unresolvable hyperlink"
  //    sampleLinks is stored in the JSONB output field; we cast to bypass PlannerOutput's
  //    strict type so the quality checker can test the extended field.
  await db
    .insert(plannerConfigsTable)
    .values({
      id:          CI_IDS.badPlannerCfg,
      userId:      CI_IDS.buyer,
      storeId:     CI_IDS.storeA,
      productType: "planner",
      year:        2026,
      setup:       { monthCount: 1, startMonth: 0, startYear: 2026, weekStart: "mon", orientation: "vertical", datingMode: "dated" } as unknown as import("@workspace/db").PlannerSetup,
      style:       {} as import("@workspace/db").PlannerStyle,
      output: {
        calMode:     "week",
        eventMins:   30,
        aiInPdf:     false,
        // sampleLinks: quality checker scans this field for unresolvable hyperlinks
        sampleLinks: [
          { label: "Broken hyperlink", href: "https://ci-bad-link.test/does-not-resolve" },
        ],
      } as unknown as import("@workspace/db").PlannerOutput,
      drive: { pdfFileId: null, configFileId: null } as import("@workspace/db").PlannerDrive,
    })
    .onConflictDoNothing();

  console.log("  ✓ bad fixtures (bad_theme, bad_pack, bad_asset, bad_edition, bad_recipe, bad_planner_cfg)");

  console.log("✅ CI seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-ci failed:", err);
  process.exit(1);
});
