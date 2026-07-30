/**
 * run-quality-check.ts
 *
 * Runs the quality checker directly against every ci_bad_* fixture and reports
 * whether each one correctly FAILS.  A fixture that passes is a false green —
 * it means the checker itself is broken.
 *
 * Also runs the full report and summarises failures vs. total checked.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run quality:check-ci
 */

import {
  checkThemes,
  checkPacks,
  checkStickerAssets,
  checkEditions,
  checkRecipes,
  checkPlannerConfigs,
  runFullQualityCheck,
  type CheckResult,
} from "../src/lib/quality-checker.js";

const CI_BAD = {
  theme:          "ci_bad_theme",
  pack:           "ci_bad_pack",
  sticker_asset:  "ci_bad_asset",
  edition:        "ci_bad_edition",
  recipe:         "ci_bad_recipe",
  planner_config: "ci_bad_planner_cfg",
} as const;

function badge(result: CheckResult): string {
  return result.pass
    ? "⚠️  PASS  ← FALSE GREEN — checker is broken for this type"
    : "✅  FAIL  ← correct";
}

async function main() {
  console.log("🔬  Quality checker — ci_bad_* fixture validation\n");
  console.log("Each fixture must FAIL.  A pass means the checker does not catch the defect.\n");

  // ── Per-fixture checks ───────────────────────────────────────────────────────

  const [themes, packs, assets, editions, recipes, planners] = await Promise.all([
    checkThemes([CI_BAD.theme]),
    checkPacks([CI_BAD.pack]),
    checkStickerAssets([CI_BAD.sticker_asset]),
    checkEditions([CI_BAD.edition]),
    checkRecipes([CI_BAD.recipe]),
    checkPlannerConfigs([CI_BAD.planner_config]),
  ]);

  const perFixture = [
    { expected: "empty colors[] — required slot missing",        result: themes[0] },
    { expected: "no stickers and no instruction sheet",          result: packs[0] },
    { expected: "transparent=false — background pixels remain",  result: assets[0] },
    { expected: "art.cover references non-existent asset",       result: editions[0] },
    { expected: "Blocks-release engine gap",                     result: recipes[0] },
    { expected: ".test-TLD hyperlink that cannot resolve",       result: planners[0] },
  ];

  let falseGreens = 0;
  for (const { expected, result } of perFixture) {
    if (!result) {
      console.log(`❌  MISSING   ${CI_BAD[Object.keys(CI_BAD).find(k => expected.includes(k) || CI_BAD[k as keyof typeof CI_BAD] === expected) as keyof typeof CI_BAD] ?? "?"} — fixture not in DB`);
      falseGreens++;
      continue;
    }
    console.log(`${badge(result)}  ${result.kind}/${result.id}`);
    console.log(`   defect    : ${expected}`);
    console.log(`   checker   : ${result.reason}`);
    if (result.pass) falseGreens++;
    console.log();
  }

  // ── Full report to confirm fixture IDs appear in the global scan ─────────────

  console.log("─".repeat(72));
  console.log("Full quality-check report (all items in DB):\n");

  const report = await runFullQualityCheck();

  const badIds = Object.values(CI_BAD);
  const allBadInReport = badIds.every((id) =>
    report.results.some((r) => r.id === id && !r.pass),
  );

  const ciRows = report.results.filter((r) => badIds.includes(r.id as typeof badIds[number]));
  for (const r of ciRows) {
    console.log(`  ${r.pass ? "⚠️  PASS" : "❌  FAIL"}  ${r.kind}/${r.id}`);
  }

  console.log(`\n  Full report totals:`);
  console.log(`    checked : ${report.totals.checked}`);
  console.log(`    passed  : ${report.totals.passed}`);
  console.log(`    failed  : ${report.totals.failed}`);
  console.log(`    runAt   : ${report.runAt}`);

  console.log(`\n${"─".repeat(72)}`);
  if (falseGreens === 0 && allBadInReport) {
    console.log(`✅  All 6 ci_bad_* fixtures correctly fail — checker is sound.`);
  } else {
    console.log(`⚠️  ${falseGreens} fixture(s) produced false greens — checker needs fixing.`);
    if (!allBadInReport) {
      console.log(`    Some ci_bad_* fixtures missing from full report — re-run seed:ci.`);
    }
  }

  process.exit(falseGreens > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n❌  Quality check script failed:", err);
  process.exit(1);
});
