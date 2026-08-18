/**
 * Edition world-filter integration tests.
 *
 * Confirms that linking an edition to a world (PATCH world:"VGJ") makes it
 * appear immediately in GET /editions?world=VGJ, including case-insensitive
 * matching, and that unlinked editions are excluded.
 *
 * Uses a minimal Express app with the real catalog router and the real
 * development database. All test rows are cleaned up in afterAll.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { editionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import catalogRouter from "../routes/catalog.js";
import type { User } from "@workspace/db";

// ── Per-run unique IDs ─────────────────────────────────────────────────────────
const RUN = Math.random().toString(36).slice(2, 10);

const ids = {
  worldEdition:   `test-ed-world-${RUN}`,
  noWorldEdition: `test-ed-noworld-${RUN}`,
};

// ── Minimal app factories ─────────────────────────────────────────────────────

const superAdminUser: User = {
  id: "u-sa",
  email: "superadmin@daybook.app",
  name: "Platform Super Admin",
  role: "owner",
  platformRole: "super_admin",
  provider: "google",
  avatarUrl: null,
  plan: null,
  owned: [],
  aiEnabled: true,
  aiProvider: "claude",
  connections: { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
    const r = req as any;
    r.isAuthenticated = () => user !== null;
    r.user = user ?? undefined;
    next();
  });
  app.use("/api", catalogRouter);
  return app;
}

const adminApp  = makeApp(superAdminUser); // for PATCH + admin GET
const publicApp = makeApp(null);           // unauthenticated (public GET)

// ── Setup / teardown ──────────────────────────────────────────────────────────

const allIds = Object.values(ids);

beforeAll(async () => {
  // Insert a live edition that will be linked to world "VGJ"
  await db.insert(editionsTable).values({
    id:          ids.worldEdition,
    name:        `World Edition VGJ ${RUN}`,
    status:      "live",
    productType: "planner",
    world:       null, // starts unlinked; PATCH will set it
  });

  // Insert a live edition that has NO world — should never appear in world filter
  await db.insert(editionsTable).values({
    id:          ids.noWorldEdition,
    name:        `No World Edition ${RUN}`,
    status:      "live",
    productType: "planner",
    world:       null,
  });
});

afterAll(async () => {
  await db.delete(editionsTable).where(inArray(editionsTable.id, allIds));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /editions?world= — world filter", () => {
  it("PATCH sets the world field and GET ?world=VGJ immediately returns the linked edition", async () => {
    // Link the edition to world "VGJ"
    const patch = await request(adminApp)
      .patch(`/api/editions/${ids.worldEdition}`)
      .send({ world: "VGJ" });
    expect(patch.status).toBe(200);
    expect(patch.body.world).toBe("VGJ");

    // As a public caller, the live edition should appear
    const get = await request(publicApp).get("/api/editions?world=VGJ");
    expect(get.status).toBe(200);
    const returnedIds: string[] = get.body.map((e: { id: string }) => e.id);
    expect(returnedIds).toContain(ids.worldEdition);
  });

  it("GET ?world=vgj (lowercase) returns the same edition (case-insensitive)", async () => {
    const get = await request(publicApp).get("/api/editions?world=vgj");
    expect(get.status).toBe(200);
    const returnedIds: string[] = get.body.map((e: { id: string }) => e.id);
    expect(returnedIds).toContain(ids.worldEdition);
  });

  it("edition without a world value does NOT appear in filtered results", async () => {
    const get = await request(publicApp).get("/api/editions?world=VGJ");
    expect(get.status).toBe(200);
    const returnedIds: string[] = get.body.map((e: { id: string }) => e.id);
    expect(returnedIds).not.toContain(ids.noWorldEdition);
  });
});
