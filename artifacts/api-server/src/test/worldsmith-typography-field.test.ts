import { describe, expect, it } from "vitest";
import { compilePrompt } from "../lib/worldsmith/prompt-compiler.js";
import type { InheritanceChain, ParsedPayload } from "../lib/worldsmith/types.js";

const payload: ParsedPayload = {
  shared_prompt: "A quiet paper landscape",
  front_prompt: "Mosses at dawn",
  negative_prompt: "no lettering",
};

function chain(): InheritanceChain {
  return {
    productionSpec: {
      productionItem: "Test item",
      specId: "TEST-1",
      componentType: "Cover",
      world: "Thornvale",
      currentVersion: "1",
      designIntent: "",
      narrativePurpose: "",
      requiredContent: "",
      reviewCriteria: "",
      payloadVersion: "PP-2.0",
      promptPayload: "{}",
      promptModuleIds: [],
      canonDependency: "None",
      canonRecordIds: [],
      status: "Ready",
      compiledPromptStatus: "Not Compiled",
    },
    promptModules: [],
    canonRecords: [],
    resolvedSourceIds: {},
    warnings: [],
    worldBible: {
      visualPalette: "moss and parchment",
      typography: [{
        fontId: "font-lora",
        family: "Lora",
        roles: [{ role: "heading", weight: "700" }, { role: "body", weight: "400" }],
        // Legacy catalog metadata must not have a path into compiler output.
        variants: ["900 italic"],
        notes: "Handwritten customer note",
      } as unknown as { fontId: string; family: string; roles: Array<{ role: string; weight?: string }> }],
    },
  };
}

describe("structured WorldSmith typography", () => {
  it("compiles only family and curated roles, never variants or notes", () => {
    const result = compilePrompt(chain(), payload);

    expect(result.fullPrompt).toContain("[TYPOGRAPHY]");
    expect(result.fullPrompt).toContain("Lora — heading 700, body 400");
    expect(result.fullPrompt).not.toContain("900 italic");
    expect(result.fullPrompt).not.toContain("Handwritten customer note");
  });

  it("places typography immediately after the visual palette", () => {
    const result = compilePrompt(chain(), payload);
    const palette = result.fullPrompt.indexOf("[VISUAL PALETTE]");
    const typography = result.fullPrompt.indexOf("[TYPOGRAPHY]");

    expect(palette).toBeGreaterThan(-1);
    expect(typography).toBeGreaterThan(palette);
    expect(result.fullPrompt.slice(palette + "[VISUAL PALETTE]".length, typography)).not.toMatch(/\[[A-Z]/);
  });

  it("keeps unmatched legacy font metadata in storage but out of PP-1 and PP-2 prompts", () => {
    const withoutNotes = [
      "Daybook Font: Missing Family",
      "Curated roles: heading 900",
      "Available variants: 14",
    ].join("\n");
    const withoutVariants = [
      "Daybook Font: Missing Family",
      "Curated roles: heading 900",
      "Source notes: retain this for an editor to resolve",
    ].join("\n");
    const rolesOnly = [
      "Daybook Font: Missing Family",
      "Curated roles: heading 900",
    ].join("\n");
    const inherited = chain();
    inherited.worldBible!.visualPalette = `moss and parchment\n${withoutNotes}`;
    inherited.styleGuide = { name: "House style", content: withoutVariants };
    inherited.canonRecords = [{ name: "Lantern", status: "accepted", visualNotes: rolesOnly }];

    const pp1: ParsedPayload = {
      asset_role: "cover",
      composition: "single lantern",
      materials: "ink",
      visual_hierarchy: "",
      text_rule: "",
      canon_rule: "",
      print_rule: "",
      negative_constraints: "",
    };
    for (const promptPayload of [payload, pp1]) {
      const result = compilePrompt(inherited, promptPayload);
      expect(result.fullPrompt).toContain("moss and parchment");
      expect(result.fullPrompt).not.toContain("Missing Family");
      expect(result.fullPrompt).not.toContain("Available variants: 14");
      expect(result.fullPrompt).not.toContain("Source notes: retain this");
    }
  });

  it("strips legacy blocks from every inherited prose source in prompts and section records", () => {
    const legacyBlock = (family: string) => [
      `Daybook Font: ${family}`,
      "Curated roles: heading 700",
      "Available variants: 8",
      "Source notes: catalog-only metadata",
    ].join("\n");
    const proseWithLegacy = (label: string) =>
      `${label} survives\n${legacyBlock("Lora")}\n${legacyBlock("Missing Family")}`;
    const inherited = chain();
    inherited.worldBible = {
      visualPalette: proseWithLegacy("Palette"),
      proseVoice: proseWithLegacy("Voice"),
      atmosphericNotes: proseWithLegacy("Atmosphere"),
      materialWorld: proseWithLegacy("Materials"),
      worldRules: [proseWithLegacy("Rule")],
    };
    inherited.styleGuide = { name: "House style", content: proseWithLegacy("Style") };
    inherited.componentSpec = {
      name: "Cover requirements",
      componentType: "Cover",
      content: proseWithLegacy("Component"),
    };
    inherited.promptModules = [
      { notionPageId: "world-module", name: "World module", section: "world", content: proseWithLegacy("World module"), dependencies: [] },
      { notionPageId: "style-module", name: "Style module", section: "style", content: proseWithLegacy("Style module"), dependencies: [] },
      { notionPageId: "general-module", name: "General module", section: "general", content: proseWithLegacy("General module"), dependencies: [] },
    ];
    inherited.canonRecords = [{
      name: "Lantern",
      status: "accepted",
      narrativeDetails: proseWithLegacy("Narrative"),
      historicalContext: proseWithLegacy("History"),
      visualNotes: proseWithLegacy("Visual"),
      emotionalRegister: proseWithLegacy("Emotion"),
      sensoryClauses: proseWithLegacy("Sensory"),
      notes: proseWithLegacy("Notes"),
    }];
    const pp1: ParsedPayload = {
      asset_role: "cover",
      composition: "single lantern",
      materials: "ink",
      visual_hierarchy: "",
      text_rule: "",
      canon_rule: "",
      print_rule: "",
      negative_constraints: "",
    };

    for (const promptPayload of [payload, pp1]) {
      const result = compilePrompt(inherited, promptPayload);
      expect(result.fullPrompt).toContain("Narrative survives");
      expect(result.fullPrompt).toContain("General module survives");
      expect(result.fullPrompt).not.toContain("Daybook Font:");
      expect(result.fullPrompt).not.toContain("Available variants:");
      expect(result.fullPrompt).not.toContain("Source notes:");
      expect(result.sectionRecords.map((record) => record.content).join("\n")).not.toContain("Daybook Font:");
    }
  });
});