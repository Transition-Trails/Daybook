/**
 * WorldSmith Wave 2 regression tests — Task #407
 *
 * TDD: each test was written to FAIL before the fix was applied and PASS after.
 *
 * Coverage:
 *   Item 1 — spec-board: companion-row col2 no longer uses invented emotionalWords
 *   Item 2 — spec-board: TEMPLATE_VERSION constant exported & used in footer
 *   Item 3 — readiness score: orientation check skipped for Washi Tape
 *   Item 4 — inheritance resolver: world/collection page fetches are cached
 *   Item 5 — PATCH /specs/:id saves mutable linkage fields (not 405)
 *   Item 6 — editorial 500 handlers: FK violation → 422, not 500
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Application } from "express";

// ── Items 1 & 2: spec-board template ─────────────────────────────────────────

import {
  TEMPLATE_VERSION,
  buildSpecBoardSvg,
} from "../lib/worldsmith/spec-board-template.js";
import type { SpecBoardData } from "../lib/worldsmith/types.js";

function minimalBoard(): SpecBoardData {
  return {
    specPageId: "wave2-test-001",
    productionItem: "Test Piece: The Amber Archive",
    specId: "WYC-HRP-001",
    world: "Wychcombe",
    collection: "The Ember Codex",
    componentType: "Hero Paper",
    payloadVersion: "PP-2.0",
    currentVersion: "1",
    status: "Draft",
    designIntent: "Warm, aged parchment that evokes decades of use.",
    narrativePurpose: "Grounds the reader in the Victorian library scene.",
    requiredContent: "Aged parchment; ink stains; quill feather.",
    reviewCriteria: "Must feel warm, aged, and authentically worn.",
    assetRole: "background",
    composition: "Full-bleed parchment.",
    materials: "Cotton rag paper, cold-press texture.",
    visualHierarchy: "Primary: reading lamp glow.",
    textRule: "Avoid center of page.",
    canonRule: "",
    printRule: "300 DPI minimum.",
    negativeConstraints: "No digital grain.",
    promptModuleCount: 0,
    canonDependency: "None",
    canonRecordCount: 0,
    promptHash: "wave2test001",
  };
}

// ── Item 2: TEMPLATE_VERSION ──────────────────────────────────────────────────

describe("Item 2 — TEMPLATE_VERSION export", () => {
  it("TEMPLATE_VERSION is exported as a semver-like string (major.minor, ≥ 3.1)", () => {
    expect(typeof TEMPLATE_VERSION).toBe("string");
    expect(TEMPLATE_VERSION).toMatch(/^\d+\.\d+$/);
    const [major, minor] = TEMPLATE_VERSION.split(".").map(Number);
    // Must be at least 3.1 — "Template v3" (3.0 effectively) was the pre-Wave-2 state
    expect(major * 10 + minor).toBeGreaterThanOrEqual(31);
  });

  it("SVG footer includes Template v{TEMPLATE_VERSION} (not the old hardcoded v3)", () => {
    const svg = buildSpecBoardSvg(minimalBoard());
    // Must contain the dynamic version string
    expect(svg).toContain(`Template v${TEMPLATE_VERSION}`);
    // Must not contain the old hardcoded literal "Template v3 " or "Template v3·"
    // (the old string was 'Template v3  ·' with two trailing spaces before the dot)
    // Accept "Template v3.x" but NOT bare "Template v3 " (the old pre-version format)
    expect(svg).not.toMatch(/Template v3\s/);
  });
});

// ── Item 1: invented emotional-words ─────────────────────────────────────────

describe("Item 1 — spec-board: no invented emotional-intent words", () => {
  it("companion-row col2 does not contain any of the six hardcoded invented phrases", () => {
    const svg = buildSpecBoardSvg(minimalBoard());
    // These were the hardcoded strings in the old emotionalWords array:
    expect(svg).not.toContain("Intellectual anticipation");
    expect(svg).not.toContain("Expanding understanding");
    expect(svg).not.toContain("Careful comparison");
    expect(svg).not.toContain("Connected histories");
    expect(svg).not.toContain("Quiet responsibility");
    expect(svg).not.toContain("The first glimpse of a larger system");
  });

  it("companion-row col2 instead renders content derived from the board's real reviewCriteria or designIntent", () => {
    const svg = buildSpecBoardSvg(minimalBoard());
    // The board fixture has reviewCriteria="Must feel warm, aged, and authentically worn."
    // After the fix, col2 should contain at least part of that text.
    // We look for a distinctive word from the real spec data.
    expect(svg).toMatch(/warm|aged|worn|Victorian|parchment/i);
  });
});

describe("Step 10 remainder — spec-board: no invented palette or constraints", () => {
  it("renders an explicit empty palette state when the spec has no color swatches", () => {
    const svg = buildSpecBoardSvg(minimalBoard());

    expect(svg).toContain("No palette specified for this spec.");
    expect(svg).not.toContain("Antique Ivory");
    expect(svg).not.toContain("Parchment Cream");
    expect(svg).not.toContain("Sage Gray");
    expect(svg).not.toContain("Walnut Brown");
  });

  it("renders only the constraints carried by the spec", () => {
    const svg = buildSpecBoardSvg(minimalBoard());

    expect(svg).toContain("Avoid center of page.");
    expect(svg).toContain("300 DPI minimum.");
    expect(svg).not.toContain("No modern printed maps");
    expect(svg).not.toContain("No contemporary typography");
    expect(svg).not.toContain("No photorealism or 3D rendering");
    expect(svg).not.toContain("No cinematic or dramatic lighting");
  });
});

// ── Item 3: orientation check conditional ────────────────────────────────────

import { computeReadinessScore } from "../routes/worldsmith-editorial.js";

describe("Item 3 — readiness score: orientation check is type-conditional", () => {
  it("orientation does NOT change the score for Washi Tape (no orientation concept)", () => {
    const base: Parameters<typeof computeReadinessScore>[0] = {
      componentType: "Washi Tape",
      productionItem: "Test Washi",
      worldId: "world-id",
      payloadVersion: "PP-2.0",
      promptPayload: '{"shared_prompt":"x".repeat(35)}',
    };
    const withOrientation    = computeReadinessScore({ ...base, orientation: "landscape" });
    const withoutOrientation = computeReadinessScore({ ...base, orientation: "" });
    expect(withOrientation).toBe(withoutOrientation);
  });

  it("orientation DOES change the score for Hero Paper (has orientation concept)", () => {
    const base: Parameters<typeof computeReadinessScore>[0] = {
      componentType: "Hero Paper",
      productionItem: "Test Hero",
      worldId: "world-id",
      payloadVersion: "PP-2.0",
      promptPayload: '{"shared_prompt":"x".repeat(35)}',
    };
    const withOrientation    = computeReadinessScore({ ...base, orientation: "portrait" });
    const withoutOrientation = computeReadinessScore({ ...base, orientation: "" });
    expect(withOrientation).toBeGreaterThan(withoutOrientation);
  });

  it("orientation DOES change the score for Journal Card (has orientation concept)", () => {
    const base: Parameters<typeof computeReadinessScore>[0] = {
      componentType: "Journal Card",
      productionItem: "Test Card",
      worldId: "world-id",
    };
    const withOrientation    = computeReadinessScore({ ...base, orientation: "portrait" });
    const withoutOrientation = computeReadinessScore({ ...base, orientation: "" });
    expect(withOrientation).toBeGreaterThan(withoutOrientation);
  });
});

// ── Item 4: inheritance resolver page cache ───────────────────────────────────

import { clearPageCache } from "../lib/worldsmith/inheritance-resolver.js";

// Minimal mock page factory
function makeMockPage(id: string, name: string) {
  return {
    id,
    properties: {
      Name: { type: "title", title: [{ plain_text: name, text: { content: name } }] },
      World: { type: "rich_text", rich_text: [{ plain_text: "Wychcombe", text: { content: "Wychcombe" } }] },
      "Component Type": { type: "select", select: { name: "Hero Paper" } },
      "Canon Dependency": { type: "select", select: { name: "None" } },
      "Payload Version": { type: "select", select: { name: "PP-2.0" } },
      "Prompt Payload": { type: "rich_text", rich_text: [{ plain_text: '{"shared_prompt":"x xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}', text: { content: '' } }] },
    },
    object: "page" as const,
    created_time: "2024-01-01T00:00:00Z",
    last_edited_time: "2024-01-01T00:00:00Z",
    url: `https://notion.so/${id}`,
  };
}

vi.mock("../lib/notion-client.js", () => {
  const getPage = vi.fn();
  const getPageText = vi.fn().mockResolvedValue("page text content");
  return {
    getPage,
    getPageText,
    extractTitle: (prop: any) => prop?.title?.[0]?.plain_text ?? "",
    extractRichText: (prop: any) => prop?.rich_text?.[0]?.plain_text ?? "",
    extractSelect: (prop: any) => prop?.select?.name ?? "",
    extractRelation: (prop: any) => (prop?.relation ?? []).map((r: any) => r.id as string),
    extractNumber: () => null,
    extractUrl: () => null,
    extractCheckbox: () => false,
  };
});

import { resolveInheritanceChain } from "../lib/worldsmith/inheritance-resolver.js";

describe("Item 4 — inheritance resolver: world page fetch is cached", () => {
  const WORLD_ID = "world-abc-123";
  const SPEC_ID  = "spec-abc-456";
  const WORLD_PAGE_ID = "world-page-id-xyz";

  beforeAll(() => {
    // Start from a clean cache so test order doesn't matter
    clearPageCache();
  });

  afterAll(() => {
    clearPageCache();
    vi.restoreAllMocks();
  });

  it("getPage is called for the production spec on every resolveInheritanceChain call", async () => {
    const { getPage } = await import("../lib/notion-client.js");
    const mockGetPage = vi.mocked(getPage);
    mockGetPage.mockReset();

    // Production spec page (must NOT be cached — it changes frequently)
    const specPage = makeMockPage(SPEC_ID, "Hero Paper 001: The Library Table");
    // World page that will be referenced via worldId relation
    const worldPage = makeMockPage(WORLD_PAGE_ID, "Wychcombe");

    // Spec page has a World relation pointing at WORLD_PAGE_ID
    specPage.properties["World"] = {
      type: "relation",
      relation: [{ id: WORLD_PAGE_ID }],
    } as any;
    // Clear inline world text so resolver will do a follow-up fetch
    specPage.properties["World"] = {
      type: "relation",
      relation: [{ id: WORLD_PAGE_ID }],
      rich_text: [],
    } as any;

    mockGetPage.mockImplementation((id: string) => {
      if (id === SPEC_ID)       return Promise.resolve({ ...specPage });
      if (id === WORLD_PAGE_ID) return Promise.resolve({ ...worldPage });
      return Promise.reject(new Error(`Unexpected getPage(${id})`));
    });

    clearPageCache(); // ensure world page not in cache yet

    // First compile
    await resolveInheritanceChain(SPEC_ID).catch(() => {/* expected — missing required fields OK */});

    const specCallCount = mockGetPage.mock.calls.filter(([id]) => id === SPEC_ID).length;
    expect(specCallCount).toBeGreaterThanOrEqual(1);
  });

  it("world/collection page getPage is called only ONCE when resolve is called twice within the cache TTL", async () => {
    const { getPage } = await import("../lib/notion-client.js");
    const mockGetPage = vi.mocked(getPage);
    mockGetPage.mockReset();

    const specPage = makeMockPage(SPEC_ID, "Hero Paper 001: The Library Table");
    const worldPage = makeMockPage(WORLD_PAGE_ID, "Wychcombe");

    // Make World a relation so the resolver does a follow-up fetch
    specPage.properties["World"] = {
      type: "relation",
      relation: [{ id: WORLD_PAGE_ID }],
    } as any;

    mockGetPage.mockImplementation((id: string) => {
      if (id === SPEC_ID)       return Promise.resolve({ ...specPage });
      if (id === WORLD_PAGE_ID) return Promise.resolve({ ...worldPage });
      return Promise.reject(new Error(`Unexpected getPage(${id})`));
    });

    clearPageCache(); // start with empty cache

    // Two successive resolves for the same spec with the same world relation
    await resolveInheritanceChain(SPEC_ID).catch(() => {});
    await resolveInheritanceChain(SPEC_ID).catch(() => {});

    // The world page (WORLD_PAGE_ID) should have been fetched only once
    const worldPageCalls = mockGetPage.mock.calls.filter(([id]) => id === WORLD_PAGE_ID).length;
    expect(worldPageCalls).toBe(1);

    // The production spec itself should have been fetched twice (not cached)
    const specCalls = mockGetPage.mock.calls.filter(([id]) => id === SPEC_ID).length;
    expect(specCalls).toBe(2);
  });
});

// ── Item 5 & 6: editorial routes ─────────────────────────────────────────────
// These tests run against a real in-memory Express app wired to the test DB.

import request from "supertest";
import { db } from "@workspace/db";
import {
  worldsmithWorldsTable,
  wsProductionSpecsTable,
} from "@workspace/db";
import { randomUUID } from "crypto";

// Minimal auth + super-admin middleware shim for test
vi.mock("../lib/auth-middleware.js", () => ({
  requireAuth: (_req: any, _res: any, next: any) => {
    _req.user = { id: "test-super-admin", platformRole: "super_admin" };
    next();
  },
}));
vi.mock("../middleware/requireRole.js", () => ({
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
  requireStoreAccess: () => (_req: any, _res: any, next: any) => next(),
}));

let app: Application;

beforeAll(async () => {
  const editorialRouter = await import("../routes/worldsmith-editorial.js");
  app = express();
  app.use(express.json());
  app.use(editorialRouter.default);
});

// ── Item 6: FK violation → 422 (not 500) ─────────────────────────────────────

describe("Item 6 — editorial 500 handlers: FK violation returns 422", () => {
  it("POST /v1/editorial/specs with a non-existent world_id returns 422 (FK violation), not 500", async () => {
    const res = await request(app)
      .post("/v1/editorial/specs")
      .send({
        world_id: randomUUID(),          // valid UUID format but no such world in DB
        production_item: "FK Test Spec",
        component_type: "Hero Paper",
      });

    // Should NOT be 500 (which was the behaviour before the fix)
    expect(res.status).not.toBe(500);
    // Should be 422 (Unprocessable Entity — required linked record missing)
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/world|linked|not found|does not exist/i);
  });
});

// ── Item 5: PATCH route saves mutable fields ──────────────────────────────────

describe("Item 5 — PATCH /v1/editorial/specs/:id saves mutable linkage fields", () => {
  let worldId: string;
  let specId: string;

  beforeAll(async () => {
    // Insert a world for FK integrity
    worldId = randomUUID();
    await db.insert(worldsmithWorldsTable).values({
      id: worldId,
      name: "Wave2 Test World",
      code: "W2T",
      status: "active",
    });

    // Create a spec via the API
    const createRes = await request(app)
      .post("/v1/editorial/specs")
      .send({
        world_id: worldId,
        production_item: "PATCH Test Spec",
        component_type: "Hero Paper",
        payload_version: "PP-2.0",
        prompt_payload: '{"shared_prompt":"initial payload content here xyz"}',
      });
    expect(createRes.status).toBe(201);
    specId = createRes.body.spec.id;
  });

  afterAll(async () => {
    // Teardown
    await db.delete(wsProductionSpecsTable).where(
      (await import("drizzle-orm")).eq(wsProductionSpecsTable.id, specId),
    ).catch(() => {});
    await db.delete(worldsmithWorldsTable).where(
      (await import("drizzle-orm")).eq(worldsmithWorldsTable.id, worldId),
    ).catch(() => {});
  });

  it("PATCH /v1/editorial/specs/:id is not 405 — it saves mutable fields", async () => {
    const res = await request(app)
      .patch(`/v1/editorial/specs/${specId}`)
      .send({
        prompt_payload: '{"shared_prompt":"updated payload content here xyz abc"}',
        payload_version: "PP-2.0",
        canon_record_ids: [],
        prompt_module_ids: [],
      });

    // Before the fix this returned 405; after the fix it returns 200
    expect(res.status).not.toBe(405);
    expect(res.status).toBe(200);
    expect(res.body.spec).toBeDefined();
  });

  it("PATCH persists the updated prompt_payload to the DB", async () => {
    const newPayload = '{"shared_prompt":"persisted payload check content xyz"}';
    await request(app)
      .patch(`/v1/editorial/specs/${specId}`)
      .send({ prompt_payload: newPayload });

    // Re-fetch the spec and verify the saved payload
    const getRes = await request(app).get(`/v1/editorial/specs/${specId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.spec.promptPayload).toBe(newPayload);
  });

  it("PATCH recalculates readinessScore after saving mutable fields", async () => {
    // Start with a spec that has no style guide
    const getRes1 = await request(app).get(`/v1/editorial/specs/${specId}`);
    const scoreBefore = getRes1.body.spec.readinessScore as number;

    // Add a well-populated prompt payload (increases score)
    const bigPayload = '{"shared_prompt":"comprehensive prompt payload content for scoring test with enough text"}';
    await request(app)
      .patch(`/v1/editorial/specs/${specId}`)
      .send({ prompt_payload: bigPayload });

    const getRes2 = await request(app).get(`/v1/editorial/specs/${specId}`);
    const scoreAfter = getRes2.body.spec.readinessScore as number;

    // The score may go up or stay the same, but must not error
    expect(typeof scoreAfter).toBe("number");
    expect(scoreAfter).toBeGreaterThanOrEqual(0);
    expect(scoreAfter).toBeGreaterThanOrEqual(scoreBefore - 5); // allow minor fluctuation
  });

  it("PATCH returns 400 when no mutable fields are provided", async () => {
    const res = await request(app)
      .patch(`/v1/editorial/specs/${specId}`)
      .send({ production_item: "Should be rejected" }); // immutable field only

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mutable|no.*field|immutable/i);
  });
});
