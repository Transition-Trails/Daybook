import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLocalResolver,
  mockGetPage,
  mockUpdatePage,
  mockUpload,
  mockAttach,
  mockRenderBoard,
  mockDbSelect,
  mockDbInsert,
  mockStorageSave,
  MockInheritanceError,
} = vi.hoisted(() => {
  class MockInheritanceError extends Error {
    constructor(
      message: string,
      public readonly stage: string,
      public readonly errorCode: string,
      public readonly retryable = false,
    ) {
      super(message);
    }
  }
  return {
    mockLocalResolver: vi.fn(),
    mockGetPage: vi.fn(),
    mockUpdatePage: vi.fn(),
    mockUpload: vi.fn(),
    mockAttach: vi.fn(),
    mockRenderBoard: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
    mockStorageSave: vi.fn(),
    MockInheritanceError,
  };
});

vi.mock("@workspace/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert },
  worldsmithRunsTable: {},
  worldsmithSpecPreviewsTable: {},
}));

vi.mock("../lib/worldsmith/inheritance-resolver.js", () => ({
  resolveLocalPreviewContextWithWorldBible: mockLocalResolver,
  InheritanceError: MockInheritanceError,
}));

vi.mock("../lib/notion-client.js", () => ({
  getPage: mockGetPage,
  getPageText: vi.fn(),
  updatePage: mockUpdatePage,
  uploadFileToNotion: mockUpload,
  attachUploadToPageProperty: mockAttach,
  selectProp: vi.fn(),
  richTextProp: vi.fn(),
  extractTitle: (property: any) => property?.title?.map((item: any) => item.plain_text).join("") ?? "",
  extractRichText: (property: any) => property?.rich_text?.map((item: any) => item.plain_text).join("") ?? "",
  extractSelect: (property: any) => property?.select?.name ?? "",
  extractRelation: (property: any) => property?.relation?.map((item: any) => item.id) ?? [],
  extractNumber: (property: any) => property?.number,
}));

vi.mock("../lib/worldsmith/spec-board-template.js", () => ({
  TEMPLATE_VERSION: "test-v1",
  CONCEPT_IMAGE_AREA: { x: 0, y: 0, width: 1, height: 1 },
  DETAIL_CROP_SOURCE_RECTS: [],
  DETAIL_CROP_DEST_AREAS: [],
  renderSpecBoardToPng: mockRenderBoard,
}));

vi.mock("../lib/worldsmith/image-generation.js", () => ({
  resolveImageGenerationMetadata: vi.fn((options?: { size?: string; quality?: string }) => ({
    provider: "replit_ai_integrations",
    model: "gpt-image-2",
    settings: { size: options?.size ?? "1024x1024", quality: options?.quality ?? "medium" },
  })),
  generateImage: vi.fn().mockResolvedValue({
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    provider: "replit_ai_integrations",
    model: "gpt-image-2",
    settings: { size: "1024x1024", quality: "medium" },
  }),
}));

vi.mock("../lib/objectStorage.js", () => ({
  ObjectStorageService: class {
    getPrivateObjectDir() { return "/test-bucket/private"; }
  },
  objectStorageClient: {
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({ save: mockStorageSave })),
    })),
  },
}));

import {
  getLatestLocalSpecPreview,
  runSpecPreview,
} from "../lib/worldsmith/spec-preview-service.js";
import type { InheritanceChain, SpecBoardData } from "../lib/worldsmith/types.js";

const localChain: InheritanceChain = {
  productionSpec: {
    sourceId: "local-spec",
    productionItem: "Thornvale Hero Paper",
    specId: "TV-001",
    componentType: "Hero Paper",
    world: "Thornvale",
    worldId: "world-1",
    collection: "Verdant Folio",
    currentVersion: "1",
    designIntent: "A rain-softened woodland threshold.",
    narrativePurpose: "Set a quiet opening tone.",
    requiredContent: "Ferns and a weathered gate.",
    reviewCriteria: "No text.",
    payloadVersion: "PP-2.0",
    promptPayload: "shared_prompt: rain-dark woodland\nfront_prompt: weathered gate in ferns\nnegative_prompt: no text",
    promptModuleIds: [],
    canonDependency: "Canon Reference",
    canonRecordIds: ["canon-1"],
    status: "draft",
    compiledPromptStatus: "Not Compiled",
  },
  styleGuide: { sourceId: "style-1", name: "Thornvale Style", content: "Watercolour restraint." },
  componentSpec: { sourceId: "component-1", name: "Hero Paper", content: "Full bleed.", componentType: "Hero Paper" },
  promptModules: [],
  canonRecords: [{ sourceId: "canon-1", name: "The Quiet Gate", status: "accepted" }],
  resolvedSourceIds: { production_spec: "local-spec", world: "world-1" },
  warnings: [],
  worldBible: {
    visualPalette: "Moss green and rain-muted amber.",
    proseVoice: "Quiet and observant.",
    atmosphericNotes: "Rain gathers on iron.",
    materialWorld: "Oxidized iron and wet stone.",
    worldRules: ["No modern objects."],
  },
};

const compiledSections = [
  { key: "world_and_collection_context", label: "World And Collection Context", content: "World: Thornvale\nCompiled world context.", source: "Production Spec" },
  { key: "component_requirements", label: "Component Requirements", content: "Compiled component requirements.", source: "Component Spec" },
  { key: "canon_policy", label: "Canon Policy", content: "Compiled Quiet Gate canon policy.", source: "Canon Record" },
  { key: "front_prompt", label: "Front Prompt", content: "Compiled gate scene.", source: "Prompt Payload" },
  { key: "material_world", label: "Material World", content: "Compiled wet stone and iron.", source: "World Bible" },
  { key: "negative_prompt", label: "Negative Prompt", content: "Compiled no text.", source: "Prompt Payload" },
  { key: "print_and_output_requirements", label: "Print And Output Requirements", content: "Compiled print requirements.", source: "Production Spec" },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  mockLocalResolver.mockResolvedValue(localChain);
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ compiledSections }]),
        }),
      }),
    }),
  });
  mockDbInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  mockRenderBoard.mockResolvedValue(Buffer.from("PNG"));
});

describe("runSpecPreview with a local Editorial Suite Production Spec", () => {
  it("stores an unpublished local board from compiled records with World Bible grounding and no Notion writes", async () => {
    let renderedBoard: SpecBoardData | undefined;
    mockRenderBoard.mockImplementation(async (data: SpecBoardData) => {
      renderedBoard = data;
      return Buffer.from("PNG");
    });

    const result = await runSpecPreview({
      production_spec_id: "local-spec",
      prompt_hash: "local-preview-hash",
    });

    expect(result).toMatchObject({
      status: "success",
      source: "local",
      spec_page_id: "local-spec",
      upload_status: "skipped",
      preview_object_path: expect.stringMatching(/^\/objects\/worldsmith\/spec-previews\//),
      preview_url: expect.stringMatching(/^\/api\/storage\/objects\/worldsmith\/spec-previews\//),
    });
    expect(mockLocalResolver).toHaveBeenCalledWith("local-spec");
    expect(renderedBoard?.worldBible?.visualPalette).toContain("Moss green");
    expect(renderedBoard?.illustratedNarrative).toBe("Compiled gate scene.");
    expect(renderedBoard?.composition).toBe("Compiled gate scene.");
    expect(renderedBoard?.materials).toBe("Compiled wet stone and iron.");
    expect(renderedBoard?.negativeConstraints).toBe("Compiled no text.");
    expect(renderedBoard?.usesCompiledSections).toBe(true);
    expect(renderedBoard?.canonNames).toEqual(["Compiled Quiet Gate canon policy."]);
    expect(renderedBoard?.generationTarget).toMatchObject({
      size: "1808x1808",
      dpi: 150,
      requestedDpi: 150,
    });
    expect(mockGetPage).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockAttach).not.toHaveBeenCalled();
    expect(mockUpdatePage).not.toHaveBeenCalled();
    expect(mockStorageSave).toHaveBeenCalledWith(
      Buffer.from("PNG"),
      expect.objectContaining({ metadata: expect.objectContaining({ contentType: "image/png" }) }),
    );
  });

  it("returns World Bible grounding in the local dry-run payload", async () => {
    const result = await runSpecPreview({
      production_spec_id: "local-spec",
      prompt_hash: "local-preview-dry-run",
      dry_run: true,
    });

    expect(result.status).toBe("dry_run");
    expect(result.source).toBe("local");
    expect(result.dry_run_payload?.["World Bible"]).toContain("Moss green");
    expect(mockRenderBoard).not.toHaveBeenCalled();
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  it("rejects a local preview without matching compiled section records", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    await expect(runSpecPreview({
      production_spec_id: "local-spec",
      prompt_hash: "missing-compiled-hash",
    })).rejects.toMatchObject({ code: "COMPILED_SECTIONS_NOT_FOUND" });
    expect(mockRenderBoard).not.toHaveBeenCalled();
  });

  it("returns the persisted local board for a later editor session", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              productionItem: "Thornvale Hero Paper",
              previewFilename: "wm-spec-preview-thornvale.png",
              previewObjectPath: "/objects/worldsmith/spec-previews/existing.png",
              provider: "local",
              model: "spec-board",
              promptHash: "persisted-hash",
              previousStatus: "draft",
              newStatus: "draft",
            }]),
          }),
        }),
      }),
    });

    await expect(getLatestLocalSpecPreview("local-spec")).resolves.toMatchObject({
      source: "local",
      spec_page_id: "local-spec",
      preview_object_path: "/objects/worldsmith/spec-previews/existing.png",
      preview_url: "/api/storage/objects/worldsmith/spec-previews/existing.png",
      prompt_hash: "persisted-hash",
    });
  });
});