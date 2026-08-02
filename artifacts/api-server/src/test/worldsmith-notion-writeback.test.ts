/**
 * WorldSmith Notion write-back smoke tests.
 *
 * Confirms that after a successful (non-dry-run) compile:
 *  1. "Compiled Prompt Status" is written to the Production Specification page
 *     with the value "Compiled" (Stage 12 via writeCompiledPromptStatus).
 *  2. "Next Action" is written to the Production Specification page with the
 *     value "Generate image" (Stage 20).
 *
 * Both fields are written via `updatePage` in notion-client.  The test mocks
 * `updatePage` with a spy, runs a full successful compile, then asserts the
 * correct property objects were passed in the correct calls.
 *
 * Strategy:
 *  - Mock notion-client so no real HTTP requests are made; updatePage is a spy
 *    so we can inspect its call arguments.
 *  - Mock run-repository and daybook-adapter so no DB writes are required.
 *  - Provide a minimal valid Production Specification page whose payload
 *    satisfies PP-1.0 validation (all 8 required keys present and non-empty).
 *  - Run with dry_run = false so the write-back path is exercised.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
// vi.mock factories are hoisted above declarations; use vi.hoisted() so these
// references are available inside the factory closures.
const { mockGetPage, mockUpdatePage, mockGetPageText } = vi.hoisted(() => ({
  mockGetPage: vi.fn(),
  mockUpdatePage: vi.fn(),
  mockGetPageText: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn().mockResolvedValue("run-writeback-test-001"),
  updateRun: vi.fn().mockResolvedValue(undefined),
  failRun: vi.fn().mockResolvedValue(undefined),
  getRun: vi.fn().mockResolvedValue(null),
  getRunsBySpec: vi.fn().mockResolvedValue([]),
  failStaleRunsForSpec: vi.fn().mockResolvedValue(0),
}));

vi.mock("../lib/worldsmith/daybook-adapter.js", () => ({
  upsertAsset: vi.fn().mockResolvedValue({ asset_id: "test-asset-id" }),
  getAsset: vi.fn().mockResolvedValue(null),
  getAssetBySpec: vi.fn().mockResolvedValue(null),
  buildAssetId: vi.fn().mockReturnValue("thornvale-v001-cover-art-spec-abc"),
  buildFilename: vi.fn().mockReturnValue("Thornvale_V001_CoverArt_specabc_Master_v001.json"),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NP = any;

vi.mock("../lib/notion-client.js", () => {
  return {
    _setOnRetry: vi.fn(),
    getPage: mockGetPage,
    getPageText: mockGetPageText,
    updatePage: mockUpdatePage,
    createPage: vi.fn().mockResolvedValue({ id: "notion-new-page", properties: {}, url: "" }),
    richTextProp: (v: string) => {
      const chunks: Array<{ text: { content: string } }> = [];
      for (let i = 0; i < v.length; i += 2000) {
        chunks.push({ text: { content: v.slice(i, i + 2000) } });
      }
      return { rich_text: chunks };
    },
    selectProp: (v: string) => ({ select: { name: v } }),
    relationProp: (ids: string[]) => ({ relation: ids.map((id: string) => ({ id })) }),
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
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { runCompilation } from "../lib/worldsmith/orchestrator.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPEC_ID = "spec-writeback-abc123";

/**
 * Build a Notion-like page where text-valued properties use rich_text type
 * and title-valued properties use title type.
 */
function makeRichTextProp(value: string) {
  return { type: "rich_text", rich_text: [{ plain_text: value }] };
}

function makeTitleProp(value: string) {
  return { type: "title", title: [{ plain_text: value }] };
}

function makeSelectProp(value: string) {
  return { type: "select", select: { name: value } };
}

/**
 * A minimal Production Specification page whose payload satisfies PP-1.0.
 * No style guide, component spec, prompt modules, or canon records are linked,
 * so only a single getPage call is needed.
 */
function makeValidSpecPage(): { id: string; properties: Record<string, unknown>; url: string } {
  // PP-1.0 payload with all 8 required keys
  const promptPayload = [
    "asset_role: Decorative cover art for Thornvale Volume I",
    "composition: Centered botanical arrangement with trailing ivy",
    "materials: Soft watercolor washes with fine ink linework",
    "visual_hierarchy: Large central floral motif with cascading secondary elements",
    "text_rule: No text elements permitted",
    "canon_rule: None — no canon characters or locations present",
    "print_rule: Full bleed with 3mm bleed zone on all edges",
    "negative_constraints: No faces, no human figures, no anachronistic objects",
  ].join("\n");

  return {
    id: SPEC_ID,
    properties: {
      "Production Item": makeTitleProp("Thornvale V001 Cover Art"),
      "World": makeRichTextProp("Thornvale"),
      "Component Type": makeSelectProp("Cover Art"),
      "Payload Version": makeSelectProp("PP-1.0"),
      "Design Intent": makeRichTextProp("Lush, atmospheric botanical cover evoking Victorian-era nature journals"),
      "Narrative Purpose": makeRichTextProp("Establish the world's visual identity on the product cover"),
      "Required Content": makeRichTextProp("Botanical motifs, ivy, pressed-flower aesthetic"),
      "Prompt Payload": makeRichTextProp(promptPayload),
      // compiledPromptStatus is absent → defaults to "Not Compiled" in the extractor
    },
    url: `https://notion.so/${SPEC_ID}`,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-not-real";
  // Ensure no Visual Assets DB is configured so upsertVisualAsset returns null
  // without making additional getPage / createPage calls.
  delete process.env.NOTION_VISUAL_ASSETS_DB_ID;
  vi.clearAllMocks();
  // Default: updatePage succeeds
  mockUpdatePage.mockResolvedValue({ id: SPEC_ID, properties: {}, url: "" });
  // Default: getPageText returns empty string (not needed for this spec)
  mockGetPageText.mockResolvedValue("");
});

// ── Stage 12: writeCompiledPromptStatus ───────────────────────────────────────

describe("Notion write-back — Compiled Prompt Status (Stage 12)", () => {
  it("calls updatePage with Compiled Prompt Status = Compiled after a successful compile", async () => {
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    expect(result.status).toBe("compiled");

    // Find the Stage 12 call: updatePage(specId, { "Compiled Prompt Status": selectProp("Compiled") })
    // This is the call made by writeCompiledPromptStatus().
    const allCalls = mockUpdatePage.mock.calls as [string, Record<string, unknown>][];
    const statusCalls = allCalls.filter(
      ([pageId, props]) =>
        pageId === SPEC_ID &&
        "Compiled Prompt Status" in props &&
        !("Next Action" in props),
    );

    expect(statusCalls.length).toBeGreaterThanOrEqual(1);
    const [, statusProps] = statusCalls[0];
    expect(statusProps["Compiled Prompt Status"]).toEqual({ select: { name: "Compiled" } });
  });

  it("does NOT call updatePage for Compiled Prompt Status when dry_run = true", async () => {
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("compiled");
    // No updatePage call should have been made in dry-run mode
    expect(mockUpdatePage).not.toHaveBeenCalled();
  });
});

// ── Stage 20: Next Action + Compiled Prompt Status ────────────────────────────

describe("Notion write-back — Next Action (Stage 20)", () => {
  it("calls updatePage with Next Action = 'Generate image' after a successful compile", async () => {
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    expect(result.status).toBe("compiled");

    // Find the Stage 20 call: the updatePage call that includes "Next Action"
    const allCalls = mockUpdatePage.mock.calls as [string, Record<string, unknown>][];
    const nextActionCalls = allCalls.filter(
      ([pageId, props]) => pageId === SPEC_ID && "Next Action" in props,
    );

    expect(nextActionCalls.length).toBe(1);
    const [, nextActionProps] = nextActionCalls[0];

    // "Next Action" must be a rich_text prop with the value "Generate image"
    const nextActionProp = nextActionProps["Next Action"] as { rich_text: Array<{ text: { content: string } }> };
    expect(nextActionProp).toBeDefined();
    expect(nextActionProp.rich_text).toBeDefined();
    expect(nextActionProp.rich_text[0].text.content).toBe("Generate image");
  });

  it("includes Compiled Prompt Status = Compiled in the Stage 20 call when status was not already Compiled", async () => {
    // The default spec has no "Compiled Prompt Status" property, so the extractor
    // defaults to "Not Compiled" → Stage 20 should include it.
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    expect(result.status).toBe("compiled");

    const allCalls = mockUpdatePage.mock.calls as [string, Record<string, unknown>][];
    const nextActionCalls = allCalls.filter(
      ([pageId, props]) => pageId === SPEC_ID && "Next Action" in props,
    );
    expect(nextActionCalls.length).toBe(1);
    const [, props] = nextActionCalls[0];

    // Stage 20 should also carry the status update when it wasn't already "Compiled"
    expect(props["Compiled Prompt Status"]).toEqual({ select: { name: "Compiled" } });
  });

  it("omits Compiled Prompt Status from Stage 20 call when spec was already marked Compiled", async () => {
    // Build a page where Compiled Prompt Status is already "Compiled"
    const alreadyCompiledPage = makeValidSpecPage();
    alreadyCompiledPage.properties["Compiled Prompt Status"] = makeSelectProp("Compiled");

    mockGetPage.mockResolvedValue(alreadyCompiledPage);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    expect(result.status).toBe("compiled");

    const allCalls = mockUpdatePage.mock.calls as [string, Record<string, unknown>][];
    const nextActionCalls = allCalls.filter(
      ([pageId, props]) => pageId === SPEC_ID && "Next Action" in props,
    );
    expect(nextActionCalls.length).toBe(1);
    const [, props] = nextActionCalls[0];

    // "Compiled Prompt Status" should NOT be included in Stage 20 when
    // the spec was already marked as "Compiled" (avoids unnecessary writes).
    expect("Compiled Prompt Status" in props).toBe(false);
  });

  it("does NOT call updatePage for Next Action when dry_run = true", async () => {
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("compiled");
    // In dry-run mode, no Notion writes should occur at all
    expect(mockUpdatePage).not.toHaveBeenCalled();
  });
});

// ── Combined write-back coverage ──────────────────────────────────────────────

describe("Notion write-back — full successful compile", () => {
  it("makes exactly two updatePage calls to the spec ID (Stage 12 + Stage 20)", async () => {
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    expect(result.status).toBe("compiled");
    expect(result.next_action).toBe("Generate image");
    expect(result.compiled_prompt_status).toBe("Compiled");

    // All updatePage calls must target the production spec ID
    const allCalls = mockUpdatePage.mock.calls as [string, Record<string, unknown>][];
    const specCalls = allCalls.filter(([pageId]) => pageId === SPEC_ID);
    // Stage 12: writeCompiledPromptStatus + Stage 20: Next Action + Compiled Prompt Status
    expect(specCalls).toHaveLength(2);

    // First call (Stage 12): only "Compiled Prompt Status"
    const [, firstProps] = specCalls[0];
    expect("Compiled Prompt Status" in firstProps).toBe(true);
    expect("Next Action" in firstProps).toBe(false);

    // Second call (Stage 20): "Next Action" and conditionally "Compiled Prompt Status"
    const [, secondProps] = specCalls[1];
    expect("Next Action" in secondProps).toBe(true);
  });

  it("write-back calls are idempotent: a second compile does not duplicate updates", async () => {
    // Simulate a re-compile of an already-compiled spec.
    // After the first run, "Compiled Prompt Status" is "Compiled".
    const alreadyCompiledPage = makeValidSpecPage();
    alreadyCompiledPage.properties["Compiled Prompt Status"] = makeSelectProp("Compiled");

    mockGetPage.mockResolvedValue(alreadyCompiledPage);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    expect(result.status).toBe("compiled");

    const allCalls = mockUpdatePage.mock.calls as [string, Record<string, unknown>][];
    const specCalls = allCalls.filter(([pageId]) => pageId === SPEC_ID);

    // Stage 12 call only writes "Compiled Prompt Status"
    const [, firstProps] = specCalls[0];
    expect(firstProps["Compiled Prompt Status"]).toEqual({ select: { name: "Compiled" } });

    // Stage 20 call only writes "Next Action" (skips redundant status write)
    const [, secondProps] = specCalls[1];
    expect("Next Action" in secondProps).toBe(true);
    expect("Compiled Prompt Status" in secondProps).toBe(false);
  });

  it("returns next_action='Generate image' in the API response after a successful compile", async () => {
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    expect(result.status).toBe("compiled");
    expect(result.next_action).toBe("Generate image");
  });

  it("write-back survives an updatePage failure without failing the overall compile", async () => {
    mockGetPage.mockResolvedValue(makeValidSpecPage());

    // Simulate Notion returning an error on both write-back calls
    mockUpdatePage.mockRejectedValue(new Error("Notion API PATCH /pages/spec-writeback → 500: internal error"));

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: false },
      "test-user",
    );

    // Compile must still succeed — write-back failures are non-fatal
    expect(result.status).toBe("compiled");
    expect(result.compiled_prompt_status).toBe("Compiled");
    expect(result.next_action).toBe("Generate image");
  });
});
