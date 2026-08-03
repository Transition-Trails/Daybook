/**
 * WorldSmith spec-preview-service — step 6b reference thumbnail compositing.
 *
 * Confirms that when a Style Guide Notion page carries 2 image file attachments,
 * `sharp.composite` is called with exactly 2 overlay inputs whose `left`/`top`
 * positions match REFERENCE_IMAGE_AREAS[0] and REFERENCE_IMAGE_AREAS[1] (each
 * inset by the 2-pixel gutter the service applies).
 *
 * Strategy:
 *   - Mock `getPage` / `getPageText` to return a spec with a linked style guide
 *     that has 2 image file attachments (one internal Notion file, one external URL).
 *   - Stub global `fetch` so the image downloads return a small buffer.
 *   - Mock `sharp` so the resize/composite chain is fully captured without I/O.
 *   - Mock `renderSpecBoardToPng` (resvg) to return a dummy PNG.
 *   - Mock `callDallE` as a non-fatal rejection so step 6 is skipped cleanly.
 *   - Mock DB so no real rows are written.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted values (available in vi.mock factory closures) ────────────────────

const { mockGetPage, mockGetPageText, mockCompositeSpy, FAKE_PNG } = vi.hoisted(() => {
  // Minimal 64-byte buffer with PNG signature — enough to satisfy any length checks.
  const png = Buffer.alloc(64, 0);
  png[0] = 0x89; png[1] = 0x50; png[2] = 0x4e; png[3] = 0x47;
  png[4] = 0x0d; png[5] = 0x0a; png[6] = 0x1a; png[7] = 0x0a;
  return {
    mockGetPage:      vi.fn(),
    mockGetPageText:  vi.fn(),
    mockCompositeSpy: vi.fn(),
    FAKE_PNG:         png,
  };
});

// ── Mock sharp ────────────────────────────────────────────────────────────────
// Each sharp() call returns a chainable instance.  .composite() records its
// argument via mockCompositeSpy so tests can inspect it.

vi.mock("sharp", () => {
  function makeInst(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst: Record<string, any> = {};
    inst.resize    = vi.fn().mockReturnValue(inst);
    inst.png       = vi.fn().mockReturnValue(inst);
    inst.toBuffer  = vi.fn().mockResolvedValue(FAKE_PNG);
    inst.metadata  = vi.fn().mockResolvedValue({ width: 10, height: 10 });
    inst.composite = vi.fn().mockImplementation((overlays: unknown[]) => {
      mockCompositeSpy(overlays);
      return inst;
    });
    return inst;
  }
  const sharpFn = vi.fn().mockImplementation(() => makeInst());
  return { default: sharpFn };
});

// ── Mock spec-board-template ──────────────────────────────────────────────────
// Keep the real REFERENCE_IMAGE_AREAS (a pure computed constant); only stub the
// resvg-dependent renderSpecBoardToPng function.

vi.mock("../lib/worldsmith/spec-board-template.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/worldsmith/spec-board-template.js")>();
  return {
    ...actual,
    renderSpecBoardToPng: vi.fn().mockResolvedValue(FAKE_PNG),
  };
});

// ── Mock notion-client ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NP = any;

vi.mock("../lib/notion-client.js", () => ({
  getPage:                    mockGetPage,
  getPageText:                mockGetPageText,
  updatePage:                 vi.fn().mockResolvedValue(undefined),
  uploadFileToNotion:         vi.fn().mockResolvedValue("test-upload-id"),
  attachUploadToPageProperty: vi.fn().mockResolvedValue(undefined),
  selectProp:   (v: string) => ({ type: "select",     select:    { name: v } }),
  richTextProp: (v: string) => ({ type: "rich_text",  rich_text: [{ text: { content: v } }] }),
  extractTitle(prop: NP): string {
    if (!prop) return "";
    if (prop.type === "title")
      return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
    return "";
  },
  extractRichText(prop: NP): string {
    if (!prop) return "";
    if (prop.type === "rich_text")
      return (prop.rich_text ?? []).map((r: NP) => r.plain_text ?? "").join("");
    if (prop.type === "title")
      return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
    return "";
  },
  extractSelect(prop: NP): string {
    if (!prop) return "";
    if (prop.type === "select") return prop.select?.name ?? "";
    if (prop.type === "status") return prop.status?.name ?? "";
    return "";
  },
  extractRelation(prop: NP): string[] {
    if (!prop) return [];
    if (prop.type === "relation")
      return (prop.relation ?? []).map((r: NP) => r.id ?? "");
    return [];
  },
  extractNumber: (_prop: NP): undefined => undefined,
}));

// ── Mock ai-proxy (skip DALL-E so step 6 is a non-fatal no-op) ───────────────

vi.mock("../lib/ai-proxy.js", () => ({
  callDallE: vi.fn().mockRejectedValue(new Error("DALL-E disabled in test")),
}));

// ── Mock drizzle-orm operators (so passing stub table columns doesn't throw) ──

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq:   vi.fn().mockReturnValue({}),
    and:  vi.fn().mockReturnValue({}),
    desc: vi.fn().mockReturnValue({}),
  };
});

// ── Mock @workspace/db (no real Postgres calls) ───────────────────────────────

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            // No existing preview → idempotency gate passes
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
  worldsmithSpecPreviewsTable: {
    specPageId:       "specPageId",
    promptHash:       "promptHash",
    templateVersion:  "templateVersion",
    status:           "status",
    dryRun:           "dryRun",
    createdAt:        "createdAt",
  },
}));

// ── Mock logger ───────────────────────────────────────────────────────────────

vi.mock("../lib/logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// ── Imports (after all vi.mock declarations) ──────────────────────────────────

import { runSpecPreview } from "../lib/worldsmith/spec-preview-service.js";
import { REFERENCE_IMAGE_AREAS } from "../lib/worldsmith/spec-board-template.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPEC_PAGE_ID   = "spec-ref-thumb-test-001";
const STYLE_GUIDE_ID = "sg-ref-thumb-test-001";
const REF_URL_1      = "https://cdn.example.com/style-guide/mood-board.jpg";
const REF_URL_2      = "https://cdn.example.com/style-guide/colour-ref.jpeg";

function makeSpecPage() {
  return {
    id:  SPEC_PAGE_ID,
    url: `https://notion.so/${SPEC_PAGE_ID}`,
    properties: {
      "Production Item": {
        type:  "title",
        title: [{ plain_text: "Victorian Garden Cover" }],
      },
      "Component Type": {
        type:      "rich_text",
        rich_text: [{ plain_text: "Cover Art" }],
      },
      "Status": {
        type:   "select",
        select: { name: "In Review" },
      },
      // Links to the style guide page
      "Style Guide": {
        type:     "relation",
        relation: [{ id: STYLE_GUIDE_ID }],
      },
    },
  };
}

/** Style guide page with 2 image file attachments (one Notion-hosted, one external). */
function makeStyleGuidePage() {
  return {
    id:  STYLE_GUIDE_ID,
    url: `https://notion.so/${STYLE_GUIDE_ID}`,
    properties: {
      "Name": {
        type:  "title",
        title: [{ plain_text: "Victorian Garden Style Guide" }],
      },
      "Reference Images": {
        type:  "files",
        files: [
          { type: "file",     file:     { url: REF_URL_1 } },
          { type: "external", external: { url: REF_URL_2 } },
        ],
      },
    },
  };
}

/** Style guide page with NO image attachments. */
function makeStyleGuidePageNoImages() {
  return {
    id:  STYLE_GUIDE_ID,
    url: `https://notion.so/${STYLE_GUIDE_ID}`,
    properties: {
      "Name": {
        type:  "title",
        title: [{ plain_text: "Minimal Style Guide — Text Only" }],
      },
    },
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("spec-preview-service — step 6b: reference thumbnail compositing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default page mock sequence: spec page then style guide page
    mockGetPage.mockResolvedValueOnce(makeSpecPage());
    mockGetPage.mockResolvedValueOnce(makeStyleGuidePage());
    mockGetPageText.mockResolvedValue("");

    // Stub global fetch so image downloads return a minimal ArrayBuffer
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url === REF_URL_1 || url === REF_URL_2) {
          return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8),
          };
        }
        return { ok: false };
      }),
    );
  });

  it("calls sharp.composite exactly once with 2 overlay inputs", async () => {
    const result = await runSpecPreview({
      spec_page_id:  SPEC_PAGE_ID,
      prompt_hash:   "hash-ref-thumb-001",
    });

    // Run must succeed (step 6b failure would have reverted to finalPng unchanged)
    expect(result.status).toMatch(/^(success|upload_success_status_failed)$/);

    // The 6b composite call must have happened exactly once
    expect(mockCompositeSpy).toHaveBeenCalledOnce();

    const [composites] = mockCompositeSpy.mock.calls[0] as [
      Array<{ input: Buffer; left: number; top: number; blend: string }>,
    ];
    expect(composites).toHaveLength(2);
  });

  it("positions the 2 overlays at REFERENCE_IMAGE_AREAS[0] and REFERENCE_IMAGE_AREAS[1]", async () => {
    await runSpecPreview({
      spec_page_id: SPEC_PAGE_ID,
      prompt_hash:  "hash-ref-thumb-002",
    });

    expect(mockCompositeSpy).toHaveBeenCalledOnce();

    const [composites] = mockCompositeSpy.mock.calls[0] as [
      Array<{ input: Buffer; left: number; top: number; blend: string }>,
    ];

    const area0 = REFERENCE_IMAGE_AREAS[0]!;
    const area1 = REFERENCE_IMAGE_AREAS[1]!;

    // Sort by left so the assertion is order-independent (Promise.all push order
    // is non-deterministic when both fetches resolve at the same tick).
    const sorted = [...composites].sort((a, b) => a.left - b.left);

    expect(sorted[0]).toMatchObject({
      left:  area0.x + 2,
      top:   area0.y + 2,
      blend: "over",
    });
    expect(sorted[1]).toMatchObject({
      left:  area1.x + 2,
      top:   area1.y + 2,
      blend: "over",
    });
  });

  it("each composite input is a non-empty Buffer (the resized image)", async () => {
    await runSpecPreview({
      spec_page_id: SPEC_PAGE_ID,
      prompt_hash:  "hash-ref-thumb-003",
    });

    const [composites] = mockCompositeSpy.mock.calls[0] as [
      Array<{ input: Buffer; left: number; top: number }>,
    ];
    for (const c of composites) {
      expect(Buffer.isBuffer(c.input)).toBe(true);
      expect(c.input.length).toBeGreaterThan(0);
    }
  });

  it("skips the composite call when the style guide has no image attachments", async () => {
    // vi.clearAllMocks() does NOT flush mockResolvedValueOnce queues — use
    // mockReset() on getPage specifically so we can load a different page sequence.
    mockGetPage.mockReset();
    mockCompositeSpy.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    );
    mockGetPage.mockResolvedValueOnce(makeSpecPage());
    mockGetPage.mockResolvedValueOnce(makeStyleGuidePageNoImages());
    mockGetPageText.mockResolvedValue("");

    await runSpecPreview({
      spec_page_id: SPEC_PAGE_ID,
      prompt_hash:  "hash-ref-thumb-004",
    });

    // No reference images → composite must NOT be called
    expect(mockCompositeSpy).not.toHaveBeenCalled();
  });

  it("skips the composite call when fetch returns a non-ok response for all URLs", async () => {
    // Same queue-flush approach: reset only getPage so the Once queue is empty.
    mockGetPage.mockReset();
    mockCompositeSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    mockGetPage.mockResolvedValueOnce(makeSpecPage());
    mockGetPage.mockResolvedValueOnce(makeStyleGuidePage());
    mockGetPageText.mockResolvedValue("");

    // Must not throw (step 6b is non-fatal)
    await expect(
      runSpecPreview({ spec_page_id: SPEC_PAGE_ID, prompt_hash: "hash-ref-thumb-005" }),
    ).resolves.toBeDefined();

    // All downloads returned !ok → composites array stayed empty → no composite call
    expect(mockCompositeSpy).not.toHaveBeenCalled();
  });
});
