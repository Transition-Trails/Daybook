/**
 * Sync-from-Notion — Emotional Register local-wins contract.
 *
 * Verifies that when POST /v1/editorial/canon-records/sync-notion runs:
 *
 *  1. LOCAL WINS: a record that already has an emotional_register set locally
 *     keeps its local value even if Notion carries a different one.
 *
 *  2. NOTION WINS (cold): a record whose local emotional_register is null
 *     picks up the value supplied by Notion.
 *
 *  The same contract applies to the complementary fields:
 *   - sensory_clauses  (local wins when non-empty)
 *   - register_locked  (local wins when already true)
 *
 * Strategy:
 *  - Mock `queryDatabase` (notion-client) to return a synthetic Notion page.
 *  - Mock `@workspace/db` with a call-queue so the first select() returns the
 *    world row and the second returns the existing canon-record row (or empty).
 *  - Capture the argument object passed to db.update().set() and assert the
 *    merge result.
 *  - Mount the editorial router on a minimal Express app and drive it with
 *    supertest (same pattern used by worldsmith-health-notion-db.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
const {
  mockQueryDatabase,
  mockExtractRelation,
  dbSelectQueue,
  capturedUpdateSet,
  capturedInsertValues,
  onConflictDoNothingCallCount,
} = vi.hoisted(() => {
  /** Queue of row-arrays returned in order by successive db.select() chains. */
  const dbSelectQueue: Array<unknown[]> = [];
  /** Stores the most-recent .set({...}) payload so tests can assert on it. */
  const capturedUpdateSet: { value: Record<string, unknown> | null } = { value: null };
  /** Stores the most-recent .values({...}) payload so tests can assert on it. */
  const capturedInsertValues: { value: Record<string, unknown> | null } = { value: null };
  /** Counts how many times .onConflictDoNothing() was called on an insert. */
  const onConflictDoNothingCallCount: { value: number } = { value: 0 };

  const mockQueryDatabase   = vi.fn();
  const mockExtractRelation = vi.fn((_prop: unknown): string[] => []);

  return {
    mockQueryDatabase,
    mockExtractRelation,
    dbSelectQueue,
    capturedUpdateSet,
    capturedInsertValues,
    onConflictDoNothingCallCount,
  };
});

// ── DB mock ────────────────────────────────────────────────────────────────────
//
// Drizzle chains look like:
//   db.select({...}).from(table).where(...)            → Promise<row[]>
//   db.select({...}).from(table).where(...).limit(n)   → Promise<row[]>
//
// We simulate this by dequeuing from dbSelectQueue on each new select() call.
// update() captures the set() payload; insert() captures the values() payload.

vi.mock("@workspace/db", () => {
  // Build a chain that resolves to the next queued result.
  function makeSelectChain(rows: unknown[]) {
    const terminus = Promise.resolve(rows);
    const leaf = Object.assign(terminus, {
      limit: (_n: number) => terminus,
    });
    // Allow both .where().limit() and bare .where() to resolve.
    const withWhere = { where: () => leaf };
    const withFrom  = { from: () => withWhere };
    return withFrom;
  }

  const db = {
    select: vi.fn(() => makeSelectChain(dbSelectQueue.shift() ?? [])),
    update: vi.fn(() => ({
      set: (payload: Record<string, unknown>) => {
        capturedUpdateSet.value = payload;
        return {
          where: () => Promise.resolve([]),
        };
      },
    })),
    insert: vi.fn(() => ({
      values: (payload: Record<string, unknown>) => {
        capturedInsertValues.value = payload;
        return {
          returning: () => Promise.resolve([{ id: "new-canon-id" }]),
          onConflictDoNothing: () => {
            onConflictDoNothingCallCount.value++;
            return Promise.resolve([]);
          },
        };
      },
    })),
    // Pass 2 of the sync handler deletes stale relation edges before re-inserting.
    delete: vi.fn(() => ({
      where: () => Promise.resolve([]),
    })),
  };

  // Stub table objects — drizzle-orm operators receive these as column references.
  // The mocked drizzle-orm below turns eq/and into plain objects, so the actual
  // column value does not matter.
  const tableStub = new Proxy(
    {},
    { get: (_t, prop) => String(prop) },
  );

  return {
    db,
    wsCanonRecordsTable:         tableStub,
    wsCanonRecordRelationsTable: tableStub,
    wsCollectionsTable:          tableStub,
    wsVolumesTable:              tableStub,
    wsStyleGuidesTable:          tableStub,
    wsComponentSpecsTable:       tableStub,
    wsPromptModulesTable:        tableStub,
    wsProductionSpecsTable:      tableStub,
    wsPromptPayloadsTable:       tableStub,
    worldsmithWorldsTable:       tableStub,
  };
});

// ── drizzle-orm operators (pass-through) ─────────────────────────────────────
// `sql` must work as both a tagged template literal AND have a `.raw` method,
// because the sync handler uses both forms in the Pass-2 delete.
vi.mock("drizzle-orm", () => {
  function sqlTag(_strings: TemplateStringsArray, ..._values: unknown[]) {
    return { op: "sql" };
  }
  sqlTag.raw = (_s: string) => ({ op: "sql_raw" });

  return {
    eq:      (_col: unknown, val: unknown) => ({ op: "eq",      val }),
    and:     (...args: unknown[])          => ({ op: "and",     args }),
    or:      (...args: unknown[])          => ({ op: "or",      args }),
    like:    (_col: unknown, val: unknown) => ({ op: "like",    val }),
    desc:    (_col: unknown)               => ({ op: "desc" }),
    inArray: (_col: unknown, val: unknown) => ({ op: "inArray", val }),
    sql:     sqlTag,
  };
});

// ── Notion client mock ────────────────────────────────────────────────────────
vi.mock("../lib/notion-client.js", () => ({
  queryDatabase:   mockQueryDatabase,
  updatePage:      vi.fn().mockResolvedValue({}),
  createPage:      vi.fn().mockResolvedValue({ id: "new-notion-page", properties: {}, url: "" }),
  richTextProp:    (v: string) => ({ rich_text: [{ text: { content: v } }] }),
  selectProp:      (v: string) => ({ select: { name: v } }),
  extractTitle(prop: Record<string, unknown> | undefined): string {
    if (!prop) return "";
    if (prop["type"] === "title") return ((prop["title"] as Array<{ plain_text: string }>) ?? []).map(r => r.plain_text ?? "").join("");
    return "";
  },
  extractRichText(prop: Record<string, unknown> | undefined): string {
    if (!prop) return "";
    if (prop["type"] === "rich_text") return ((prop["rich_text"] as Array<{ plain_text: string }>) ?? []).map(r => r.plain_text ?? "").join("");
    return "";
  },
  extractSelect(prop: Record<string, unknown> | undefined): string {
    if (!prop) return "";
    if (prop["type"] === "select") return (prop["select"] as { name: string })?.name ?? "";
    if (prop["type"] === "status") return (prop["status"] as { name: string })?.name ?? "";
    return "";
  },
  extractMultiSelect(_prop: unknown): string[] { return []; },
  extractRelation: mockExtractRelation,
  extractCheckbox(prop: Record<string, unknown> | undefined): boolean {
    if (!prop) return false;
    if (prop["type"] === "checkbox") return (prop["checkbox"] as boolean) ?? false;
    return false;
  },
  extractNumber(_prop: unknown): number | undefined { return undefined; },
  extractUrl(_prop: unknown):    string | undefined { return undefined; },
}));

// ── Auth middleware — bypass ──────────────────────────────────────────────────
vi.mock("../lib/auth-middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middleware/requireRole.js", () => ({
  requireSuperAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireStoreAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Logger — silence ──────────────────────────────────────────────────────────
vi.mock("../lib/logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import editorialRouter from "../routes/worldsmith-editorial.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const WORLD_ID  = "world-test-001";
const NOTION_DB = "notion-canon-db-001";
const PAGE_ID   = "notion-page-abc";

/** A Notion-side page returning "Intimate" as the emotional register. */
function makeNotionPage(overrides: Record<string, unknown> = {}) {
  return {
    id: PAGE_ID,
    url: `https://notion.so/${PAGE_ID}`,
    properties: {
      "Name": {
        type: "title",
        title: [{ plain_text: "Evangeline Voss" }],
      },
      "Emotional register": {
        type: "select",
        select: { name: "Intimate" },
      },
      "Sensory clauses": {
        type: "rich_text",
        rich_text: [{ plain_text: "The scent of warm wax and old paper." }],
      },
      "Register locked": {
        type: "checkbox",
        checkbox: true,
      },
      ...overrides,
    },
  };
}

/** The world row returned by the first db.select() call inside the sync handler. */
const worldRow = {
  notionCanonDbId: NOTION_DB,
};

/** Build a minimal Express app that mounts the editorial router. */
function buildApp() {
  const app = express();
  app.use(express.json());
  // Attach a synthetic user so routes that read req.user don't throw.
  app.use((_req: express.Request & { user?: unknown }, _res: unknown, next: () => void) => {
    (_req as { user?: unknown }).user = { id: "super-admin-user" };
    next();
  });
  app.use(editorialRouter);
  return app;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-not-real";
  dbSelectQueue.length = 0;
  capturedUpdateSet.value           = null;
  capturedInsertValues.value        = null;
  onConflictDoNothingCallCount.value = 0;
  mockExtractRelation.mockImplementation(() => []);
  vi.clearAllMocks();
  // vi.clearAllMocks() clears mockExtractRelation's implementation, so restore it.
  mockExtractRelation.mockImplementation(() => []);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Sync from Notion — local-wins rule for emotional_register", () => {
  it("preserves the local emotional_register when one is already set", async () => {
    // Notion says "Intimate" but the local record already has "Withholding".
    mockQueryDatabase.mockResolvedValue([makeNotionPage()]);

    // Queue: [world row, existing canon record row with local register]
    dbSelectQueue.push([worldRow]);
    dbSelectQueue.push([
      {
        id:                "local-canon-001",
        emotionalRegister: "Withholding",
        sensoryClauses:    "The hush of candlelight.",
        registerLocked:    false,
      },
    ]);

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    // The update must preserve the local "Withholding" value, NOT overwrite with "Intimate".
    expect(capturedUpdateSet.value).not.toBeNull();
    expect(capturedUpdateSet.value!["emotionalRegister"]).toBe("Withholding");
  });

  it("applies the Notion emotional_register when the local value is null", async () => {
    // Notion says "Intimate"; the local record has no register set yet.
    mockQueryDatabase.mockResolvedValue([makeNotionPage()]);

    dbSelectQueue.push([worldRow]);
    dbSelectQueue.push([
      {
        id:                "local-canon-002",
        emotionalRegister: null,
        sensoryClauses:    null,
        registerLocked:    false,
      },
    ]);

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    // With no local value, the Notion value "Intimate" must be adopted.
    expect(capturedUpdateSet.value).not.toBeNull();
    expect(capturedUpdateSet.value!["emotionalRegister"]).toBe("Intimate");
  });

  it("stores the Notion emotional_register for a brand-new record (no local row)", async () => {
    // The page is entirely new — no existing local row.
    mockQueryDatabase.mockResolvedValue([makeNotionPage()]);

    dbSelectQueue.push([worldRow]);
    dbSelectQueue.push([]); // no existing record

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    // A new record should inherit the Notion register.
    expect(capturedInsertValues.value).not.toBeNull();
    expect(capturedInsertValues.value!["emotionalRegister"]).toBe("Intimate");
  });
});

describe("Sync from Notion — local-wins rule for sensory_clauses", () => {
  it("preserves a non-empty local sensory_clauses over the Notion value", async () => {
    mockQueryDatabase.mockResolvedValue([makeNotionPage()]);

    dbSelectQueue.push([worldRow]);
    dbSelectQueue.push([
      {
        id:                "local-canon-003",
        emotionalRegister: null,
        sensoryClauses:    "Local prose: the creak of oak floorboards.",
        registerLocked:    false,
      },
    ]);

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    expect(capturedUpdateSet.value!["sensoryClauses"]).toBe(
      "Local prose: the creak of oak floorboards.",
    );
  });

  it("fills sensory_clauses from Notion when the local value is empty", async () => {
    mockQueryDatabase.mockResolvedValue([makeNotionPage()]);

    dbSelectQueue.push([worldRow]);
    dbSelectQueue.push([
      {
        id:                "local-canon-004",
        emotionalRegister: null,
        sensoryClauses:    "",
        registerLocked:    false,
      },
    ]);

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    expect(capturedUpdateSet.value!["sensoryClauses"]).toBe(
      "The scent of warm wax and old paper.",
    );
  });
});

describe("Sync from Notion — local-wins rule for register_locked", () => {
  it("keeps register_locked=true even when Notion carries false", async () => {
    // Override the Notion page so Register Locked is false.
    mockQueryDatabase.mockResolvedValue([
      makeNotionPage({
        "Register locked": { type: "checkbox", checkbox: false },
      }),
    ]);

    dbSelectQueue.push([worldRow]);
    dbSelectQueue.push([
      {
        id:                "local-canon-005",
        emotionalRegister: "Guarded",
        sensoryClauses:    "",
        registerLocked:    true, // locked locally
      },
    ]);

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    expect(capturedUpdateSet.value!["registerLocked"]).toBe(true);
  });

  it("adopts register_locked=true from Notion when local is false", async () => {
    mockQueryDatabase.mockResolvedValue([makeNotionPage()]);

    dbSelectQueue.push([worldRow]);
    dbSelectQueue.push([
      {
        id:                "local-canon-006",
        emotionalRegister: null,
        sensoryClauses:    "",
        registerLocked:    false,
      },
    ]);

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    // Notion says locked=true and local is false → adopt Notion value
    expect(capturedUpdateSet.value!["registerLocked"]).toBe(true);
  });
});

describe("Sync from Notion — duplicate canon relation resilience", () => {
  /**
   * Sets up two Notion pages (A → B) where page A has a "Related Canon"
   * relation pointing at page B. Both pages already exist as local records.
   * Running the sync twice should succeed both times and call
   * .onConflictDoNothing() so a pre-existing (A, B) row in
   * ws_canon_record_relations never causes a unique-violation error.
   */

  const PAGE_A = "notion-page-rel-a";
  const PAGE_B = "notion-page-rel-b";
  const LOCAL_A = "local-rel-a";
  const LOCAL_B = "local-rel-b";

  function makeRelatedPages() {
    return [
      {
        id: PAGE_A,
        url: `https://notion.so/${PAGE_A}`,
        properties: {
          "Name": { type: "title", title: [{ plain_text: "Record Alpha" }] },
          "Related Canon": { type: "relation", relation: [{ id: PAGE_B }] },
          "Emotional register": { type: "select", select: null },
          "Sensory clauses": { type: "rich_text", rich_text: [] },
          "Register locked": { type: "checkbox", checkbox: false },
        },
      },
      {
        id: PAGE_B,
        url: `https://notion.so/${PAGE_B}`,
        properties: {
          "Name": { type: "title", title: [{ plain_text: "Record Beta" }] },
          "Emotional register": { type: "select", select: null },
          "Sensory clauses": { type: "rich_text", rich_text: [] },
          "Register locked": { type: "checkbox", checkbox: false },
        },
      },
    ];
  }

  function queueSyncRows() {
    // world row, then two existing-record lookups (one per Notion page)
    dbSelectQueue.push([{ notionCanonDbId: NOTION_DB }]);
    dbSelectQueue.push([{ id: LOCAL_A, emotionalRegister: null, sensoryClauses: "", registerLocked: false }]);
    dbSelectQueue.push([{ id: LOCAL_B, emotionalRegister: null, sensoryClauses: "", registerLocked: false }]);
  }

  it("succeeds on first sync and calls onConflictDoNothing for relation insert", async () => {
    // extractRelation returns the related page ID for page A's property.
    mockExtractRelation.mockImplementation((prop: unknown) => {
      const p = prop as { relation?: Array<{ id: string }> } | undefined;
      return p?.relation?.map(r => r.id) ?? [];
    });

    mockQueryDatabase.mockResolvedValue(makeRelatedPages());
    queueSyncRows();

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    expect(res.body.relations_written).toBe(1);
    // The sync handler must have called .onConflictDoNothing() at least once
    // (for the relation insert) — never a bare .insert().values() termination.
    expect(onConflictDoNothingCallCount.value).toBeGreaterThanOrEqual(1);
  });

  it("succeeds on re-sync without error even when the relation row already exists", async () => {
    // Simulates a re-sync: the (LOCAL_A, LOCAL_B) edge is already in the DB.
    // The handler deletes existing outgoing edges first (so no real conflict),
    // but the .onConflictDoNothing() guard means a race or partial-delete can
    // never surface a unique-violation to the caller.
    mockExtractRelation.mockImplementation((prop: unknown) => {
      const p = prop as { relation?: Array<{ id: string }> } | undefined;
      return p?.relation?.map(r => r.id) ?? [];
    });

    mockQueryDatabase.mockResolvedValue(makeRelatedPages());

    // First sync
    queueSyncRows();
    const app = buildApp();
    await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    // Reset counters before second sync
    onConflictDoNothingCallCount.value = 0;
    mockExtractRelation.mockImplementation((prop: unknown) => {
      const p = prop as { relation?: Array<{ id: string }> } | undefined;
      return p?.relation?.map(r => r.id) ?? [];
    });

    // Second sync — same data, simulates re-sync
    queueSyncRows();
    const res2 = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res2.status).toBe(200);
    expect(res2.body.relations_written).toBe(1);
    // onConflictDoNothing must still be called on the second pass
    expect(onConflictDoNothingCallCount.value).toBeGreaterThanOrEqual(1);
  });

  it("produces exactly one relation edge pair even when Notion returns the same toId twice", async () => {
    // Notion sometimes returns duplicate entries in a relation property.
    // The handler's per-fromId `seen` Set deduplicates before insert.
    mockExtractRelation.mockImplementation((prop: unknown) => {
      const p = prop as { relation?: Array<{ id: string }> } | undefined;
      if (!p?.relation) return [];
      // Duplicate the first entry to simulate Notion noise.
      return [...p.relation.map(r => r.id), ...p.relation.map(r => r.id)];
    });

    mockQueryDatabase.mockResolvedValue(makeRelatedPages());
    queueSyncRows();

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);
    // Despite duplicate toIds from Notion, only one edge should be recorded.
    expect(res.body.relations_written).toBe(1);
  });
});

describe("Sync from Notion — error handling", () => {
  it("returns 400 when world_id is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/world_id/i);
  });

  it("returns 503 when NOTION_TOKEN is not set", async () => {
    delete process.env.NOTION_TOKEN;

    dbSelectQueue.push([worldRow]);

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(503);
  });

  it("returns 404 when the world does not exist in the DB", async () => {
    mockQueryDatabase.mockResolvedValue([]);

    dbSelectQueue.push([]); // world lookup returns nothing

    const app = buildApp();
    const res = await request(app)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(404);
  });
});
