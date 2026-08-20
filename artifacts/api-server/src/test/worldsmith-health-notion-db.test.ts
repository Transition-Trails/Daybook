/**
 * WorldSmith health check — Notion DB permission tests.
 *
 * Verifies that GET /v1/worldsmith/health correctly reports:
 *   1. status: "warning"  when the integration returns 403 (not shared with DB)
 *   2. status: "warning"  when the Notion DB ID is invalid / returns 404
 *   3. status: "failed"   when the fetch throws (network timeout / unreachable)
 *
 * Strategy:
 *   - Mock global.fetch so no real network calls are made.
 *   - Mock @workspace/db to return a controlled worlds list.
 *   - Mock auth middleware so the route bypasses session checks.
 *   - Mount the worldsmith router on a minimal Express app and drive it with supertest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted mock state ─────────────────────────────────────────────────────────
const { mockSelectFrom, mockSelectFn, worldsRef } = vi.hoisted(() => {
  const worldsRef = {
    rows: [] as Array<{ id: string; name: string; notionProductionDbId: string | null }>,
  };
  const mockSelectFrom = vi.fn(async () => worldsRef.rows);
  const mockSelectFn = vi.fn(() => ({ from: mockSelectFrom }));
  return { mockSelectFrom, mockSelectFn, worldsRef };
});

// ── DB mock ────────────────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelectFn,
  },
  worldsmithWorldsTable: {
    id: "id",
    name: "name",
    notionProductionDbId: "notion_production_db_id",
    updatedAt: "updated_at",
  },
  worldsmithRunsTable: {},
  worldsmithAssetsTable: {},
}));

// ── drizzle-orm operators (pass-through — never touch a real DB) ───────────────
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ op: "eq", val }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  inArray: (_col: unknown, vals: unknown) => ({ op: "inArray", vals }),
  ne: (_col: unknown, val: unknown) => ({ op: "ne", val }),
  isNull: (_col: unknown) => ({ op: "isNull" }),
  or: (...args: unknown[]) => ({ op: "or", args }),
  desc: (_col: unknown) => ({ op: "desc" }),
  sql: vi.fn(),
}));

// ── Auth middleware — bypass so the route handler runs unconditionally ─────────
vi.mock("../lib/auth-middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middleware/requireRole.js", () => ({
  requireSuperAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireStoreAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Logger — silence output during tests ──────────────────────────────────────
vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ── Heavy worldsmith modules — not exercised by health check ──────────────────
vi.mock("../lib/worldsmith/orchestrator.js", () => ({
  runCompilation: vi.fn(),
}));
vi.mock("../lib/worldsmith/spec-preview-service.js", () => ({
  runSpecPreview: vi.fn(),
  retrySpecPreviewStatus: vi.fn(),
  SpecPreviewError: class SpecPreviewError extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));
vi.mock("../lib/worldsmith/run-repository.js", () => ({
  getRun: vi.fn(),
  getRunsBySpec: vi.fn(),
  failStaleRunsForSpec: vi.fn().mockResolvedValue(0),
  updateRun: vi.fn(),
}));
vi.mock("../lib/worldsmith/daybook-adapter.js", () => ({
  getAsset: vi.fn(),
  getAssetBySpec: vi.fn(),
}));
vi.mock("../lib/notion-client.js", () => ({
  getPage: vi.fn(),
  extractTitle: vi.fn(),
  extractRichText: vi.fn(),
  extractSelect: vi.fn(),
  extractRelation: vi.fn(),
  extractNumber: vi.fn(),
}));
vi.mock("../lib/worldsmith/normalize-id.js", () => ({
  normalizeNotionId: (id: string) => id,
}));

// ── Imports (after all mocks are registered) ──────────────────────────────────
import worldsmithRouter from "../routes/worldsmith.js";

// ── Test helpers ───────────────────────────────────────────────────────────────

type FetchResponse = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

/**
 * Build a minimal express app that mounts the worldsmith router.
 * Re-created per test so the router stays isolated.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  // Attach a dummy user so auth-dependent handlers don't choke
  app.use((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (_req as express.Request & { user: unknown }).user = { id: "test-user-super" };
    next();
  });
  app.use(worldsmithRouter);
  return app;
}

/**
 * Mock global.fetch so the first call (token check at /users/me) returns 200,
 * then subsequent calls (DB probes) return the provided response.
 */
function mockFetchWithDbResponse(dbResponse: FetchResponse) {
  const tokenOkResponse: FetchResponse = { ok: true, status: 200 };
  let callCount = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    callCount++;
    if (callCount === 1) return tokenOkResponse; // users/me token check
    return dbResponse;                           // databases/${dbId} probe
  }));
}

/**
 * Mock global.fetch where the first call (token check) succeeds and subsequent
 * DB probes throw an error (simulating a network timeout or ECONNREFUSED).
 */
function mockFetchWithDbThrow(error: Error) {
  let callCount = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    callCount++;
    if (callCount === 1) return { ok: true, status: 200 };
    throw error;
  }));
}

function setWorlds(rows: typeof worldsRef.rows) {
  worldsRef.rows = rows;
}

const WORLD_ID = "world-test-001";
const WORLD_NAME = "Test World";
const DB_ID = "aaaa1111bbbb2222cccc3333dddd4444";

// ── Suite setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  worldsRef.rows = [];
  mockSelectFrom.mockImplementation(async () => worldsRef.rows);
  mockSelectFn.mockReturnValue({ from: mockSelectFrom });

  // Default NOTION_TOKEN env so the token check passes
  process.env.NOTION_TOKEN = "test-notion-token";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /v1/worldsmith/health — Notion DB 403 (integration not shared)", () => {
  it("returns status: warning with a 403 message when the integration lacks DB share permission", async () => {
    setWorlds([{ id: WORLD_ID, name: WORLD_NAME, notionProductionDbId: DB_ID }]);
    mockFetchWithDbResponse({ ok: false, status: 403 });

    const app = buildApp();
    const res = await request(app).get("/v1/worldsmith/health");

    expect(res.status).toBe(200);
    const integrations: Array<{ service: string; status: string; message?: string; worldId?: string }> =
      res.body.integrations;

    const dbEntry = integrations.find((i) => i.service === `notion_db_${WORLD_ID}`);
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.status).toBe("warning");
    expect(dbEntry!.message).toContain("403");
    expect(dbEntry!.worldId).toBe(WORLD_ID);
  });

  it("includes the world name in the label for the 403 entry", async () => {
    setWorlds([{ id: WORLD_ID, name: WORLD_NAME, notionProductionDbId: DB_ID }]);
    mockFetchWithDbResponse({ ok: false, status: 403 });

    const app = buildApp();
    const res = await request(app).get("/v1/worldsmith/health");

    const integrations: Array<{ service: string; label: string; status: string }> = res.body.integrations;
    const dbEntry = integrations.find((i) => i.service === `notion_db_${WORLD_ID}`);
    expect(dbEntry!.label).toContain(WORLD_NAME);
  });
});

describe("GET /v1/worldsmith/health — Notion DB 404 (database not found)", () => {
  it("returns status: warning with a 404 message when the DB ID is wrong or the DB was deleted", async () => {
    setWorlds([{ id: WORLD_ID, name: WORLD_NAME, notionProductionDbId: DB_ID }]);
    mockFetchWithDbResponse({ ok: false, status: 404 });

    const app = buildApp();
    const res = await request(app).get("/v1/worldsmith/health");

    expect(res.status).toBe(200);
    const integrations: Array<{ service: string; status: string; message?: string }> =
      res.body.integrations;

    const dbEntry = integrations.find((i) => i.service === `notion_db_${WORLD_ID}`);
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.status).toBe("warning");
    expect(dbEntry!.message).toContain("404");
  });
});

describe("GET /v1/worldsmith/health — Notion DB network timeout / unreachable", () => {
  it("returns status: failed when the fetch to the Notion DB throws a timeout error", async () => {
    setWorlds([{ id: WORLD_ID, name: WORLD_NAME, notionProductionDbId: DB_ID }]);
    const timeoutError = new Error("The operation was aborted due to a network timeout");
    (timeoutError as Error & { name: string }).name = "AbortError";
    mockFetchWithDbThrow(timeoutError);

    const app = buildApp();
    const res = await request(app).get("/v1/worldsmith/health");

    expect(res.status).toBe(200);
    const integrations: Array<{ service: string; status: string; message?: string }> =
      res.body.integrations;

    const dbEntry = integrations.find((i) => i.service === `notion_db_${WORLD_ID}`);
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.status).toBe("failed");
    expect(dbEntry!.message).toBeTruthy();
  });

  it("returns status: failed when the fetch throws a generic network error (ECONNREFUSED)", async () => {
    setWorlds([{ id: WORLD_ID, name: WORLD_NAME, notionProductionDbId: DB_ID }]);
    mockFetchWithDbThrow(new Error("connect ECONNREFUSED 127.0.0.1:443"));

    const app = buildApp();
    const res = await request(app).get("/v1/worldsmith/health");

    expect(res.status).toBe(200);
    const integrations: Array<{ service: string; status: string; message?: string }> =
      res.body.integrations;

    const dbEntry = integrations.find((i) => i.service === `notion_db_${WORLD_ID}`);
    expect(dbEntry).toBeDefined();
    expect(dbEntry!.status).toBe("failed");
  });
});

describe("GET /v1/worldsmith/health — worlds without a DB ID are skipped", () => {
  it("does not emit a DB entry for a world that has no notionProductionDbId configured", async () => {
    setWorlds([{ id: WORLD_ID, name: WORLD_NAME, notionProductionDbId: null }]);
    // fetch is only called once (token check); any DB probe would be an error
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));

    const app = buildApp();
    const res = await request(app).get("/v1/worldsmith/health");

    expect(res.status).toBe(200);
    const integrations: Array<{ service: string }> = res.body.integrations;
    const dbEntry = integrations.find((i) => i.service === `notion_db_${WORLD_ID}`);
    expect(dbEntry).toBeUndefined();
  });
});

describe("GET /v1/worldsmith/health — per-world probes are skipped when the token is invalid", () => {
  it("does not probe any DB when the Notion token check returns 401", async () => {
    setWorlds([{ id: WORLD_ID, name: WORLD_NAME, notionProductionDbId: DB_ID }]);
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const res = await request(app).get("/v1/worldsmith/health");

    expect(res.status).toBe(200);
    // fetch should only be called once (the token check), not a second time for the DB
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const integrations: Array<{ service: string; status: string }> = res.body.integrations;
    const dbEntry = integrations.find((i) => i.service === `notion_db_${WORLD_ID}`);
    expect(dbEntry).toBeUndefined();
  });
});
