import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPage, mockGetPageText, mockDbRows } = vi.hoisted(() => ({
  mockGetPage: vi.fn(),
  mockGetPageText: vi.fn(),
  mockDbRows: { value: [] as unknown[][] },
}));

vi.mock("../lib/notion-client.js", () => {
  type Property = any;
  return {
    getPage: mockGetPage,
    getPageText: mockGetPageText,
    extractTitle: (prop: Property) => (prop?.title ?? prop?.rich_text ?? []).map((item: Property) => item.plain_text ?? "").join(""),
    extractRichText: (prop: Property) => (prop?.rich_text ?? prop?.title ?? []).map((item: Property) => item.plain_text ?? "").join(""),
    extractSelect: (prop: Property) => prop?.select?.name ?? "",
    extractRelation: (prop: Property) => (prop?.relation ?? []).map((item: Property) => item.id),
    extractNumber: (prop: Property) => prop?.number ?? undefined,
    extractUrl: (prop: Property) => prop?.url ?? undefined,
  };
});

vi.mock("@workspace/db", () => {
  const limit = vi.fn(() => Promise.resolve(mockDbRows.value.shift() ?? []));
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return {
    db: { select: vi.fn(() => ({ from })) },
    worldsmithWorldsTable: { id: "world-id" },
    wsCollectionsTable: { id: "collection-id" },
    wsVolumesTable: { id: "volume-id" },
    wsStyleGuidesTable: { id: "style-id" },
    wsComponentSpecsTable: { id: "component-id" },
    wsPromptModulesTable: { id: "module-id" },
    wsCanonRecordsTable: { id: "canon-id" },
    wsProductionSpecsTable: { id: "spec-id" },
  };
});

import {
  clearPageCache,
  resolveInheritanceChain,
  resolveInheritanceChainLocal,
} from "../lib/worldsmith/inheritance-resolver.js";
import { compilePrompt } from "../lib/worldsmith/prompt-compiler.js";
import { computePromptHash } from "../lib/worldsmith/prompt-hasher.js";

const IDS = {
  spec: "local-spec",
  notionSpec: "notion-spec",
  world: "world-1",
  collection: "collection-1",
  volume: "volume-1",
  style: "style-1",
  component: "component-1",
  module: "module-1",
  canon: "canon-1",
};

function richText(value: string) {
  return { type: "rich_text", rich_text: value ? [{ plain_text: value }] : [] };
}

function relation(ids: string[]) {
  return { type: "relation", relation: ids.map((id) => ({ id })) };
}

function notionPage(id: string, properties: Record<string, unknown>) {
  return { id, properties, url: `https://notion.so/${id}` };
}

function setLocalRows() {
  mockDbRows.value = [
    [{
      id: IDS.spec,
      notionPageId: IDS.notionSpec,
      worldId: IDS.world,
      collectionId: IDS.collection,
      volumeId: IDS.volume,
      productionItem: "Thornvale Hero Paper",
      specId: "TV-001",
      componentType: "Hero Paper",
      componentSet: null,
      heroFamily: null,
      currentVersion: "1",
      designIntent: "A quiet woodland threshold.",
      narrativePurpose: "Set the opening tone.",
      requiredContent: "Mist and ferns.",
      reviewCriteria: "No modern objects.",
      writingSpacePercent: null,
      orientation: null,
      frontBackStyle: null,
      canonDependency: "Canon Reference",
      canonRecordIds: [IDS.canon],
      payloadVersion: "PP-2.0",
      promptPayload: "shared_prompt: woodland\nnegative_prompt: no text",
      styleGuideId: IDS.style,
      componentSpecId: IDS.component,
      promptModuleIds: [IDS.module],
      status: "canon_clear",
      compiledPromptStatus: "Not Compiled",
    }],
    [{ id: IDS.world, name: "Thornvale" }],
    [{ id: IDS.collection, worldId: IDS.world, name: "The Verdant Folio" }],
    [{ id: IDS.volume, worldId: IDS.world, name: "Volume I" }],
    [{ id: IDS.style, worldId: IDS.world, notionPageId: "notion-style", name: "Thornvale Style", content: "Watercolour restraint." }],
    [{ id: IDS.component, worldId: IDS.world, notionPageId: "notion-component", name: "Hero Paper", content: "Full bleed.", componentType: "Hero Paper" }],
    [{ id: IDS.module, worldId: IDS.world, notionPageId: "notion-module", name: "Collection Motif", content: "Fern filigree.", dependencyIds: [] }],
    [{
      id: IDS.canon,
      worldId: IDS.world,
      notionPageId: "notion-canon",
      name: "The Quiet Gate",
      status: "accepted",
      narrativeDetails: "An old gate marks the border.",
      historicalContext: "It predates the village.",
      visualNotes: "Oxidized iron and wet stone.",
      emotionalRegister: "Withholding",
      sensoryClauses: "rain-dark iron; lichen-cold stone",
      notes: "Keep it distant.",
    }],
  ];
}

function setNotionPages() {
  const pages = new Map<string, ReturnType<typeof notionPage>>([
    [IDS.notionSpec, notionPage(IDS.notionSpec, {
      "Production Item": richText("Thornvale Hero Paper"),
      "Spec ID": richText("TV-001"),
      "Component Type": richText("Hero Paper"),
      World: relation([IDS.world]),
      Collection: relation([IDS.collection]),
      Volume: relation([IDS.volume]),
      "Current Version": richText("1"),
      "Design Intent": richText("A quiet woodland threshold."),
      "Narrative Purpose": richText("Set the opening tone."),
      "Required Content": richText("Mist and ferns."),
      "Review Criteria": richText("No modern objects."),
      "Payload Version": richText("PP-2.0"),
      "Prompt Payload": richText("shared_prompt: woodland\nnegative_prompt: no text"),
      "Style Guide": relation([IDS.style]),
      "Component Specification": relation([IDS.component]),
      "Prompt Modules": relation([IDS.module]),
      "Canon Dependency": { type: "select", select: { name: "Canon Reference" } },
      "Canon Records": relation([IDS.canon]),
      Status: richText("canon_clear"),
      "Compiled Prompt Status": richText("Not Compiled"),
    })],
    [IDS.world, notionPage(IDS.world, { Name: { type: "title", title: [{ plain_text: "Thornvale" }] } })],
    [IDS.collection, notionPage(IDS.collection, { Name: { type: "title", title: [{ plain_text: "The Verdant Folio" }] } })],
    [IDS.volume, notionPage(IDS.volume, { Name: { type: "title", title: [{ plain_text: "Volume I" }] } })],
    [IDS.style, notionPage(IDS.style, { Name: { type: "title", title: [{ plain_text: "Thornvale Style" }] } })],
    [IDS.component, notionPage(IDS.component, {
      Name: { type: "title", title: [{ plain_text: "Hero Paper" }] },
      "Component Type": richText("Hero Paper"),
    })],
    [IDS.module, notionPage(IDS.module, { Name: { type: "title", title: [{ plain_text: "Collection Motif" }] } })],
    [IDS.canon, notionPage(IDS.canon, {
      Name: { type: "title", title: [{ plain_text: "The Quiet Gate" }] },
      Status: { type: "select", select: { name: "accepted" } },
    })],
  ]);
  mockGetPage.mockImplementation((id: string) => Promise.resolve(pages.get(id)));
  mockGetPageText.mockImplementation((id: string) => Promise.resolve({
    [IDS.style]: "Watercolour restraint.",
    [IDS.component]: "Full bleed.",
    [IDS.module]: "Fern filigree.",
  }[id] ?? ""));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPageCache();
  setLocalRows();
  setNotionPages();
});

describe("resolveInheritanceChainLocal", () => {
  it("returns the same compiler-facing chain as the represented Notion spec", async () => {
    const [local, notion] = await Promise.all([
      resolveInheritanceChainLocal(IDS.spec),
      resolveInheritanceChain(IDS.notionSpec),
    ]);

    expect(local.productionSpec).toMatchObject({
      productionItem: notion.productionSpec.productionItem,
      specId: notion.productionSpec.specId,
      componentType: notion.productionSpec.componentType,
      world: notion.productionSpec.world,
      collection: notion.productionSpec.collection,
      volume: notion.productionSpec.volume,
      promptPayload: notion.productionSpec.promptPayload,
      canonDependency: notion.productionSpec.canonDependency,
    });
    expect(local.styleGuide?.content).toBe(notion.styleGuide?.content);
    expect(local.componentSpec?.content).toBe(notion.componentSpec?.content);
    expect(local.promptModules.map((module) => module.content)).toEqual(notion.promptModules.map((module) => module.content));
    expect(local.canonRecords.map(({ name, status }) => ({ name, status })))
      .toEqual(notion.canonRecords.map(({ name, status }) => ({ name, status })));
    expect(local.productionSpec.sourceId).toBe(IDS.spec);
    expect(local.productionSpec.notionPageId).toBe(IDS.notionSpec);
  });

  it("renders authored canon bodies in CANON POLICY and changes the prompt hash", async () => {
    const chain = await resolveInheritanceChainLocal(IDS.spec);
    const payload = {
      shared_prompt: "A quiet threshold in rain.",
      negative_prompt: "no text",
    };
    const compiled = compilePrompt(chain, payload);
    const changedRegister = {
      ...chain,
      canonRecords: chain.canonRecords.map((record) => ({
        ...record,
        emotionalRegister: "Trespass",
      })),
    };
    const changedCompiled = compilePrompt(changedRegister, payload);
    const hash = computePromptHash({
      payload_version: chain.productionSpec.payloadVersion,
      compiled_prompt: compiled.fullPrompt,
      negative_prompt: compiled.negativePrompt,
    });
    const changedHash = computePromptHash({
      payload_version: changedRegister.productionSpec.payloadVersion,
      compiled_prompt: changedCompiled.fullPrompt,
      negative_prompt: changedCompiled.negativePrompt,
    });

    expect(compiled.fullPrompt).toContain("[CANON POLICY]");
    expect(compiled.fullPrompt).toContain("Emotional Register: Withholding");
    expect(compiled.fullPrompt).toContain("Sensory Clauses: rain-dark iron; lichen-cold stone");
    expect(compiled.fullPrompt).toContain("Narrative Details: An old gate marks the border.");
    expect(changedCompiled.fullPrompt).toContain("Emotional Register: Trespass");
    expect(changedHash).not.toBe(hash);
  });
});