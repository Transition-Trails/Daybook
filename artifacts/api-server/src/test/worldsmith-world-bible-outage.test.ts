/**
 * WorldSmith — World Bible DB outage recording tests.
 *
 * Confirms that when the worldsmithWorldsTable query throws (simulating a DB
 * outage), the orchestrator:
 *   1. Does NOT surface the error as a fatal failure — compilation still succeeds.
 *   2. Persists a WORLD_BIBLE_FETCH_ERROR warning to the run record via updateRun
 *      so operators can see it in the run history.
 *   3. Includes the WORLD_BIBLE_FETCH_ERROR warning in the CompileResponse.warnings
 *      returned to the caller.
 *   4. Logs the failure via logger.warn (not silently swallowed).
 *
 * Strategy:
 *   - Mock @workspace/db so db.select().from().where().limit() rejects with a
 *     controlled error, simulating a DB outage during the World Bible fetch.
 *   - Mock run-repository to capture updateRun calls without real DB writes.
 *   - Mock notion-client to return a valid spec page with a World field set,
 *     ensuring the Bible fetch path is entered.
 *   - Mock daybook-adapter to suppress external writes.
 *   - Call runCompilation with dry_run=true so Notion write-backs are skipped.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ─────────────────────────────────────────────────────────

const {
  mockDbSelectLimit,
  mockUpdateRun,
  mockLoggerWarn,
  mockGetPage,
  mockGetPageText,
} = vi.hoisted(() => ({
  /** Controls whether the DB World Bible select chain resolves or rejects. */
  mockDbSelectLimit: vi.fn<() => Promise<unknown[]>>(),
  mockUpdateRun: vi.fn<(runId: string, update: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
  mockLoggerWarn: vi.fn(),
  mockGetPage: vi.fn(),
  mockGetPageText: vi.fn(),
}));

// ── @workspace/db mock ─────────────────────────────────────────────────────────
// The orchestrator calls db.select({...}).from(worldsmithWorldsTable).where(...).limit(1)
// to fetch World Bible fields.  We stub the entire chain so we can control the
// outcome without a real database connection.

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mockDbSelectLimit,
        }),
      }),
    }),
  },
  worldsmithWorldsTable: {
    name: "name",
    visualPalette: "visual_palette",
    proseVoice: "prose_voice",
    atmosphericNotes: "atmospheric_notes",
    materialWorld: "material_world",
    worldRules: "world_rules",
  },
}));

// drizzle-orm helpers used only to build the WHERE clause — pass-through is fine.
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ op: "eq", val }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  inArray: (_col: unknown, vals: unknown) => ({ op: "inArray", vals }),
  lt: (_col: unknown, val: unknown) => ({ op: "lt", val }),
  // Tagged template function used for the World Bible WHERE clause.
  sql: vi.fn(),
}));

// ── run-repository mock ────────────────────────────────────────────────────────

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn().mockResolvedValue("run-bible-outage-001"),
  updateRun: mockUpdateRun,
  failRun: vi.fn().mockResolvedValue(undefined),
  getRun: vi.fn().mockResolvedValue(null),
  getRunsBySpec: vi.fn().mockResolvedValue([]),
  failStaleRunsForSpec: vi.fn().mockResolvedValue(0),
}));

// ── daybook-adapter mock ───────────────────────────────────────────────────────

vi.mock("../lib/worldsmith/daybook-adapter.js", () => ({
  upsertAsset: vi.fn().mockResolvedValue({ asset_id: "test-asset" }),
  getAsset: vi.fn().mockResolvedValue(null),
  getAssetBySpec: vi.fn().mockResolvedValue(null),
  buildAssetId: vi.fn().mockReturnValue("test-asset-id"),
  buildFilename: vi.fn().mockReturnValue("test-file.json"),
}));

// ── logger mock ───────────────────────────────────────────────────────────────

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ── notion-client mock ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NP = any;

vi.mock("../lib/notion-client.js", () => ({
  getPage: mockGetPage,
  getPageText: mockGetPageText,
  updatePage: vi.fn().mockResolvedValue(undefined),
  createPage: vi.fn().mockResolvedValue({ id: "notion-new-page" }),
  _setOnRetry: vi.fn(),
  richTextProp: (v: string) => ({ type: "rich_text", rich_text: [{ text: { content: v } }] }),
  selectProp: (v: string) => ({ type: "select", select: { name: v } }),
  relationProp: (ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) }),
  extractTitle(prop: NP): string {
    if (!prop) return "";
    if (prop.type === "title") return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
    if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NP) => r.plain_text ?? "").join("");
    return "";
  },
  extractRichText(prop: NP): string {
    if (!prop) return "";
    if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NP) => r.plain_text ?? "").join("");
    if (prop.type === "title") return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
    return "";
  },
  extractSelect(prop: NP): string {
    if (!prop) return "";
    if (prop.type === "select") return prop.select?.name ?? "";
    if (prop.type === "status") return prop.status?.name ?? "";
    return "";
  },
  extractMultiSelect(prop: NP): string[] {
    if (!prop) return [];
    if (prop.type === "multi_select") return (prop.multi_select ?? []).map((o: NP) => o.name ?? "");
    return [];
  },
  extractRelation(prop: NP): string[] {
    if (!prop) return [];
    if (prop.type === "relation") return (prop.relation ?? []).map((r: NP) => r.id ?? "");
    return [];
  },
  extractNumber(prop: NP): number | undefined {
    if (!prop) return undefined;
    if (prop.type === "number") return prop.number ?? undefined;
    return undefined;
  },
  extractUrl(prop: NP): string | undefined {
    if (!prop) return undefined;
    if (prop.type === "url") return prop.url ?? undefined;
    return undefined;
  },
  extractCheckbox(prop: NP): boolean {
    if (!prop) return false;
    if (prop.type === "checkbox") return prop.checkbox ?? false;
    return false;
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runCompilation } from "../lib/worldsmith/orchestrator.js";

// ── Page-builder helpers ──────────────────────────────────────────────────────

const SPEC_ID = "spec-bible-outage-abc123";

/**
 * A minimal PP-1.0 payload string that passes validatePayload for a Cover Art spec.
 */
const VALID_PAYLOAD = [
  "asset_role: Cover art for Thornvale volume",
  "composition: Centered focal object with scattered supporting botanical elements",
  "materials: Watercolour with ink outlines",
  "visual_hierarchy: Foreground subject, midground accent, background wash",
  "text_rule: No text permitted",
  "canon_rule: None",
  "print_rule: Standard CMYK 300dpi bleed",
  "negative_constraints: No text, no people, no photorealism",
].join("\n");

/** Build a Notion-like page with rich_text properties. */
function makePage(id: string, fields: Record<string, string | undefined>) {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      properties[key] = {
        type: "rich_text",
        rich_text: value ? [{ plain_text: value }] : [],
      };
    }
  }
  return { id, properties, url: `https://notion.so/${id}` };
}

/**
 * A spec page with a World field set to "Thornvale" so the orchestrator
 * enters the World Bible fetch path.
 */
function makeSpecPageWithWorld() {
  return makePage(SPEC_ID, {
    "Production Item": "Test Cover Art",
    World: "Thornvale",
    "Component Type": "Cover Art",
    "Payload Version": "PP-1.0",
    "Design Intent": "A beautiful botanical cover art piece",
    "Narrative Purpose": "Sets the tone for the Thornvale collection",
    "Required Content": "Floral botanical elements in muted earth tones",
    "Review Criteria": "Consistent with Thornvale palette and visual style",
    "Compiled Prompt Status": "Not Compiled",
    "Prompt Payload": VALID_PAYLOAD,
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-not-real";
  vi.clearAllMocks();

  // Default: getPageText returns empty string (content is irrelevant for these tests)
  mockGetPageText.mockResolvedValue("");

  // Default: DB select chain resolves to an empty array (world row not found)
  mockDbSelectLimit.mockResolvedValue([]);

  // Reset updateRun to resolve cleanly
  mockUpdateRun.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runCompilation — World Bible DB outage is recorded in the run", () => {
  it("still returns 'compiled' status when the World Bible DB query throws", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithWorld());
    mockDbSelectLimit.mockRejectedValueOnce(
      new Error("ECONNREFUSED: could not connect to database host"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("compiled");
  });

  it("includes a WORLD_BIBLE_FETCH_ERROR entry in CompileResponse.warnings", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithWorld());
    mockDbSelectLimit.mockRejectedValueOnce(
      new Error("ECONNREFUSED: could not connect to database host"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(Array.isArray(result.warnings)).toBe(true);
    const bibleWarn = result.warnings?.find((w) => w.code === "WORLD_BIBLE_FETCH_ERROR");
    expect(bibleWarn).toBeDefined();
    expect(bibleWarn!.field).toBe("world_bible");
    expect(bibleWarn!.governing_rule).toBe("WS-BIBLE-001");
    expect(bibleWarn!.message).toContain("Thornvale");
    expect(bibleWarn!.recommended_action).toBeTruthy();
  });

  it("persists the WORLD_BIBLE_FETCH_ERROR warning to the run record via updateRun before later stages run", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithWorld());
    const dbError = new Error("pg: SSL SYSCALL error: EOF detected");
    mockDbSelectLimit.mockRejectedValueOnce(dbError);

    await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    // updateRun must have been called at some point with a warnings array
    // containing a WORLD_BIBLE_FETCH_ERROR entry.
    const allCalls = mockUpdateRun.mock.calls as Array<[string, Record<string, unknown>]>;
    const callWithBibleWarning = allCalls.find(([, update]) => {
      const warnings = update.warnings;
      if (!Array.isArray(warnings)) return false;
      return warnings.some(
        (w: Record<string, unknown>) => w.code === "WORLD_BIBLE_FETCH_ERROR",
      );
    });

    expect(callWithBibleWarning).toBeDefined();

    // The immediate persist call (before later stages) must use the run-id
    // returned by createRun so it targets the right row.
    const [persistedRunId] = callWithBibleWarning!;
    expect(persistedRunId).toBe("run-bible-outage-001");
  });

  it("records the original error message in the WORLD_BIBLE_FETCH_ERROR warning", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithWorld());
    const errorMessage = "SSL connection has been closed unexpectedly";
    mockDbSelectLimit.mockRejectedValueOnce(new Error(errorMessage));

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    const bibleWarn = result.warnings?.find((w) => w.code === "WORLD_BIBLE_FETCH_ERROR");
    expect(bibleWarn).toBeDefined();
    expect(bibleWarn!.message).toContain(errorMessage);
  });

  it("logs the failure via logger.warn (not silently swallowed)", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithWorld());
    mockDbSelectLimit.mockRejectedValueOnce(
      new Error("ECONNREFUSED: could not connect to database host"),
    );

    await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    // At least one logger.warn call must mention the World Bible failure.
    const warnCalls = mockLoggerWarn.mock.calls as Array<[Record<string, unknown>, string]>;
    const bibleWarnCall = warnCalls.find(([, msg]) =>
      typeof msg === "string" && /world bible/i.test(msg),
    );
    expect(bibleWarnCall).toBeDefined();

    // The structured log context must include the world name for observability.
    const [logCtx] = bibleWarnCall!;
    expect(logCtx).toHaveProperty("world", "Thornvale");
  });

  it("completes with 'compiled' status when the DB returns an empty result (world not found)", async () => {
    // DB query succeeds but returns no rows — world is not in the registry.
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithWorld());
    mockDbSelectLimit.mockResolvedValueOnce([]);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    // This is not an error — the spec may not have a registered world yet.
    expect(result.status).toBe("compiled");

    // No WORLD_BIBLE_FETCH_ERROR warning expected (empty result is not a DB failure).
    const bibleWarn = result.warnings?.find((w) => w.code === "WORLD_BIBLE_FETCH_ERROR");
    expect(bibleWarn).toBeUndefined();
  });
});
