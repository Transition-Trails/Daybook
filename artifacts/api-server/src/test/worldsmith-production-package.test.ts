import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type NextFunction, type Request, type Response } from "express";

const {
  packageRows,
  mockGenerateImage,
  mockUpload,
  mockAttach,
  mockUpdatePage,
  mockUpdateRun,
  mockSpecStatus,
  packageClaimAttempts,
} = vi.hoisted(() => ({
  packageRows: { value: [] as Array<Record<string, unknown>> },
  mockGenerateImage: vi.fn(),
  mockUpload: vi.fn(),
  mockAttach: vi.fn(),
  mockUpdatePage: vi.fn(),
  mockUpdateRun: vi.fn(),
  mockSpecStatus: { value: "Draft" },
  packageClaimAttempts: {
    value: 0,
    onAttempt: undefined as (() => void) | undefined,
  },
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
  const imageTargetsTable = {
    componentType: "component_type",
    printWidthIn: "print_width_in",
    printHeightIn: "print_height_in",
  };

  const firstRow = () => packageRows.value[0] ?? null;
  const chunkText = (chunk: unknown): string | undefined => {
    if (typeof chunk === "string") return chunk;
    if (
      typeof chunk === "object"
      && chunk !== null
      && "value" in chunk
      && Array.isArray(chunk.value)
      && chunk.value.every((value) => typeof value === "string")
    ) {
      return chunk.value.join("");
    }
    return undefined;
  };
  const matchesCondition = (condition: unknown, row: Record<string, unknown>): boolean => {
    const predicates: Array<{ column: string; values: unknown[] }> = [];
    const visit = (node: unknown) => {
      if (
        typeof node !== "object"
        || node === null
        || !("queryChunks" in node)
        || !Array.isArray(node.queryChunks)
      ) {
        return;
      }
      const chunks = node.queryChunks;
      const operatorIndex = chunks.findIndex((chunk) => {
        const text = chunkText(chunk)?.trim().toLowerCase();
        return text === "=" || text === "in";
      });
      if (operatorIndex > 0 && operatorIndex < chunks.length - 1) {
        const column = chunkText(chunks[operatorIndex - 1]);
        const value = chunks[operatorIndex + 1];
        if (column) {
          predicates.push({
            column,
            values: Array.isArray(value) ? value : [value],
          });
        }
      }
      chunks.forEach(visit);
    };
    visit(condition);
    return predicates.every(({ column, values }) => values.includes(row[column]));
  };

  return {
    worldsmithProductionPackagesTable: table,
    worldsmithImageTargetsTable: imageTargetsTable,
    worldsmithWorldsTable: { id: "world-id", name: "world-name" },
    storeMembersTable: { storeId: "store-id", userId: "user-id", role: "role" },
    fontsTable: {},
    palettesTable: {},
    storeFlagsTable: {},
    storesTable: {},
    worldsmithAssetsTable: {},
    worldsmithRunsTable: {},
    wsCanonRecordsTable: {},
    wsComponentSpecsTable: {},
    wsPromptModulesTable: {},
    wsStyleGuidesTable: {},
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
      select: vi.fn((fields: unknown) => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const isCatalogQuery = !!fields
                && typeof fields === "object"
                && "printWidthIn" in fields;
              if (isCatalogQuery) {
                return [{ printWidthIn: 12, printHeightIn: 12 }];
              }
              const row = firstRow();
              return row ? [{ ...row }] : [];
            },
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (patch: Record<string, unknown>) => ({
          where: (condition: unknown) => ({
            returning: async () => {
              const row = firstRow();
              if (!row) return [];
              if (patch.status === "generating") {
                packageClaimAttempts.value += 1;
                packageClaimAttempts.onAttempt?.();
              }
              if (!matchesCondition(condition, row)) return [];
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
  resolveImageGenerationMetadata: ({
    size = "1024x1024",
    quality = "medium",
  }: {
    size?: string;
    quality?: "low" | "medium" | "high" | "standard" | "hd";
  }) => ({
    provider: "replit_ai_integrations",
    model: "gpt-image-2",
    modelVersion: "2026-01",
    settings: {
      size,
      quality: quality === "standard" ? "medium" : quality === "hd" ? "high" : quality,
    },
  }),
}));

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn().mockResolvedValue("run-1"),
  updateRun: mockUpdateRun,
  failRun: vi.fn(),
  getRun: vi.fn(),
  getRunsBySpec: vi.fn().mockResolvedValue([]),
  failStaleRunsForSpec: vi.fn().mockResolvedValue(0),
}));

vi.mock("../lib/worldsmith/daybook-adapter.js", () => ({
  upsertAsset: vi.fn().mockResolvedValue({ asset_id: "daybook-asset-1" }),
  getAssetBySpec: vi.fn().mockResolvedValue(null),
  getAsset: vi.fn().mockResolvedValue(null),
  buildAssetId: vi.fn().mockReturnValue("WS-WYC-V01-HERO-MASTER"),
  buildFilename: vi.fn().mockReturnValue("WS-WYC-V01-HERO-MASTER.png"),
}));

vi.mock("../lib/worldsmith/inheritance-resolver.js", () => ({
  resolveInheritanceChain: vi.fn(),
  resolveInheritanceChainLocalWithWorldBible: vi.fn(async () => ({
    productionSpec: {
      sourceId: "spec-1",
      notionPageId: "spec-page-1",
      productionItem: "WorldSmith Hero",
      specId: "spec-1",
      componentType: "Hero Paper",
      world: "Thornvale",
      currentVersion: "1",
      designIntent: "A quiet woodland threshold.",
      narrativePurpose: "Set the opening tone.",
      requiredContent: "Mist and ferns.",
      reviewCriteria: "No modern objects.",
      payloadVersion: "PP-2.0",
      promptPayload: "shared_prompt: woodland threshold\nfront_prompt: mist and ferns\nnegative_prompt: no text",
      promptModuleIds: [],
      canonDependency: "None",
      canonRecordIds: [],
      status: mockSpecStatus.value,
      compiledPromptStatus: "Not Compiled",
      existingVisualAssetId: "visual-1",
    },
    promptModules: [],
    canonRecords: [],
    resolvedSourceIds: { production_spec: "spec-1", world: "world-1" },
    warnings: [],
  })),
  InheritanceError: class InheritanceError extends Error {},
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
import worldsmithRouter from "../routes/worldsmith.js";

const initialLocalResolver = process.env.USE_LOCAL_RESOLVER;
const initialVisualAssetsDatabase = process.env.NOTION_VISUAL_ASSETS_DB_ID;

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
    mockSpecStatus.value = "Draft";
    packageClaimAttempts.value = 0;
    packageClaimAttempts.onAttempt = undefined;
    mockGenerateImage.mockResolvedValue({
      ...baseInput.generation,
      dataUrl: "data:image/png;base64,cHJvZHVjdGlvbi1hcnQ=",
    });
    mockUpload.mockResolvedValue("notion-upload-1");
    mockAttach.mockResolvedValue({});
    mockUpdatePage.mockResolvedValue({});
  });

  afterEach(() => {
    if (initialLocalResolver === undefined) delete process.env.USE_LOCAL_RESOLVER;
    else process.env.USE_LOCAL_RESOLVER = initialLocalResolver;
    if (initialVisualAssetsDatabase === undefined) delete process.env.NOTION_VISUAL_ASSETS_DB_ID;
    else process.env.NOTION_VISUAL_ASSETS_DB_ID = initialVisualAssetsDatabase;
  });

  function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      // Passport's type declaration uses a type predicate; the test shim only
      // needs to provide the runtime behavior expected by the role middleware.
      const authenticatedRequest = req as Request & {
        isAuthenticated: () => boolean;
        user: { platformRole: "super_admin" };
      };
      Object.defineProperty(authenticatedRequest, "isAuthenticated", { value: () => true });
      authenticatedRequest.user = { platformRole: "super_admin" };
      next();
    });
    app.use("/api", worldsmithRouter);
    return app;
  }

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

  it("blocks a failed-generation retry after approval withdrawal, then retries after approval is restored", async () => {
    process.env.USE_LOCAL_RESOLVER = "true";
    process.env.NOTION_VISUAL_ASSETS_DB_ID = "visual-assets-db";
    mockSpecStatus.value = "Approved";
    mockGenerateImage.mockRejectedValueOnce(new Error("provider temporarily unavailable"));

    const first = await request(makeApp())
      .post("/api/v1/production-packages")
      .send({ production_spec_id: "spec-1" });

    expect(first.status).toBe(200);
    expect(first.body.production_package).toMatchObject({
      status: "generation_failed",
      production_art_status: "not_started",
      error: "provider temporarily unavailable",
    });
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);

    mockSpecStatus.value = "In Review";
    const retry = await request(makeApp())
      .post("/api/v1/production-packages")
      .send({ production_spec_id: "spec-1" });

    expect(retry.status).toBe(422);
    expect(retry.body.error_code).toBe("FINAL_ARTWORK_APPROVAL_REQUIRED");
    expect(retry.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FINAL_ARTWORK_APPROVAL_REQUIRED" }),
      ]),
    );
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);

    mockSpecStatus.value = "Approved";
    const restoredRetry = await request(makeApp())
      .post("/api/v1/production-packages")
      .send({ production_spec_id: "spec-1" });

    expect(restoredRetry.status).toBe(200);
    expect(restoredRetry.body.production_package).toMatchObject({
      status: "success",
      production_art_status: "artwork_review",
      idempotent: false,
    });
    expect(packageRows.value).toHaveLength(1);
    expect(mockGenerateImage).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockAttach).toHaveBeenCalledTimes(1);
  });

  it("shares the failed package identity across concurrent restored retries and claims only one provider call", async () => {
    process.env.USE_LOCAL_RESOLVER = "true";
    process.env.NOTION_VISUAL_ASSETS_DB_ID = "visual-assets-db";
    mockSpecStatus.value = "Approved";
    mockGenerateImage.mockRejectedValueOnce(new Error("provider temporarily unavailable"));

    const failed = await request(makeApp())
      .post("/api/v1/production-packages")
      .send({ production_spec_id: "spec-1" });

    expect(failed.status).toBe(200);
    expect(failed.body.production_package).toMatchObject({
      status: "generation_failed",
      production_art_status: "not_started",
    });

    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const providerCanFinish = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const providerHasStarted = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const bothClaimsAttempted = new Promise<void>((resolve) => {
      packageClaimAttempts.onAttempt = () => {
        if (packageClaimAttempts.value === 2) resolve();
      };
    });
    mockGenerateImage.mockImplementationOnce(async () => {
      providerStarted();
      await providerCanFinish;
      return {
        ...baseInput.generation,
        dataUrl: "data:image/png;base64,cHJvZHVjdGlvbi1hcnQ=",
      };
    });

    const retryA = runFinalArtwork({ ...baseInput, runId: "run-concurrent-a" });
    const retryB = runFinalArtwork({ ...baseInput, runId: "run-concurrent-b" });
    const retries = Promise.all([retryA, retryB]);

    await providerHasStarted;
    await bothClaimsAttempted;
    releaseProvider();
    const [a, b] = await retries;

    expect(a).toEqual(
      expect.objectContaining({ id: packageRows.value[0]?.id }),
    );
    expect(b).toEqual(
      expect.objectContaining({ id: packageRows.value[0]?.id }),
    );
    expect(new Set([
      a.id,
      b.id,
    ]).size).toBe(1);
    expect([
      a.status,
      b.status,
    ].sort()).toEqual(["in_progress", "success"]);
    expect(packageClaimAttempts.value).toBe(2);
    expect(mockGenerateImage).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockAttach).toHaveBeenCalledTimes(1);
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

  it("retries an existing Notion upload without regenerating provider artwork", async () => {
    mockAttach.mockRejectedValueOnce(new Error("Notion attach failed"));

    const first = await runFinalArtwork(baseInput);
    const second = await runFinalArtwork({ ...baseInput, runId: "run-retry" });

    expect(first).toMatchObject({
      status: "upload_failed",
      notion_upload_id: "notion-upload-1",
    });
    expect(second).toMatchObject({
      status: "success",
      idempotent: true,
      notion_upload_id: "notion-upload-1",
    });
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockAttach).toHaveBeenCalledTimes(2);
    expect(mockUpdatePage).toHaveBeenCalledTimes(1);
  });

  it("rejects an unapproved production package at the HTTP route before calling the provider", async () => {
    process.env.USE_LOCAL_RESOLVER = "true";
    mockSpecStatus.value = "In Review";

    const res = await request(makeApp())
      .post("/api/v1/production-packages")
      .send({ production_spec_id: "spec-1" });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("FINAL_ARTWORK_APPROVAL_REQUIRED");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FINAL_ARTWORK_APPROVAL_REQUIRED" }),
      ]),
    );
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockAttach).not.toHaveBeenCalled();
  });

  it("finishes an uploaded-status retry after the board status changes without generating again", async () => {
    process.env.USE_LOCAL_RESOLVER = "true";
    process.env.NOTION_VISUAL_ASSETS_DB_ID = "visual-assets-db";
    mockSpecStatus.value = "Approved";

    let failFinalStatusOnce = true;
    mockUpdatePage.mockImplementation(async (_pageId: string, props: Record<string, unknown>) => {
      if (failFinalStatusOnce && props.Status === "Artwork Review") {
        failFinalStatusOnce = false;
        throw new Error("status write temporarily unavailable");
      }
      return {};
    });

    const first = await request(makeApp())
      .post("/api/v1/production-packages")
      .send({ production_spec_id: "spec-1" });

    expect(first.status).toBe(200);
    expect(first.body.production_package).toMatchObject({
      status: "uploaded_status_pending",
      notion_upload_id: "notion-upload-1",
    });
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);

    mockSpecStatus.value = "In Review";
    const retry = await request(makeApp())
      .post("/api/v1/production-packages")
      .send({ production_spec_id: "spec-1" });

    expect(retry.status).toBe(200);
    expect(retry.body.production_package).toMatchObject({
      status: "success",
      idempotent: true,
      notion_upload_id: "notion-upload-1",
    });
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockAttach).toHaveBeenCalledTimes(1);
  });
});