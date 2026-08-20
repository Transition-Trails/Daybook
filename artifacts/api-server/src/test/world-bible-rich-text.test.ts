import { describe, expect, it } from "vitest";
import { compilePrompt } from "../lib/worldsmith/prompt-compiler.js";
import { sanitizeWorldBibleRichText, worldBibleRichTextToPlainText } from "../lib/worldsmith/world-bible-rich-text.js";
import { computeReadinessScore } from "../routes/worldsmith-editorial.js";
import type { InheritanceChain, ParsedPayload } from "../lib/worldsmith/types.js";

function chainWithBible(visualPalette: string): InheritanceChain {
  return {
    productionSpec: {
      notionPageId: "spec-rich-text",
      productionItem: "Rich text test",
      specId: "RICH-001",
      componentType: "Hero paper",
      world: "Thornvale",
      currentVersion: "v1",
      designIntent: "evoke wonder",
      narrativePurpose: "scene setter",
      requiredContent: "foliage",
      reviewCriteria: "check margins",
      payloadVersion: "PP-2.0",
      promptPayload: "{}",
      promptModuleIds: [],
      canonDependency: "None",
      canonRecordIds: [],
      status: "Ready to Compile",
      compiledPromptStatus: "Not Compiled",
    },
    promptModules: [],
    canonRecords: [],
    resolvedSourceIds: {},
    warnings: [],
    worldBible: { visualPalette, worldRules: [] },
  };
}

const payload: ParsedPayload = {
  shared_prompt: "A misty forest glade at dawn.",
  front_prompt: "Close-up of dew-covered ferns.",
};

describe("World Bible rich text", () => {
  it("keeps only the small formatting subset and removes attributes or executable markup", () => {
    const sanitized = sanitizeWorldBibleRichText(
      `<p onclick="alert('no')"><strong>Moss green</strong> and <em>pale gold</em>.</p><script>alert("no")</script><a href="https://unsafe.example">link</a>`,
    );

    expect(sanitized).toBe("<p><strong>Moss green</strong> and <em>pale gold</em>.</p>link");
    expect(worldBibleRichTextToPlainText(sanitized)).toBe("Moss green and pale gold.\nlink");
  });

  it("uses World Bible formatting in the UI data but never sends its HTML to compiled prompts", () => {
    const richPalette = "<p><strong>Moss green</strong>, umber, and pale gold.</p><ul><li>Warm candlelight</li></ul>";
    const result = compilePrompt(chainWithBible(richPalette), payload);

    expect(result.fullPrompt).toContain("Moss green, umber, and pale gold.");
    expect(result.fullPrompt).toContain("Warm candlelight");
    expect(result.fullPrompt).not.toContain("<strong>");
    expect(result.fullPrompt).not.toContain("<ul>");
    expect(result.sectionRecords.find(section => section.key === "visual_palette")?.content)
      .toBe("Moss green, umber, and pale gold.\n\nWarm candlelight");
  });

  it("does not count a formatting-only editorial field as production-spec readiness", () => {
    const baseline = {
      productionItem: "Editorial readiness",
      componentType: "Hero Paper",
      worldId: "world-a",
      collectionId: "collection-a",
      designIntent: "",
      narrativePurpose: "Meaningful prose",
      requiredContent: "A fern",
      orientation: "portrait",
      payloadVersion: "PP-2.0",
      promptPayload: "shared_prompt: " + "x".repeat(40),
      canonDependency: "None",
      styleGuideId: "guide-a",
      componentSpecId: "component-a",
      promptModuleIds: ["module-a"],
      reviewCriteria: "Check margins",
      specId: "SPEC-1",
    };

    expect(computeReadinessScore({ ...baseline, designIntent: "<div><br></div>" } as any))
      .toBe(computeReadinessScore(baseline as any));
  });
});