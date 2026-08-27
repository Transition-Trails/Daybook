/**
 * WorldSmith store-scope and platform-boundary integration coverage.
 *
 * These tests use the real route, middleware, and development database with
 * isolated rows. That makes a missing store predicate or a weakened role guard
 * fail as an HTTP-level regression rather than only as a mocked unit test.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  auditLogTable,
  storeFlagsTable,
  storeMembersTable,
  storesTable,
  usersTable,
  worldsmithWorldsTable,
  palettesTable,
  fontsTable,
  pool,
  type User,
} from "@workspace/db";
import worldsmithRouter from "../routes/worldsmith.js";
import worldsmithEditorialRouter from "../routes/worldsmith-editorial.js";

type SqlResult = { rowCount: number | null; rows: Array<{ count?: number }> };
type WorldsmithScopeMigrationClient = {
  query(sql: string): Promise<SqlResult>;
  release(): void;
};
type WorldsmithScopeMigrationPool = {
  connect(): Promise<WorldsmithScopeMigrationClient>;
  end(): Promise<void>;
};

const {
  applyWorldsmithStoreScopeMigration,
  runWorldsmithStoreScopeMigration,
} = await vi.importActual<{
  applyWorldsmithStoreScopeMigration(
    client: WorldsmithScopeMigrationClient,
    houseStoreId?: string,
  ): Promise<void>;
  runWorldsmithStoreScopeMigration(
    pool: WorldsmithScopeMigrationPool,
    houseStoreId?: string,
  ): Promise<void>;
}>("../../../../scripts/src/migrate-worldsmith-store-scope.js");

const RUN = randomUUID().slice(0, 8);
const ids = {
  alphaStore: `ws-scope-alpha-${RUN}`,
  betaStore: `ws-scope-beta-${RUN}`,
  disabledStore: `ws-scope-disabled-${RUN}`,
  alphaUser: `ws-scope-alpha-user-${RUN}`,
  alphaOwner: `ws-scope-alpha-owner-${RUN}`,
  betaUser: `ws-scope-beta-user-${RUN}`,
  disabledUser: `ws-scope-disabled-user-${RUN}`,
};

const worldIds = {
  alpha: `${ids.alphaStore}--world`,
  beta: `${ids.betaStore}--world`,
  disabled: `${ids.disabledStore}--world`,
  impersonated: `${ids.alphaStore}--impersonated-world`,
};
const libraryIds = {
  alphaPalette: `ws-scope-alpha-palette-${RUN}`,
  betaPalette: `ws-scope-beta-palette-${RUN}`,
  starterFont: `ws-scope-starter-font-${RUN}`,
  alphaOwnedFont: `ws-scope-alpha-owned-font-${RUN}`,
  betaOwnedFont: `ws-scope-beta-owned-font-${RUN}`,
  hiddenFont: `ws-scope-hidden-font-${RUN}`,
};
const migrationIds = {
  user: `ws-scope-migration-user-${RUN}`,
  houseStore: `ws-scope-house-${RUN}`,
  successfulLegacyWorld: `ws-scope-legacy-success-${RUN}`,
  missingHouseLegacyWorld: `ws-scope-legacy-missing-house-${RUN}`,
  rolledBackLegacyWorld: `ws-scope-legacy-rollback-${RUN}`,
  missingHouseStore: `ws-scope-house-missing-${RUN}`,
};

function actor(id: string): User {
  return {
    id,
    platformRole: null,
  } as User;
}

function makeApp(user: User | null) {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authenticatedRequest = req as any;
    authenticatedRequest.isAuthenticated = () => user !== null;
    authenticatedRequest.user = user ?? undefined;
    next();
  });
  app.use("/api", worldsmithRouter);
  app.use("/api", worldsmithEditorialRouter);
  return app;
}

const alphaApp = makeApp(actor(ids.alphaUser));
const alphaOwnerApp = makeApp(actor(ids.alphaOwner));
const betaApp = makeApp(actor(ids.betaUser));
const disabledApp = makeApp(actor(ids.disabledUser));
const superAdminApp = makeApp({
  id: "worldsmith-scope-super-admin",
  platformRole: "super_admin",
} as User);
function makeImpersonatingSuperAdminApp() {
  const user = {
    id: ids.alphaOwner,
    platformRole: "super_admin",
  } as User;
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "worldsmith-impersonation-test-secret",
    resave: false,
    saveUninitialized: false,
  }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const testRequest = req as any;
    testRequest.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    testRequest.isAuthenticated = () => true;
    testRequest.user = user;
    next();
  });
  app.post("/test/impersonate/:storeId", (req, res) => {
    const now = new Date();
    req.session.storeImpersonation = {
      actorUserId: user.id,
      storeId: req.params.storeId as string,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    };
    res.sendStatus(204);
  });
  app.use("/api", worldsmithRouter);
  return app;
}
function scoped(
  app: express.Express,
  storeId: string,
) {
  return {
    get: (path: string) => request(app).get(path).set("x-store-id", storeId),
    post: (path: string) => request(app).post(path).set("x-store-id", storeId),
    patch: (path: string) => request(app).patch(path).set("x-store-id", storeId),
  };
}

beforeAll(async () => {
  await db.insert(usersTable).values([
    { id: ids.alphaUser, email: `${ids.alphaUser}@test.invalid`, name: "WorldSmith Alpha Staff" },
    { id: ids.alphaOwner, email: `${ids.alphaOwner}@test.invalid`, name: "WorldSmith Alpha Owner" },
    { id: ids.betaUser, email: `${ids.betaUser}@test.invalid`, name: "WorldSmith Beta Staff" },
    { id: ids.disabledUser, email: `${ids.disabledUser}@test.invalid`, name: "WorldSmith Disabled Staff" },
    { id: migrationIds.user, email: `${migrationIds.user}@test.invalid`, name: "WorldSmith Migration House" },
  ]);
  await db.insert(storesTable).values([
    { id: ids.alphaStore, name: "WorldSmith Alpha", slug: ids.alphaStore, ownerUserId: ids.alphaUser },
    { id: ids.betaStore, name: "WorldSmith Beta", slug: ids.betaStore, ownerUserId: ids.betaUser },
    { id: ids.disabledStore, name: "WorldSmith Disabled", slug: ids.disabledStore, ownerUserId: ids.disabledUser },
    { id: migrationIds.houseStore, name: "WorldSmith Migration House", slug: migrationIds.houseStore, ownerUserId: migrationIds.user },
  ]);
  await db.insert(storeMembersTable).values([
    { storeId: ids.alphaStore, userId: ids.alphaUser, role: "store_staff" },
    { storeId: ids.alphaStore, userId: ids.alphaOwner, role: "store_owner" },
    { storeId: ids.betaStore, userId: ids.betaUser, role: "store_staff" },
    { storeId: ids.disabledStore, userId: ids.disabledUser, role: "store_staff" },
  ]);
  await db.insert(storeFlagsTable).values([
    { storeId: ids.alphaStore, worldsmithEnabled: true },
    { storeId: ids.betaStore, worldsmithEnabled: true },
    { storeId: ids.disabledStore, worldsmithEnabled: false },
  ]);
  await db.insert(worldsmithWorldsTable).values([
    { id: worldIds.alpha, storeId: ids.alphaStore, name: "Alpha World", code: "ALP" },
    { id: worldIds.beta, storeId: ids.betaStore, name: "Beta World", code: "BET" },
    { id: worldIds.disabled, storeId: ids.disabledStore, name: "Disabled World", code: "DIS" },
  ]);
  await db.insert(palettesTable).values([
    {
      id: libraryIds.alphaPalette,
      name: "Alpha Palette",
      colors: ["#1B2A4A", "#C87560", "#D7B98E", "#8297A8", "#111111", "#FFFDF8"],
      origin: "owned",
      authoredByStoreId: ids.alphaStore,
      globalAvailable: false,
      status: "draft",
    },
    {
      id: libraryIds.betaPalette,
      name: "Beta Palette",
      colors: ["#113355", "#BB7755", "#DDAA77", "#7799AA", "#111111", "#FFFFFF"],
      origin: "owned",
      authoredByStoreId: ids.betaStore,
      globalAvailable: false,
      status: "live",
    },
  ]);
  await db.insert(fontsTable).values([
    {
      id: libraryIds.starterFont,
      familyName: "WorldSmith Starter",
      origin: "starter",
      globalAvailable: true,
      status: "live",
      curatedPairings: [{ role: "heading", family: "WorldSmith Starter", weight: "700" }],
    },
    {
      id: libraryIds.hiddenFont,
      familyName: "WorldSmith Hidden",
      origin: "licensed",
      globalAvailable: false,
      status: "draft",
    },
    {
      id: libraryIds.alphaOwnedFont,
      familyName: "WorldSmith Alpha Owned",
      origin: "owned",
      authoredByStoreId: ids.alphaStore,
      globalAvailable: false,
      status: "draft",
      curatedPairings: [{ role: "body", family: "WorldSmith Alpha Owned", weight: "400" }],
    },
    {
      id: libraryIds.betaOwnedFont,
      familyName: "WorldSmith Beta Owned",
      origin: "owned",
      authoredByStoreId: ids.betaStore,
      globalAvailable: false,
      status: "live",
    },
  ]);
});

afterAll(async () => {
  await db.delete(auditLogTable).where(and(
    eq(auditLogTable.actorUserId, ids.alphaOwner),
    eq(auditLogTable.action, "store.impersonation.mutation"),
  ));
  await db.delete(palettesTable).where(inArray(palettesTable.id, Object.values(libraryIds).slice(0, 2)));
  await db.delete(fontsTable).where(inArray(fontsTable.id, Object.values(libraryIds).slice(2)));
  await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [
    migrationIds.successfulLegacyWorld,
    migrationIds.missingHouseLegacyWorld,
    migrationIds.rolledBackLegacyWorld,
  ]));
  await db.delete(storesTable).where(inArray(storesTable.id, Object.values(ids).slice(0, 3)));
  await db.delete(storesTable).where(eq(storesTable.id, migrationIds.houseStore));
  await db.delete(usersTable).where(inArray(usersTable.id, [...Object.values(ids).slice(3), migrationIds.user]));
});

describe("WorldSmith store-facing access", () => {
  it("keeps header-scoped WorldSmith routes inside an active impersonation", async () => {
    const agent = request.agent(makeImpersonatingSuperAdminApp());
    await agent.post(`/test/impersonate/${ids.alphaStore}`).expect(204);

    const ownWorlds = await agent
      .get("/api/v1/worldsmith/worlds")
      .set("x-store-id", ids.alphaStore);
    expect(ownWorlds.status).toBe(200);
    expect(ownWorlds.body.worlds.map((world: { id: string }) => world.id)).toContain(worldIds.alpha);
    expect(ownWorlds.body.worlds.map((world: { id: string }) => world.id)).not.toContain(worldIds.beta);

    const created = await agent
      .post("/api/v1/worldsmith/worlds")
      .set("x-store-id", ids.alphaStore)
      .send({ id: "impersonated-world", name: "Impersonated World", code: "IMP" });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe(worldIds.impersonated);

    const updated = await agent
      .patch(`/api/v1/worldsmith/worlds/${worldIds.impersonated}`)
      .set("x-store-id", ids.alphaStore)
      .send({ visualPalette: "Audited ink and brass" });
    expect(updated.status).toBe(200);

    let audits: Array<typeof auditLogTable.$inferSelect> = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      audits = await db.select().from(auditLogTable).where(and(
        eq(auditLogTable.actorUserId, ids.alphaOwner),
        eq(auditLogTable.action, "store.impersonation.mutation"),
      ));
      if (audits.length >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(audits).toHaveLength(2);
    expect(audits.map(row => row.targetId)).toEqual(expect.arrayContaining([
      "/api/v1/worldsmith/worlds",
      `/api/v1/worldsmith/worlds/${worldIds.impersonated}`,
    ]));
    expect(audits.every(row => row.scope === ids.alphaStore)).toBe(true);
    expect(audits.every(row =>
      (row.metadata as Record<string, unknown>)?.adminSupportAction === true
    )).toBe(true);

    const otherStore = await agent
      .get("/api/v1/worldsmith/worlds")
      .set("x-store-id", ids.betaStore);
    expect(otherStore.status).toBe(403);
  });

  it("lists only the scoped store's worlds and creates worlds under that store", async () => {
    const alphaList = await scoped(alphaApp, ids.alphaStore).get("/api/v1/worldsmith/worlds");
    expect(alphaList.status).toBe(200);
    expect(alphaList.body.worlds.map((world: { id: string }) => world.id)).toContain(worldIds.alpha);
    expect(alphaList.body.worlds.map((world: { id: string }) => world.id)).not.toContain(worldIds.beta);
    expect(alphaList.body.permissions).toEqual({ canEditWorldRules: false });

    const betaList = await scoped(betaApp, ids.betaStore).get("/api/v1/worldsmith/worlds");
    expect(betaList.status).toBe(200);
    expect(betaList.body.worlds.map((world: { id: string }) => world.id)).toEqual([worldIds.beta]);

    const [alphaCreate, betaCreate] = await Promise.all([
      scoped(alphaApp, ids.alphaStore)
        .post("/api/v1/worldsmith/worlds")
        .send({ id: "shared-world", name: "Alpha Shared", code: "SAME" }),
      scoped(betaApp, ids.betaStore)
        .post("/api/v1/worldsmith/worlds")
        .send({ id: "shared-world", name: "Beta Shared", code: "SAME" }),
    ]);

    expect(alphaCreate.status).toBe(201);
    expect(alphaCreate.body).toMatchObject({ id: `${ids.alphaStore}--shared-world`, storeId: ids.alphaStore });
    expect(betaCreate.status).toBe(201);
    expect(betaCreate.body).toMatchObject({ id: `${ids.betaStore}--shared-world`, storeId: ids.betaStore });
  });

  it("allows staff to update World Bible prose but rejects World Rules changes", async () => {
    const ownUpdate = await scoped(alphaApp, ids.alphaStore)
      .patch(`/api/v1/worldsmith/worlds/${worldIds.alpha}`)
      .send({ visualPalette: "Ink blue and brass" });
    expect(ownUpdate.status).toBe(200);
    expect(ownUpdate.body).toMatchObject({
      id: worldIds.alpha,
      visualPalette: "Ink blue and brass",
    });

    const forbiddenRulesUpdate = await scoped(alphaApp, ids.alphaStore)
      .patch(`/api/v1/worldsmith/worlds/${worldIds.alpha}`)
      .send({ worldRules: ["Keep it local"] });
    expect(forbiddenRulesUpdate.status).toBe(403);
    expect(forbiddenRulesUpdate.body).toMatchObject({
      code: "WORLD_RULES_OWNER_REQUIRED",
      field: "worldRules",
    });
    expect(forbiddenRulesUpdate.body.error).toContain("worldRules");
  });

  it("allows store owners to update World Rules", async () => {
    const ownerUpdate = await scoped(alphaOwnerApp, ids.alphaStore)
      .patch(`/api/v1/worldsmith/worlds/${worldIds.alpha}`)
      .send({ worldRules: ["Keep it local"] });

    expect(ownerUpdate.status).toBe(200);
    expect(ownerUpdate.body).toMatchObject({
      id: worldIds.alpha,
      worldRules: ["Keep it local"],
    });

    const ownerList = await scoped(alphaOwnerApp, ids.alphaStore).get("/api/v1/worldsmith/worlds");
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.permissions).toEqual({ canEditWorldRules: true });
  });

  it("returns not found for another store's world and Bible copilot", async () => {
    const crossStoreUpdate = await scoped(alphaApp, ids.alphaStore)
      .patch(`/api/v1/worldsmith/worlds/${worldIds.beta}`)
      .send({ visualPalette: "Attempted cross-store write" });
    expect(crossStoreUpdate.status).toBe(404);
    expect(crossStoreUpdate.body.code).toBe("NOT_FOUND");

    const crossStoreCopilot = await scoped(alphaApp, ids.alphaStore)
      .post(`/api/v1/worldsmith/worlds/${worldIds.beta}/bible-copilot`)
      .send({ field: "visualPalette", message: "Draft a palette." });
    expect(crossStoreCopilot.status).toBe(404);
    expect(crossStoreCopilot.body.code).toBe("NOT_FOUND");

    const [betaWorld] = await db
      .select({ visualPalette: worldsmithWorldsTable.visualPalette })
      .from(worldsmithWorldsTable)
      .where(and(eq(worldsmithWorldsTable.id, worldIds.beta), eq(worldsmithWorldsTable.storeId, ids.betaStore)));
    expect(betaWorld?.visualPalette).toBeNull();
  });

  it("returns only the current store's World Bible libraries and saves an entitled font", async () => {
    const [paletteLibrary, fontLibrary] = await Promise.all([
      scoped(alphaApp, ids.alphaStore).get(`/api/v1/worldsmith/worlds/${worldIds.alpha}/palette-library`),
      scoped(alphaApp, ids.alphaStore).get(`/api/v1/worldsmith/worlds/${worldIds.alpha}/font-library`),
    ]);

    expect(paletteLibrary.status).toBe(200);
    expect(paletteLibrary.body.palettes.map((palette: { id: string }) => palette.id)).toEqual([libraryIds.alphaPalette]);
    expect(fontLibrary.status).toBe(200);
    expect(fontLibrary.body.fonts.map((font: { id: string }) => font.id)).toContain(libraryIds.starterFont);
    expect(fontLibrary.body.fonts.map((font: { id: string }) => font.id)).toContain(libraryIds.alphaOwnedFont);
    expect(fontLibrary.body.fonts.map((font: { id: string }) => font.id)).not.toContain(libraryIds.hiddenFont);
    expect(fontLibrary.body.fonts.map((font: { id: string }) => font.id)).not.toContain(libraryIds.betaOwnedFont);

    const saved = await scoped(alphaApp, ids.alphaStore)
      .patch(`/api/v1/worldsmith/worlds/${worldIds.alpha}`)
      .send({
        typography: [{ fontId: libraryIds.alphaOwnedFont }],
        visualPalette: "Daybook Palette: Alpha Palette",
      });

    expect(saved.status).toBe(200);
    expect(saved.body.visualPalette).toBe("Daybook Palette: Alpha Palette");
    expect(saved.body.typography).toEqual([{
      fontId: libraryIds.alphaOwnedFont,
      family: "WorldSmith Alpha Owned",
      roles: [{ role: "body", weight: "400" }],
    }]);

    const rejected = await scoped(alphaApp, ids.alphaStore)
      .patch(`/api/v1/worldsmith/worlds/${worldIds.alpha}`)
      .send({ typography: [{ fontId: libraryIds.hiddenFont }] });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe("INVALID_TYPOGRAPHY");

    const [foreignOwnedRejected, crossStoreLibrary, platformFontLibrary] = await Promise.all([
      scoped(alphaApp, ids.alphaStore)
      .patch(`/api/v1/worldsmith/worlds/${worldIds.alpha}`)
        .send({ typography: [{ fontId: libraryIds.betaOwnedFont }] }),
      scoped(alphaApp, ids.alphaStore)
        .get(`/api/v1/worldsmith/worlds/${worldIds.beta}/font-library`),
      request(superAdminApp)
        .get(`/api/v1/worldsmith/worlds/${worldIds.alpha}/font-library`),
    ]);

    expect(foreignOwnedRejected.status).toBe(400);
    expect(foreignOwnedRejected.body.code).toBe("INVALID_TYPOGRAPHY");
    expect(crossStoreLibrary.status).toBe(404);
    expect(crossStoreLibrary.body.code).toBe("NOT_FOUND");
    expect(platformFontLibrary.status).toBe(200);
    expect(platformFontLibrary.body.fonts.map((font: { id: string }) => font.id))
      .not.toContain(libraryIds.betaOwnedFont);
  });

  it("blocks all store-facing WorldSmith routes while the feature is disabled", async () => {
    const requests = await Promise.all([
      scoped(disabledApp, ids.disabledStore).get("/api/v1/worldsmith/worlds"),
      scoped(disabledApp, ids.disabledStore)
        .post("/api/v1/worldsmith/worlds")
        .send({ name: "Should Not Exist", code: "NOPE" }),
      scoped(disabledApp, ids.disabledStore)
        .patch(`/api/v1/worldsmith/worlds/${worldIds.disabled}`)
        .send({ visualPalette: "Should not persist" }),
      scoped(disabledApp, ids.disabledStore)
        .post(`/api/v1/worldsmith/worlds/${worldIds.disabled}/bible-copilot`)
        .send({ field: "visualPalette", message: "Should not run." }),
      scoped(disabledApp, ids.disabledStore)
        .get(`/api/v1/worldsmith/worlds/${worldIds.disabled}/palette-library`),
      scoped(disabledApp, ids.disabledStore)
        .get(`/api/v1/worldsmith/worlds/${worldIds.disabled}/font-library`),
    ]);

    for (const response of requests) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("WORLDSMITH_DISABLED");
    }
  });
});

describe("WorldSmith platform-only access", () => {
  it.each([
    ["post", "/api/v1/prompt-compilations"],
    ["get", "/api/v1/worldsmith/preflight?spec_id=example"],
    ["get", "/api/v1/worldsmith/runs"],
    ["get", "/api/v1/worldsmith/assets"],
    ["get", "/api/v1/worldsmith/assets/asset-from-another-store"],
  ] as const)("rejects store staff from %s %s", async (method, path) => {
    const response = method === "get"
      ? await request(alphaApp).get(path).set("x-store-id", ids.alphaStore)
      : await request(alphaApp).post(path).set("x-store-id", ids.alphaStore).send({});

    expect(response.status).toBe(403);
  });

  it("allows platform admins to reach platform-only routes", async () => {
    const [compiler, preflight, runs, assets] = await Promise.all([
      request(superAdminApp).post("/api/v1/prompt-compilations").send({}),
      request(superAdminApp).get("/api/v1/worldsmith/preflight"),
      request(superAdminApp).get("/api/v1/worldsmith/runs"),
      request(superAdminApp).get("/api/v1/worldsmith/assets"),
    ]);

    expect(compiler.status).toBe(400);
    expect(preflight.status).toBe(400);
    expect(runs.status).toBe(200);
    expect(assets.status).toBe(200);
  });
});

describe("WorldSmith store-scope migration", () => {
  it("rolls back when the required house store is missing", async () => {
    await db.insert(worldsmithWorldsTable).values({
      id: migrationIds.missingHouseLegacyWorld,
      storeId: null,
      name: "Migration Missing House Legacy World",
      code: "MIS",
    });

    const client = await pool.connect();
    const migrationPool: WorldsmithScopeMigrationPool = {
      connect: vi.fn(async () => ({
        query: async (statement: string) => {
          if (statement.includes("SELECT COUNT(*)")) {
            return { rowCount: 1, rows: [{ count: 1 }] };
          }
          return client.query(statement) as Promise<SqlResult>;
        },
        release: () => client.release(),
      })),
      end: vi.fn(async () => {}),
    };

    await expect(
      runWorldsmithStoreScopeMigration(migrationPool, migrationIds.houseStore),
    ).rejects.toThrow("left unowned worlds");

    const [worldAfterRollback] = await db
      .select({ storeId: worldsmithWorldsTable.storeId })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, migrationIds.missingHouseLegacyWorld));
    expect(worldAfterRollback?.storeId).toBeNull();
  });

  it("backfills a legacy world within the migration transaction", async () => {
    await db.insert(worldsmithWorldsTable).values({
      id: migrationIds.successfulLegacyWorld,
      storeId: null,
      name: "Migration Successful Legacy World",
      code: "SUC",
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyWorldsmithStoreScopeMigration(client, migrationIds.houseStore);

      const world = await client.query<{ store_id: string | null }>(
        "SELECT store_id FROM worldsmith_worlds WHERE id = $1",
        [migrationIds.successfulLegacyWorld],
      );
      const flag = await client.query<{ worldsmith_enabled: boolean }>(
        "SELECT worldsmith_enabled FROM store_flags WHERE store_id = $1",
        [migrationIds.houseStore],
      );
      expect(world.rows).toEqual([{ store_id: migrationIds.houseStore }]);
      expect(flag.rows).toEqual([{ worldsmith_enabled: true }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    const [worldAfterRollback] = await db
      .select({ storeId: worldsmithWorldsTable.storeId })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, migrationIds.successfulLegacyWorld));
    expect(worldAfterRollback?.storeId).toBeNull();
  });

  it("rolls back a real legacy-world backfill when a later migration check fails", async () => {
    await db.insert(worldsmithWorldsTable).values({
      id: migrationIds.rolledBackLegacyWorld,
      storeId: null,
      name: "Migration Rollback Legacy World",
      code: "RBK",
    });

    const client = await pool.connect();
    const migrationPool: WorldsmithScopeMigrationPool = {
      connect: vi.fn(async () => ({
        query: async (statement: string) => {
          if (statement.includes("SELECT COUNT(*)")) {
            return { rowCount: 1, rows: [{ count: 1 }] };
          }
          return client.query(statement) as Promise<SqlResult>;
        },
        release: () => client.release(),
      })),
      end: vi.fn(async () => {}),
    };

    await expect(
      runWorldsmithStoreScopeMigration(migrationPool, migrationIds.houseStore),
    ).rejects.toThrow("left unowned worlds");

    const [worldAfterRollback] = await db
      .select({ storeId: worldsmithWorldsTable.storeId })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, migrationIds.rolledBackLegacyWorld));
    expect(worldAfterRollback?.storeId).toBeNull();
    expect(migrationPool.end).toHaveBeenCalledOnce();
  });
});
