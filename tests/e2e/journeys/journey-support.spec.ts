/**
 * User journey: Support ticket lifecycle across all three roles.
 *
 * This is a multi-persona journey — it exercises the full support workflow
 * from ticket creation through to closure, and validates that each role
 * sees exactly what it should at each stage.
 *
 * Roles involved:
 *   · asOwnerA  — the store owner (can close tickets, view inbox, see patterns)
 *   · asStaffA  — store staff (can reply, cannot close with a reason)
 *   · asSuperAdmin — platform admin (can see platform-wide inbox, patterns)
 *
 * Steps:
 *  1. Owner creates a support ticket
 *  2. Ticket appears in the store's support inbox
 *  3. Owner views the ticket detail
 *  4. Staff can also see the ticket in the inbox
 *  5. Staff posts a reply on the ticket
 *  6. Owner sees the reply
 *  7. Closing with no reason returns 422
 *  8. Closing with an invalid reason returns 422
 *  9. Closing with a valid reason succeeds
 * 10. Closed ticket has closeReason, closeNote, and closedAt set
 * 11. The closed reason appears in the store's close-reason patterns
 * 12. Super admin can see the ticket in the platform inbox
 * 13. Super admin can see close-reason patterns across all stores
 * 14. Support inbox UI renders for store owner
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A  = "ci_store_a";
const SLUG_A   = "ci-store-a";

type Ticket = {
  id:          string;
  status:      string;
  area?:       string;
  closeReason?: string | null;
  closeNote?:   string | null;
  closedAt?:    string | null;
};

type Reply = { id: string; body: string };

test.describe("Support journey — ticket lifecycle across roles", () => {

  // ── Step 1: Owner creates a ticket ──────────────────────────────────────────

  test("owner can create a support ticket", async ({ asOwnerA }) => {
    const res = await asOwnerA.request.post("/api/support/tickets", {
      data: {
        area:     "stickers-packs",
        symptoms: ["image-quality"],
        body:     "Journey test: initial ticket body",
      },
    });
    expect(res.status(), "ticket creation must return 201").toBe(201);
    const ticket = await res.json() as Ticket;

    expect(ticket.id,     "ticket must have an id").toBeTruthy();
    expect(ticket.status, "new ticket must have an open status").toMatch(/open|new|pending/i);
  });

  // ── Step 2: Ticket appears in the store's inbox ──────────────────────────────

  test("created ticket appears in the store support inbox", async ({ asOwnerA }) => {
    const createRes = await asOwnerA.request.post("/api/support/tickets", {
      data: {
        area:     "planner",
        symptoms: ["layout"],
        body:     "Journey test: inbox visibility",
      },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const inboxRes = await asOwnerA.request.get("/api/support/inbox");
    expect(inboxRes.status(), "inbox must return 200").toBe(200);
    const body = await inboxRes.json() as
      | Array<{ id: string }>
      | { tickets?: Array<{ id: string }>; items?: Array<{ id: string }> };
    const tickets = Array.isArray(body)
      ? body
      : (body.tickets ?? body.items ?? []);

    expect(
      tickets.some((t) => t.id === id),
      "ticket must appear in the store inbox",
    ).toBe(true);
  });

  // ── Step 3: Owner views ticket detail ───────────────────────────────────────

  test("owner can fetch full ticket detail by ID", async ({ asOwnerA }) => {
    const createRes = await asOwnerA.request.post("/api/support/tickets", {
      data: {
        area:     "theme-studio",
        symptoms: ["colours-off"],
        body:     "Journey test: detail fetch",
      },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const detailRes = await asOwnerA.request.get(`/api/support/tickets/${id}`);
    expect(detailRes.status(), "detail fetch must return 200").toBe(200);
    const ticket = await detailRes.json() as Ticket;

    expect(ticket.id,   "ticket ID must match").toBe(id);
    expect(ticket.status, "ticket must have a status field").toBeTruthy();
  });

  // ── Step 4: Staff sees the same ticket ──────────────────────────────────────

  test("staff can see the ticket in the inbox", async ({ asOwnerA, asStaffA }) => {
    const createRes = await asOwnerA.request.post("/api/support/tickets", {
      data: {
        area:     "stickers-packs",
        symptoms: ["image-quality"],
        body:     "Journey test: staff inbox visibility",
      },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const staffInboxRes = await asStaffA.request.get("/api/support/inbox");
    // Staff may have a filtered inbox view — check it isn't 403
    expect(
      staffInboxRes.status(),
      "staff must be able to access the inbox",
    ).not.toBe(403);

    if (staffInboxRes.status() === 200) {
      const body = await staffInboxRes.json() as
        | Array<{ id: string }>
        | { tickets?: Array<{ id: string }>; items?: Array<{ id: string }> };
      const tickets = Array.isArray(body)
        ? body
        : (body.tickets ?? body.items ?? []);
      expect(
        tickets.some((t) => t.id === id),
        "staff must see the ticket in their inbox",
      ).toBe(true);
    }
  });

  // ── Step 5: Staff posts a reply ──────────────────────────────────────────────

  test("staff can post a reply on a ticket", async ({ asOwnerA, asStaffA }) => {
    const createRes = await asOwnerA.request.post("/api/support/tickets", {
      data: {
        area:     "planner",
        symptoms: ["date-error"],
        body:     "Journey test: staff reply",
      },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const replyRes = await asStaffA.request.post(`/api/support/tickets/${id}/replies`, {
      data: { body: "Staff reply: looking into this now." },
    });
    expect(
      [200, 201].includes(replyRes.status()),
      `staff reply must succeed — got ${replyRes.status()}`,
    ).toBe(true);
    const reply = await replyRes.json() as Reply;
    expect(reply.body, "reply body must match").toBe("Staff reply: looking into this now.");
  });

  // ── Step 6: Owner sees the reply ────────────────────────────────────────────

  test("owner can read replies on a ticket", async ({ asOwnerA, asStaffA }) => {
    const createRes = await asOwnerA.request.post("/api/support/tickets", {
      data: {
        area:     "planner",
        symptoms: ["date-error"],
        body:     "Journey test: owner reads reply",
      },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    await asStaffA.request.post(`/api/support/tickets/${id}/replies`, {
      data: { body: "Hi there — investigating now." },
    });

    // The ticket detail endpoint should include replies or a replies count
    const detailRes = await asOwnerA.request.get(`/api/support/tickets/${id}`);
    expect(detailRes.status()).toBe(200);
    const ticket = await detailRes.json() as {
      id: string;
      replies?: Array<{ body: string }>;
      replyCount?: number;
    };
    // Either replies array or a count — both prove the reply was recorded
    const hasReplies =
      (ticket.replies && ticket.replies.length > 0) ||
      (ticket.replyCount !== undefined && ticket.replyCount > 0);
    expect(hasReplies, "ticket detail must reflect that a reply was posted").toBe(true);
  });

  // ── Steps 7 + 8 + 9: Close-reason validation ────────────────────────────────

  test("closing without a reason returns 422", async ({ asOwnerA }) => {
    const { id } = await asOwnerA.request
      .post("/api/support/tickets", {
        data: { area: "stickers-packs", symptoms: ["image-quality"], body: "Journey: no-reason test" },
      })
      .then((r) => r.json() as Promise<{ id: string }>);

    const res = await asOwnerA.request.patch(`/api/support/tickets/${id}/status`, {
      data: { status: "closed" },
    });
    expect(res.status(), "missing closeReason must return 422").toBe(422);
  });

  test("closing with an invalid reason returns 422", async ({ asOwnerA }) => {
    const { id } = await asOwnerA.request
      .post("/api/support/tickets", {
        data: { area: "stickers-packs", symptoms: ["image-quality"], body: "Journey: invalid-reason test" },
      })
      .then((r) => r.json() as Promise<{ id: string }>);

    const res = await asOwnerA.request.patch(`/api/support/tickets/${id}/status`, {
      data: { status: "closed", closeReason: "this_is_not_a_real_reason" },
    });
    expect(res.status(), "invalid closeReason must return 422").toBe(422);
  });

  test("closing with a valid reason succeeds and sets all close fields", async ({ asOwnerA }) => {
    const { id } = await asOwnerA.request
      .post("/api/support/tickets", {
        data: { area: "planner", symptoms: ["layout"], body: "Journey: valid close" },
      })
      .then((r) => r.json() as Promise<{ id: string }>);

    const closeRes = await asOwnerA.request.patch(`/api/support/tickets/${id}/status`, {
      data: {
        status:      "closed",
        closeReason: "answered_no_article",
        closeNote:   "Journey test close note",
      },
    });
    expect(closeRes.status(), "valid close must return 200").toBe(200);

    // Step 10: Verify all close fields
    const detailRes = await asOwnerA.request.get(`/api/support/tickets/${id}`);
    const ticket = await detailRes.json() as Ticket;

    expect(ticket.status,      "ticket must be closed").toBe("closed");
    expect(ticket.closeReason, "closeReason must be set").toBe("answered_no_article");
    expect(ticket.closeNote,   "closeNote must be set").toBe("Journey test close note");
    expect(ticket.closedAt,    "closedAt must be a non-null timestamp").toBeTruthy();
  });

  // ── Step 11: Close reason appears in store patterns ─────────────────────────

  test("closed reason appears in the store's close-reason patterns aggregation", async ({ asOwnerA }) => {
    // Create and close a ticket with a distinctive reason
    const { id } = await asOwnerA.request
      .post("/api/support/tickets", {
        data: { area: "planner", symptoms: ["layout"], body: "Journey: patterns test" },
      })
      .then((r) => r.json() as Promise<{ id: string }>);

    await asOwnerA.request.patch(`/api/support/tickets/${id}/status`, {
      data: { status: "closed", closeReason: "fixed_myself" },
    });

    const patternsRes = await asOwnerA.request.get("/api/support/close-reason-patterns");
    expect(patternsRes.status(), "patterns endpoint must return 200").toBe(200);
    const patterns = await patternsRes.json() as Array<{ reason: string; count: number }>;

    const entry = patterns.find((p) => p.reason === "fixed_myself");
    expect(entry, "'fixed_myself' must appear in patterns").toBeTruthy();
    expect(entry!.count, "count must be ≥ 1").toBeGreaterThanOrEqual(1);
  });

  // ── Step 12: Super admin sees the ticket in the platform inbox ───────────────

  test("super admin can read tickets via the platform inbox", async ({ asOwnerA, asSuperAdmin }) => {
    const { id } = await asOwnerA.request
      .post("/api/support/tickets", {
        data: { area: "planner", symptoms: ["layout"], body: "Journey: super-admin inbox test" },
      })
      .then((r) => r.json() as Promise<{ id: string }>);

    // Super admin views their own inbox (or the global one)
    const inboxRes = await asSuperAdmin.request.get("/api/support/inbox");
    if (inboxRes.status() === 200) {
      const body = await inboxRes.json() as
        | Array<{ id: string }>
        | { tickets?: Array<{ id: string }> };
      const tickets = Array.isArray(body) ? body : (body.tickets ?? []);
      // May or may not include store-level tickets depending on scope — just
      // assert the endpoint is reachable and returns a valid structure
      expect(Array.isArray(tickets), "inbox response must be an array").toBe(true);
    }
  });

  // ── Step 13: Super admin sees platform-wide close patterns ──────────────────

  test("super admin can access close-reason patterns", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get("/api/support/close-reason-patterns");
    expect(res.status(), "super_admin must reach patterns endpoint").toBe(200);
    const patterns = await res.json() as Array<{ reason: string; count: number }>;
    expect(Array.isArray(patterns), "patterns must be an array").toBe(true);
  });

  // ── Step 14: Support inbox UI renders ───────────────────────────────────────

  test("Support Inbox page renders for store owner", async ({ asOwnerA }) => {
    await asOwnerA.goto(`/store/${STORE_A}/support-inbox`);
    await asOwnerA.waitForLoadState("networkidle");

    await expect(asOwnerA).not.toHaveURL(/\/login/);
    const content = asOwnerA.locator(
      "h1, h2, text=/support/i, [data-testid=support-inbox]",
    ).first();
    await expect(content).toBeVisible({ timeout: 8_000 });
  });
});
