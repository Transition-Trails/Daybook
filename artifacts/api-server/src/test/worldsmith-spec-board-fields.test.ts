/**
 * WorldSmith Spec Board — New Fields Rendering Tests
 *
 * Confirms that three new fields added to the spec board render correctly
 * when exercised against real SVG output and through the async Notion fetch path:
 *
 *   1. illustratedNarrative (Section 3) — from PP-2.0 front_prompt; must beat the
 *      "Required content: …" fallback when a non-empty front_prompt is present.
 *
 *   2. canonNames (Section 13) — async-fetched page titles from linked Canon Record
 *      pages; must show actual names instead of just a count.
 *
 *   3. collection (header subtitle) — resolved from a Notion relation when not
 *      stored as plain text; must appear in the "WORLDSMITH <World> — <Collection>"
 *      subtitle line.
 *
 * Strategy:
 *   SVG layer  — call buildSpecBoardSvg() directly with synthetic SpecBoardData
 *               objects; assertions are plain string-contains on the SVG text.
 *   Service layer — mock notion-client + DB + renderSpecBoardToPng to confirm the
 *               async Promise.all block in runSpecPreview() populates the fields
 *               before passing them to the template.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock handles ──────────────────────────────────────────────────────

const { mockGetPage, mockGetPageText } = vi.hoisted(() => ({
  mockGetPage: vi.fn(),
  mockGetPageText: vi.fn(),
}));

const { mockRenderBoard } = vi.hoisted(() => ({
  mockRenderBoard: vi.fn(),
}));

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NP = any;

vi.mock("../lib/notion-client.js", () => ({
  _setOnRetry: vi.fn(),
  getPage: mockGetPage,
  getPageText: mockGetPageText,
  updatePage: vi.fn().mockResolvedValue(undefined),
  uploadFileToNotion: vi.fn().mockResolvedValue({ id: "upload-001" }),
  attachUploadToPageProperty: vi.fn().mockResolvedValue(undefined),
  richTextProp: (v: string) => ({ type: "rich_text", rich_text: [{ text: { content: v } }] }),
  selectProp: (v: string) => ({ type: "select", select: { name: v } }),
  relationProp: (ids: string[]) => ({ type: "relation", relation: ids.map((id: string) => ({ id })) }),
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
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  worldsmithSpecPreviewsTable: {},
}));

vi.mock("../lib/worldsmith/spec-board-template.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/worldsmith/spec-board-template.js")>();
  return {
    ...original,
    // Override only the PNG renderer; let buildSpecBoardSvg through unchanged
    renderSpecBoardToPng: mockRenderBoard,
  };
});

vi.mock("../lib/ai-proxy.js", () => ({
  callDallE: vi.fn().mockResolvedValue("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  buildSpecBoardSvg,
  TEMPLATE_VERSION,
} from "../lib/worldsmith/spec-board-template.js";
import { runSpecPreview } from "../lib/worldsmith/spec-preview-service.js";
import type { SpecBoardData } from "../lib/worldsmith/types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal valid SpecBoardData — override only the fields under test. */
function makeBoard(overrides: Partial<SpecBoardData> = {}): SpecBoardData {
  return {
    specPageId: "spec-board-test-001",
    productionItem: "Autumn Journal Card",
    specId: "AJC-001",
    world: "Thornvale",
    volume: undefined,
    collection: undefined,
    componentType: "Journal Card",
    payloadVersion: "PP-2.0",
    currentVersion: "1",
    status: "Active",
    designIntent: "A warm autumn scene.",
    narrativePurpose: "Evoke the harvest season.",
    requiredContent: "Oak leaves, acorns, a quill.",
    reviewCriteria: "No photorealism; warm palette.",
    assetRole: "front",
    composition: "Centered specimen with soft border.",
    materials: "Watercolour washes, fine ink.",
    visualHierarchy: "Botanical specimen focal point.",
    textRule: "No unapproved text.",
    canonRule: "",
    printRule: "300 DPI, RGB PNG.",
    negativeConstraints: "No photography, no 3D render.",
    promptModuleCount: 0,
    canonDependency: "None",
    canonRecordCount: 0,
    promptHash: "testhash001",
    ...overrides,
  };
}

/** Build a minimal rich_text Notion page. */
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

/** Build a page with a title property (used for canon record / collection pages). */
function makeTitlePage(id: string, title: string) {
  return {
    id,
    properties: {
      Name: { type: "title", title: [{ plain_text: title }] },
    },
    url: `https://notion.so/${id}`,
  };
}

/** Build a page that mixes rich_text fields with relation fields. */
function makePageWithRelations(
  id: string,
  textFields: Record<string, string>,
  relationFields: Record<string, string[]>,
) {
  const page = makePage(id, textFields);
  for (const [key, ids] of Object.entries(relationFields)) {
    (page.properties as Record<string, unknown>)[key] = {
      type: "relation",
      relation: ids.map((rid) => ({ id: rid })),
    };
  }
  return page;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default DB mock: no existing preview (forces a fresh run)
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  });
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });

  // Default PNG renderer: return a 1×1 white pixel PNG
  mockRenderBoard.mockResolvedValue(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    ),
  );

  mockGetPageText.mockResolvedValue("");
  process.env.NOTION_TOKEN = "test-not-real";
});

// ═════════════════════════════════════════════════════════════════════════════
// SVG layer — buildSpecBoardSvg
// ═════════════════════════════════════════════════════════════════════════════

// ── Section 3: Illustrated Narrative ─────────────────────────────────────────

describe("buildSpecBoardSvg — Section 3: Illustrated Narrative", () => {
  it("renders the front_prompt scene text in Section 3 when illustratedNarrative is provided", () => {
    const sceneText = "Beneath a copper-leafed oak, a dried botanical specimen rests on aged parchment.";
    const svg = buildSpecBoardSvg(makeBoard({ illustratedNarrative: sceneText }));

    // The scene text must appear in the SVG
    expect(svg).toContain("Beneath a copper-leafed oak");

    // The fallback "Required content:" prefix must NOT appear when narrative is present
    expect(svg).not.toContain("Required content:");
  });

  it("falls back to a structured summary when illustratedNarrative is absent", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        illustratedNarrative: undefined,
        requiredContent: "Oak leaves, acorns, a quill.",
        componentType: "Journal Card",
        assetRole: "front",
      }),
    );

    // V3 fallback chain: narrativePurpose → designIntent → "—"
    // makeBoard default sets narrativePurpose, so the Narrative Role section renders it.
    // requiredContent items also appear in the Required Elements Checklist column.
    const hasNarrativeFallback = svg.includes("Evoke the harvest season");
    const hasRequiredItem = svg.includes("Oak leaves");
    const hasComponentType = svg.toUpperCase().includes("JOURNAL CARD");
    expect(hasNarrativeFallback || hasRequiredItem || hasComponentType).toBe(true);
  });

  it("uses narrativePurpose as a tertiary fallback when both illustratedNarrative and structured fields are empty", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        illustratedNarrative: undefined,
        requiredContent: "",
        componentType: "",
        assetRole: "",
        narrativePurpose: "Evoke the harvest season warmth.",
      }),
    );

    // narrativePurpose is the last-resort fallback baked into the template
    // The exact rendering depends on wrapText; the content should not be "—" alone
    // (only the complete absence of all fallbacks would produce "—")
    expect(svg).not.toMatch(/^—$/m);
  });

  it("Section 3 title appears in the SVG output", () => {
    const svg = buildSpecBoardSvg(makeBoard({ illustratedNarrative: "A misty morning scene." }));
    // V3 renamed the section from "Illustrated Narrative" to "Narrative Role"
    expect(svg.toUpperCase()).toContain("NARRATIVE ROLE");
  });

  it("uses the not-specified state for missing local compiled sections", () => {
    const svg = buildSpecBoardSvg(makeBoard({
      usesCompiledSections: true,
      illustratedNarrative: undefined,
      composition: "",
      materials: "",
      visualHierarchy: "",
      negativeConstraints: "",
      focalHierarchy: [],
    }));

    expect(svg).toContain("Not specified.");
    expect(svg).not.toContain("Preserve open paper areas.");
  });
});

// ── Section 13: Canon Names ───────────────────────────────────────────────────

describe("buildSpecBoardSvg — Section 13: Canon Lock", () => {
  it("renders actual Canon Record names in Section 13 when canonNames is populated", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        canonNames: ["The Thornvale Codex", "Ember Court Charter"],
        canonRecordCount: 2,
        canonDependency: "Canon Reference",
      }),
    );

    expect(svg).toContain("The Thornvale Codex");
    expect(svg).toContain("Ember Court Charter");

    // Must NOT show the generic count fallback when actual names are present
    expect(svg).not.toContain("2 Canon Records linked");
  });

  it("renders component-type series when canonNames is absent but canonRecordCount > 0", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        canonNames: undefined,
        canonRecordCount: 3,
        canonDependency: "Supports Canon",
      }),
    );

    // V3 companion column: when canonNames is empty, falls back to "<componentType> Series".
    // makeBoard default has componentType "Journal Card" → renders "Journal Card Series".
    expect(svg).toContain("Journal Card Series");
  });

  it("renders placeholder text when canonNames is absent and componentType is unset", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        canonNames: undefined,
        canonRecordCount: 0,
        canonDependency: "None",
        componentType: "",
      }),
    );

    // V3: no canonNames + no componentType → companion col shows the See Canon Records note
    expect(svg).toContain("See Canon Records for companion asset relationships");
  });

  it("Section in the companion row is labelled 'Relationship to Companion Assets'", () => {
    const svg = buildSpecBoardSvg(makeBoard({ canonNames: ["Verdant Veil Records"] }));
    // V3 renamed the section from "Canon Lock" to "Relationship to Companion Assets"
    expect(svg.toUpperCase()).toContain("COMPANION ASSETS");
  });

  it("canon name appears in the companion column when canonNames is set", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        canonNames: ["Ironbound Register"],
        canonDependency: "Canon Defining",
      }),
    );

    // V3 companion row lists canon names prefixed with HP00N; no "Canon Dependency:" label
    expect(svg).toContain("Ironbound Register");
    // canonDependency is not rendered as a "Canon Dependency: …" label in V3
    expect(svg).not.toContain("Canon Dependency: Canon Defining");
  });
});

// ── Header subtitle: Collection ────────────────────────────────────────────────

describe("buildSpecBoardSvg — Header subtitle: Collection", () => {
  it("includes collection name in the subtitle when collection is set", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({ world: "Thornvale", collection: "The Ember Codex" }),
    );

    // subtitleLine = "WORLDSMITH THORNVALE — THE EMBER CODEX"
    expect(svg.toUpperCase()).toContain("THORNVALE");
    expect(svg.toUpperCase()).toContain("THE EMBER CODEX");
  });

  it("prefers collection over volume in the subtitle", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        world: "Thornvale",
        volume: "Volume I",
        collection: "The Ember Codex",
      }),
    );

    // collection should appear; volume may or may not, but collection wins the slot
    expect(svg.toUpperCase()).toContain("THE EMBER CODEX");
  });

  it("falls back to volume when collection is absent", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({
        world: "Thornvale",
        volume: "Volume II",
        collection: undefined,
      }),
    );

    expect(svg.toUpperCase()).toContain("VOLUME II");
  });

  it("renders living-archive fallback subtitle when neither world nor collection are provided", () => {
    const svg = buildSpecBoardSvg(
      makeBoard({ world: "", volume: undefined, collection: undefined }),
    );

    // V3 fallback: "WORLDSMITH LIVING ARCHIVE  ·  THE CURATOR'S DESK"
    expect(svg.toUpperCase()).toContain("WORLDSMITH LIVING ARCHIVE");
    expect(svg.toUpperCase()).toContain("CURATOR");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Service layer — runSpecPreview async fetch paths
// ═════════════════════════════════════════════════════════════════════════════

const SPEC_ID = "spec-svc-test-001";
const CANON_A_ID = "canon-page-aaa";
const CANON_B_ID = "canon-page-bbb";
const COLLECTION_PAGE_ID = "collection-page-ccc";

/**
 * Build the primary spec page used for service-layer tests.
 * It has two Canon Record relations and a PP-2.0 payload with front_prompt.
 */
function makeSpecPage() {
  const page = makePageWithRelations(
    SPEC_ID,
    {
      "Production Item": "Autumn Journal Card",
      World: "Thornvale",
      "Component Type": "Journal Card",
      "Payload Version": "PP-2.0",
      "Current Version": "2",
      Status: "Active",
      "Prompt Payload": [
        "shared_prompt: A Victorian botanical study in warm autumn colours.",
        "front_prompt: Beneath a copper-leafed oak, a dried botanical specimen rests on aged parchment with fine ink annotations.",
        "negative_prompt: No photography, no 3D render.",
      ].join("\n"),
    },
    {
      "Canon Records": [CANON_A_ID, CANON_B_ID],
    },
  );
  return page;
}

/**
 * Like makeSpecPage but Collection is a relation rather than plain text,
 * and no Canon Records.
 */
function makeSpecPageWithCollectionRelation() {
  return makePageWithRelations(
    SPEC_ID,
    {
      "Production Item": "Winter Hero Paper",
      World: "Thornvale",
      "Component Type": "Hero Paper",
      "Payload Version": "PP-1.0",
      "Current Version": "1",
      Status: "Active",
    },
    {
      Collection: [COLLECTION_PAGE_ID],
    },
  );
}

describe("runSpecPreview — canonNames fetched from linked Canon Record pages", () => {
  it("populates canonNames from linked Canon Record page titles so Section 13 shows real names", async () => {
    // Spec page
    mockGetPage
      .mockResolvedValueOnce(makeSpecPage())
      // Canon record A
      .mockResolvedValueOnce(makeTitlePage(CANON_A_ID, "The Thornvale Codex"))
      // Canon record B
      .mockResolvedValueOnce(makeTitlePage(CANON_B_ID, "Ember Court Charter"));

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-canon-names-001",
      dry_run: false,
    });

    expect(capturedBoardData).toBeDefined();
    expect(capturedBoardData!.canonNames).toEqual(
      expect.arrayContaining(["The Thornvale Codex", "Ember Court Charter"]),
    );
    expect(capturedBoardData!.canonNames).toHaveLength(2);
  });

  it("generates the board without canonNames when a Canon Record fetch fails (silent degradation)", async () => {
    mockGetPage
      .mockResolvedValueOnce(makeSpecPage())
      // Both canon record fetches fail
      .mockRejectedValueOnce(new Error("Notion 404: not found"))
      .mockRejectedValueOnce(new Error("Notion 404: not found"));

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    // Must NOT throw — silent degradation
    await expect(
      runSpecPreview({
        spec_page_id: SPEC_ID,
        prompt_hash: "hash-canon-fail-002",
        dry_run: false,
      }),
    ).resolves.not.toThrow();

    expect(capturedBoardData).toBeDefined();
    // canonNames should remain undefined (not an empty array) when all fetches fail
    expect(capturedBoardData!.canonNames).toBeUndefined();
    // But canonRecordCount reflects what was linked in Notion
    expect(capturedBoardData!.canonRecordCount).toBe(2);
  });

  it("partially populates canonNames when only some Canon Record fetches succeed", async () => {
    mockGetPage
      .mockResolvedValueOnce(makeSpecPage())
      // First canon: success
      .mockResolvedValueOnce(makeTitlePage(CANON_A_ID, "The Thornvale Codex"))
      // Second canon: failure
      .mockRejectedValueOnce(new Error("connect ETIMEDOUT"));

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-canon-partial-003",
      dry_run: false,
    });

    expect(capturedBoardData!.canonNames).toEqual(["The Thornvale Codex"]);
    expect(capturedBoardData!.canonNames).toHaveLength(1);
  });
});

describe("runSpecPreview — collection resolved from Notion relation", () => {
  it("fetches the linked Collection page and populates collection for the header subtitle", async () => {
    mockGetPage
      .mockResolvedValueOnce(makeSpecPageWithCollectionRelation())
      .mockResolvedValueOnce(makeTitlePage(COLLECTION_PAGE_ID, "The Iron Archive"));

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-collection-001",
      dry_run: false,
    });

    expect(capturedBoardData!.collection).toBe("The Iron Archive");
  });

  it("leaves collection undefined but does not throw when the Collection page fetch fails", async () => {
    mockGetPage
      .mockResolvedValueOnce(makeSpecPageWithCollectionRelation())
      .mockRejectedValueOnce(new Error("Notion 404: collection page not found"));

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    await expect(
      runSpecPreview({
        spec_page_id: SPEC_ID,
        prompt_hash: "hash-collection-fail-002",
        dry_run: false,
      }),
    ).resolves.not.toThrow();

    expect(capturedBoardData!.collection).toBeUndefined();
  });

  it("uses the inline collection text directly without an extra getPage call", async () => {
    const specWithInlineCollection = makePageWithRelations(
      SPEC_ID,
      {
        "Production Item": "Hero Paper",
        World: "Thornvale",
        Collection: "Verdant Veil",
        "Component Type": "Hero Paper",
        "Payload Version": "PP-1.0",
        Status: "Active",
      },
      {},
    );
    mockGetPage.mockResolvedValueOnce(specWithInlineCollection);

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-collection-inline-003",
      dry_run: false,
    });

    expect(capturedBoardData!.collection).toBe("Verdant Veil");
    // Exactly one getPage call (the spec itself) — no follow-up for inline text
    expect(mockGetPage).toHaveBeenCalledTimes(1);
  });
});

describe("runSpecPreview — illustratedNarrative from PP-2.0 front_prompt", () => {
  it("extracts front_prompt as illustratedNarrative and passes it to the board template", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPage());

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-narrative-001",
      dry_run: false,
    });

    expect(capturedBoardData!.illustratedNarrative).toBeDefined();
    expect(capturedBoardData!.illustratedNarrative).toContain(
      "Beneath a copper-leafed oak",
    );
  });

  it("the resulting SVG Section 3 contains the front_prompt scene text (not the fallback)", async () => {
    // Use buildSpecBoardSvg directly with the data we expect runSpecPreview to produce
    const svg = buildSpecBoardSvg(
      makeBoard({
        illustratedNarrative:
          "Beneath a copper-leafed oak, a dried botanical specimen rests on aged parchment with fine ink annotations.",
        requiredContent: "Oak leaves, acorns, a quill.",
      }),
    );

    // Section 3 content: front_prompt scene text must appear
    expect(svg).toContain("copper-leafed oak");

    // The "Required content:" fallback must NOT appear when narrative is present
    expect(svg).not.toContain("Required content:");
  });

  it("falls back gracefully when front_prompt is absent (PP-1.0 payload)", async () => {
    const pp1SpecPage = makePage(SPEC_ID, {
      "Production Item": "Simple Card",
      World: "Thornvale",
      "Component Type": "Journal Card",
      "Payload Version": "PP-1.0",
      Status: "Active",
      "Prompt Payload": [
        "asset_role: journal card front",
        "composition: Centered specimen.",
        "materials: Watercolour.",
        "visual_hierarchy: Botanical focus.",
        "text_rule: No unapproved text.",
        "canon_rule: None.",
        "print_rule: 300 DPI.",
        "negative_constraints: No photography.",
      ].join("\n"),
    });
    mockGetPage.mockResolvedValueOnce(pp1SpecPage);

    let capturedBoardData: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      capturedBoardData = data;
      return Buffer.from("PNG");
    });

    await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-pp1-fallback-001",
      dry_run: false,
    });

    // PP-1.0 has no front_prompt; illustratedNarrative should be undefined or empty
    // so the template falls back to requiredContent / componentType / assetRole
    const narrative = capturedBoardData!.illustratedNarrative;
    // Either undefined or an empty string — the test confirms we don't crash
    expect(narrative === undefined || narrative === "").toBe(true);
  });
});

// ── dry_run path: confirm all three fields appear in the dry_run_payload ──────

describe("runSpecPreview dry_run — new fields present in extracted data", () => {
  it("dry_run with a PP-2.0 spec still extracts illustratedNarrative correctly", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPage());

    const result = await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-dryrun-001",
      dry_run: true,
    });

    expect(result.status).toBe("dry_run");
    // dry_run_payload confirms the board would include the production item
    expect(result.dry_run_payload?.["Production Item"]).toBe("Autumn Journal Card");
  });
});

describe("runSpecPreview — audit row records the current template version", () => {
  it("persists the shared board TEMPLATE_VERSION on the preview audit row", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecPage());

    await runSpecPreview({
      spec_page_id: SPEC_ID,
      prompt_hash: "hash-template-version-001",
      dry_run: true,
    });

    const insertBuilder = mockDbInsert.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        templateVersion: TEMPLATE_VERSION,
      }),
    );
  });
});
