/**
 * Invariant: publish, unpublish, and delete are owner-only operations.
 * Staff can create and edit drafts; they cannot promote or destroy.
 *
 * All assertions hit the API directly — the publish gate is server-side.
 * A hidden button in the UI is not a gate; the server must reject the call.
 *
 * Covered types: themes, sticker-packs, editions (the three primary owned types).
 * Each type is tested independently with a fresh draft item.
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A = "ci_store_a";

// Helper: create a draft theme as the given requester and return its ID.
// Returns null if creation fails (test should assert the status itself).
async function createDraftTheme(
  request: import("@playwright/test").APIRequestContext,
  suffix: string,
): Promise<{ id: string } | null> {
  const res = await request.post(`/api/stores/${STORE_A}/owned/themes`, {
    data: {
      name:   `CI RBAC Test Theme — ${suffix}`,
      colors: ["#1B2A4A", "#C87560"],
    },
  });
  if (res.status() !== 201) return null;
  return res.json() as Promise<{ id: string }>;
}

async function createDraftPack(
  request: import("@playwright/test").APIRequestContext,
  suffix: string,
): Promise<{ id: string } | null> {
  const res = await request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
    data: { name: `CI RBAC Test Pack — ${suffix}`, attestation: "own-or-licensed" },
  });
  if (res.status() !== 201) return null;
  return res.json() as Promise<{ id: string }>;
}

async function createDraftEdition(
  request: import("@playwright/test").APIRequestContext,
  suffix: string,
): Promise<{ id: string } | null> {
  const res = await request.post(`/api/stores/${STORE_A}/owned/editions`, {
    data: { name: `CI RBAC Test Edition — ${suffix}` },
  });
  if (res.status() !== 201) return null;
  return res.json() as Promise<{ id: string }>;
}

test.describe("owner-vs-staff RBAC invariant", () => {

  // ── Staff CAN create and edit drafts ──────────────────────────────────────

  test("staff can create a draft theme", async ({ asStaffA }) => {
    const res = await asStaffA.request.post(`/api/stores/${STORE_A}/owned/themes`, {
      data: { name: "CI Staff Draft Theme", colors: ["#1B2A4A"] },
    });
    expect(res.status(), "staff should be able to create a draft theme").toBe(201);
  });

  test("staff can edit a draft theme", async ({ asStaffA }) => {
    const draft = await createDraftTheme(asStaffA.request, "staff-edit-test");
    expect(draft, "draft theme creation should succeed").toBeTruthy();

    const res = await asStaffA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
      { data: { name: "CI Staff Draft Theme — edited", colors: ["#FFFFFF"] } },
    );
    expect(res.status(), "staff should be able to edit a draft theme").toBe(200);
  });

  test("staff can create a draft sticker pack", async ({ asStaffA }) => {
    const res = await asStaffA.request.post(`/api/stores/${STORE_A}/owned/sticker-packs`, {
      data: { name: "CI Staff Draft Pack", attestation: "own-or-licensed" },
    });
    expect(res.status(), "staff should be able to create a draft pack").toBe(201);
  });

  test("staff can create a draft edition", async ({ asStaffA }) => {
    const res = await asStaffA.request.post(`/api/stores/${STORE_A}/owned/editions`, {
      data: { name: "CI Staff Draft Edition" },
    });
    expect(res.status(), "staff should be able to create a draft edition").toBe(201);
  });

  // ── Staff CANNOT publish (promote draft → live) ───────────────────────────

  test("staff cannot publish a theme (server-side rejection)", async ({ asStaffA, asOwnerA }) => {
    // Staff creates the draft
    const draft = await createDraftTheme(asStaffA.request, "staff-publish-blocked");
    expect(draft, "staff should be able to create the draft").toBeTruthy();

    // Staff attempts to publish → must be 403
    const publishAttempt = await asStaffA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
      { data: { status: "live" } },
    );
    expect(
      publishAttempt.status(),
      "staff publish attempt must be rejected server-side — not just hidden in UI",
    ).toBe(403);

    // Owner publishes the same draft — must succeed
    const ownerPublish = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
      { data: { status: "live" } },
    );
    expect(ownerPublish.status(), "owner should be able to publish").toBe(200);
  });

  test("staff cannot publish a sticker pack", async ({ asStaffA, asOwnerA }) => {
    const draft = await createDraftPack(asStaffA.request, "staff-pack-publish-blocked");
    expect(draft).toBeTruthy();

    const attempt = await asStaffA.request.patch(
      `/api/stores/${STORE_A}/owned/sticker-packs/${draft!.id}`,
      { data: { status: "live" } },
    );
    expect(attempt.status(), "staff cannot publish a pack").toBe(403);

    const ownerOk = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/sticker-packs/${draft!.id}`,
      { data: { status: "live" } },
    );
    expect(ownerOk.status(), "owner can publish the pack").toBe(200);
  });

  test("staff cannot publish an edition", async ({ asStaffA, asOwnerA }) => {
    const draft = await createDraftEdition(asStaffA.request, "staff-edition-publish-blocked");
    expect(draft).toBeTruthy();

    const attempt = await asStaffA.request.patch(
      `/api/stores/${STORE_A}/owned/editions/${draft!.id}`,
      { data: { status: "live" } },
    );
    expect(attempt.status(), "staff cannot publish an edition").toBe(403);

    const ownerOk = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/editions/${draft!.id}`,
      { data: { status: "live" } },
    );
    expect(ownerOk.status(), "owner can publish the edition").toBe(200);
  });

  // ── Staff CANNOT delete ───────────────────────────────────────────────────

  test("staff cannot delete a theme", async ({ asStaffA, asOwnerA }) => {
    const draft = await createDraftTheme(asOwnerA.request, "staff-delete-blocked");
    expect(draft).toBeTruthy();

    const attempt = await asStaffA.request.delete(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
    );
    expect(attempt.status(), "staff cannot delete a theme").toBe(403);

    // Confirm the theme still exists
    const check = await asOwnerA.request.get(`/api/stores/${STORE_A}/owned`);
    const { items } = await check.json() as { items: Array<{ id: string }> };
    expect(
      items.some((i) => i.id === draft!.id),
      "theme must still exist after staff delete was rejected",
    ).toBe(true);
  });

  test("staff cannot delete a sticker pack", async ({ asStaffA, asOwnerA }) => {
    const draft = await createDraftPack(asOwnerA.request, "staff-pack-delete-blocked");
    expect(draft).toBeTruthy();

    const attempt = await asStaffA.request.delete(
      `/api/stores/${STORE_A}/owned/sticker-packs/${draft!.id}`,
    );
    expect(attempt.status(), "staff cannot delete a pack").toBe(403);
  });

  // ── Owner CAN publish and delete ─────────────────────────────────────────

  test("owner can publish then delete a theme", async ({ asOwnerA }) => {
    const draft = await createDraftTheme(asOwnerA.request, "owner-publish-delete");
    expect(draft).toBeTruthy();

    const publish = await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
      { data: { status: "live" } },
    );
    expect(publish.status(), "owner can publish").toBe(200);

    const del = await asOwnerA.request.delete(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
    );
    expect([200, 204].includes(del.status()), "owner can delete").toBe(true);
  });

  // ── Unpublish is also owner-only ──────────────────────────────────────────

  test("staff cannot unpublish a live theme", async ({ asStaffA, asOwnerA }) => {
    // Owner publishes first
    const draft = await createDraftTheme(asOwnerA.request, "staff-unpublish-blocked");
    expect(draft).toBeTruthy();
    await asOwnerA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
      { data: { status: "live" } },
    );

    // Staff tries to unpublish
    const attempt = await asStaffA.request.patch(
      `/api/stores/${STORE_A}/owned/themes/${draft!.id}`,
      { data: { status: "draft" } },
    );
    expect(attempt.status(), "staff cannot unpublish a live theme").toBe(403);
  });
});
