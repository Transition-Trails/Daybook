/**
 * WorldSmith — Prompt Module dependency fetch failure tests.
 *
 * Confirms that when a dependency page fetch inside `resolvePromptModule` throws,
 * the failure is:
 *   1. Logged via logger.warn with the dep page ID and the error message.
 *   2. Recorded as a PROMPT_MODULE_DEP_FETCH_FAILED entry in InheritanceChain.warnings.
 *   3. Propagated into CompileResponse.warnings on a successful full compile run.
 *
 * Strategy:
 *   - Mock `getPage` / `getPageText` in notion-client to control Notion responses.
 *   - Mock the logger so logger.warn calls can be spied on.
 *   - Mock run-repository and daybook-adapter to avoid DB writes.
 *   - Call resolveInheritanceChain directly for the InheritanceChain assertion.
 *   - Call runCompilation (dry_run=true, valid payload) for the CompileResponse assertion.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (must be defined before any import that pulls them in) ───────

const { mockGetPage, mockGetPageText, mockLoggerWarn } = vi.hoisted(() => ({
  mockGetPage: vi.fn(),
  mockGetPageText: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn().mockResolvedValue("run-dep-test-001"),
  updateRun: vi.fn().mockResolvedValue(undefined),
  failRun: vi.fn().mockResolvedValue(undefined),
  getRun: vi.fn().mockResolvedValue(null),
  getRunsBySpec: vi.fn().mockResolvedValue([]),
  failStaleRunsForSpec: vi.fn().mockResolvedValue(0),
}));

vi.mock("../lib/worldsmith/daybook-adapter.js", () => ({
  upsertAsset: vi.fn().mockResolvedValue({ asset_id: "test-asset" }),
  getAsset: vi.fn().mockResolvedValue(null),
  getAssetBySpec: vi.fn().mockResolvedValue(null),
  buildAssetId: vi.fn().mockReturnValue("test-asset-id"),
  buildFilename: vi.fn().mockReturnValue("test-file.json"),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

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
  relationProp: (ids: string[]) => ({
    type: "relation",
    relation: ids.map((id) => ({ id })),
  }),
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

import { resolveInheritanceChain } from "../lib/worldsmith/inheritance-resolver.js";
import { runCompilation } from "../lib/worldsmith/orchestrator.js";

// ── Page-builder helpers ──────────────────────────────────────────────────────

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
 * Build a page with a mix of rich_text and relation properties.
 */
function makePageWithRelations(
  id: string,
  textFields: Record<string, string | undefined>,
  relationFields: Record<string, string[]>,
) {
  const page = makePage(id, textFields);
  for (const [key, ids] of Object.entries(relationFields)) {
    page.properties[key] = {
      type: "relation",
      relation: ids.map((rid) => ({ id: rid })),
    };
  }
  return page;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SPEC_ID = "spec-dep-test-abc123";
const MODULE_ID = "mod-dep-test-001";
const DEP_ID = "dep-dep-test-002";
const DEP_A_ID = "dep-multi-test-A01";
const DEP_B_ID = "dep-multi-test-B02";

/**
 * A minimal PP-1.0 payload string that passes validatePayload for a Cover Art spec.
 */
const VALID_PAYLOAD = [
  "asset_role: Cover art test asset",
  "composition: Centered focal object with scattered supporting botanical elements",
  "materials: Watercolour with ink outlines",
  "visual_hierarchy: Foreground subject, midground accent, background wash",
  "text_rule: No text permitted",
  "canon_rule: None",
  "print_rule: Standard CMYK 300dpi bleed",
  "negative_constraints: No text, no people, no photorealism",
].join("\n");

/** A spec page with a Prompt Module linked, carrying a full valid payload. */
function makeSpecPageWithModule() {
  return makePageWithRelations(
    SPEC_ID,
    {
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
    },
    {
      "Prompt Modules": [MODULE_ID],
    },
  );
}

/** A module page that declares DEP_ID as a dependency. */
function makeModulePageWithDependency() {
  return makePageWithRelations(
    MODULE_ID,
    { Name: "Thornvale Style Module" },
    { Dependencies: [DEP_ID] },
  );
}

/** A module page that declares TWO dependencies (DEP_A_ID, DEP_B_ID). */
function makeModulePageWithTwoDependencies() {
  return makePageWithRelations(
    MODULE_ID,
    { Name: "Thornvale Style Module" },
    { Dependencies: [DEP_A_ID, DEP_B_ID] },
  );
}

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-not-real";
  vi.clearAllMocks();
  // Default: getPageText returns empty string (content is irrelevant for these tests)
  mockGetPageText.mockResolvedValue("");
});

// ── 1. resolveInheritanceChain — InheritanceChain.warnings ────────────────────

describe("resolveInheritanceChain — Prompt Module dependency fetch failure", () => {
  it("records a PROMPT_MODULE_DEP_FETCH_FAILED warning when a dependency page cannot be fetched", async () => {
    // Spec fetch succeeds
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithModule());
    // Module fetch succeeds, with a dependency
    mockGetPage.mockResolvedValueOnce(makeModulePageWithDependency());
    // Dependency fetch fails
    const depError = new Error("Notion API GET /pages/dep-dep-test-002 → 404: page not found");
    mockGetPage.mockRejectedValueOnce(depError);

    const chain = await resolveInheritanceChain(SPEC_ID);

    // The chain itself must still resolve (dep failure is non-fatal)
    expect(chain.productionSpec.notionPageId).toBe(SPEC_ID);
    expect(chain.promptModules).toHaveLength(1);

    // The warnings array must contain exactly one PROMPT_MODULE_DEP_FETCH_FAILED entry
    expect(chain.warnings).toHaveLength(1);
    expect(chain.warnings[0].code).toBe("PROMPT_MODULE_DEP_FETCH_FAILED");
    expect(chain.warnings[0].field).toContain(DEP_ID);
    expect(chain.warnings[0].message).toContain(DEP_ID);
  });

  it("calls logger.warn with the dep page ID and the error message", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithModule());
    mockGetPage.mockResolvedValueOnce(makeModulePageWithDependency());
    const depError = new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443");
    mockGetPage.mockRejectedValueOnce(depError);

    await resolveInheritanceChain(SPEC_ID);

    expect(mockLoggerWarn).toHaveBeenCalledOnce();

    const [logContext, logMessage] = mockLoggerWarn.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    // Must include the dep page ID in the structured log context
    expect(logContext).toMatchObject({ depId: DEP_ID });
    // The error object must be present
    expect(logContext).toHaveProperty("err");
    // Message must indicate a dep fetch failure
    expect(logMessage).toMatch(/dependency fetch failed/i);
  });

  it("includes the error text in the warning message", async () => {
    const errorText = "Notion API GET /pages/dep-dep-test-002 → 500: Internal Server Error";
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithModule());
    mockGetPage.mockResolvedValueOnce(makeModulePageWithDependency());
    mockGetPage.mockRejectedValueOnce(new Error(errorText));

    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.warnings[0].code).toBe("PROMPT_MODULE_DEP_FETCH_FAILED");
    expect(chain.warnings[0].message).toContain(errorText);
  });

  it("still returns module content (minus the dropped dep) when the dependency fails", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithModule());
    mockGetPage.mockResolvedValueOnce(makeModulePageWithDependency());
    mockGetPageText.mockResolvedValueOnce("Module body text");
    mockGetPage.mockRejectedValueOnce(new Error("timeout"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    // The module itself is still present; its content is the module body (dep dropped)
    expect(chain.promptModules[0].content).toBe("Module body text");
  });

  it("records a separate PROMPT_MODULE_DEP_FETCH_FAILED warning for each failing dependency when two deps both fail", async () => {
    // Spec fetch succeeds
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithModule());
    // Module fetch succeeds, with TWO dependencies
    mockGetPage.mockResolvedValueOnce(makeModulePageWithTwoDependencies());
    // Both dependency fetches fail
    const errA = new Error(`Notion API GET /pages/${DEP_A_ID} → 404: page not found`);
    const errB = new Error(`Notion API GET /pages/${DEP_B_ID} → 503: service unavailable`);
    mockGetPage.mockRejectedValueOnce(errA);
    mockGetPage.mockRejectedValueOnce(errB);

    const chain = await resolveInheritanceChain(SPEC_ID);

    // The chain itself still resolves (dep failures are non-fatal)
    expect(chain.productionSpec.notionPageId).toBe(SPEC_ID);
    expect(chain.promptModules).toHaveLength(1);

    // Each failing dep must produce its own warning entry
    expect(chain.warnings).toHaveLength(2);
    expect(chain.warnings.every((w) => w.code === "PROMPT_MODULE_DEP_FETCH_FAILED")).toBe(true);

    const fieldA = chain.warnings.find((w) => w.field.includes(DEP_A_ID));
    const fieldB = chain.warnings.find((w) => w.field.includes(DEP_B_ID));
    expect(fieldA).toBeDefined();
    expect(fieldB).toBeDefined();
    expect(fieldA!.message).toContain(DEP_A_ID);
    expect(fieldB!.message).toContain(DEP_B_ID);

    // logger.warn must be called once per failing dep
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    const warnCalls = mockLoggerWarn.mock.calls as Array<[Record<string, unknown>, string]>;
    const calledDepIds = warnCalls.map(([ctx]) => ctx.depId);
    expect(calledDepIds).toContain(DEP_A_ID);
    expect(calledDepIds).toContain(DEP_B_ID);
  });
});

// ── 2. runCompilation — CompileResponse.warnings ──────────────────────────────

describe("runCompilation — PROMPT_MODULE_DEP_FETCH_FAILED propagates to CompileResponse.warnings", () => {
  it("includes the PROMPT_MODULE_DEP_FETCH_FAILED entry in warnings when the compile otherwise succeeds", async () => {
    // Spec fetch succeeds (full valid payload)
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithModule());
    // Module fetch succeeds
    mockGetPage.mockResolvedValueOnce(makeModulePageWithDependency());
    // Dependency fetch fails (non-fatal)
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/dep-dep-test-002 → 404: page not found"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    // The run must succeed despite the dropped dependency
    expect(result.status).toBe("compiled");

    // The warnings array must contain the dep-fetch failure
    expect(Array.isArray(result.warnings)).toBe(true);
    const depWarn = result.warnings.find(
      (w) => w.code === "PROMPT_MODULE_DEP_FETCH_FAILED",
    );
    expect(depWarn).toBeDefined();
    expect(depWarn!.field).toContain(DEP_ID);
  });

  it("still logs via logger.warn when the failure occurs inside a full runCompilation call", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPageWithModule());
    mockGetPage.mockResolvedValueOnce(makeModulePageWithDependency());
    mockGetPage.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    const warnCalls = mockLoggerWarn.mock.calls as Array<[Record<string, unknown>, string]>;
    const depWarnCall = warnCalls.find(([ctx]) => ctx?.depId === DEP_ID);
    expect(depWarnCall).toBeDefined();
    expect(depWarnCall![0]).toMatchObject({ depId: DEP_ID });
    expect(depWarnCall![1]).toMatch(/dependency fetch failed/i);
  });
});
