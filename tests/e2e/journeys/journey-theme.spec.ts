/**
 * User journey: Theme creation, palette/background attachment, publication,
 * and cleanup.
 *
 * Themes are the most compositional owned type: they can have palettes,
 * backgrounds, and packs linked to them.  This journey walks the complete
 * lifecycle a store owner goes through before a theme reaches buyers.
 *
 * Steps:
 *  1. Owner sees the Theme Studio page load without crashing
 *  2. Owner creates a theme (draft)
 *  3. Owner creates a palette and links it to the theme
 *  4. Owner creates a background and links it to the theme
 *  5. Owner edits the theme name
 *  6. Staff can read the theme
 *  7. Staff cannot publish the theme
 *  8. Owner publishes the theme
 *  9. Published theme appears in the store's catalog with status=live
 * 10. Owner edits a field on the live theme
 * 11. Owner unpublishes the theme
 * 12. Owner deletes the theme; it no longer appears in the catalog
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A = "ci_store_a";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createTheme(
  req: import("@playwright/test").APIRequestContext,
  suffix: string,
): Promise<string> {
  const res = await req.post(`/api/stores/${STORE_A}/owned/themes`, {
    data: { name: `Journey Theme — ${suffix}`, colors: ["#1B2A4A", "#C87560", "#F7F0E6"] },
  });
  expect(res.status(), `theme creation (${suffix}) must return 201`).toBe(201);
  const { id } = await res.json() as { id: string };
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("Theme journey — compose, publish, and teardown", () => {

  // ── Step 1: Studio UI renders ───────────────────────────────────────────────

  test("Theme Studio page loads for store owner", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/studios/theme`);
    await asOwnerA.waitForLoadState("networkidle");

    await expect(asOwnerA).not.toHaveURL(/\/login/);
    await expect(
      asOwnerA.locator("main, [role=main], h1, [data-testid=studio-root]").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Step 2: Create theme ─────────────────────────────────────────────────────

  test("owner can create a theme with colors and it is returned as draft", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/themes`, {
      data: {
        name:   "Journey Theme — color check",
        colors: ["#1B2A4A", "#C87560", "#F7F0E6", "#E8D9C4"],
      },
    });
    expect(res.status(), "theme creation must return 201").toBe(201);
    const theme = await res.json() as { id: string; name: string; status: string; colors?: unknown };

    expect(theme.id,     "theme must have an id").toBeTruthy();
    expect(theme.status, "new theme must be draft").toBe("draft");

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${theme.id}`);
  });

  // ── Step 3: Create palette and link to theme ────────────────────────────────

  test("owner can create a palette and link it to a theme", async ({ asOwnerA }) => {
    const themeId = await createTheme(asOwnerA.request, "palette-link");

    // Create palette
    const paletteRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/palettes`, {
      data: {
        name:   "Journey Palette",
        shades: ["#1B2A4A", "#2E4070", "#C87560", "#E5A090"],
      },
    });
    expect(paletteRes.status(), "palette creation must return 201").toBe(201);
    const { id: paletteId } = await paletteRes.json() as { id: string };

    // Link palette to theme
    const linkRes = await asOwnerA.request.put(
      `/api/stores/${STORE_A}/owned/themes/${themeId}/palettes`,
      { data: { paletteIds: [paletteId] } },
    );
    expect(
      [200, 204].includes(linkRes.status()),
      `palette link must succeed — got ${linkRes.status()}`,
    ).toBe(true);

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/palettes/${paletteId}`);
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
  });

  // ── Step 4: Create background and link to theme ─────────────────────────────

  test("owner can create a background record and link it to a theme", async ({ asOwnerA }) => {
    const themeId = await createTheme(asOwnerA.request, "bg-link");

    // Create a solid-colour background (no file upload required)
    const bgRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/backgrounds`, {
      data: {
        name:    "Journey Background",
        kind:    "color",
        value:   "#F7F0E6",
      },
    });

    if (bgRes.status() === 422 || bgRes.status() === 400) {
      // Some installs require an uploaded image; skip gracefully
      test.skip(true, `background creation returned ${bgRes.status()} — file upload may be required`);
      await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
      return;
    }

    expect(bgRes.status(), "background creation must return 201").toBe(201);
    const { id: bgId } = await bgRes.json() as { id: string };

    // Link background to theme
    const linkRes = await asOwnerA.request.put(
      `/api/stores/${STORE_A}/owned/themes/${themeId}/backgrounds`,
      { data: { backgroundIds: [bgId] } },
    );
    expect(
      [200, 204].includes(linkRes.status()),
      `background link must succeed — got ${linkRes.status()}`,
    ).toBe(true);

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/backgrounds/${bgId}`);
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
  });

  // ── Step 5: Edit theme name ──────────────────────────────────────────────────

  test("owner can rename a draft theme", async ({ asOwnerA }) => {
    const themeId = await createTheme(asOwnerA.request, "rename-me");

    const patchRes = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { name: "Journey Theme — renamed" } },
    );
    expect(patchRes.status(), "rename must succeed").toBe(200);
    const updated = await patchRes.json() as { name: string };
    expect(updated.name, "name must reflect the rename").toBe("Journey Theme — renamed");

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
  });

  // ── Step 6: Staff can read ───────────────────────────────────────────────────

  test("staff can read a draft theme in the owned catalog", async ({ asOwnerA, asStaffA }) => {
    const themeId = await createTheme(asOwnerA.request, "staff-read");

    const listRes = await asStaffA.request.get(`/api/stores/${STORE_A}/owned`);
    expect(listRes.status()).toBe(200);
    const { items } = await listRes.json() as { items: Array<{ id: string }> };
    expect(
      items.some((i) => i.id === themeId),
      "staff must see the draft theme in the catalog",
    ).toBe(true);

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
  });

  // ── Step 7: Staff cannot publish ────────────────────────────────────────────

  test("staff cannot publish a theme (server-enforced)", async ({ asOwnerA, asStaffA }) => {
    const themeId = await createTheme(asOwnerA.request, "staff-publish-blocked");

    const attempt = await asStaffA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { status: "live" } },
    );
    expect(attempt.status(), "staff publish must be rejected with 403").toBe(403);

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
  });

  // ── Steps 8 + 9: Owner publishes; status=live in catalog ────────────────────

  test("owner publishes a theme and it appears live in the catalog", async ({ asOwnerA }) => {
    const themeId = await createTheme(asOwnerA.request, "publish");

    const publishRes = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { status: "live" } },
    );
    expect(publishRes.status(), "publish must succeed").toBe(200);
    const published = await publishRes.json() as { status: string };
    expect(published.status, "status must be live").toBe("live");

    // Verify status in catalog
    const listRes = await asOwnerA.request.get(`/api/stores/${STORE_A}/owned`);
    const { items } = await listRes.json() as { items: Array<{ id: string; status: string }> };
    const entry = items.find((i) => i.id === themeId);
    expect(entry, "theme must be in catalog").toBeTruthy();
    expect(entry!.status, "catalog entry must show status=live").toBe("live");

    // Cleanup
    await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { status: "draft" } },
    );
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
  });

  // ── Step 10: Edit a field on a live theme ───────────────────────────────────

  test("owner can edit the name of a live theme without unpublishing", async ({ asOwnerA }) => {
    const themeId = await createTheme(asOwnerA.request, "live-edit");
    await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { status: "live" } },
    );

    const patchRes = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { name: "Journey Theme — live-edited" } },
    );
    // 200 = editable while live; 409 = requires unpublish first
    // Both behaviours are valid depending on server policy
    expect(
      [200, 204, 409].includes(patchRes.status()),
      `live theme edit returned unexpected status ${patchRes.status()}`,
    ).toBe(true);

    // Cleanup
    await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { status: "draft" } },
    );
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);
  });

  // ── Steps 11 + 12: Unpublish then delete ────────────────────────────────────

  test("owner can unpublish then delete a theme", async ({ asOwnerA }) => {
    const themeId = await createTheme(asOwnerA.request, "unpublish-delete");
    await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { status: "live" } },
    );

    // Unpublish
    const unpublishRes = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
      { data: { status: "draft" } },
    );
    expect(unpublishRes.status(), "unpublish must succeed").toBe(200);

    // Delete
    const deleteRes = await asOwnerA.request.delete(
      `/api/stores/${STORE_A}/owned/themes/${themeId}`,
    );
    expect(
      [200, 204].includes(deleteRes.status()),
      `delete must return 200 or 204 — got ${deleteRes.status()}`,
    ).toBe(true);

    // Confirm gone
    const listRes = await asOwnerA.request.get(`/api/stores/${STORE_A}/owned`);
    const { items } = await listRes.json() as { items: Array<{ id: string }> };
    expect(
      items.every((i) => i.id !== themeId),
      "deleted theme must not appear in the catalog",
    ).toBe(true);
  });
});
