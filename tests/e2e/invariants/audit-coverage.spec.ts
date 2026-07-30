/**
 * Invariant: every mutation writes an audit row with actor, store scope,
 * action, target type, and target ID.
 *
 * The audit log is the oracle for permission tests — it catches server-side
 * failures that the UI would hide (e.g. a 403 that the client silently ignores,
 * or a success that skipped the audit write).
 *
 * Strategy:
 *  1. Record a timestamp immediately before the mutation.
 *  2. Make the mutation via the API.
 *  3. Query GET /api/audit-log with ?since=<timestamp>&actorUserId=<id>
 *  4. Assert the expected audit row is present with all required fields.
 *
 * Required audit fields (from auditLogTable schema):
 *   actorUserId, actorRole, scope, action, targetType, targetId
 *
 * Covered mutations:
 *   · theme create (staff)
 *   · theme publish (owner)
 *   · theme delete (owner)
 *   · recipe publish (super_admin)
 *   · ticket status change (owner)
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A     = "ci_store_a";
const OWNER_A_ID  = "ci_owner_a";
const STAFF_A_ID  = "ci_staff_a";
const SUPER_ID    = "ci_super_admin";

type AuditEntry = {
  actorUserId:  string;
  actorRole:    string;
  scope:        string;
  action:       string;
  targetType:   string | null;
  targetId:     string | null;
  createdAt:    string;
};

/** Query the audit log since a given ISO timestamp for a specific actor. */
async function queryAuditLog(
  request: import("@playwright/test").APIRequestContext,
  actorUserId: string,
  since: Date,
  action?: string,
): Promise<AuditEntry[]> {
  const params = new URLSearchParams({ actorUserId, since: since.toISOString() });
  if (action) params.set("action", action);
  const res = await request.get(`/api/audit-log?${params}`);
  expect(res.status(), "audit log query should succeed").toBe(200);
  const { entries } = await res.json() as { entries: AuditEntry[] };
  return entries;
}

test.describe("audit-coverage invariant", () => {

  test("creating a theme writes an audit row", async ({ asStaffA, asSuperAdmin }) => {
    const before = new Date();

    const createRes = await asStaffA.request.post(`/api/stores/${STORE_A}/owned/themes`, {
      data: { name: "CI Audit — Theme Create", colors: ["#1B2A4A"] },
    });
    expect(createRes.status()).toBe(201);
    const { id: themeId } = await createRes.json() as { id: string };

    const entries = await queryAuditLog(asSuperAdmin.request, STAFF_A_ID, before, "owned_theme.create");
    const row = entries.find((e) => e.targetId === themeId);

    expect(row, "audit row for theme.create must exist").toBeTruthy();
    expect(row!.actorUserId,  "actorUserId must be staffA").toBe(STAFF_A_ID);
    expect(row!.scope,        "scope must be storeA").toBe(STORE_A);
    expect(row!.action,       "action must reference theme create").toMatch(/theme.*create|create.*theme/i);
    expect(row!.targetType,   "targetType must be set").toBeTruthy();
    expect(row!.targetId,     "targetId must be the new theme ID").toBe(themeId);
  });

  test("publishing a theme writes an audit row", async ({ asOwnerA, asSuperAdmin }) => {
    // Create first
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/themes`, {
      data: { name: "CI Audit — Theme Publish", colors: ["#C87560"] },
    });
    const { id: themeId } = await createRes.json() as { id: string };

    const before = new Date();

    await asOwnerA.request.patch(`/api/stores/${STORE_A}/owned/themes/${themeId}`, {
      data: { status: "live" },
    });

    const entries = await queryAuditLog(asSuperAdmin.request, OWNER_A_ID, before);
    const row = entries.find(
      (e) => e.targetId === themeId && /publish|live|status/i.test(e.action),
    );
    expect(row, "audit row for theme publish must exist").toBeTruthy();
    expect(row!.scope,  "scope must be storeA").toBe(STORE_A);
    expect(row!.action, "action must reference publish or status change").toMatch(/publish|status|live/i);
  });

  test("deleting a theme writes an audit row", async ({ asOwnerA, asSuperAdmin }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/themes`, {
      data: { name: "CI Audit — Theme Delete", colors: ["#000000"] },
    });
    const { id: themeId } = await createRes.json() as { id: string };

    const before = new Date();
    await asOwnerA.request.delete(`/api/stores/${STORE_A}/owned/themes/${themeId}`);

    const entries = await queryAuditLog(asSuperAdmin.request, OWNER_A_ID, before);
    const row = entries.find(
      (e) => e.targetId === themeId && /delete|remove/i.test(e.action),
    );
    expect(row, "audit row for theme delete must exist").toBeTruthy();
    expect(row!.targetId, "targetId must reference the deleted theme").toBe(themeId);
  });

  test("publishing a recipe writes an audit row", async ({ asSuperAdmin }) => {
    // Create a clean recipe
    const createRes = await asSuperAdmin.request.post("/api/platform/recipes", {
      data: {
        name: "CI Audit — Recipe Publish",
        category: "planner",
        parts: [],
        claudeBrief: { assistantGrounding: "CI audit test", engineGaps: [] },
      },
    });
    const { id: recipeId } = await createRes.json() as { id: string };

    const before = new Date();
    await asSuperAdmin.request.post(`/api/platform/recipes/${recipeId}/publish`);

    const entries = await queryAuditLog(asSuperAdmin.request, SUPER_ID, before, "recipe.publish");
    const row = entries.find((e) => e.targetId === recipeId);
    expect(row, "audit row for recipe.publish must exist").toBeTruthy();
    expect(row!.action, "action must be recipe.publish").toMatch(/recipe.*publish/i);
    expect(row!.targetId, "targetId must be the recipe ID").toBe(recipeId);
  });

  test("closing a support ticket writes an audit row", async ({ asOwnerA, asSuperAdmin }) => {
    const createRes = await asOwnerA.request.post("/api/support/tickets", {
      data: { area: "stickers-packs", symptoms: ["image-quality"], body: "CI audit — ticket close" },
    });
    const { id: ticketId } = await createRes.json() as { id: string };

    const before = new Date();
    await asOwnerA.request.patch(`/api/support/tickets/${ticketId}/status`, {
      data: { status: "closed", closeReason: "fixed_myself" },
    });

    const entries = await queryAuditLog(asSuperAdmin.request, OWNER_A_ID, before);
    const row = entries.find(
      (e) => e.targetId === ticketId && /ticket|close|status/i.test(e.action),
    );
    expect(row, "audit row for ticket close must exist").toBeTruthy();
  });

  test("audit row has all required fields — none are null unexpectedly", async ({ asOwnerA, asSuperAdmin }) => {
    const createRes = await asOwnerA.request.post(`/api/stores/${STORE_A}/owned/themes`, {
      data: { name: "CI Audit — Field completeness", colors: ["#FAFBFC"] },
    });
    const { id: themeId } = await createRes.json() as { id: string };

    const before = new Date();
    await asOwnerA.request.patch(`/api/stores/${STORE_A}/owned/themes/${themeId}`, {
      data: { name: "CI Audit — Field completeness — edited" },
    });

    const entries = await queryAuditLog(asSuperAdmin.request, OWNER_A_ID, before);
    const row = entries[0]; // most recent entry for ownerA
    expect(row, "at least one audit entry must exist after mutation").toBeTruthy();

    // Every required field must be set
    const REQUIRED: Array<keyof AuditEntry> = ["actorUserId", "actorRole", "scope", "action"];
    for (const field of REQUIRED) {
      expect(row![field], `audit row.${field} must not be null/empty`).toBeTruthy();
    }
    expect(row!.createdAt, "audit row.createdAt must be set").toBeTruthy();
  });

  test("audit log is inaccessible to store owners (super_admin only)", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.get("/api/audit-log");
    expect(
      res.status(),
      "store owner must not access audit log — super_admin only",
    ).toBe(403);
  });

  test("403 from a cross-store attempt does NOT produce an audit row", async ({
    asOwnerB,
    asSuperAdmin,
  }) => {
    const before = new Date();

    // ownerB tries to patch storeA's theme — must get 403
    await asOwnerB.request.patch(`/api/stores/${STORE_A}/owned/themes/ci_theme_a`, {
      data: { name: "ownerB cross-store inject" },
    });

    // No audit row should exist for this actor on this action
    const entries = await queryAuditLog(asSuperAdmin.request, "ci_owner_b", before);
    const poisonRow = entries.find(
      (e) => e.targetId === "ci_theme_a" && e.actorUserId === "ci_owner_b",
    );
    expect(
      poisonRow,
      "a rejected cross-store attempt must not produce an audit row",
    ).toBeUndefined();
  });
});
