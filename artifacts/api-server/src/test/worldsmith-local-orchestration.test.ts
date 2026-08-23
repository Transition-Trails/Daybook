import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDbBibleRows,
  mockDbBibleError,
  mockLocalResolver,
  mockNotionGetPage,
  mockNotionUpdatePage,
  mockDaybookUpsert,
} = vi.hoisted(() => ({
  mockDbBibleRows: { value: [] as unknown[][] },
  mockDbBibleError: { value: "" },
  mockLocalResolver: vi.fn(),
  mockNotionGetPage: vi.fn(),
  mockNotionUpdatePage: vi.fn(),
  mockDaybookUpsert: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const limit = vi.fn(() => {
    if (mockDbBibleError.value) return Promise.reject(new Error(mockDbBibleError.value));
    return Promise.resolve(mockDbBibleRows.value.shift() ?? []);
  });
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return {
    db: { select: vi.fn(() => ({ from })) },
    worldsmithWorldsTable: { id: "world-id" },
  };
});

vi.mock("../lib/worldsmith/inheritance-resolver.js", () => ({
  resolveInheritanceChain: vi.fn(),
  resolveInheritanceChainLocal: mockLocalResolver,
  InheritanceError: class InheritanceError extends Error {
    constructor(
      message: string,
      public readonly stage: string,
      public readonly errorCode: string,
      public readonly retryable = false,
    ) {
      super(message);
    }
  },
}));

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn().mockResolvedValue("local-run"),
  updateRun: vi.fn().mockResolvedValue(undefined),
  failRun: vi.fn().mockResolvedValue(undefined),
  getRun: vi.fn(),
}));

vi.mock("../lib/worldsmith/daybook-adapter.js", () => ({
  buildAssetId: vi.fn().mockReturnValue("WS-TST-001"),
  buildFilename: vi.fn().mockReturnValue("test.pdf"),
  upsertAsset: mockDaybookUpsert,
  getAssetBySpec: vi.fn(),
}));

vi.mock("../lib/notion-client.js", () => ({
  _setOnRetry: vi.fn(),
  getPage: mockNotionGetPage,
  updatePage: mockNotionUpdatePage,
  createPage: vi.fn(),
  richTextProp: vi.fn(),
  selectProp: vi.fn(),
  relationProp: vi.fn(),
}));

import { isLocalResolverEnabled, runCompilation } from "../lib/worldsmith/orchestrator.js";

const originalNodeEnv = process.env.NODE_ENV;

const localChain = {
  productionSpec: {
    sourceId: "local-spec",
    productionItem: "Local Hero Paper",
    specId: "LOCAL-001",
    componentType: "Hero Paper",
    world: "Thornvale",
    worldId: "local-world",
    currentVersion: "1",
    designIntent: "A rain-softened woodland threshold.",
    narrativePurpose: "Set a quiet opening tone.",
    requiredContent: "Ferns and a weathered gate.",
    reviewCriteria: "No text.",
    payloadVersion: "PP-2.0",
    promptPayload: "shared_prompt: rain-dark woodland threshold\nfront_prompt: weathered gate in ferns\nnegative_prompt: no text",
    promptModuleIds: [],
    canonDependency: "None",
    canonRecordIds: [],
    status: "canon_clear",
    compiledPromptStatus: "Not Compiled",
  },
  promptModules: [],
  canonRecords: [],
  resolvedSourceIds: { production_spec: "local-spec", world: "local-world" },
  warnings: [],
};

describe("runCompilation with the local resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_LOCAL_RESOLVER = "true";
    delete process.env.NOTION_TOKEN;
    mockDbBibleRows.value = [[{
      visualPalette: "moss green",
      proseVoice: "quiet",
      atmosphericNotes: "rain",
      materialWorld: "iron",
      worldRules: [],
    }]];
    mockDbBibleError.value = "";
    mockLocalResolver.mockResolvedValue(localChain);
    mockNotionGetPage.mockRejectedValue(new Error("Notion must not be read for a local compile"));
  });

  afterEach(() => {
    delete process.env.USE_LOCAL_RESOLVER;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("defaults the local resolver on in development and off in production", () => {
    delete process.env.USE_LOCAL_RESOLVER;
    process.env.NODE_ENV = "development";
    expect(isLocalResolverEnabled()).toBe(true);
    process.env.NODE_ENV = "production";
    expect(isLocalResolverEnabled()).toBe(false);
  });

  it("compiles a local spec while the Notion client throws", async () => {
    const result = await runCompilation({
      production_spec_id: "local-spec",
      operation: "validate_and_compile",
      dry_run: true,
    });

    expect(result.status).toBe("compiled");
    expect(result.production_spec_id).toBe("local-spec");
    expect(mockLocalResolver).toHaveBeenCalledWith("local-spec");
    expect(mockNotionGetPage).not.toHaveBeenCalled();
  });

  it("blocks compilation when the local world ID has no World Bible record", async () => {
    mockDbBibleRows.value = [[]];

    const result = await runCompilation({
      production_spec_id: "local-spec",
      operation: "validate_and_compile",
      dry_run: true,
    });

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("WORLD_BIBLE_NOT_FOUND");
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "WORLD_BIBLE_NOT_FOUND",
        field: "world_bible",
      }),
    ]));
    expect(mockNotionGetPage).not.toHaveBeenCalled();
  });

  it("blocks compilation when the local World Bible query fails", async () => {
    mockDbBibleError.value = "database unavailable";

    const result = await runCompilation({
      production_spec_id: "local-spec",
      operation: "validate_and_compile",
      dry_run: true,
    });

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("WORLD_BIBLE_FETCH_ERROR");
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "WORLD_BIBLE_FETCH_ERROR" }),
    ]));
  });

  it("does not write unpublished local IDs to Notion or Daybook in a non-dry run", async () => {
    const result = await runCompilation({
      production_spec_id: "local-spec",
      operation: "validate_and_compile",
      dry_run: false,
    });

    expect(result.status).toBe("compiled");
    expect(mockNotionGetPage).not.toHaveBeenCalled();
    expect(mockNotionUpdatePage).not.toHaveBeenCalled();
    expect(mockDaybookUpsert).not.toHaveBeenCalled();
  });
});