/**
 * Invariant: a ticket cannot be closed without a reason.
 *
 * Tests:
 *  1. PATCH to closed with no closeReason → 422
 *  2. PATCH to closed with an invalid closeReason → 422
 *  3. PATCH to closed with a valid closeReason → 200
 *  4. GET ticket → closeReason, closeNote, closedAt are present and readable
 *  5. GET close-reason-patterns → the reason appears in the aggregation
 *
 * All assertions hit the API directly — the UI cannot override a server-side
 * rule, and a UI-only check would miss a wide-open API.
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A = "ci_store_a";

// The five valid close reasons (must match server VALID_CLOSE_REASONS)
const VALID_REASONS = [
  "fixed_myself",
  "answered_article_existed",
  "answered_no_article",
  "buyer_error",
  "product_defect",
] as const;

test.describe("close-reason-required invariant", () => {
  let ticketId: string;

  // Create a fresh ticket before each test in this describe block
  test.beforeEach(async ({ asOwnerA }) => {
    const res = await asOwnerA.request.post("/api/support/tickets", {
      data: {
        area:     "stickers-packs",
        symptoms: ["image-quality"],
        body:     "CI invariant test ticket — close-reason check",
      },
    });
    expect(res.status(), "ticket creation should succeed").toBe(201);
    const body = await res.json() as { id: string };
    ticketId = body.id;
  });

  test("PATCH to closed with no closeReason returns 422", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.patch(`/api/support/tickets/${ticketId}/status`, {
      data: { status: "closed" },
    });
    expect(res.status(), "missing closeReason must be rejected").toBe(422);
    const body = await res.json() as { error?: string; code?: string };
    // The error should mention the reason requirement
    const errorText = JSON.stringify(body).toLowerCase();
    expect(
      errorText.includes("reason") || errorText.includes("closereason"),
      "error body should mention closeReason",
    ).toBe(true);
  });

  test("PATCH to closed with an invalid closeReason returns 422", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.patch(`/api/support/tickets/${ticketId}/status`, {
      data: { status: "closed", closeReason: "not_a_real_reason" },
    });
    expect(res.status(), "invalid closeReason must be rejected").toBe(422);
  });

  test("PATCH to closed with a valid closeReason succeeds", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.patch(`/api/support/tickets/${ticketId}/status`, {
      data: {
        status:      "closed",
        closeReason: "answered_no_article",
        closeNote:   "CI test: closed with reason",
      },
    });
    expect(res.status(), "valid closeReason should succeed").toBe(200);
  });

  test("closed ticket exposes reason, note, and closedAt read-only", async ({ asOwnerA }) => {
    // Close the ticket first
    await asOwnerA.request.patch(`/api/support/tickets/${ticketId}/status`, {
      data: { status: "closed", closeReason: "product_defect", closeNote: "CI note" },
    });

    const res = await asOwnerA.request.get(`/api/support/tickets/${ticketId}`);
    expect(res.status()).toBe(200);
    const ticket = await res.json() as Record<string, unknown>;

    expect(ticket.status,      "status should be closed").toBe("closed");
    expect(ticket.closeReason, "closeReason must be present").toBe("product_defect");
    expect(ticket.closeNote,   "closeNote must be present").toBe("CI note");
    expect(ticket.closedAt,    "closedAt must be a non-null timestamp").toBeTruthy();
  });

  test("every valid close reason is accepted", async ({ asOwnerA }) => {
    for (const reason of VALID_REASONS) {
      // Create a fresh ticket for each reason
      const createRes = await asOwnerA.request.post("/api/support/tickets", {
        data: { area: "stickers-packs", symptoms: ["image-quality"], body: `CI: testing reason ${reason}` },
      });
      const { id } = await createRes.json() as { id: string };

      const closeRes = await asOwnerA.request.patch(`/api/support/tickets/${id}/status`, {
        data: { status: "closed", closeReason: reason },
      });
      expect(closeRes.status(), `reason "${reason}" should be accepted`).toBe(200);
    }
  });

  test("closed reason feeds the patterns aggregation", async ({ asSuperAdmin }) => {
    // Create and close a ticket with a known reason
    const createRes = await asSuperAdmin.request.post("/api/support/tickets", {
      data: { area: "planner", symptoms: ["layout"], body: "CI patterns aggregation test" },
    });
    const { id } = await createRes.json() as { id: string };
    await asSuperAdmin.request.patch(`/api/support/tickets/${id}/status`, {
      data: { status: "closed", closeReason: "answered_no_article" },
    });

    const patternsRes = await asSuperAdmin.request.get("/api/support/close-reason-patterns");
    expect(patternsRes.status()).toBe(200);
    const patterns = await patternsRes.json() as Array<{ reason: string; count: number }>;

    const noArticleEntry = patterns.find((p) => p.reason === "answered_no_article");
    expect(noArticleEntry, "answered_no_article should appear in patterns").toBeTruthy();
    expect(noArticleEntry!.count, "count must be ≥ 1").toBeGreaterThanOrEqual(1);
  });
});
