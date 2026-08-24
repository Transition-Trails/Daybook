import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  packageRows,
  mockGenerateImage,
  mockUpload,
  mockAttach,
  mockUpdatePage,
  mockUpdateRun,
} = vi.hoisted(() => ({
  packageRows: { value: [] as Array<Record<string, unknown>> },
  mockGenerateImage: vi.fn(),
  mockUpload: vi.fn(),
  mockAttach: vi.fn(),
  mockUpdatePage: vi.fn(),
  mockUpdateRun: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const table = {
    id: "id",
    productionSpecId: "production_spec_id",
    promptHash: "prompt_hash",
    provider: "provider",
    modelName: "model_name",
    modelVersion: "model_version",
    effectiveSize: "effective_size",
    quality: "quality",
    filename: "filename",
    visualAssetNotionId: "visual_asset_notion_id",
    notionUploadId: "notion_upload_id",
    providerRequestId: "provider_request_id",
    estimatedCostUsd: "estimated_cost_usd",
    actualCostUsd: "actual_cost_usd",
    status: "status",
    productionArtStatus: "production_art_status",
    error: "error",
    updatedAt: "updated_at",
  };

  const firstRow = () => packageRows.value[0] ?? null;
  return {
    worldsmithProductionPackagesTable: table,
    worldsmithWorldsTable: { id: "world-id", name: "world-name" },
    db: {
      insert: vi.fn(() => ({
        values: (value: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (firstRow()) return [];
              const row = {
                ...value,
                notionUploadId: null,
                providerRequestId: null,
                actualCostUsd: null,
                error: null,
              };
              packageRows.value.push(row);
              return [row];
            },
          }),
        }),
      })),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => firstRow() ? [firstRow()] : [],
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (patch: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              const row = firstRow();
              if (!row) return [];
              Object.assign(row, patch);
              return [row];
            },
          }),
        }),
      })),
    },
  };
});

vi.mock("../lib/ai-proxy.js", () => ({
  generateImage: mockGenerateImage,
}));

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn(),
  updateRun: mockUpdateRun,
  failRun: vi.fn(),
  getRun: vi.fn(),
}));

vi.mock("../lib/notion-client.js", () => ({
  _setOnRetry: vi.fn(),
  getPage: vi.fn(),
  updatePage: mockUpdatePage,
  createPage: vi.fn(),
  richTextProp: vi.fn((value: string) => value),
  selectProp: vi.fn((value: string) => value),
  relationProp: vi.fn(),
  uploadFileToNotion: mockUpload,
  attachUploadToPageProperty: mockAttach,
}));

import { runFinalArtwork } from "../lib/worldsmith/orchestrator.js";

const baseInput = {
  runId: "run-1",
  dryRun: false,
  productionSpecId: "spec-1",
  promptHash: "prompt-hash",
  compiledPrompt: "An archival botanical collage, no text.",
  filename: "WS-WYC-V01-HERO-MASTER.png",
  visualAssetNotionId: "visual-1",
  target: {
    size: "1440x1440",
    dpi: 150,
    printWidthIn: 12,
    printHeightIn: 12,
    orientation: "square" as const,
  },
  generation: {
    provider: "replit_ai_integrations" as const,
    model: "gpt-image-2",
    modelVersion: "2026-01",
    settings: { size: "1440x1440", quality: "medium" as const },
  },
};

describe("WorldSmith final production packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    packageRows.value = [];
    mockGenerateImage.mockResolvedValue({
      ...baseInput.generation,
      dataUrl: "data:image/png;base64,cHJvZHVjdGlvbi1hcnQ=",
    });
    mockUpload.mockResolvedValue("notion-upload-1");
    mockAttach.mockResolvedValue({});
    mockUpdatePage.mockResolvedValue({});
  });

  it("uploads once and returns the persisted final artwork for an identical retry", async () => {
    const first = await runFinalArtwork(baseInput);
    const second = await runFinalArtwork({ ...baseInput, runId: "run-2" });

    expect(first).toMatchObject({
      status: "success",
      production_art_status: "artwork_review",
      notion_upload_id: "notion-upload-1",
      effective_size: "1440x1440",
      quality: "medium",
      idempotent: false,
    });
    expect(second).toMatchObject({
      status: "success",
      idempotent: true,
      notion_upload_id: "notion-upload-1",
    });
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockAttach).toHaveBeenCalledTimes(1);
    expect(mockUpdatePage).toHaveBeenCalledWith("visual-1", {
      Status: "Artwork Review",
      "Next Action": "Review final artwork",
    });
  });

  it("reports a dry-run plan without calling the image provider or Notion", async () => {
    const result = await runFinalArtwork({ ...baseInput, dryRun: true });

    expect(result).toMatchObject({
      status: "dry_run",
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      effective_size: "1440x1440",
      quality: "medium",
      target: { dpi: 150, orientation: "square" },
    });
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockAttach).not.toHaveBeenCalled();
  });

  it("keeps a provider generation failure non-fatal and retryable", async () => {
    mockGenerateImage.mockRejectedValueOnce(new Error("provider temporarily unavailable"));

    const result = await runFinalArtwork(baseInput);

    expect(result).toMatchObject({
      status: "generation_failed",
      production_art_status: "not_started",
      error: "provider temporarily unavailable",
    });
    expect(result.fatal).toBeUndefined();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockAttach).not.toHaveBeenCalled();
    expect(mockUpdatePage).not.toHaveBeenCalled();
  });

  it("treats an upload failure as fatal and never advances final-art status", async () => {
    mockAttach.mockRejectedValueOnce(new Error("Notion attach failed"));

    const result = await runFinalArtwork(baseInput);

    expect(result).toMatchObject({
      status: "upload_failed",
      production_art_status: "not_started",
      fatal: true,
      error_code: "UPLOAD_FAILED",
      error: "Notion attach failed",
    });
    expect(mockUpload).toHaveBeenCalledTimes(1);
    // attachUploadToPageProperty is the artifact upload itself; final review
    // status is written only after that operation has succeeded.
    expect(mockUpdatePage).not.toHaveBeenCalled();
  });
});