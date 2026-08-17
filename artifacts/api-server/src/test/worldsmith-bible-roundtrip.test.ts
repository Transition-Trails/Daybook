/**
 * WorldSmith integration test — World Bible round-trip.
 *
 * Confirms that all four World Bible fields (visualPalette, proseVoice,
 * atmosphericNotes, materialWorld) survive the full orchestrator path:
 *
 *   Notion fetch → inheritance-resolver chain resolution → DB bible lookup
 *   → compilePrompt → generation payload
 *
 * A regression in inheritance-resolver.ts or orchestrator.ts could silently
 * drop world bible data BEFORE compilePrompt is called.  These tests catch
 * that class of bug by walking the entire runCompilation() path (not just
 * calling compilePrompt() directly as in worldsmith-prompt-compiler-bible.test.ts).
 *
 * Strategy:
 *   - Mock notion-client so getPage returns a valid spec page (World set).
 *   - Mock @workspace/db so the worldsmithWorldsTable query returns all four
 *     Bible fields populated.
 *   - Use dry_run: true so no Notion write-back or Daybook upsert is attempted.
 *   - Assert that the compiled_prompt in the response contains all four
 *     Bible section tags.
 *   - Covers both PP-2.0 (shared_prompt present) and PP-1.0 (legacy flat).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: variables referenced inside vi.mock factories ─────────────────

const { mockGetPage, mockDbSelectResult, mockDbShouldThrow } = vi.hoisted(() => ({
  mockGetPage: vi.fn(),
  // Mutable ref lets individual tests swap the DB result without re-hoisting.
  mockDbSelectResult: { value: [] as unknown[] },
  // When set to a non-empty string, mockLimit rejects with that message instead
  // of resolving.  Reset to "" in beforeEach so tests are isolated.
  mockDbShouldThrow: { value: "" },
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn().mockResolvedValue("run-bible-rt-001"),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NP = any;

vi.mock("../lib/notion-client.js", () => ({
  _setOnRetry: vi.fn(),
  getPage: mockGetPage,
  getPageText: vi.fn().mockResolvedValue(""),
  updatePage: vi.fn().mockResolvedValue(undefined),
  createPage: vi.fn().mockResolvedValue({ id: "notion-new-page" }),
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

/**
 * Mock @workspace/db so the drizzle select chain resolves from mockDbSelectResult.
 * The orchestrator does: db.select({...}).from(worldsmithWorldsTable).where(...).limit(1)
 */
vi.mock("@workspace/db", () => {
  // Build a chainable mock that ultimately reads from mockDbSelectResult.value.
  // Each method returns an object with the next method in the chain.
  // When mockDbShouldThrow.value is non-empty the limit() call rejects with
  // that message, exercising the orchestrator's try/catch for DB errors.
  const mockLimit = vi.fn().mockImplementation(() => {
    if (mockDbShouldThrow.value) {
      return Promise.reject(new Error(mockDbShouldThrow.value));
    }
    return Promise.resolve(mockDbSelectResult.value);
  });
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    db: { select: mockSelect },
    // The table reference just needs to exist — the mock where() ignores its arg.
    worldsmithWorldsTable: { name: "ws_worlds_name_col" },
    // Other table exports used elsewhere (not by the orchestrator bible path).
    worldsmithRunsTable: {},
    worldsmithAssetsTable: {},
    // sql tag and eq are used in the where clause; they can be no-ops here.
    sql: new Proxy(() => {}, { get: () => () => {} }),
    eq: vi.fn(),
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runCompilation } from "../lib/worldsmith/orchestrator.js";

// ── Constants ─────────────────────────────────────────────────────────────────

// Must be a 32-hex-char UUID to pass normalizeNotionId() in the route handler.
const SPEC_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

/** All four World Bible fields populated. */
const FULL_BIBLE_ROW = {
  visualPalette: "Moss green, umber, pale gold — warm candlelight tones.",
  proseVoice: "Second person present tense, lyrical and unhurried.",
  atmosphericNotes: "Damp woodland air, distant birdsong, sense of discovery.",
  materialWorld: "Rough linen, hand-thrown pottery, beeswax candles.",
  worldRules: ["No anachronistic technology.", "No primary colours."],
};

// ── Page builder helpers ──────────────────────────────────────────────────────

/** Build a Notion-like page with plain rich_text properties. */
function makePage(id: string, fields: Record<string, string>) {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    properties[key] = {
      type: "rich_text",
      rich_text: value ? [{ plain_text: value }] : [],
    };
  }
  return { id, properties, url: `https://notion.so/${id}` };
}

/**
 * PP-2.0 payload in YAML-like key: value format (as stored in Notion).
 * Presence of shared_prompt signals the new section-based format.
 */
const PP2_PAYLOAD = [
  "shared_prompt: A misty forest glade at dawn.",
  "front_prompt: Close-up of dew-covered ferns.",
  "negative_prompt: no text, no people",
].join("\n");

/**
 * PP-1.0 payload in YAML-like key: value format.
 * shared_prompt is absent → legacy flat format detected by the validator.
 */
const PP1_PAYLOAD = [
  "asset_role: background",
  "composition: full bleed botanical",
  "materials: watercolour on cotton paper",
  "visual_hierarchy: foliage dominant",
  "text_rule: no text",
  "canon_rule: none",
  "print_rule: bleed to edge",
  "negative_constraints: no people",
].join("\n");

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-not-real";
  // Default: DB returns the full bible row and does NOT throw.
  mockDbSelectResult.value = [FULL_BIBLE_ROW];
  mockDbShouldThrow.value = "";
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// PP-2.0 round-trip
// ══════════════════════════════════════════════════════════════════════════════

describe("runCompilation (PP-2.0) — World Bible round-trip: all four fields reach compiled_prompt", () => {
  // Shared result: run once, assert across multiple its.
  let result: Awaited<ReturnType<typeof runCompilation>>;

  beforeEach(async () => {
    // Re-prime mockDbSelectResult so clearAllMocks() in outer beforeEach doesn't
    // erase it before this test's own beforeEach fires.
    mockDbSelectResult.value = [FULL_BIBLE_ROW];

    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        "Production Item": "Thornvale Hero Paper",
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-2.0",
        "Prompt Payload": PP2_PAYLOAD,
        "Design Intent": "Evoke the quiet wonder of the ancient woodland.",
        "Narrative Purpose": "Establish the world's visual identity on first open.",
        "Required Content": "Foliage, mist, ambient light.",
        "Review Criteria": "Check margins and colour balance.",
      }),
    );

    result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
  });

  it("compilation succeeds (status=compiled)", () => {
    expect(result.status).toBe("compiled");
  });

  it("compiled_prompt contains [VISUAL PALETTE]", () => {
    expect(result.compiled_prompt).toContain("[VISUAL PALETTE]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.visualPalette);
  });

  it("compiled_prompt contains [PROSE VOICE]", () => {
    expect(result.compiled_prompt).toContain("[PROSE VOICE]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.proseVoice);
  });

  it("compiled_prompt contains [ATMOSPHERIC NOTES]", () => {
    expect(result.compiled_prompt).toContain("[ATMOSPHERIC NOTES]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.atmosphericNotes);
  });

  it("compiled_prompt contains [MATERIAL WORLD]", () => {
    expect(result.compiled_prompt).toContain("[MATERIAL WORLD]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.materialWorld);
  });

  it("compiled_prompt contains [WORLD RULES]", () => {
    expect(result.compiled_prompt).toContain("[WORLD RULES]");
    expect(result.compiled_prompt).toContain("No anachronistic technology.");
    expect(result.compiled_prompt).toContain("No primary colours.");
  });

  it("compiled_sections includes a source='World Bible' entry for each field", () => {
    const sections = result.compiled_sections ?? [];
    const bibleKeys = ["visual_palette", "prose_voice", "atmospheric_notes", "material_world"];
    for (const key of bibleKeys) {
      const entry = sections.find((s) => s.key === key);
      expect(entry, `section entry '${key}' missing`).toBeDefined();
      expect(entry?.source).toBe("World Bible");
    }
  });

  it("payload_format is '2.0' (not 'legacy')", () => {
    // Provenance.payload_format is set by the orchestrator at stage 9.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).provenance?.payload_format).toBe("2.0");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PP-1.0 round-trip
// ══════════════════════════════════════════════════════════════════════════════

describe("runCompilation (PP-1.0) — World Bible round-trip: all four fields reach compiled_prompt", () => {
  let result: Awaited<ReturnType<typeof runCompilation>>;

  beforeEach(async () => {
    mockDbSelectResult.value = [FULL_BIBLE_ROW];

    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        "Production Item": "Thornvale Hero Paper",
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
        "Prompt Payload": PP1_PAYLOAD,
        "Design Intent": "Evoke the quiet wonder of the ancient woodland.",
        "Narrative Purpose": "Establish the world's visual identity on first open.",
        "Required Content": "Foliage, mist, ambient light.",
        "Review Criteria": "Check margins and colour balance.",
      }),
    );

    result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
  });

  it("compilation succeeds (status=compiled)", () => {
    expect(result.status).toBe("compiled");
  });

  it("compiled_prompt contains [VISUAL PALETTE]", () => {
    expect(result.compiled_prompt).toContain("[VISUAL PALETTE]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.visualPalette);
  });

  it("compiled_prompt contains [PROSE VOICE]", () => {
    expect(result.compiled_prompt).toContain("[PROSE VOICE]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.proseVoice);
  });

  it("compiled_prompt contains [ATMOSPHERIC NOTES]", () => {
    expect(result.compiled_prompt).toContain("[ATMOSPHERIC NOTES]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.atmosphericNotes);
  });

  it("compiled_prompt contains [MATERIAL WORLD]", () => {
    expect(result.compiled_prompt).toContain("[MATERIAL WORLD]");
    expect(result.compiled_prompt).toContain(FULL_BIBLE_ROW.materialWorld);
  });

  it("compiled_prompt contains [WORLD RULES]", () => {
    expect(result.compiled_prompt).toContain("[WORLD RULES]");
    expect(result.compiled_prompt).toContain("No anachronistic technology.");
    expect(result.compiled_prompt).toContain("No primary colours.");
  });

  it("compiled_sections includes a source='World Bible' entry for each field", () => {
    const sections = result.compiled_sections ?? [];
    const bibleKeys = ["visual_palette", "prose_voice", "atmospheric_notes", "material_world"];
    for (const key of bibleKeys) {
      const entry = sections.find((s) => s.key === key);
      expect(entry, `section entry '${key}' missing`).toBeDefined();
      expect(entry?.source).toBe("World Bible");
    }
  });

  it("payload_format is 'legacy' (not '2.0')", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).provenance?.payload_format).toBe("legacy");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Regression guard: no bible in DB → compiled_prompt has no Bible tags
// ══════════════════════════════════════════════════════════════════════════════

describe("runCompilation — World Bible absent from DB: no section tags injected", () => {
  it("compiled_prompt has no [VISUAL PALETTE] when DB returns empty", async () => {
    // Simulate DB returning no row for the world name.
    mockDbSelectResult.value = [];

    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        "Production Item": "Thornvale Hero Paper",
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-2.0",
        "Prompt Payload": PP2_PAYLOAD,
        "Design Intent": "Evoke the quiet wonder of the ancient woodland.",
        "Narrative Purpose": "Establish the world's visual identity on first open.",
        "Required Content": "Foliage, mist, ambient light.",
        "Review Criteria": "Check margins and colour balance.",
      }),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("compiled");
    expect(result.compiled_prompt).not.toContain("[VISUAL PALETTE]");
    expect(result.compiled_prompt).not.toContain("[PROSE VOICE]");
    expect(result.compiled_prompt).not.toContain("[ATMOSPHERIC NOTES]");
    expect(result.compiled_prompt).not.toContain("[MATERIAL WORLD]");
    expect(result.compiled_prompt).not.toContain("[WORLD RULES]");
  });

  it("DB fetch error is non-fatal — compilation still succeeds without Bible tags", async () => {
    // The orchestrator catches DB errors and continues without bible fields.
    // Simulate by returning empty to avoid test brittleness around rejection handling.
    mockDbSelectResult.value = [];

    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        "Production Item": "Thornvale Hero Paper",
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
        "Prompt Payload": PP1_PAYLOAD,
        "Design Intent": "Evoke the quiet wonder of the ancient woodland.",
        "Narrative Purpose": "Establish the world's visual identity on first open.",
        "Required Content": "Foliage, mist, ambient light.",
        "Review Criteria": "Check margins and colour balance.",
      }),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    // Should still compile successfully even if bible is absent.
    expect(result.status).toBe("compiled");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DB throws an unexpected exception — graceful degradation
// ══════════════════════════════════════════════════════════════════════════════

describe("runCompilation — World Bible DB query throws: graceful degradation", () => {
  /**
   * This suite exercises the try/catch that wraps the worldsmithWorldsTable
   * SELECT in orchestrator.ts (lines 113–138).  A DB connection failure,
   * schema mismatch, or driver crash would cause the promise to reject rather
   * than resolve.  The catch block must absorb the error, log a warning, and
   * continue compilation without the Bible fields.
   */

  beforeEach(() => {
    // Make the DB select chain reject instead of resolving.
    mockDbShouldThrow.value = "connection refused";

    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        "Production Item": "Thornvale Hero Paper",
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-2.0",
        "Prompt Payload": PP2_PAYLOAD,
        "Design Intent": "Evoke the quiet wonder of the ancient woodland.",
        "Narrative Purpose": "Establish the world's visual identity on first open.",
        "Required Content": "Foliage, mist, ambient light.",
        "Review Criteria": "Check margins and colour balance.",
      }),
    );
  });

  it("returns status=compiled despite the DB exception", async () => {
    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
    expect(result.status).toBe("compiled");
  });

  it("compiled_prompt contains no [VISUAL PALETTE] tag when DB threw", async () => {
    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
    expect(result.compiled_prompt).not.toContain("[VISUAL PALETTE]");
  });

  it("compiled_prompt contains no [PROSE VOICE] tag when DB threw", async () => {
    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
    expect(result.compiled_prompt).not.toContain("[PROSE VOICE]");
  });

  it("compiled_prompt contains no [ATMOSPHERIC NOTES] tag when DB threw", async () => {
    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
    expect(result.compiled_prompt).not.toContain("[ATMOSPHERIC NOTES]");
  });

  it("compiled_prompt contains no [MATERIAL WORLD] tag when DB threw", async () => {
    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
    expect(result.compiled_prompt).not.toContain("[MATERIAL WORLD]");
  });

  it("compiled_prompt contains no [WORLD RULES] tag when DB threw", async () => {
    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );
    expect(result.compiled_prompt).not.toContain("[WORLD RULES]");
  });
});
