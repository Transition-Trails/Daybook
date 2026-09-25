/**
 * WorldSmith world update route regression coverage.
 *
 * The World Bible quick-edit and established settings/cover flows share the
 * same PATCH endpoint. These tests keep that route unified so a new field
 * cannot shadow or narrow existing updates.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { User } from "@workspace/db";

const { dbState } = vi.hoisted(() => ({
  dbState: {
    patches: [] as Record<string, unknown>[],
    row: {
      id: "thornvale",
      name: "Thornvale",
      code: "THV",
      status: "active",
      visualPalette: null as string | null,
      proseVoice: null as string | null,
      atmosphericNotes: null as string | null,
      materialWorld: null as string | null,
      worldRules: [] as string[],
      coverImageUrl: null as string | null,
      notionProductionDbId: null as string | null,
      currentCollection: null as string | null,
      currentVolume: null as string | null,
      worldsmithEnabled: true,
      updatedAt: new Date("2026-01-01"),
    },
  },
}));

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  const select = () => ({
    from: () => ({
      where: () => ({ limit: async () => [dbState.row] }),
    }),
  });
  const chain = {
    select,
    update: () => chain,
    set: (patch: Record<string, unknown>) => {
      dbState.patches.push(patch);
      dbState.row = { ...dbState.row, ...patch };
      return chain;
    },
    where: () => chain,
    returning: () => {
      const patch = dbState.patches.at(-1) ?? {};
      return Promise.resolve([{ ...dbState.row, ...patch }]);
    },
  };

  const transaction = async <T>(run: (tx: any) => Promise<T>): Promise<T> => run({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [dbState.row],
          for: () => ({ limit: async () => [dbState.row] }),
        }),
      }),
    }),
    update: chain.update,
  });
  return { ...actual, db: { ...chain, transaction } };
});

vi.mock("../middleware/requireRole", () => ({
  requireStoreAccess: () => (req: Request, _res: Response, next: NextFunction) => {
    const role = typeof req.headers["x-test-role"] === "string"
      ? req.headers["x-test-role"]
      : "super_admin";
    Object.assign(req, {
      actor: {
        isSuperAdmin: role === "super_admin",
        storeRole: role === "super_admin" ? null : role,
        storeId: role === "super_admin" ? null : "test-store",
      },
    });
    next();
  },
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import worldsmithRouter from "../routes/worldsmith.js";
import { revisionFor } from "../lib/worldsmith/editorial-revision.js";

const superAdminUser = {
  id: "world-update-admin",
  platformRole: "super_admin",
} as User;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Test app supplies the minimal Passport surface required by route guards.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authenticatedRequest = req as any;
    authenticatedRequest.isAuthenticated = () => true;
    authenticatedRequest.user = superAdminUser;
    next();
  });
  app.use("/api", worldsmithRouter);
  return app;
}

const app = makeApp();

beforeEach(() => {
  dbState.patches = [];
  dbState.row = {
    id: "thornvale",
    name: "Thornvale",
    code: "THV",
    status: "active",
    visualPalette: null,
    proseVoice: null,
    atmosphericNotes: null,
    materialWorld: null,
    worldRules: [],
    coverImageUrl: null,
    notionProductionDbId: null,
    currentCollection: null,
    currentVolume: null,
    worldsmithEnabled: true,
    updatedAt: new Date("2026-01-01"),
  };
});

describe("PATCH /api/v1/worldsmith/worlds/:id", () => {
  it("accepts a matching revision and returns the new current revision", async () => {
    const expected_revision = revisionFor(dbState.row);
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ expected_revision, worldPremise: "  A concise realm premise.  " });

    expect(response.status).toBe(200);
    expect(response.body.worldPremise).toBe("  A concise realm premise.  ");
    expect(response.body.revision).toMatch(/^sha256:/);
    expect(response.body.revision).not.toBe(expected_revision);
  });

  it("rejects World Creative Director fields from store staff", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .set("x-test-role", "store_staff")
      .send({ expected_revision: revisionFor(dbState.row), worldPremise: "A staff-authored premise" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "CREATIVE_DIRECTOR_OWNER_REQUIRED",
      fields: ["worldPremise"],
    });
    expect(dbState.patches).toHaveLength(0);
  });

  it("requires expected_revision for World Creative Director fields", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .set("x-test-role", "store_owner")
      .send({ worldPremise: "A new premise" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MISSING_REVISION");
    expect(dbState.patches).toHaveLength(0);
  });

  it("allows a store owner to update World Creative Director fields at a matching revision", async () => {
    const expected_revision = revisionFor(dbState.row);
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .set("x-test-role", "store_owner")
      .send({ expected_revision, worldPremise: "Owner-authored premise" });

    expect(response.status).toBe(200);
    expect(response.body.worldPremise).toBe("Owner-authored premise");
  });

  it("keeps existing Bible aesthetic fields editable by store staff without a revision", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .set("x-test-role", "store_staff")
      .send({ visualPalette: "  moonlit indigo and brass  " });

    expect(response.status).toBe(200);
    expect(response.body.visualPalette).toBe("moonlit indigo and brass");
  });

  it("returns a 409 with the current revision on an optimistic-concurrency conflict", async () => {
    const currentRevision = revisionFor(dbState.row);
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ expected_revision: "sha256:stale", currentWorldState: "Should not save" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "REVISION_CONFLICT",
      revision: currentRevision,
    });
    expect(dbState.patches).toHaveLength(0);
  });

  it("persists a normalized World Bible quick edit", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({
        visualPalette: "  moonlit indigo and brass  ",
        proseVoice: "  close third person  ",
        atmosphericNotes: "  rain against old glass  ",
        materialWorld: "  worn leather and iron  ",
        worldRules: ["  No magic north of the ridge  ", " ", "Time moves differently underground"],
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      visualPalette: "moonlit indigo and brass",
      proseVoice: "close third person",
      atmosphericNotes: "rain against old glass",
      materialWorld: "worn leather and iron",
      worldRules: ["No magic north of the ridge", "Time moves differently underground"],
    });
    expect(dbState.patches.at(-1)).toMatchObject({
      visualPalette: "moonlit indigo and brass",
      proseVoice: "close third person",
      atmosphericNotes: "rain against old glass",
      materialWorld: "worn leather and iron",
      worldRules: ["No magic north of the ridge", "Time moves differently underground"],
      updatedAt: expect.any(Date),
    });
  });

  it("continues to update existing cover and world settings", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({
        coverImageUrl: "  /worlds/thornvale-cover.png  ",
        notionProductionDbId: "  notion-production-db  ",
        currentCollection: "  The Long Autumn  ",
        currentVolume: "  Volume II  ",
        status: "in_setup",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      coverImageUrl: "/worlds/thornvale-cover.png",
      notionProductionDbId: "notion-production-db",
      currentCollection: "The Long Autumn",
      currentVolume: "Volume II",
      status: "in_setup",
    });
    expect(dbState.patches.at(-1)).toMatchObject({
      coverImageUrl: "/worlds/thornvale-cover.png",
      notionProductionDbId: "notion-production-db",
      currentCollection: "The Long Autumn",
      currentVolume: "Volume II",
      status: "in_setup",
      updatedAt: expect.any(Date),
    });
  });
});