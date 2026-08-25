/**
 * RBAC integration tests for the multi-tenant store platform.
 *
 * Strategy: spin up a minimal Express app with fake auth injected (bypasses
 * Passport/session entirely), mount the real stores + platform routers, and
 * hit the real development database.  Test data uses unique per-run IDs and
 * is cleaned up in afterAll.
 *
 * Run: pnpm --filter @workspace/api-server test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Response } from "express";
import request from "supertest";
import { db } from "@workspace/db";
import {
  usersTable,
  storeMembersTable,
  storeCatalogTable,
  auditLogTable,
  themesTable,
  helpContentTable,
  insertsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { makeApp, USERS } from "./helpers.js";
import { assertStoreScope } from "../lib/auth-middleware.js";
import type { ActorContext } from "../lib/roles.js";

// ── Per-run unique IDs ─────────────────────────────────────────────────────────
// Prevents collisions when the suite is run multiple times against the same DB.
const RUN = Math.random().toString(36).slice(2, 10);
const ids = {
  testStore:        `test-store-${RUN}`,
  noGlobalTheme:    `test-theme-noglobal-${RUN}`,
  platformLiveHelp: `test-h-plat-live-${RUN}`,
  platformDraftHelp:`test-h-plat-draft-${RUN}`,
  alphaHelp:        `test-h-alpha-${RUN}`,
  betaHelp:         `test-h-beta-${RUN}`,
  // Self-seeded insert fixtures — used by store_owner and store_staff catalog tests.
  // Per-run IDs ensure no collision with production seed data.
  rbacInsert4:      `rbac-insert-4-${RUN}`,
  rbacInsert5:      `rbac-insert-5-${RUN}`,
};

// ── Apps keyed by actor ────────────────────────────────────────────────────────
const sa          = makeApp(USERS.superAdmin);
const alphaOwner  = makeApp(USERS.alphaOwner);
const alphaStaff  = makeApp(USERS.alphaStaff);
const betaOwner   = makeApp(USERS.betaOwner);
const betaSupport = makeApp(USERS.betaSupport);
const gammaOwner  = makeApp(USERS.gammaOwner);
const noStore     = makeApp(USERS.noStore);       // authenticated, no store membership
const unauth      = makeApp(null);                // unauthenticated

// ── Global setup / teardown ───────────────────────────────────────────────────
const cleanups: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  // 1. Customer user + membership in store-alpha (for customer-role deny tests)
  //    Must insert the user first because store_members has a FK on user_id.
  await db.insert(usersTable)
    .values({
      id: USERS.alphaCustomer.id,
      provider: "google",
      email: "customer@test.example.com",
      name: "Test Customer",
      role: "user",
      platformRole: null,
      owned: [],
      aiEnabled: false,
      aiProvider: "claude",
      connections: { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false },
    })
    .onConflictDoNothing();
  await db.insert(storeMembersTable)
    .values({ storeId: "store-alpha", userId: USERS.alphaCustomer.id, role: "customer" })
    .onConflictDoNothing();
  cleanups.push(() =>
    db.delete(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, "store-alpha"), eq(storeMembersTable.userId, USERS.alphaCustomer.id)))
  );
  cleanups.push(() =>
    db.delete(usersTable).where(eq(usersTable.id, USERS.alphaCustomer.id))
  );

  // 2. Insert fixtures used by store_owner and store_staff catalog tests.
  //    Seeded here so tests pass on a fresh database with no pre-existing seed data.
  await db.insert(insertsTable)
    .values([
      { id: ids.rbacInsert4, name: "RBAC Test Insert 4", cat: "Functional", globalAvailable: true, status: "live" },
      { id: ids.rbacInsert5, name: "RBAC Test Insert 5", cat: "Functional", globalAvailable: true, status: "live" },
    ])
    .onConflictDoNothing();
  cleanups.push(() =>
    db.delete(insertsTable).where(eq(insertsTable.id, ids.rbacInsert4))
  );
  cleanups.push(() =>
    db.delete(insertsTable).where(eq(insertsTable.id, ids.rbacInsert5))
  );

  // 3. Theme with globalAvailable=false (catalog guard test)
  await db.insert(themesTable)
    .values({ id: ids.noGlobalTheme, name: "No-Global Theme", colors: ["#000"], price: 0, status: "live", globalAvailable: false, createdBy: "test" })
    .onConflictDoNothing();
  cleanups.push(() =>
    db.delete(themesTable).where(eq(themesTable.id, ids.noGlobalTheme))
  );

  // 3. Help articles for visibility tests
  await db.insert(helpContentTable).values([
    { id: ids.platformLiveHelp,  title: "Test Platform Live",  body: "body", category: "Test", kind: "article", scope: "platform",    status: "live",  createdBy: "u-sa" },
    { id: ids.platformDraftHelp, title: "Test Platform Draft", body: "body", category: "Test", kind: "article", scope: "platform",    status: "draft", createdBy: "u-sa" },
    { id: ids.alphaHelp,         title: "Test Alpha Help",     body: "body", category: "Test", kind: "article", scope: "store-alpha", status: "live",  createdBy: "u-alpha-owner" },
    { id: ids.betaHelp,          title: "Test Beta Help",      body: "body", category: "Test", kind: "article", scope: "store-beta",  status: "live",  createdBy: "u-beta-owner" },
  ]).onConflictDoNothing();
  cleanups.push(() =>
    db.delete(helpContentTable).where(eq(helpContentTable.id, ids.platformLiveHelp))
  );
  cleanups.push(() =>
    db.delete(helpContentTable).where(eq(helpContentTable.id, ids.platformDraftHelp))
  );
  cleanups.push(() =>
    db.delete(helpContentTable).where(eq(helpContentTable.id, ids.alphaHelp))
  );
  cleanups.push(() =>
    db.delete(helpContentTable).where(eq(helpContentTable.id, ids.betaHelp))
  );
});

afterAll(async () => {
  // Run cleanups in reverse order (LIFO)
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* ignore cleanup errors */ }
  }
  // Also sweep any audit entries written by test actors during this run
  await db.delete(auditLogTable).where(eq(auditLogTable.actorUserId, "u-sa")).catch(() => {});
  // Close DB connection so vitest exits cleanly
  const { pool } = await import("@workspace/db");
  await pool.end().catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. super_admin — allow
// ─────────────────────────────────────────────────────────────────────────────
describe("super_admin — allow", () => {
  it("GET /api/platform/stats → 200", async () => {
    const res = await request(sa).get("/api/platform/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("stores");
    expect(res.body).toHaveProperty("users");
  });

  it("GET /api/stores → 200 (lists all stores)", async () => {
    const res = await request(sa).get("/api/stores");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((s: { id: string }) => s.id);
    expect(ids).toContain("store-alpha");
    expect(ids).toContain("store-beta");
  });

  it("POST /api/stores → 201 (create any store)", async () => {
    const res = await request(sa)
      .post("/api/stores")
      .send({ id: ids.testStore, name: "Test Store", slug: ids.testStore, ownerUserId: "u-sa" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(ids.testStore);

    // Register cleanup — must also wipe flags auto-created + member auto-enrolled
    cleanups.push(async () => {
      const { storesTable, storeFlagsTable } = await import("@workspace/db");
      await db.delete(storeMembersTable).where(eq(storeMembersTable.storeId, ids.testStore)).catch(() => {});
      await db.delete(storeFlagsTable).where(eq(storeFlagsTable.storeId, ids.testStore)).catch(() => {});
      await db.delete(storesTable).where(eq(storesTable.id, ids.testStore)).catch(() => {});
    });
  });

  it("GET /api/stores/store-alpha → 200 (bypasses store membership)", async () => {
    const res = await request(sa).get("/api/stores/store-alpha");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("store-alpha");
  });

  it("GET /api/stores/store-beta → 200 (bypasses store membership — not a beta member)", async () => {
    const res = await request(sa).get("/api/stores/store-beta");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("store-beta");
  });

  it("PATCH /api/stores/store-alpha → 200 (can update any store)", async () => {
    const res = await request(sa)
      .patch("/api/stores/store-alpha")
      .send({ domain: `sa-test-${RUN}.example.com` });
    expect(res.status).toBe(200);
    // Revert
    await request(sa).patch("/api/stores/store-alpha").send({ domain: null });
  });

  it("PATCH /api/stores/store-alpha/entitlement → 200 (can manage entitlement)", async () => {
    const res = await request(sa)
      .patch("/api/stores/store-alpha/entitlement")
      .send({ subscriptionActive: true });
    expect(res.status).toBe(200);
  });

  it("GET /api/stores/store-alpha/members → 200", async () => {
    const res = await request(sa).get("/api/stores/store-alpha/members");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/stores/store-alpha/flags → 200", async () => {
    const res = await request(sa).get("/api/stores/store-alpha/flags");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("storeId", "store-alpha");
  });

  it("PUT /api/stores/store-alpha/flags → 200 (set feature flags)", async () => {
    const res = await request(sa)
      .put("/api/stores/store-alpha/flags")
      .send({ editionsCap: 25 });
    expect(res.status).toBe(200);
    expect(res.body.editionsCap).toBe(25);
    // Revert
    await request(sa).put("/api/stores/store-alpha/flags").send({ editionsCap: 20 });
  });

  it("GET /api/audit → 200 (platform-wide, no scope filter)", async () => {
    const res = await request(sa).get("/api/audit");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/audit?storeId=store-alpha → 200 (filtered by store)", async () => {
    const res = await request(sa).get("/api/audit?storeId=store-alpha");
    expect(res.status).toBe(200);
    // Every row returned must be scoped to store-alpha
    for (const row of res.body as Array<{ scope: string }>) {
      expect(row.scope).toBe("store-alpha");
    }
  });

  it("POST /api/help (platform scope) → 201", async () => {
    const hId = `${ids.platformLiveHelp}-sa`;
    const res = await request(sa)
      .post("/api/help")
      .send({ id: hId, title: "SA Help", body: "body", category: "Test", scope: "platform" });
    expect(res.status).toBe(201);
    cleanups.push(() => db.delete(helpContentTable).where(eq(helpContentTable.id, hId)));
  });

  it("can enable a catalog item with globalAvailable=false", async () => {
    const res = await request(sa)
      .post("/api/stores/store-alpha/catalog")
      .send({ itemType: "theme", itemId: ids.noGlobalTheme });
    expect(res.status).toBe(201);
    // Cleanup
    cleanups.push(() =>
      db.delete(storeCatalogTable).where(
        and(
          eq(storeCatalogTable.storeId, "store-alpha"),
          eq(storeCatalogTable.itemType, "theme"),
          eq(storeCatalogTable.itemId, ids.noGlobalTheme),
        )
      )
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. store_owner (alpha) — allow
// ─────────────────────────────────────────────────────────────────────────────
describe("store_owner (store-alpha) — allow", () => {
  it("GET /api/stores/store-alpha → 200 (own store)", async () => {
    const res = await request(alphaOwner).get("/api/stores/store-alpha");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("store-alpha");
  });

  it("PATCH /api/stores/store-alpha → 200 (owner may update only presentation settings)", async () => {
    const original = (await request(alphaOwner).get("/api/stores/store-alpha")).body;
    const defaultMode = original.defaultMode === "curated" ? "independent" : "curated";
    const res = await request(alphaOwner)
      .patch("/api/stores/store-alpha")
      .send({
        name: `Owner Test ${RUN}`,
        domain: `owner-test-${RUN}.example.com`,
        defaultMode,
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: `Owner Test ${RUN}`,
      domain: `owner-test-${RUN}.example.com`,
      defaultMode,
    });
    await request(sa).patch("/api/stores/store-alpha").send({
      name: original.name,
      domain: original.domain,
      defaultMode: original.defaultMode,
    });
  });

  it("PATCH /api/stores/store-alpha → 400 (owner cannot change protected or unknown fields)", async () => {
    const before = (await request(alphaOwner).get("/api/stores/store-alpha")).body;
    const forbiddenPatches = [
      { slug: `renamed-${RUN}` },
      { ownerUserId: "u-beta-owner" },
      { status: "suspended" },
      { plan: "enterprise" },
      { subscriptionActive: false },
      { createdAt: "2000-01-01T00:00:00.000Z" },
      { unrecognizedSetting: true },
    ];

    for (const body of forbiddenPatches) {
      await request(alphaOwner)
        .patch("/api/stores/store-alpha")
        .send(body)
        .expect(400);
    }

    const after = (await request(alphaOwner).get("/api/stores/store-alpha")).body;
    expect(after).toMatchObject({
      slug: before.slug,
      ownerUserId: before.ownerUserId,
      status: before.status,
      plan: before.plan,
      subscriptionActive: before.subscriptionActive,
      createdAt: before.createdAt,
    });
  });

  it("GET /api/stores/store-alpha/members → 200", async () => {
    const res = await request(alphaOwner).get("/api/stores/store-alpha/members");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/stores/store-alpha/catalog → 200", async () => {
    const res = await request(alphaOwner).get("/api/stores/store-alpha/catalog");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/stores/store-alpha/catalog → 201 (enable available item)", async () => {
    // Use a self-seeded insert fixture (globalAvailable=true) so this test passes
    // on a fresh database with no pre-existing seed data.
    const res = await request(alphaOwner)
      .post("/api/stores/store-alpha/catalog")
      .send({ itemType: "insert", itemId: ids.rbacInsert5 });
    expect([201, 200]).toContain(res.status); // 201 created or already existed is fine
    cleanups.push(() =>
      db.delete(storeCatalogTable).where(
        and(
          eq(storeCatalogTable.storeId, "store-alpha"),
          eq(storeCatalogTable.itemType, "insert"),
          eq(storeCatalogTable.itemId, ids.rbacInsert5),
        )
      )
    );
  });

  it("GET /api/stores/store-alpha/flags → 200", async () => {
    const res = await request(alphaOwner).get("/api/stores/store-alpha/flags");
    expect(res.status).toBe(200);
  });

  it("GET /api/audit → 200 (sees own store-alpha entries)", async () => {
    const res = await request(alphaOwner).get("/api/audit");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Every row must be scoped to store-alpha (their only owned store)
    for (const row of res.body as Array<{ scope: string }>) {
      expect(row.scope).toBe("store-alpha");
    }
  });

  it("POST /api/help (store-alpha scope) → 201", async () => {
    const hId = `${ids.alphaHelp}-owner`;
    const res = await request(alphaOwner)
      .post("/api/help")
      .send({ id: hId, title: "Alpha Owner Help", body: "body", category: "Test", scope: "store-alpha" });
    expect(res.status).toBe(201);
    cleanups.push(() => db.delete(helpContentTable).where(eq(helpContentTable.id, hId)));
  });

  it("PATCH /api/help/:id (store-alpha article) → 200", async () => {
    const res = await request(alphaOwner)
      .patch(`/api/help/${ids.alphaHelp}`)
      .send({ title: "Updated Title" });
    expect(res.status).toBe(200);
    // Revert
    await request(sa).patch(`/api/help/${ids.alphaHelp}`).send({ title: "Test Alpha Help" });
  });

  it("POST /api/stores/store-alpha/members → 201 (assign member)", async () => {
    // Use u-delta-owner so we don't pollute the gamma-owner visibility test
    const res = await request(alphaOwner)
      .post("/api/stores/store-alpha/members")
      .send({ userId: "u-delta-owner", role: "support" });
    expect(res.status).toBe(201);
    cleanups.push(() =>
      db.delete(storeMembersTable).where(
        and(eq(storeMembersTable.storeId, "store-alpha"), eq(storeMembersTable.userId, "u-delta-owner"))
      )
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. store_owner (alpha) — deny
// ─────────────────────────────────────────────────────────────────────────────
describe("store_owner (store-alpha) — deny", () => {
  it("GET /api/platform/stats → 403 (not super_admin)", async () => {
    const res = await request(alphaOwner).get("/api/platform/stats");
    expect(res.status).toBe(403);
  });

  it("GET /api/stores → 403 (super_admin only)", async () => {
    const res = await request(alphaOwner).get("/api/stores");
    expect(res.status).toBe(403);
  });

  it("GET /api/stores/store-beta → 403 (different store, no membership)", async () => {
    const res = await request(alphaOwner).get("/api/stores/store-beta");
    expect(res.status).toBe(403);
  });

  it("PATCH /api/stores/store-beta → 403 (different store)", async () => {
    const res = await request(alphaOwner)
      .patch("/api/stores/store-beta")
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("PUT /api/stores/store-alpha/flags → 403 (super_admin only)", async () => {
    const res = await request(alphaOwner)
      .put("/api/stores/store-alpha/flags")
      .send({ aiEnabled: false });
    expect(res.status).toBe(403);
  });

  it("POST /api/help with scope=platform → 403 (only super_admin can create platform help)", async () => {
    const res = await request(alphaOwner)
      .post("/api/help")
      .send({ id: `${ids.platformLiveHelp}-owner-attempt`, title: "Injected", body: "b", category: "Test", scope: "platform" });
    expect(res.status).toBe(403);
  });

  it("POST /api/help with scope=store-beta → 403 (not a member of beta)", async () => {
    const res = await request(alphaOwner)
      .post("/api/help")
      .send({ id: `${ids.betaHelp}-owner-attempt`, title: "Injected", body: "b", category: "Test", scope: "store-beta" });
    expect(res.status).toBe(403);
  });

  it("PATCH /api/help/:id on platform article → 403", async () => {
    const res = await request(alphaOwner)
      .patch("/api/help/h-build-first")
      .send({ title: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/help/:id on platform article → 403", async () => {
    const res = await request(alphaOwner).delete("/api/help/h-build-first");
    expect(res.status).toBe(403);
  });

  it("audit result contains only store-alpha rows (cannot see platform or beta)", async () => {
    const res = await request(alphaOwner).get("/api/audit");
    expect(res.status).toBe(200);
    const scopes = (res.body as Array<{ scope: string }>).map(r => r.scope);
    expect(scopes.every(s => s === "store-alpha")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. store_staff (alpha) — allow
// ─────────────────────────────────────────────────────────────────────────────
describe("store_staff (store-alpha) — allow", () => {
  it("GET /api/stores/store-alpha/catalog → 200", async () => {
    const res = await request(alphaStaff).get("/api/stores/store-alpha/catalog");
    expect(res.status).toBe(200);
  });

  it("POST /api/stores/store-alpha/catalog → 201 (curate catalog)", async () => {
    // Use a self-seeded insert fixture so this test passes on a fresh database.
    const res = await request(alphaStaff)
      .post("/api/stores/store-alpha/catalog")
      .send({ itemType: "insert", itemId: ids.rbacInsert4 });
    expect([201, 200]).toContain(res.status);
    cleanups.push(() =>
      db.delete(storeCatalogTable).where(
        and(
          eq(storeCatalogTable.storeId, "store-alpha"),
          eq(storeCatalogTable.itemType, "insert"),
          eq(storeCatalogTable.itemId, ids.rbacInsert4),
        )
      )
    );
  });

  it("DELETE /api/stores/store-alpha/catalog/insert/:rbacInsert4 → 204 or 404 (curate catalog)", async () => {
    // Ensure the fixture insert is enabled first so delete has something to remove.
    await request(alphaStaff)
      .post("/api/stores/store-alpha/catalog")
      .send({ itemType: "insert", itemId: ids.rbacInsert4 });
    const res = await request(alphaStaff)
      .delete(`/api/stores/store-alpha/catalog/insert/${ids.rbacInsert4}`);
    expect([204, 404]).toContain(res.status);
  });

  it("POST /api/help (store-alpha scope) → 201", async () => {
    const hId = `${ids.alphaHelp}-staff`;
    const res = await request(alphaStaff)
      .post("/api/help")
      .send({ id: hId, title: "Staff Help", body: "body", category: "Test", scope: "store-alpha" });
    expect(res.status).toBe(201);
    cleanups.push(() => db.delete(helpContentTable).where(eq(helpContentTable.id, hId)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. store_staff (alpha) — deny
// ─────────────────────────────────────────────────────────────────────────────
describe("store_staff (store-alpha) — deny", () => {
  it("GET /api/stores/store-alpha → 403 (store_owner required in handler)", async () => {
    const res = await request(alphaStaff).get("/api/stores/store-alpha");
    expect(res.status).toBe(403);
  });

  it("PATCH /api/stores/store-alpha → 403 (store settings locked to store_owner)", async () => {
    const res = await request(alphaStaff)
      .patch("/api/stores/store-alpha")
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("GET /api/stores/store-alpha/members → 403 (store_owner required)", async () => {
    const res = await request(alphaStaff).get("/api/stores/store-alpha/members");
    expect(res.status).toBe(403);
  });

  it("POST /api/stores/store-alpha/members → 403 (store_owner required)", async () => {
    const res = await request(alphaStaff)
      .post("/api/stores/store-alpha/members")
      .send({ userId: "u-gamma-owner", role: "support" });
    expect(res.status).toBe(403);
  });

  it("PUT /api/stores/store-alpha/flags → 403 (super_admin only)", async () => {
    const res = await request(alphaStaff)
      .put("/api/stores/store-alpha/flags")
      .send({ aiEnabled: false });
    expect(res.status).toBe(403);
  });

  it("GET /api/platform/stats → 403", async () => {
    const res = await request(alphaStaff).get("/api/platform/stats");
    expect(res.status).toBe(403);
  });

  it("GET /api/audit → 403 (store_owner required)", async () => {
    const res = await request(alphaStaff).get("/api/audit");
    expect(res.status).toBe(403);
  });

  it("POST /api/help with scope=platform → 403", async () => {
    const res = await request(alphaStaff)
      .post("/api/help")
      .send({ id: `${ids.platformLiveHelp}-staff`, title: "x", body: "b", category: "Test", scope: "platform" });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. support role (beta) — allow
// ─────────────────────────────────────────────────────────────────────────────
describe("support role (store-beta) — allow", () => {
  it("GET /api/stores/store-beta/catalog → 200 (read-only access)", async () => {
    const res = await request(betaSupport).get("/api/stores/store-beta/catalog");
    expect(res.status).toBe(200);
  });

  it("GET /api/help → 200 (authenticated member sees platform + beta articles)", async () => {
    const res = await request(betaSupport).get("/api/help");
    expect(res.status).toBe(200);
    const returnedIds = (res.body as Array<{ id: string }>).map(a => a.id);
    expect(returnedIds).toContain(ids.platformLiveHelp);
    expect(returnedIds).toContain(ids.betaHelp);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. support role (beta) — deny
// ─────────────────────────────────────────────────────────────────────────────
describe("support role (store-beta) — deny", () => {
  it("POST /api/stores/store-beta/catalog → 403 (read-only role blocks writes)", async () => {
    const res = await request(betaSupport)
      .post("/api/stores/store-beta/catalog")
      .send({ itemType: "theme", itemId: "t4" });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/stores/store-beta/catalog/theme/t1 → 403 (read-only role)", async () => {
    const res = await request(betaSupport)
      .delete("/api/stores/store-beta/catalog/theme/t1");
    expect(res.status).toBe(403);
  });

  it("GET /api/stores/store-beta → 403 (store_owner required in handler)", async () => {
    const res = await request(betaSupport).get("/api/stores/store-beta");
    expect(res.status).toBe(403);
  });

  it("GET /api/stores/store-beta/members → 403 (store_owner required)", async () => {
    const res = await request(betaSupport).get("/api/stores/store-beta/members");
    expect(res.status).toBe(403);
  });

  it("GET /api/stores/store-beta/flags → 403 (store_owner required)", async () => {
    const res = await request(betaSupport).get("/api/stores/store-beta/flags");
    expect(res.status).toBe(403);
  });

  it("PUT /api/stores/store-beta/flags → 403 (super_admin only)", async () => {
    const res = await request(betaSupport)
      .put("/api/stores/store-beta/flags")
      .send({ aiEnabled: false });
    expect(res.status).toBe(403);
  });

  it("POST /api/help (store-beta scope) → 403 (store_staff required for help mutations)", async () => {
    const res = await request(betaSupport)
      .post("/api/help")
      .send({ id: `${ids.betaHelp}-support`, title: "x", body: "b", category: "Test", scope: "store-beta" });
    expect(res.status).toBe(403);
  });

  it("GET /api/audit → 403 (store_owner required)", async () => {
    const res = await request(betaSupport).get("/api/audit");
    expect(res.status).toBe(403);
  });

  it("GET /api/platform/stats → 403", async () => {
    const res = await request(betaSupport).get("/api/platform/stats");
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. customer role — deny
// ─────────────────────────────────────────────────────────────────────────────
describe("customer role (store-alpha member, role=customer) — deny", () => {
  const customerApp = makeApp(USERS.alphaCustomer);

  it("GET /api/stores/store-alpha/catalog → 403 (customer rank below support minimum)", async () => {
    const res = await request(customerApp).get("/api/stores/store-alpha/catalog");
    expect(res.status).toBe(403);
  });

  it("POST /api/stores/store-alpha/catalog → 403", async () => {
    const res = await request(customerApp)
      .post("/api/stores/store-alpha/catalog")
      .send({ itemType: "theme", itemId: "t1" });
    expect(res.status).toBe(403);
  });

  it("GET /api/stores/store-alpha/members → 403", async () => {
    const res = await request(customerApp).get("/api/stores/store-alpha/members");
    expect(res.status).toBe(403);
  });

  it("GET /api/platform/stats → 403", async () => {
    const res = await request(customerApp).get("/api/platform/stats");
    expect(res.status).toBe(403);
  });

  it("GET /api/audit → 403", async () => {
    const res = await request(customerApp).get("/api/audit");
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Unauthenticated — 401 on all protected routes
// ─────────────────────────────────────────────────────────────────────────────
describe("unauthenticated — 401 on all auth-required routes", () => {
  it("GET /api/platform/stats → 401", async () => {
    expect((await request(unauth).get("/api/platform/stats")).status).toBe(401);
  });

  it("GET /api/stores → 401", async () => {
    expect((await request(unauth).get("/api/stores")).status).toBe(401);
  });

  it("GET /api/stores/store-alpha → 401", async () => {
    expect((await request(unauth).get("/api/stores/store-alpha")).status).toBe(401);
  });

  it("GET /api/stores/store-alpha/members → 401", async () => {
    expect((await request(unauth).get("/api/stores/store-alpha/members")).status).toBe(401);
  });

  it("GET /api/stores/store-alpha/catalog → 401", async () => {
    expect((await request(unauth).get("/api/stores/store-alpha/catalog")).status).toBe(401);
  });

  it("GET /api/stores/store-alpha/flags → 401", async () => {
    expect((await request(unauth).get("/api/stores/store-alpha/flags")).status).toBe(401);
  });

  it("POST /api/help → 401", async () => {
    expect(
      (await request(unauth).post("/api/help").send({ id: "x", title: "x", body: "b", category: "c", scope: "platform" })).status
    ).toBe(401);
  });

  it("GET /api/audit → 401", async () => {
    expect((await request(unauth).get("/api/audit")).status).toBe(401);
  });

  it("GET /api/help → 200 (public route, returns live platform articles only)", async () => {
    const res = await request(unauth).get("/api/help");
    expect(res.status).toBe(200);
    const articles = res.body as Array<{ id: string; scope: string; status: string }>;
    // All returned articles must be platform-scoped and live
    for (const a of articles) {
      expect(a.scope).toBe("platform");
      expect(a.status).toBe("live");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Authenticated, no store membership — store routes return 403
// ─────────────────────────────────────────────────────────────────────────────
describe("authenticated user with no store membership — store routes 403", () => {
  it("GET /api/stores/store-alpha → 403 (not a member)", async () => {
    expect((await request(noStore).get("/api/stores/store-alpha")).status).toBe(403);
  });

  it("GET /api/stores/store-alpha/catalog → 403", async () => {
    expect((await request(noStore).get("/api/stores/store-alpha/catalog")).status).toBe(403);
  });

  it("GET /api/platform/stats → 403 (authenticated but not super_admin)", async () => {
    expect((await request(noStore).get("/api/platform/stats")).status).toBe(403);
  });

  it("GET /api/audit → 403 (no owned stores)", async () => {
    expect((await request(noStore).get("/api/audit")).status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Store scope cannot be overridden by request headers
// ─────────────────────────────────────────────────────────────────────────────
describe("store scope guard", () => {
  it("rejects an actor whose resolved membership does not match the URL store", () => {
    let statusCode: number | undefined;
    let responseBody: unknown;
    const response = {
      status: (code: number) => {
        statusCode = code;
        return response;
      },
      json: (body: unknown) => {
        responseBody = body;
        return response;
      },
    } as unknown as Response;
    const alphaActor: ActorContext = {
      userId: USERS.alphaOwner.id,
      platformRole: null,
      isSuperAdmin: false,
      storeId: "store-alpha",
      storeRole: "store_owner",
      effectiveRole: "store-alpha:store_owner",
    };

    expect(assertStoreScope(alphaActor, "store-beta", response)).toBe(false);
    expect(statusCode).toBe(403);
    expect(responseBody).toEqual({ error: "Forbidden: cross-store access denied" });
  });

  it("rejects a store owner's cross-store read when x-store-id points at their own store", async () => {
    const res = await request(alphaOwner)
      .get("/api/stores/store-beta")
      .set("x-store-id", "store-alpha");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden: cross-store access denied" });
  });

  it("rejects a cross-store catalog read before it can query the requested store", async () => {
    const res = await request(alphaOwner)
      .get("/api/stores/store-beta/owned")
      .set("x-store-id", "store-alpha");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/^Forbidden:/);
  });

  it("allows a platform super admin to inspect any store despite a supplied store ID", async () => {
    const [store, catalog] = await Promise.all([
      request(sa).get("/api/stores/store-beta").set("x-store-id", "store-alpha"),
      request(sa).get("/api/stores/store-beta/owned").set("x-store-id", "store-alpha"),
    ]);

    expect(store.status).toBe(200);
    expect(store.body.id).toBe("store-beta");
    expect(catalog.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Catalog curation: globalAvailable=false guard
// ─────────────────────────────────────────────────────────────────────────────
describe("catalog curation — globalAvailable guard", () => {
  it("store_owner enabling item with globalAvailable=false → 403", async () => {
    const res = await request(alphaOwner)
      .post("/api/stores/store-alpha/catalog")
      .send({ itemType: "theme", itemId: ids.noGlobalTheme });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not available/i);
  });

  it("store_staff enabling item with globalAvailable=false → 403", async () => {
    const res = await request(alphaStaff)
      .post("/api/stores/store-alpha/catalog")
      .send({ itemType: "theme", itemId: ids.noGlobalTheme });
    expect(res.status).toBe(403);
  });

  it("super_admin bypasses globalAvailable check → 201", async () => {
    // Already tested in super_admin allow block; assert the entry exists
    const rows = await db.select().from(storeCatalogTable).where(
      and(
        eq(storeCatalogTable.storeId, "store-alpha"),
        eq(storeCatalogTable.itemType, "theme"),
        eq(storeCatalogTable.itemId, ids.noGlobalTheme),
      )
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. GET /api/help visibility rules
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/help — visibility rules", () => {
  it("unauthenticated: sees live platform articles, NOT draft or store-scoped", async () => {
    const res = await request(unauth).get("/api/help");
    expect(res.status).toBe(200);
    const returnedIds = (res.body as Array<{ id: string }>).map(a => a.id);

    expect(returnedIds).toContain(ids.platformLiveHelp);  // live platform → visible
    expect(returnedIds).not.toContain(ids.platformDraftHelp); // draft platform → hidden
    expect(returnedIds).not.toContain(ids.alphaHelp);         // store-scoped → hidden
    expect(returnedIds).not.toContain(ids.betaHelp);          // store-scoped → hidden
  });

  it("store-alpha member (owner): sees platform (all statuses) + alpha articles, NOT beta", async () => {
    const res = await request(alphaOwner).get("/api/help");
    expect(res.status).toBe(200);
    const returnedIds = (res.body as Array<{ id: string }>).map(a => a.id);

    expect(returnedIds).toContain(ids.platformLiveHelp);   // live platform → visible
    expect(returnedIds).toContain(ids.platformDraftHelp);  // draft platform → visible (authenticated)
    expect(returnedIds).toContain(ids.alphaHelp);          // own store → visible
    expect(returnedIds).not.toContain(ids.betaHelp);       // other store → hidden
  });

  it("store scope returns platform plus the requested member store, never another store", async () => {
    const res = await request(alphaOwner).get("/api/help?scope=store-alpha");
    expect(res.status).toBe(200);
    const returned = res.body as Array<{ id: string; scope: string }>;

    expect(returned.map(article => article.id)).toEqual(expect.arrayContaining([
      ids.platformLiveHelp,
      ids.platformDraftHelp,
      ids.alphaHelp,
    ]));
    expect(returned.map(article => article.id)).not.toContain(ids.betaHelp);
    expect(returned.every(article => ["platform", "store-alpha"].includes(article.scope))).toBe(true);
  });

  it("rejects a cross-store help scope request", async () => {
    await request(alphaOwner).get("/api/help?scope=store-beta").expect(403);
  });

  it("store-gamma owner: sees platform articles but NOT alpha or beta store articles", async () => {
    const res = await request(gammaOwner).get("/api/help");
    expect(res.status).toBe(200);
    const returnedIds = (res.body as Array<{ id: string }>).map(a => a.id);

    expect(returnedIds).toContain(ids.platformLiveHelp);
    expect(returnedIds).not.toContain(ids.alphaHelp);
    expect(returnedIds).not.toContain(ids.betaHelp);
  });

  it("super_admin: sees everything — platform live, platform draft, store-alpha, store-beta", async () => {
    const res = await request(sa).get("/api/help");
    expect(res.status).toBe(200);
    const returnedIds = (res.body as Array<{ id: string }>).map(a => a.id);

    expect(returnedIds).toContain(ids.platformLiveHelp);
    expect(returnedIds).toContain(ids.platformDraftHelp);
    expect(returnedIds).toContain(ids.alphaHelp);
    expect(returnedIds).toContain(ids.betaHelp);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Store order tenant isolation
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/store/:storeId/orders — tenant isolation", () => {
  it("returns 403 when a non-member requests another store's orders", async () => {
    await request(noStore).get("/api/store/store-alpha/orders").expect(403);
  });

  it("returns 200 for a store staff member", async () => {
    await request(alphaStaff).get("/api/store/store-alpha/orders").expect(200);
  });

  it("reserves the platform orders endpoint for super admins", async () => {
    await request(alphaOwner).get("/api/store/platform/orders").expect(403);
    await request(sa).get("/api/store/platform/orders").expect(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Audit log written on mutations
// ─────────────────────────────────────────────────────────────────────────────
describe("audit log — written on admin mutations", () => {
  it("POST /api/stores (super_admin) writes audit entry: actorRole=super_admin, scope=platform", async () => {
    const storeId = `test-audit-store-${RUN}`;
    const res = await request(sa)
      .post("/api/stores")
      .send({ id: storeId, name: "Audit Test Store", slug: storeId, ownerUserId: "u-sa" });
    expect(res.status).toBe(201);

    cleanups.push(async () => {
      const { storesTable, storeFlagsTable } = await import("@workspace/db");
      await db.delete(storeMembersTable).where(eq(storeMembersTable.storeId, storeId)).catch(() => {});
      await db.delete(storeFlagsTable).where(eq(storeFlagsTable.storeId, storeId)).catch(() => {});
      await db.delete(storesTable).where(eq(storesTable.id, storeId)).catch(() => {});
    });

    const entries = await db.select().from(auditLogTable).where(
      and(
        eq(auditLogTable.actorUserId, "u-sa"),
        eq(auditLogTable.action, "store.create"),
        eq(auditLogTable.targetId, storeId),
      )
    );
    expect(entries.length).toBe(1);
    expect(entries[0].actorRole).toBe("super_admin");
    expect(entries[0].scope).toBe("platform");
    expect(entries[0].targetType).toBe("store");
  });

  it("PUT /api/stores/:id/flags (super_admin) writes audit entry: scope=platform, action=flags.update", async () => {
    await request(sa).put("/api/stores/store-alpha/flags").send({ editionsCap: 20 });

    const entries = await db.select().from(auditLogTable).where(
      and(
        eq(auditLogTable.actorUserId, "u-sa"),
        eq(auditLogTable.action, "flags.update"),
        eq(auditLogTable.targetId, "store-alpha"),
      )
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].scope).toBe("platform");
  });

  it("POST /api/stores/:id/members (store_owner) writes audit entry: actorRole contains store_owner, scope=store-alpha", async () => {
    // Assign u-delta-owner as support in alpha, then clean up
    const res = await request(alphaOwner)
      .post("/api/stores/store-alpha/members")
      .send({ userId: "u-delta-owner", role: "support" });
    expect(res.status).toBe(201);

    cleanups.push(() =>
      db.delete(storeMembersTable).where(
        and(eq(storeMembersTable.storeId, "store-alpha"), eq(storeMembersTable.userId, "u-delta-owner"))
      )
    );

    const entries = await db.select().from(auditLogTable).where(
      and(
        eq(auditLogTable.actorUserId, "u-alpha-owner"),
        eq(auditLogTable.action, "member.assign"),
        eq(auditLogTable.targetId, "u-delta-owner"),
      )
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].scope).toBe("store-alpha");
    expect(entries[0].actorRole).toContain("store_owner");
  });

  it("POST /api/help (store-alpha scope, owner) writes audit entry: scope=store-alpha, action=help.create", async () => {
    const hId = `${ids.alphaHelp}-audit-test`;
    const res = await request(alphaOwner)
      .post("/api/help")
      .send({ id: hId, title: "Audit Help", body: "body", category: "Test", scope: "store-alpha" });
    expect(res.status).toBe(201);
    cleanups.push(() => db.delete(helpContentTable).where(eq(helpContentTable.id, hId)));

    const entries = await db.select().from(auditLogTable).where(
      and(
        eq(auditLogTable.actorUserId, "u-alpha-owner"),
        eq(auditLogTable.action, "help.create"),
        eq(auditLogTable.targetId, hId),
      )
    );
    expect(entries.length).toBe(1);
    expect(entries[0].scope).toBe("store-alpha");
    // POST /help has no :storeId in the URL, so buildActor resolves no store
    // context — effectiveRole is "user" even for a store_owner. The scope in
    // the audit entry (set from the article's own scope field) is still correct.
    expect(entries[0].actorRole).toBe("user");
  });

  it("PATCH /api/help/:id writes audit entry: action=help.update", async () => {
    await request(alphaOwner)
      .patch(`/api/help/${ids.alphaHelp}`)
      .send({ title: "Updated For Audit" });

    const entries = await db.select().from(auditLogTable).where(
      and(
        eq(auditLogTable.actorUserId, "u-alpha-owner"),
        eq(auditLogTable.action, "help.update"),
        eq(auditLogTable.targetId, ids.alphaHelp),
      )
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].scope).toBe("store-alpha");

    // Revert title
    await request(sa).patch(`/api/help/${ids.alphaHelp}`).send({ title: "Test Alpha Help" });
  });
});
