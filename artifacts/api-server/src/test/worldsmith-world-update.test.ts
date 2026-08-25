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
      updatedAt: new Date("2026-01-01"),
    },
  },
}));

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  const chain = {
    update: () => chain,
    set: (patch: Record<string, unknown>) => {
      dbState.patches.push(patch);
      return chain;
    },
    where: () => chain,
    returning: () => {
      const patch = dbState.patches.at(-1) ?? {};
      return Promise.resolve([{ ...dbState.row, ...patch }]);
    },
  };

  return { ...actual, db: chain };
});

import worldsmithRouter from "../routes/worldsmith.js";

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
    updatedAt: new Date("2026-01-01"),
  };
});

describe("PATCH /api/v1/worldsmith/worlds/:id", () => {
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