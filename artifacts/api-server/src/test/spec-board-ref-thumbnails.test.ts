/**
 * WorldSmith spec-preview-service — direct Production Spec image output.
 *
 * Confirms that successful image generation prepares the generated image itself
 * for upload without restoring the retired board wrapper or detail crops.
 * Generation failures must fail closed instead of saving a placeholder.
 *
 * Strategy:
 *   - Mock `getPage` to return a minimal spec page.
 *   - Mock image generation to return a successful base64 PNG data URL.
 *   - Mock `sharp` so the resize/extract/composite chain is captured.
 *   - Mock `renderSpecBoardToPng` (resvg) to return a dummy PNG.
 *   - Mock DB so no real rows are written.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted values (available in vi.mock factory closures) ────────────────────

const { mockGetPage, mockGetPageText, mockCompositeSpy, mockGenerateImage, FAKE_PNG, FAKE_B64 } = vi.hoisted(() => {
  const png = Buffer.alloc(64, 0);
  png[0] = 0x89; png[1] = 0x50; png[2] = 0x4e; png[3] = 0x47;
  png[4] = 0x0d; png[5] = 0x0a; png[6] = 0x1a; png[7] = 0x0a;
  const b64 = `data:image/png;base64,${png.toString("base64")}`;
  return {
    mockGetPage:      vi.fn(),
    mockGetPageText:  vi.fn(),
    mockCompositeSpy: vi.fn(),
    mockGenerateImage: vi.fn().mockResolvedValue({
      dataUrl: b64,
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      settings: { size: "1024x1024", quality: "medium" },
    }),
    FAKE_PNG:         png,
    FAKE_B64:         b64,
  };
});

// ── Mock sharp ────────────────────────────────────────────────────────────────
// Each sharp() call returns a chainable instance.  .composite() records its
// argument via mockCompositeSpy so tests can inspect it.

vi.mock("sharp", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeInst(): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst: Record<string, any> = {};
    inst.resize    = vi.fn().mockReturnValue(inst);
    inst.extract   = vi.fn().mockReturnValue(inst);
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
// Keep the real crop geometry / destination-area constants;
// only stub the resvg-dependent renderSpecBoardToPng function.

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

// ── Mock shared image-generation core — success path ─────────────────────────
// mockGenerateImage is declared inside vi.hoisted() above so it is available when
// this vi.mock factory runs (vi.mock is hoisted before regular const declarations).

vi.mock("../lib/worldsmith/image-generation.js", () => ({
  resolveImageGenerationMetadata: (options?: { size?: string; quality?: string }) => ({
    provider: "replit_ai_integrations",
    model: "gpt-image-2",
    settings: { size: options?.size ?? "1024x1024", quality: options?.quality ?? "medium" },
  }),
  generateImage: mockGenerateImage,
}));

// ── Mock drizzle-orm operators ────────────────────────────────────────────────

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
    select: vi.fn((fields: unknown) => {
      const isCatalogQuery = !!fields && typeof fields === "object" && "printWidthIn" in fields;
      const limit = vi.fn().mockResolvedValue(
        isCatalogQuery ? [{ printWidthIn: 3, printHeightIn: 4 }] : [],
      );
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit }),
            limit,
          }),
        }),
      };
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
  worldsmithImageTargetsTable: { componentType: {}, printWidthIn: {}, printHeightIn: {} },
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPEC_PAGE_ID = "spec-detail-crop-test-001";

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
    },
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("spec-preview-service — direct generated-image output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateImage.mockResolvedValue({
      dataUrl: FAKE_B64,
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      settings: { size: "1024x1024", quality: "medium" },
    });

    mockGetPage.mockResolvedValue(makeSpecPage());
    mockGetPageText.mockResolvedValue("");
  });

  it("uploads a successful generated image without compositing a board wrapper or detail crops", async () => {
    const result = await runSpecPreview({
      spec_page_id: SPEC_PAGE_ID,
      prompt_hash:  "hash-direct-image-001",
    });

    expect(result.status).toMatch(/^(success|upload_success_status_failed)$/);
    expect(mockGenerateImage).toHaveBeenCalledOnce();
    expect(mockCompositeSpy).not.toHaveBeenCalled();
  });

  it("fails closed when image generation fails and never composites a placeholder", async () => {
    mockGenerateImage.mockRejectedValueOnce(new Error("Image generation disabled in test"));

    await expect(
      runSpecPreview({ spec_page_id: SPEC_PAGE_ID, prompt_hash: "hash-direct-image-002" }),
    ).rejects.toMatchObject({ code: "CONCEPT_IMAGE_GENERATION_FAILED" });
    expect(mockCompositeSpy).not.toHaveBeenCalled();
  });
});
