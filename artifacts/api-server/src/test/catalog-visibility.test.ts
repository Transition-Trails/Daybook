/**
 * Central catalog visibility contract.
 *
 * Public callers and regular authenticated users can see live catalog rows
 * only. Staff, owners, and platform super admins can also see drafts, while
 * soft-deleted rows remain hidden from every caller.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { editionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import catalogRouter from "../routes/catalog.js";
import type { User } from "@workspace/db";

const RUN = Math.random().toString(36).slice(2, 10);
const ids = {
  live: `catalog-visibility-live-${RUN}`,
  draft: `catalog-visibility-draft-${RUN}`,
  deleted: `catalog-visibility-deleted-${RUN}`,
};

const baseUser = {
  provider: "google" as const,
  avatarUrl: null,
  plan: null,
  owned: [] as string[],
  aiEnabled: true,
  aiProvider: "claude" as const,
  connections: {
    googleDrive: false,
    googleCalendar: false,
    googleTasks: false,
    googleDocs: false,
    notion: false,
  },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  planCurrentPeriodEnd: null,
  planStatus: null,
  stripeSubscriptionId: null,
  stripePaymentIntentId: null,
  stripeSubscriptionEventCreatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Partial<User>;

function makeUser(id: string, role: User["role"], platformRole: User["platformRole"] = null): User {
  return {
    ...baseUser,
    id,
    email: `${id}@example.com`,
    name: id,
    role,
    platformRole,
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
    const r = req as any;
    r.isAuthenticated = () => user !== null;
    r.user = user ?? undefined;
    next();
  });
  app.use("/api", catalogRouter);
  return app;
}

const publicApp = makeApp(null);
const regularUserApp = makeApp(makeUser(`catalog-user-${RUN}`, "user"));
const staffApp = makeApp(makeUser(`catalog-staff-${RUN}`, "staff"));
const ownerApp = makeApp(makeUser(`catalog-owner-${RUN}`, "owner"));
const superAdminApp = makeApp(makeUser(`catalog-super-admin-${RUN}`, "user", "super_admin"));

beforeAll(async () => {
  await db.insert(editionsTable).values([
    {
      id: ids.live,
      name: `Catalog Visibility Live ${RUN}`,
      status: "live",
      productType: "planner",
    },
    {
      id: ids.draft,
      name: `Catalog Visibility Draft ${RUN}`,
      status: "draft",
      productType: "planner",
    },
    {
      id: ids.deleted,
      name: `Catalog Visibility Deleted ${RUN}`,
      status: "deleted",
      productType: "planner",
    },
  ]);
});

afterAll(async () => {
  await db.delete(editionsTable).where(inArray(editionsTable.id, Object.values(ids)));
});

describe("GET /editions visibility", () => {
  it.each([
    ["unauthenticated visitors", publicApp],
    ["regular authenticated users", regularUserApp],
  ])("%s see live rows only", async (_label, app) => {
    const res = await request(app).get("/api/editions");

    expect(res.status).toBe(200);
    const returnedIds = (res.body as Array<{ id: string }>).map((row) => row.id);
    expect(returnedIds).toContain(ids.live);
    expect(returnedIds).not.toContain(ids.draft);
    expect(returnedIds).not.toContain(ids.deleted);
  });

  it.each([
    ["staff admins", staffApp],
    ["owner admins", ownerApp],
    ["platform super admins", superAdminApp],
  ])("%s see draft and live rows but not deleted rows", async (_label, app) => {
    const res = await request(app).get("/api/editions");

    expect(res.status).toBe(200);
    const returnedIds = (res.body as Array<{ id: string }>).map((row) => row.id);
    expect(returnedIds).toContain(ids.live);
    expect(returnedIds).toContain(ids.draft);
    expect(returnedIds).not.toContain(ids.deleted);
  });
});

describe("GET /editions/:id visibility", () => {
  it.each([
    ["unauthenticated visitors", publicApp],
    ["regular authenticated users", regularUserApp],
  ])("%s cannot retrieve a draft row", async (_label, app) => {
    const res = await request(app).get(`/api/editions/${ids.draft}`);
    expect(res.status).toBe(404);
  });

  it.each([
    ["staff admins", staffApp],
    ["owner admins", ownerApp],
    ["platform super admins", superAdminApp],
  ])("%s can retrieve a draft row", async (_label, app) => {
    const res = await request(app).get(`/api/editions/${ids.draft}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ids.draft);
  });

  it.each([
    ["unauthenticated visitors", publicApp],
    ["regular authenticated users", regularUserApp],
    ["staff admins", staffApp],
    ["owner admins", ownerApp],
    ["platform super admins", superAdminApp],
  ])("%s cannot retrieve a deleted row", async (_label, app) => {
    const res = await request(app).get(`/api/editions/${ids.deleted}`);
    expect(res.status).toBe(404);
  });
});