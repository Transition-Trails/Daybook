/**
 * WorldSmith — World Bible field persistence regression tests.
 *
 * Part 1 — `buildEnrichedWorld` unit tests
 * Exercises the actual function called by GET /v1/worldsmith/worlds rather
 * than a locally duplicated mapper.
 *
 * Regression guard: before the fix that introduced this helper, the enriched
 * response omitted all five World Bible fields.  WorldSmithHome received them
 * as `undefined`, initialised the settings form with empty strings / [], and a
 * save of any unrelated setting silently overwrote stored aesthetic identity
 * with nulls.
 *
 * Part 2 — PATCH /v1/worldsmith/worlds/:id validation tests
 * Ensures the World Bible quick-edit endpoint rejects invalid payloads,
 * normalises blank values consistently with the editor form, and returns 404
 * for unknown world IDs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { User } from "@workspace/db";

// ---------------------------------------------------------------------------
// DB mock (hoisted so it precedes the route import)
// ---------------------------------------------------------------------------

const { dbState } = vi.hoisted(() => ({
  dbState: {
    patches: [] as Record<string, unknown>[],
    notFound: false,
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
      if (dbState.notFound) return Promise.resolve([]);
      const patch = dbState.patches.at(-1) ?? {};
      return Promise.resolve([{ ...dbState.row, ...patch }]);
    },
  };

  return { ...actual, db: chain };
});

// ---------------------------------------------------------------------------
// Route import (after mock is registered)
// ---------------------------------------------------------------------------

import worldsmithRouter from "../routes/worldsmith.js";
import { buildEnrichedWorld } from "../routes/worldsmith.js";
import type { AssetCountRow } from "../routes/worldsmith.js";

// ---------------------------------------------------------------------------
// Express test app
// ---------------------------------------------------------------------------

const superAdminUser = {
  id: "bible-test-admin",
  platformRole: "super_admin",
} as User;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    r.isAuthenticated = () => true;
    r.user = superAdminUser;
    next();
  });
  app.use("/api", worldsmithRouter);
  return app;
}

const app = makeApp();

beforeEach(() => {
  dbState.patches = [];
  dbState.notFound = false;
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

// ---------------------------------------------------------------------------
// Part 1: buildEnrichedWorld unit tests
// ---------------------------------------------------------------------------

type WorldRow = Parameters<typeof buildEnrichedWorld>[0];

function makeWorldRow(overrides: Partial<WorldRow> = {}): WorldRow {
  return {
    id: "world-001",
    storeId: null,
    name: "Thornvale",
    code: "THV",
    description: "A world of mist and memory",
    status: "active",
    coverColor: "#1B2A4A",
    coverAccent: "#C87560",
    currentCollection: "autumn",
    currentVolume: "Vol I",
    owner: "editor-1",
    tags: ["fantasy"],
    notionProductionDbId: "notion-db-id",
    notionCanonDbId: null,
    notionStyleGuideId: null,
    notionStyleGuidesDbId: null,
    styleGuideVersion: 1,
    driveFolderId: "drive-id",
    imageProvider: "dalle",
    createdBy: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    visualPalette: "Muted amber, deep slate, bone white. Light always arrives oblique.",
    proseVoice: "Close third-person, past tense. Short declarative sentences under pressure.",
    atmosphericNotes: "Persistent low damp. Smoke and mildew undercut every interior.",
    materialWorld: "Worn leather, tallow candles, iron rivets, stone that never fully dries.",
    worldRules: ["No magic north of the Ridgeline", "Time moves faster in the Undercroft"],
    typography: [],
    coverImageUrl: null,
    ...overrides,
  };
}

const NO_ASSETS: AssetCountRow[] = [];

describe("buildEnrichedWorld — World Bible fields in GET /v1/worldsmith/worlds", () => {
  it("preserves all four text aesthetic fields verbatim", () => {
    const row = makeWorldRow();
    const enriched = buildEnrichedWorld(row, NO_ASSETS);

    expect(enriched.visualPalette).toBe(row.visualPalette);
    expect(enriched.proseVoice).toBe(row.proseVoice);
    expect(enriched.atmosphericNotes).toBe(row.atmosphericNotes);
    expect(enriched.materialWorld).toBe(row.materialWorld);
  });

  it("preserves the worldRules array in full and in order", () => {
    const row = makeWorldRow();
    const enriched = buildEnrichedWorld(row, NO_ASSETS);

    expect(enriched.worldRules).toEqual(row.worldRules);
    expect(enriched.worldRules).toHaveLength(2);
    expect(enriched.worldRules[0]).toBe("No magic north of the Ridgeline");
    expect(enriched.worldRules[1]).toBe("Time moves faster in the Undercroft");
  });

  it("preserves catalog-backed typography so a list refetch cannot clear it", () => {
    const typography = [{
      fontId: "font-lora",
      family: "Lora",
      roles: [{ role: "heading", weight: "700" }],
    }];
    const enriched = buildEnrichedWorld(makeWorldRow({ typography }), NO_ASSETS);

    expect(enriched.typography).toEqual(typography);
  });

  it("includes all six World Bible keys even when all values are null / empty", () => {
    const row = makeWorldRow({
      visualPalette: null,
      proseVoice: null,
      atmosphericNotes: null,
      materialWorld: null,
      worldRules: [],
      typography: [],
    });

    const enriched = buildEnrichedWorld(row, NO_ASSETS);

    // Keys must be present so WorldSmithHome can distinguish "not configured"
    // from "never returned". Absent keys cause the form to initialise as
    // `undefined`, which the save mutation treats as a clear instruction to
    // null the field — silently overwriting existing aesthetic identity.
    expect(Object.prototype.hasOwnProperty.call(enriched, "visualPalette")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "proseVoice")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "atmosphericNotes")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "materialWorld")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "worldRules")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "typography")).toBe(true);

    expect(enriched.visualPalette).toBeNull();
    expect(enriched.worldRules).toHaveLength(0);
    expect(enriched.typography).toHaveLength(0);
  });

  it("does not truncate long aesthetic text values", () => {
    const longText = "A".repeat(2000);
    const enriched = buildEnrichedWorld(makeWorldRow({ visualPalette: longText }), NO_ASSETS);

    expect(enriched.visualPalette).toHaveLength(2000);
    expect(enriched.visualPalette).toBe(longText);
  });

  it("resolves asset stats by world code (case-insensitive) while preserving World Bible fields", () => {
    const assets: AssetCountRow[] = [
      { world: "thv", total: 12, underReview: 3 },
    ];
    const enriched = buildEnrichedWorld(makeWorldRow(), assets);

    expect(enriched.assetCount).toBe(12);
    expect(enriched.reviewCount).toBe(3);
    // Aesthetic fields must survive alongside the stats merge
    expect(enriched.visualPalette).toBeTruthy();
    expect(enriched.worldRules).toHaveLength(2);
  });

  it("falls back to zero stats when no asset row matches — fields still present", () => {
    const assets: AssetCountRow[] = [
      { world: "OTHER", total: 99, underReview: 5 },
    ];
    const enriched = buildEnrichedWorld(makeWorldRow(), assets);

    expect(enriched.assetCount).toBe(0);
    expect(enriched.reviewCount).toBe(0);
    expect(enriched.visualPalette).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Part 2: PATCH /v1/worldsmith/worlds/:id — World Bible quick-edit validation
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/worldsmith/worlds/:id — World Bible quick-edit validation", () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it("persists all four aesthetic fields and worldRules on a valid request", async () => {
    // Row starts with null / empty values — different from what we are sending.
    // This ensures the test only passes if the route actually wrote the fields
    // to the DB patch; it cannot pass by returning pre-seeded row values.
    // (dbState.row is already null/empty from beforeEach — no override needed.)

    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({
        visualPalette: "moonlit indigo and brass",
        proseVoice: "close third person",
        atmosphericNotes: "rain against old glass",
        materialWorld: "worn leather and iron",
        worldRules: ["No magic north of the ridge", "Time moves differently underground"],
      });

    expect(response.status).toBe(200);

    // Primary assertion: the DB patch must contain each field with its
    // normalized value. This is the regression guard — a route that ignored
    // the submitted fields and wrote only `updatedAt` would fail here.
    const patch = dbState.patches.at(-1) ?? {};
    expect(patch.visualPalette).toBe("moonlit indigo and brass");
    expect(patch.proseVoice).toBe("close third person");
    expect(patch.atmosphericNotes).toBe("rain against old glass");
    expect(patch.materialWorld).toBe("worn leather and iron");
    expect(patch.worldRules).toEqual(["No magic north of the ridge", "Time moves differently underground"]);
    expect(patch.updatedAt).toBeInstanceOf(Date);

    // Exactly one DB write should have happened
    expect(dbState.patches).toHaveLength(1);
  });

  // ── Blank / whitespace normalisation ─────────────────────────────────────

  it("normalises a blank visualPalette string to null without rejecting the request", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ visualPalette: "   " });

    expect(response.status).toBe(200);
    // blank string → null in the DB patch
    expect(dbState.patches.at(-1)).toMatchObject({ visualPalette: null });
  });

  it("normalises blank strings for all four aesthetic fields to null in one call", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({
        visualPalette: "  ",
        proseVoice: "",
        atmosphericNotes: "\t",
        materialWorld: "   \n   ",
      });

    expect(response.status).toBe(200);
    const patch = dbState.patches.at(-1) ?? {};
    expect(patch.visualPalette).toBeNull();
    expect(patch.proseVoice).toBeNull();
    expect(patch.atmosphericNotes).toBeNull();
    expect(patch.materialWorld).toBeNull();
  });

  it("drops blank and whitespace-only entries from worldRules", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({
        worldRules: ["  ", "Rule A", "   ", " Rule B  ", ""],
      });

    expect(response.status).toBe(200);
    expect(dbState.patches.at(-1)).toMatchObject({
      worldRules: ["Rule A", "Rule B"],
    });
  });

  it("stores an empty worldRules array when all entries are blank", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ worldRules: ["  ", "", "   "] });

    expect(response.status).toBe(200);
    expect(dbState.patches.at(-1)?.worldRules).toEqual([]);
  });

  it("stores an empty worldRules array when an explicit empty array is sent", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ worldRules: [] });

    expect(response.status).toBe(200);
    expect(dbState.patches.at(-1)?.worldRules).toEqual([]);
  });

  // ── Invalid text field values ─────────────────────────────────────────────

  it("returns 400 when visualPalette is a number", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ visualPalette: 42 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_FIELD");
    // No DB write should occur
    expect(dbState.patches).toHaveLength(0);
  });

  it("returns 400 when proseVoice is an object", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ proseVoice: { tone: "measured" } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_FIELD");
    expect(dbState.patches).toHaveLength(0);
  });

  it("returns 400 when atmosphericNotes is an array", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ atmosphericNotes: ["cold", "damp"] });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_FIELD");
    expect(dbState.patches).toHaveLength(0);
  });

  it("returns 400 when materialWorld is a boolean", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ materialWorld: true });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_FIELD");
    expect(dbState.patches).toHaveLength(0);
  });

  // ── Malformed worldRules ──────────────────────────────────────────────────

  it("returns 400 when worldRules is a plain string instead of an array", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ worldRules: "No magic north of the ridge" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_WORLD_RULES");
    expect(dbState.patches).toHaveLength(0);
  });

  it("returns 400 when worldRules is a number", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ worldRules: 7 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_WORLD_RULES");
    expect(dbState.patches).toHaveLength(0);
  });

  it("returns 400 when worldRules contains a non-string element", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ worldRules: ["Valid rule", 99, "Another rule"] });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_WORLD_RULES");
    expect(dbState.patches).toHaveLength(0);
  });

  it("returns 400 when worldRules contains a nested object element", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ worldRules: [{ rule: "object rule" }] });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_WORLD_RULES");
    expect(dbState.patches).toHaveLength(0);
  });

  // ── Empty / no-op update ──────────────────────────────────────────────────

  it("returns 400 when the request body contains no updatable fields", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MISSING_FIELDS");
    expect(dbState.patches).toHaveLength(0);
  });

  it("returns 400 when the request body only contains unrecognised keys", async () => {
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({ randomField: "value", anotherUnknown: 123 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MISSING_FIELDS");
    expect(dbState.patches).toHaveLength(0);
  });

  // ── Missing world (404) ───────────────────────────────────────────────────

  it("returns 404 when the world ID does not exist", async () => {
    dbState.notFound = true;

    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/does-not-exist")
      .send({ visualPalette: "some palette" });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });

  // ── No cross-contamination between invalid and valid fields ───────────────

  it("does not write any DB patch when one field among many is invalid", async () => {
    // visualPalette is a number — the whole request should be rejected
    const response = await request(app)
      .patch("/api/v1/worldsmith/worlds/thornvale")
      .send({
        visualPalette: 99,
        proseVoice: "valid prose voice",
        atmosphericNotes: "valid notes",
        materialWorld: "valid materials",
        worldRules: ["valid rule"],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_FIELD");
    // The DB must not have been written — not even a partial update
    expect(dbState.patches).toHaveLength(0);
  });
});
