/**
 * Invariant: the quality checker FAILS every ci_bad_* fixture for the right reason.
 *
 * A quality-checker run that returns pass=true for deliberately broken data is
 * worse than no checker at all — it gives false confidence.
 *
 * Each test hits GET /api/quality-check/:kind/:id as super_admin, asserts
 * pass=false, and confirms the reason field matches the expected failure mode.
 *
 * ci_bad_* fixtures are seeded by scripts/src/seed-ci.ts.
 */
import { test, expect } from "../fixtures/base.js";

const BASE = "/api/quality-check";

test.describe("quality-checker invariant — bad fixtures must all FAIL", () => {
  test("ci_bad_theme — empty colors[] slot", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}/theme/ci_bad_theme`);
    expect(res.status(), "checker should return 200 (item found)").toBe(200);

    const result = await res.json() as { pass: boolean; reason: string };
    expect(result.pass, "ci_bad_theme must FAIL the quality check").toBe(false);
    expect(
      result.reason.toLowerCase(),
      "reason must mention the empty-slot failure",
    ).toMatch(/empty.*slot|colors.*empty|no.*color/);
  });

  test("ci_bad_pack — no stickers and no instruction sheet", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}/pack/ci_bad_pack`);
    expect(res.status()).toBe(200);

    const result = await res.json() as { pass: boolean; reason: string };
    expect(result.pass, "ci_bad_pack must FAIL the quality check").toBe(false);
    expect(
      result.reason.toLowerCase(),
      "reason must mention missing index sheet",
    ).toMatch(/index.*sheet|no.*sticker|no.*sheet/);
  });

  test("ci_bad_asset — transparent=false (background pixels remain)", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}/sticker_asset/ci_bad_asset`);
    expect(res.status()).toBe(200);

    const result = await res.json() as { pass: boolean; reason: string };
    expect(result.pass, "ci_bad_asset must FAIL the quality check").toBe(false);
    expect(
      result.reason.toLowerCase(),
      "reason must mention cutout or transparency failure",
    ).toMatch(/transparent|cutout|background.*pixel/);
  });

  test("ci_bad_edition — orphaned asset reference in art.cover", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}/edition/ci_bad_edition`);
    expect(res.status()).toBe(200);

    const result = await res.json() as { pass: boolean; reason: string };
    expect(result.pass, "ci_bad_edition must FAIL the quality check").toBe(false);
    expect(
      result.reason.toLowerCase(),
      "reason must mention orphaned or missing asset",
    ).toMatch(/orphan|not.*found|missing.*asset|asset.*ref/);
  });

  test("ci_bad_recipe — Blocks-release engine gap", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}/recipe/ci_bad_recipe`);
    expect(res.status()).toBe(200);

    const result = await res.json() as { pass: boolean; reason: string };
    expect(result.pass, "ci_bad_recipe must FAIL the quality check").toBe(false);
    expect(
      result.reason.toLowerCase(),
      "reason must mention blocking gap",
    ).toMatch(/block|gap|release/);
  });

  test("ci_bad_planner_cfg — .test-TLD hyperlink that cannot resolve", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}/planner_config/ci_bad_planner_cfg`);
    expect(res.status()).toBe(200);

    const result = await res.json() as { pass: boolean; reason: string };
    expect(result.pass, "ci_bad_planner_cfg must FAIL the quality check").toBe(false);
    expect(
      result.reason.toLowerCase(),
      "reason must mention unresolvable hyperlink",
    ).toMatch(/unresolvable|hyperlink|\.test|cannot.*resolv/);
  });

  test("full quality-check run flags all six bad fixtures", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}`);
    expect(res.status()).toBe(200);

    const report = await res.json() as {
      totals: { checked: number; failed: number };
      results: Array<{ id: string; pass: boolean }>;
    };

    const BAD_IDS = [
      "ci_bad_theme",
      "ci_bad_pack",
      "ci_bad_asset",
      "ci_bad_edition",
      "ci_bad_recipe",
      "ci_bad_planner_cfg",
    ];

    for (const badId of BAD_IDS) {
      const entry = report.results.find((r) => r.id === badId);
      expect(entry, `result for ${badId} should be in full report`).toBeTruthy();
      expect(entry!.pass, `${badId} must appear as FAILED in full report`).toBe(false);
    }

    expect(
      report.totals.failed,
      "report totals.failed must include all six bad fixtures",
    ).toBeGreaterThanOrEqual(6);
  });

  test("non-existent item returns 404, not a false pass", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`${BASE}/theme/does_not_exist_ever`);
    // Must be 404 — returning 200 with pass=true for a missing item would be a false green
    expect(res.status(), "missing item must return 404 not a false-pass 200").toBe(404);
  });

  test("quality check endpoint is inaccessible to non-super-admins", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.get(`${BASE}`);
    expect(res.status(), "store owner must not access quality check endpoint").toBe(403);
  });
});
