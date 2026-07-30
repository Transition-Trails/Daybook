/**
 * User journey: Sticker pack creation, management, and publication.
 *
 * Covers the lifecycle a store owner follows when building a sticker pack:
 * creating the pack, updating its metadata, confirming it appears in the owned
 * catalog, publishing it, and then unpublishing/deleting for cleanup.
 *
 * Steps:
 *  1. Owner sees the Sticker Studio page load without crashing
 *  2. Owner creates a new sticker pack via API
 *  3. Pack appears in the store's owned-catalog list
 *  4. Owner edits pack metadata (name, attestation)
 *  5. Staff can see the pack in the owned catalog (read)
 *  6. Staff CANNOT publish the pack (server-enforced)
 *  7. Owner publishes the pack successfully
 *  8. Owner unpublishes (returns to draft)
 *  9. Owner deletes the pack; it no longer appears in the list
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A = "ci_store_a";

test.describe("Sticker pack journey — create, publish, and teardown", () => {

  // ── Step 1: Studio UI renders ───────────────────────────────────────────────

  test("Sticker Studio page loads for store owner", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/studios/stickers`);
    await asOwnerA.waitForLoadState("networkidle");

    await expect(asOwnerA).not.toHaveURL(/\/login/);
    await expect(
      asOwnerA.locator("main, [role=main], h1, [data-testid=studio-root]").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Steps 2 + 3: Create pack, confirm in list ───────────────────────────────

  test("owner creates a sticker pack and it appears in the owned catalog", async ({ asOwnerA }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: {
        name:        "Journey Test Pack — create",
        attestation: "own-or-licensed",
      },
    });
    expect(createRes.status(), "sticker pack creation must return 201").toBe(201);
    const pack = await createRes.json() as { id: string; name: string; status: string };

    expect(pack.id,     "pack must have an id").toBeTruthy();
    expect(pack.name,   "name must match").toBe("Journey Test Pack — create");
    expect(pack.status, "new pack must be draft").toBe("draft");

    // Confirm it appears in the owned catalog
    const listRes = await asOwnerA.request.get(`/api/stores/${STORE_A}/owned`);
    expect(listRes.status()).toBe(200);
    const { items } = await listRes.json() as { items: Array<{ id: string; kind?: string }> };
    expect(
      items.some((i) => i.id === pack.id),
      "newly created pack must be in the owned catalog",
    ).toBe(true);

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/sticker-packs/${pack.id}`);
  });

  // ── Step 4: Edit metadata ────────────────────────────────────────────────────

  test("owner can edit a pack's name and description", async ({ asOwnerA }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: { name: "Journey Test Pack — edit-me", attestation: "own-or-licensed" },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const patchRes = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/sticker-packs/${id}`,
      { data: { name: "Journey Test Pack — edited", description: "Updated via journey test" } },
    );
    expect(patchRes.status(), "patch must succeed").toBe(200);

    const patchBody = await patchRes.json() as { name: string };
    expect(patchBody.name, "name must reflect the edit").toBe("Journey Test Pack — edited");

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/sticker-packs/${id}`);
  });

  // ── Step 5: Staff can read the pack ─────────────────────────────────────────

  test("staff can view a draft sticker pack in the owned catalog", async ({ asOwnerA, asStaffA }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: { name: "Journey Test Pack — staff-read", attestation: "own-or-licensed" },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const staffList = await asStaffA.request.get(`/api/stores/${STORE_A}/owned`);
    expect(staffList.status(), "staff can list owned catalog").toBe(200);
    const { items } = await staffList.json() as { items: Array<{ id: string }> };
    expect(
      items.some((i) => i.id === id),
      "staff must see the draft pack in the catalog",
    ).toBe(true);

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/sticker-packs/${id}`);
  });

  // ── Step 6: Staff cannot publish ────────────────────────────────────────────

  test("staff cannot publish a sticker pack (server-enforced)", async ({ asOwnerA, asStaffA }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: { name: "Journey Test Pack — staff-publish-blocked", attestation: "own-or-licensed" },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const attempt = await asStaffA.request.patch(
      `/api/stores/${STORE_A}/owned/sticker-packs/${id}`,
      { data: { status: "live" } },
    );
    expect(attempt.status(), "staff publish attempt must return 403").toBe(403);

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/sticker-packs/${id}`);
  });

  // ── Steps 7 + 8: Owner publishes then unpublishes ────────────────────────────

  test("owner can publish then unpublish a sticker pack", async ({ asOwnerA }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: { name: "Journey Test Pack — publish-cycle", attestation: "own-or-licensed" },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    // Publish
    const publishRes = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/sticker-packs/${id}`,
      { data: { status: "live" } },
    );
    expect(publishRes.status(), "owner publish must succeed").toBe(200);
    const published = await publishRes.json() as { status: string };
    expect(published.status, "status must be live after publish").toBe("live");

    // Unpublish
    const unpublishRes = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/sticker-packs/${id}`,
      { data: { status: "draft" } },
    );
    expect(unpublishRes.status(), "owner unpublish must succeed").toBe(200);
    const unpublished = await unpublishRes.json() as { status: string };
    expect(unpublished.status, "status must return to draft").toBe("draft");

    // Cleanup
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/sticker-packs/${id}`);
  });

  // ── Step 9: Delete removes the pack from the catalog ────────────────────────

  test("owner can delete a sticker pack and it no longer appears in the catalog", async ({ asOwnerA }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: { name: "Journey Test Pack — delete-me", attestation: "own-or-licensed" },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const deleteRes = await asOwnerA.request.delete(
      `/api/stores/${STORE_A}/owned/sticker-packs/${id}`,
    );
    expect(
      [200, 204].includes(deleteRes.status()),
      `delete must return 200 or 204 — got ${deleteRes.status()}`,
    ).toBe(true);

    // Confirm it is gone
    const listRes = await asOwnerA.request.get(`/api/stores/${STORE_A}/owned`);
    const { items } = await listRes.json() as { items: Array<{ id: string }> };
    expect(
      items.every((i) => i.id !== id),
      "deleted pack must not appear in the owned catalog",
    ).toBe(true);
  });

  // ── UI: sticker library page ─────────────────────────────────────────────────

  test("Sticker Library page loads for store owner", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/stickers`);
    await asOwnerA.waitForLoadState("networkidle");

    await expect(asOwnerA).not.toHaveURL(/\/login/);
    // Should show the sticker library heading or an empty-state message
    const content = asOwnerA.locator(
      "h1, h2, [data-testid=sticker-library], text=/sticker/i",
    ).first();
    await expect(content).toBeVisible({ timeout: 8_000 });
  });
});
