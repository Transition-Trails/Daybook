import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbBibleRows, mockLocalResolver, mockNotionGetPage } = vi.hoisted(() => ({
  mockDbBibleRows: { value: [] as unknown[][] },
  mockLocalResolver: vi.fn(),
  mockNotionGetPage: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const limit = vi.fn(() => Promise.resolve(mockDbBibleRows.value.shift() ?? []));
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
  upsertAsset: vi.fn(),
  getAssetBySpec: vi.fn(),
}));

vi.mock("../lib/notion-client.js", () => ({
  _setOnRetry: vi.fn(),
  getPage: mockNotionGetPage,
  updatePage: vi.fn(),
  createPage: vi.fn(),
  richTextProp: vi.fn(),
  selectProp: vi.fn(),
  relationProp: vi.fn(),
}));

import { runCompilation } from "../lib/worldsmith/orchestrator.js";

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
    process.env.USE_LOCAL_RESOLVER = "true";
    delete process.env.NOTION_TOKEN;
    mockDbBibleRows.value = [[{
      visualPalette: "moss green",
      proseVoice: "quiet",
      atmosphericNotes: "rain",
      materialWorld: "iron",
      worldRules: [],
    }]];
    mockLocalResolver.mockResolvedValue(localChain);
    mockNotionGetPage.mockRejectedValue(new Error("Notion must not be read for a local compile"));
  });

  afterEach(() => {
    delete process.env.USE_LOCAL_RESOLVER;
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
});