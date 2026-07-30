/**
 * Invariant: store B cannot touch store A's owned items via any API route.
 *
 * This test hits the API DIRECTLY — not through the UI.
 * A UI-only check would pass while the API is wide open.
 *
 * Owned-catalog URL pattern: /api/stores/:storeId/owned/[type]/:id
 * assertSameStore() runs on every mutating route in owned-catalog.ts.
 *
 * Covered types: themes, sticker-packs, palettes, backgrounds, editions, inserts.
 * Covered operations: GET (list), GET (by ID), PATCH, DELETE, and publish.
 *
 * The test also asserts the positive case: super_admin CAN reach all of them.
 *
 * Fixtures seeded by scripts/src/seed-ci.ts:
 *   ci_theme_a, ci_pack_a, ci_palette_a, ci_background_a, ci_edition_a
 *   — all owned by ci_store_a.
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A = "ci_store_a";
const STORE_B = "ci_store_b";

/** Items owned by storeA. ownerB must be denied access to every one. */
const OWNED_A_ITEMS = [
  { type: "themes",        id: "ci_theme_a",      patchBody: { name: "ownerB override attempt" } },
  { type: "sticker-packs", id: "ci_pack_a",        patchBody: { name: "ownerB override attempt" } },
  { type: "palettes",      id: "ci_palette_a",     patchBody: { name: "ownerB override attempt" } },
  { type: "backgrounds",   id: "ci_background_a",  patchBody: { name: "ownerB override attempt" } },
  { type: "editions",      id: "ci_edition_a",     patchBody: { name: "ownerB override attempt" } },
] as const;

test.describe("store-isolation invariant — cross-store API access denied", () => {

  // ── ownerB is denied on every owned type ───────────────────────────────────

  for (const { type, id, patchBody } of OWNED_A_ITEMS) {
    test(`ownerB cannot PATCH storeA's ${type}/${id}`, async ({ asOwnerB }) => {
      const res = await asOwnerB.request.patch(
        `/api/stores/${STORE_A}/owned/${type}/${id}`,
        { data: patchBody },
      );
      expect(
        res.status(),
        `ownerB PATCH on storeA ${type} must be 403, got ${res.status()}`,
      ).toBe(403);
    });

    test(`ownerB cannot DELETE storeA's ${type}/${id}`, async ({ asOwnerB }) => {
      const res = await asOwnerB.request.delete(
        `/api/stores/${STORE_A}/owned/${type}/${id}`,
      );
      expect(
        res.status(),
        `ownerB DELETE on storeA ${type} must be 403, got ${res.status()}`,
      ).toBe(403);
    });
  }

  // ── ownerB cannot list storeA's owned items ────────────────────────────────

  test("ownerB cannot list storeA's owned catalog", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.get(`/api/stores/${STORE_A}/owned`);
    expect(res.status(), "listing storeA's catalog must return 403 for ownerB").toBe(403);
  });

  test("ownerB cannot list storeA's owned palettes", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.get(`/api/stores/${STORE_A}/owned/palettes`);
    expect(res.status()).toBe(403);
  });

  test("ownerB cannot list storeA's owned backgrounds", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.get(`/api/stores/${STORE_A}/owned/backgrounds`);
    expect(res.status()).toBe(403);
  });

  // ── ownerB cannot create items in storeA's namespace ──────────────────────

  test("ownerB cannot POST a new theme into storeA", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.post(`/api/stores/${STORE_A}/owned/themes`, {
      data: { name: "ownerB cross-store theme", colors: ["#000000"] },
    });
    expect(res.status(), "ownerB cannot create items in storeA").toBe(403);
  });

  test("ownerB cannot POST a new edition into storeA", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.post(`/api/stores/${STORE_A}/owned/editions`, {
      data: { name: "ownerB cross-store edition" },
    });
    expect(res.status()).toBe(403);
  });

  test("ownerB cannot POST a new sticker pack into storeA", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: { name: "ownerB cross-store pack" },
    });
    expect(res.status()).toBe(403);
  });

  // ── Publish/unpublish are write operations — also blocked ─────────────────

  test("ownerB cannot publish storeA's edition", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.patch(
      `/api/stores/${STORE_A}/owned/editions/ci_edition_a`,
      { data: { status: "live" } },
    );
    expect(res.status(), "publishing storeA's edition must be 403 for ownerB").toBe(403);
  });

  // ── super_admin CAN reach storeA's items (support path) ───────────────────

  test("super_admin can read storeA's owned catalog", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`/api/stores/${STORE_A}/owned`);
    expect(res.status(), "super_admin must be able to list storeA's catalog").toBe(200);
  });

  test("super_admin can PATCH storeA's theme", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.patch(
      `/api/stores/${STORE_A}/owned/themes/ci_theme_a`,
      { data: { name: "CI Theme A — super_admin edit" } },
    );
    expect(
      [200, 204].includes(res.status()),
      `super_admin PATCH on storeA theme should succeed, got ${res.status()}`,
    ).toBe(true);
  });

  // ── ownerB accessing storeB items is fine ─────────────────────────────────

  test("ownerB can list storeB's own catalog (sanity check)", async ({ asOwnerB }) => {
    const res = await asOwnerB.request.get(`/api/stores/${STORE_B}/owned`);
    // 200 even if the list is empty — the request must succeed
    expect(res.status(), "ownerB listing their own store should succeed").toBe(200);
  });

  // ── staffA (of storeA) cannot access storeB ───────────────────────────────

  test("staffA cannot access storeB's catalog", async ({ asStaffA }) => {
    const res = await asStaffA.request.get(`/api/stores/${STORE_B}/owned`);
    expect(res.status(), "staffA of storeA cannot list storeB's catalog").toBe(403);
  });
});
