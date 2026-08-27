import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  auditLogTable,
  helpContentTable,
  ordersTable,
  ticketsTable,
  usersTable,
  type User,
} from "@workspace/db";
import storesRouter from "../routes/stores";
import authRouter from "../routes/auth";
import { requireStoreAccess, resolveStoreActor } from "../middleware/requireRole";
import ordersRouter from "../routes/orders";
import meRouter from "../routes/me";
import platformRouter from "../routes/platform";
import supportRouter from "../routes/support";

const actorId = `impersonation-sa-${Math.random().toString(36).slice(2, 10)}`;
const orderId = `impersonation-order-${Math.random().toString(36).slice(2, 10)}`;
const helpId = `impersonation-help-${Math.random().toString(36).slice(2, 10)}`;
const alphaTicketId = `impersonation-ticket-alpha-${Math.random().toString(36).slice(2, 10)}`;
const betaTicketId = `impersonation-ticket-beta-${Math.random().toString(36).slice(2, 10)}`;
let actor: User;

function makeSessionApp() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "store-impersonation-test-secret",
    resave: false,
    saveUninitialized: false,
  }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const testRequest = req as any;
    testRequest.isAuthenticated = () => true;
    testRequest.user = actor;
    testRequest.log = {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    };
    next();
  });
  app.post("/test/expire-impersonation", (req, res) => {
    if (req.session.storeImpersonation) {
      req.session.storeImpersonation.expiresAt = new Date(Date.now() - 1).toISOString();
    }
    res.sendStatus(204);
  });
  app.get("/api/audit", resolveStoreActor, (_req, res) => {
    res.json({ entries: [] });
  });
  app.get("/api/header-scoped", requireStoreAccess("store_staff"), (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api", authRouter);
  app.use("/api", storesRouter);
  app.use("/api", platformRouter);
  app.use("/api", meRouter);
  app.use("/api", supportRouter);
  app.use("/api", ordersRouter);
  return app;
}

function makeAnonymousSupportApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const testRequest = req as any;
    testRequest.isAuthenticated = () => false;
    testRequest.log = {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    };
    next();
  });
  app.use("/api", supportRouter);
  app.use("/api", platformRouter);
  return app;
}

beforeAll(async () => {
  const [inserted] = await db.insert(usersTable).values({
    id: actorId,
    provider: "google",
    email: `${actorId}@test.example.com`,
    name: "Impersonation Test Admin",
    platformRole: "super_admin",
    owned: [],
    aiEnabled: false,
    aiProvider: "claude",
    connections: {
      googleDrive: false,
      googleCalendar: false,
      googleTasks: false,
      googleDocs: false,
      notion: false,
    },
  }).returning();
  actor = inserted;
  await db.insert(ordersTable).values({
    id: orderId,
    storeId: "store-alpha",
    buyerEmail: "impersonation-order@test.invalid",
    items: [{ name: "Scoped order", priceCents: 1000 }],
    totalCents: 1000,
  });
  await db.insert(ticketsTable).values([
    {
      id: alphaTicketId,
      reporterRole: "buyer",
      recipientScope: "store-alpha",
      storeId: "store-alpha",
      area: "orders",
      body: "Alpha support ticket",
    },
    {
      id: betaTicketId,
      reporterRole: "buyer",
      recipientScope: "store-beta",
      storeId: "store-beta",
      area: "orders",
      body: "Beta support ticket",
    },
  ]);
});

afterAll(async () => {
  await db.delete(ticketsTable).where(inArray(ticketsTable.id, [alphaTicketId, betaTicketId]));
  await db.delete(helpContentTable).where(eq(helpContentTable.id, helpId));
  await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  await db.delete(auditLogTable).where(eq(auditLogTable.actorUserId, actorId));
  await db.delete(usersTable).where(eq(usersTable.id, actorId));
});

describe("store impersonation session lifecycle", () => {
  it("keeps store operator support routes authenticated", async () => {
    const app = makeAnonymousSupportApp();
    const responses = await Promise.all([
      request(app).get("/api/support/inbox?storeId=store-alpha"),
      request(app).get(`/api/support/tickets/${alphaTicketId}`),
      request(app).post(`/api/support/tickets/${alphaTicketId}/replies`).send({ body: "no" }),
      request(app).patch(`/api/support/tickets/${alphaTicketId}/status`).send({ status: "fixed" }),
      request(app).get("/api/support/close-reason-patterns?storeId=store-alpha"),
      request(app).post("/api/help").send({}),
      request(app).patch(`/api/help/${helpId}`).send({}),
      request(app).delete(`/api/help/${helpId}`),
    ]);
    expect(responses.map(response => response.status)).toEqual(Array(8).fill(401));
  });

  it("requires a platform super admin to enter a store", async () => {
    const regularActor = { ...actor, platformRole: null } as User;
    const original = actor;
    actor = regularActor;
    const response = await request(makeSessionApp())
      .post("/api/stores/store-alpha/impersonate");
    actor = original;
    expect(response.status).toBe(403);
  });

  it("issues a 30-minute scope, enforces it, exposes it, and clears it on exit", async () => {
    const app = makeSessionApp();
    const agent = request.agent(app);
    const enteredAt = Date.now();

    const enter = await agent.post("/api/stores/store-alpha/impersonate");
    expect(enter.status).toBe(200);
    expect(enter.body.impersonation).toMatchObject({
      actorUserId: actorId,
      storeId: "store-alpha",
    });
    const ttl = Date.parse(enter.body.impersonation.expiresAt) - Date.parse(enter.body.impersonation.startedAt);
    expect(ttl).toBe(30 * 60 * 1000);
    expect(Date.parse(enter.body.impersonation.startedAt)).toBeGreaterThanOrEqual(enteredAt - 1_000);

    const context = await agent.get("/api/auth/me");
    expect(context.status).toBe(200);
    expect(context.body.impersonation.storeId).toBe("store-alpha");

    const scopedStores = await agent.get("/api/me/stores?includeSeed=true");
    expect(scopedStores.status).toBe(200);
    expect(scopedStores.body).toHaveLength(1);
    expect(scopedStores.body[0]).toMatchObject({
      id: "store-alpha",
      role: "super_admin",
    });

    const scopedStore = await agent.get("/api/stores/store-alpha");
    expect(scopedStore.status).toBe(200);
    expect(scopedStore.body.id).toBe("store-alpha");

    const scopedAudit = await agent.get("/api/audit?storeId=store-alpha&limit=5");
    expect(scopedAudit.status).toBe(200);

    const headerScoped = await agent
      .get("/api/header-scoped")
      .set("x-store-id", "store-alpha");
    expect(headerScoped.status).toBe(200);

    const crossStoreHeader = await agent
      .get("/api/header-scoped")
      .set("x-store-id", "store-beta");
    expect(crossStoreHeader.status).toBe(403);

    const orderDetail = await agent
      .get(`/api/orders/${orderId}`)
      .set("x-store-id", "store-alpha");
    expect(orderDetail.status).toBe(200);
    expect(orderDetail.body.order).toMatchObject({
      id: orderId,
      storeId: "store-alpha",
    });

    const inbox = await agent
      .get("/api/support/inbox?storeId=store-alpha")
      .set("x-store-id", "store-alpha");
    expect(inbox.status).toBe(200);
    expect(inbox.body.tickets.map((ticket: { id: string }) => ticket.id)).toContain(alphaTicketId);
    expect(inbox.body.tickets.map((ticket: { id: string }) => ticket.id)).not.toContain(betaTicketId);

    const ticketDetail = await agent
      .get(`/api/support/tickets/${alphaTicketId}`)
      .set("x-store-id", "store-alpha");
    expect(ticketDetail.status).toBe(200);

    const ticketReply = await agent
      .post(`/api/support/tickets/${alphaTicketId}/replies`)
      .set("x-store-id", "store-alpha")
      .send({ body: "Scoped support reply" });
    expect(ticketReply.status).toBe(201);

    const ticketStatus = await agent
      .patch(`/api/support/tickets/${alphaTicketId}/status`)
      .set("x-store-id", "store-alpha")
      .send({ status: "fixed" });
    expect(ticketStatus.status).toBe(200);

    const crossStoreTicket = await agent
      .get(`/api/support/tickets/${betaTicketId}`)
      .set("x-store-id", "store-alpha");
    expect(crossStoreTicket.status).toBe(403);

    const helpList = await agent
      .get("/api/help?scope=store-alpha")
      .set("x-store-id", "store-alpha");
    expect(helpList.status).toBe(200);

    const createdHelp = await agent
      .post("/api/help")
      .set("x-store-id", "store-alpha")
      .send({
        id: helpId,
        title: "Scoped support article",
        body: "Scoped content",
        category: "something-else",
        scope: "store-alpha",
        status: "draft",
      });
    expect(createdHelp.status).toBe(201);

    const updatedHelp = await agent
      .patch(`/api/help/${helpId}`)
      .set("x-store-id", "store-alpha")
      .send({ title: "Updated scoped support article" });
    expect(updatedHelp.status).toBe(200);

    const crossStoreHelp = await agent
      .patch(`/api/help/${helpId}`)
      .set("x-store-id", "store-beta")
      .send({ title: "Must not update" });
    expect(crossStoreHelp.status).toBe(403);

    const deletedHelp = await agent
      .delete(`/api/help/${helpId}`)
      .set("x-store-id", "store-alpha");
    expect(deletedHelp.status).toBe(204);

    let mutationAudits: Array<typeof auditLogTable.$inferSelect> = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      mutationAudits = await db.select().from(auditLogTable).where(and(
        eq(auditLogTable.actorUserId, actorId),
        eq(auditLogTable.action, "store.impersonation.mutation"),
      ));
      if (mutationAudits.length >= 3) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(mutationAudits.length).toBeGreaterThanOrEqual(3);
    expect(mutationAudits.every(row => row.scope === "store-alpha")).toBe(true);
    expect(mutationAudits.every(row =>
      (row.metadata as Record<string, unknown>)?.adminSupportAction === true
    )).toBe(true);

    const unscopedAudit = await agent.get("/api/audit");
    expect(unscopedAudit.status).toBe(403);

    const crossStore = await agent.get("/api/stores/store-beta");
    expect(crossStore.status).toBe(403);
    expect(crossStore.body.error).toMatch(/impersonation scope/i);

    const globalMutation = await agent.post("/api/stores").send({
      name: "Must Not Be Created",
      slug: `blocked-${actorId}`,
    });
    expect(globalMutation.status).toBe(403);
    expect(globalMutation.body.error).toMatch(/must target the entered store/i);

    const spoofedQueryMutation = await agent
      .post("/api/stores?storeId=store-alpha")
      .send({ name: "Must Not Be Created", slug: `blocked-query-${actorId}` });
    expect(spoofedQueryMutation.status).toBe(403);
    expect(spoofedQueryMutation.body.error).toMatch(/must target the entered store/i);

    const spoofedHeaderMutation = await agent
      .post("/api/stores")
      .set("x-store-id", "store-alpha")
      .send({ name: "Must Not Be Created", slug: `blocked-header-${actorId}` });
    expect(spoofedHeaderMutation.status).toBe(403);
    expect(spoofedHeaderMutation.body.error).toMatch(/must target the entered store/i);

    const conflictingContext = await agent
      .get("/api/stores/store-alpha?storeId=store-beta");
    expect(conflictingContext.status).toBe(403);
    expect(conflictingContext.body.error).toMatch(/impersonation scope/i);

    const [startAudit] = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.actorUserId, actorId),
      eq(auditLogTable.action, "store.impersonation.start"),
    ));
    expect(startAudit).toMatchObject({
      actorUserId: actorId,
      actorRole: "super_admin",
      scope: "store-alpha",
      targetId: "store-alpha",
    });
    expect(startAudit?.metadata).toMatchObject({
      adminSupportAction: true,
      impersonation: {
        actorUserId: actorId,
        storeId: "store-alpha",
      },
    });

    const exit = await agent.post("/api/stores/impersonation/exit");
    expect(exit.status).toBe(200);
    expect(exit.body).toEqual({ impersonation: null });
    const afterExit = await agent.get("/api/auth/me");
    expect(afterExit.body.impersonation).toBeNull();

    const [exitAudit] = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.actorUserId, actorId),
      eq(auditLogTable.action, "store.impersonation.exit"),
    ));
    expect(exitAudit).toMatchObject({
      actorUserId: actorId,
      scope: "store-alpha",
      targetId: "store-alpha",
    });
  });

  it("drops an expired scope from server context and no longer enforces it", async () => {
    const app = makeSessionApp();
    const agent = request.agent(app);
    await agent.post("/api/stores/store-alpha/impersonate").expect(200);
    await agent.post("/test/expire-impersonation").expect(204);

    const context = await agent.get("/api/auth/me");
    expect(context.status).toBe(200);
    expect(context.body.impersonation).toBeNull();

    const otherStore = await agent.get("/api/stores/store-beta");
    expect(otherStore.status).toBe(200);
  });
});