/**
 * WorldSmith prompt compiler — World Bible field injection tests.
 *
 * Confirms that all four World Bible fields (visualPalette, proseVoice,
 * atmosphericNotes, materialWorld) reach the compiled prompt in the correct
 * order for both PP-2.0 (section-based) and PP-1.0 (legacy flat) paths.
 *
 * Also asserts:
 *   - worldRules is always the last section when populated.
 *   - null / undefined / whitespace-only Bible fields produce no section
 *     (no empty brackets in the fullPrompt output).
 *
 * Strategy:
 *   compilePrompt() is a pure function — no DB or Notion mocks are needed.
 *   Tests construct InheritanceChain + ParsedPayload directly and inspect
 *   the returned fullPrompt string and sectionRecords array.
 */

import { describe, it, expect } from "vitest";
import { compilePrompt } from "../lib/worldsmith/prompt-compiler.js";
import type { InheritanceChain, ParsedPayload, WorldBible } from "../lib/worldsmith/types.js";

// ── Shared fixture builders ────────────────────────────────────────────────────

/** Minimal production spec that satisfies the compiler without optional fields. */
function makeSpec(overrides: Partial<ReturnType<typeof baseSpec>> = {}) {
  return { ...baseSpec(), ...overrides };
}

function baseSpec() {
  return {
    notionPageId: "spec-test-001",
    productionItem: "Test Item",
    specId: "TEST-001",
    componentType: "Hero Paper",
    world: "Thornvale",
    currentVersion: "v1",
    designIntent: "evoke wonder",
    narrativePurpose: "scene setter",
    requiredContent: "foliage",
    reviewCriteria: "check margins",
    payloadVersion: "PP-2.0",
    promptPayload: "{}",
    promptModuleIds: [],
    canonDependency: "None" as const,
    canonRecordIds: [],
    status: "Ready to Compile",
    compiledPromptStatus: "Not Compiled",
  };
}

/** Minimal chain with no optional dependencies. */
function makeChain(bible?: WorldBible): InheritanceChain {
  return {
    productionSpec: makeSpec(),
    promptModules: [],
    canonRecords: [],
    resolvedSourceIds: {},
    warnings: [],
    worldBible: bible,
  };
}

/** PP-2.0 payload (shared_prompt present → new format). */
function pp2Payload(overrides: Partial<ParsedPayload> = {}): ParsedPayload {
  return {
    shared_prompt: "A misty forest glade at dawn.",
    front_prompt: "Close-up of dew-covered ferns.",
    negative_prompt: "no text, no people",
    ...overrides,
  };
}

/** PP-1.0 payload (shared_prompt absent → legacy format). */
function pp1Payload(overrides: Partial<ParsedPayload> = {}): ParsedPayload {
  return {
    asset_role: "background",
    composition: "full bleed botanical",
    materials: "watercolour on cotton paper",
    visual_hierarchy: "foliage dominant",
    text_rule: "no text",
    canon_rule: "canon reference",
    print_rule: "bleed to edge",
    negative_constraints: "no people",
    ...overrides,
  };
}

/** A full World Bible with all four descriptor fields and worldRules populated. */
const fullBible: WorldBible = {
  visualPalette: "Moss green, umber, pale gold — warm candlelight tones.",
  proseVoice: "Second person present tense, lyrical and unhurried.",
  atmosphericNotes: "Damp woodland air, distant birdsong, sense of discovery.",
  materialWorld: "Rough linen, hand-thrown pottery, beeswax candles.",
  worldRules: ["No anachronistic technology.", "No primary colours."],
};

// ── Helper: extract section-tag positions in fullPrompt ───────────────────────

/** Return the index at which a [TAG] first appears in the prompt, or -1. */
function tagIndex(prompt: string, tag: string): number {
  return prompt.indexOf(`[${tag}]`);
}

// ══════════════════════════════════════════════════════════════════════════════
// PP-2.0 (new section-based format)
// ══════════════════════════════════════════════════════════════════════════════

describe("compilePrompt (PP-2.0) — all four Bible fields present", () => {
  const result = compilePrompt(makeChain(fullBible), pp2Payload());

  it("keeps PP-2.0 shared/front content under accurately named compatibility keys", () => {
    expect(result.sections.shared_prompt).toBe("A misty forest glade at dawn.");
    expect(result.sections.front_prompt).toBe("Close-up of dew-covered ferns.");
    expect(result.sections.composition_and_content).toBe("");
    expect(result.sections.materials_and_lighting).toBe("");
  });

  it("fullPrompt contains [VISUAL PALETTE]", () => {
    expect(result.fullPrompt).toContain("[VISUAL PALETTE]");
    expect(result.fullPrompt).toContain(fullBible.visualPalette!);
  });

  it("fullPrompt contains [PROSE VOICE]", () => {
    expect(result.fullPrompt).toContain("[PROSE VOICE]");
    expect(result.fullPrompt).toContain(fullBible.proseVoice!);
  });

  it("fullPrompt contains [ATMOSPHERIC NOTES]", () => {
    expect(result.fullPrompt).toContain("[ATMOSPHERIC NOTES]");
    expect(result.fullPrompt).toContain(fullBible.atmosphericNotes!);
  });

  it("fullPrompt contains [MATERIAL WORLD]", () => {
    expect(result.fullPrompt).toContain("[MATERIAL WORLD]");
    expect(result.fullPrompt).toContain(fullBible.materialWorld!);
  });

  it("Bible fields appear after [WORLD AND COLLECTION CONTEXT]", () => {
    const worldIdx = tagIndex(result.fullPrompt, "WORLD AND COLLECTION CONTEXT");
    const vpIdx = tagIndex(result.fullPrompt, "VISUAL PALETTE");
    expect(worldIdx).toBeGreaterThanOrEqual(0);
    expect(vpIdx).toBeGreaterThan(worldIdx);
  });

  it("Bible fields appear before [STYLE SYSTEM]", () => {
    const vpIdx = tagIndex(result.fullPrompt, "VISUAL PALETTE");
    const styleIdx = tagIndex(result.fullPrompt, "STYLE SYSTEM");
    expect(vpIdx).toBeGreaterThanOrEqual(0);
    // Style System may be absent if no style guide — only assert ordering when present
    if (styleIdx !== -1) {
      expect(vpIdx).toBeLessThan(styleIdx);
    }
  });

  it("Bible fields are in order: Visual Palette → Prose Voice → Atmospheric Notes → Material World", () => {
    const vp = tagIndex(result.fullPrompt, "VISUAL PALETTE");
    const pv = tagIndex(result.fullPrompt, "PROSE VOICE");
    const an = tagIndex(result.fullPrompt, "ATMOSPHERIC NOTES");
    const mw = tagIndex(result.fullPrompt, "MATERIAL WORLD");
    expect(vp).toBeGreaterThanOrEqual(0);
    expect(pv).toBeGreaterThan(vp);
    expect(an).toBeGreaterThan(pv);
    expect(mw).toBeGreaterThan(an);
  });

  it("[WORLD RULES] is the last section in fullPrompt", () => {
    const wrIdx = tagIndex(result.fullPrompt, "WORLD RULES");
    expect(wrIdx).toBeGreaterThanOrEqual(0);
    // No other [TAG] should appear after WORLD RULES
    const afterRules = result.fullPrompt.slice(wrIdx + "[WORLD RULES]".length);
    expect(afterRules).not.toMatch(/\[[A-Z].*?\]/);
  });

  it("worldRules content is included in the [WORLD RULES] section", () => {
    expect(result.fullPrompt).toContain("No anachronistic technology.");
    expect(result.fullPrompt).toContain("No primary colours.");
  });

  it("sectionRecords includes an entry for each Bible field", () => {
    const keys = result.sectionRecords.map((r) => r.key);
    expect(keys).toContain("visual_palette");
    expect(keys).toContain("prose_voice");
    expect(keys).toContain("atmospheric_notes");
    expect(keys).toContain("material_world");
  });

  it("sectionRecords Bible entries have source='World Bible'", () => {
    const bibleKeys = ["visual_palette", "prose_voice", "atmospheric_notes", "material_world"];
    for (const key of bibleKeys) {
      const rec = result.sectionRecords.find((r) => r.key === key);
      expect(rec?.source).toBe("World Bible");
    }
  });

  it("isLegacyFormat is false", () => {
    expect(result.isLegacyFormat).toBe(false);
  });
});

describe("compilePrompt — explicit prompt-module section routing", () => {
  it("routes each module by section rather than title for PP-2.0 and PP-1.0", () => {
    const chain = makeChain();
    chain.promptModules = [
      {
        notionPageId: "module-style",
        name: "World Notes With a Misleading Name",
        section: "style",
        content: "EXPLICIT STYLE CONTENT",
        dependencies: [],
      },
      {
        notionPageId: "module-world",
        name: "Aesthetic Notes With a Misleading Name",
        section: "world",
        content: "EXPLICIT WORLD CONTENT",
        dependencies: [],
      },
      {
        notionPageId: "module-general",
        name: "Style World Display Name",
        section: "general",
        content: "EXPLICIT GENERAL CONTENT",
        dependencies: [],
      },
    ];

    for (const payload of [pp2Payload(), pp1Payload()]) {
      const result = compilePrompt(chain, payload);
      const world = result.sectionRecords.find(record => record.key === "world_and_collection_context");
      const style = result.sectionRecords.find(record => record.key === "style_system");
      const general = result.sectionRecords.find(record => record.key === "module_module-general");

      expect(world?.content).toContain("EXPLICIT WORLD CONTENT");
      expect(world?.content).not.toContain("EXPLICIT STYLE CONTENT");
      expect(style?.content).toContain("EXPLICIT STYLE CONTENT");
      expect(style?.content).not.toContain("EXPLICIT WORLD CONTENT");
      if (result.isLegacyFormat) {
        expect(result.fullPrompt).toContain("EXPLICIT GENERAL CONTENT");
      } else {
        expect(general?.content).toBe("EXPLICIT GENERAL CONTENT");
      }
    }
  });
});

// ── PP-2.0: null / undefined / whitespace fields omitted ─────────────────────

describe("compilePrompt (PP-2.0) — null/undefined Bible fields produce no section", () => {
  const sparseBible: WorldBible = {
    visualPalette: null,        // explicit null
    proseVoice: undefined,      // undefined
    atmosphericNotes: "  ",     // whitespace only
    materialWorld: "Rough linen.",
    worldRules: [],
  };

  const result = compilePrompt(makeChain(sparseBible), pp2Payload());

  it("fullPrompt does not contain [VISUAL PALETTE] when value is null", () => {
    expect(result.fullPrompt).not.toContain("[VISUAL PALETTE]");
  });

  it("fullPrompt does not contain [PROSE VOICE] when value is undefined", () => {
    expect(result.fullPrompt).not.toContain("[PROSE VOICE]");
  });

  it("fullPrompt does not contain [ATMOSPHERIC NOTES] when value is whitespace-only", () => {
    expect(result.fullPrompt).not.toContain("[ATMOSPHERIC NOTES]");
  });

  it("fullPrompt does contain [MATERIAL WORLD] when value is non-empty", () => {
    expect(result.fullPrompt).toContain("[MATERIAL WORLD]");
  });

  it("fullPrompt does not contain empty brackets (no [] remnants)", () => {
    // Match any [TAG] where inner content is only whitespace
    expect(result.fullPrompt).not.toMatch(/\[\s*\]/);
  });

  it("fullPrompt does not contain [WORLD RULES] when worldRules is empty", () => {
    expect(result.fullPrompt).not.toContain("[WORLD RULES]");
  });
});

// ── PP-2.0: no Bible at all ───────────────────────────────────────────────────

describe("compilePrompt (PP-2.0) — no worldBible on chain", () => {
  const result = compilePrompt(makeChain(undefined), pp2Payload());

  it("fullPrompt contains no Bible section tags", () => {
    expect(result.fullPrompt).not.toContain("[VISUAL PALETTE]");
    expect(result.fullPrompt).not.toContain("[PROSE VOICE]");
    expect(result.fullPrompt).not.toContain("[ATMOSPHERIC NOTES]");
    expect(result.fullPrompt).not.toContain("[MATERIAL WORLD]");
    expect(result.fullPrompt).not.toContain("[WORLD RULES]");
  });

  it("sectionRecords has no World Bible entries", () => {
    const bibleKeys = ["visual_palette", "prose_voice", "atmospheric_notes", "material_world", "world_rules"];
    for (const key of bibleKeys) {
      expect(result.sectionRecords.find((r) => r.key === key)).toBeUndefined();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PP-1.0 (legacy flat format)
// ══════════════════════════════════════════════════════════════════════════════

describe("compilePrompt (PP-1.0) — all four Bible fields present", () => {
  const result = compilePrompt(makeChain(fullBible), pp1Payload());

  it("fullPrompt contains [VISUAL PALETTE]", () => {
    expect(result.fullPrompt).toContain("[VISUAL PALETTE]");
    expect(result.fullPrompt).toContain(fullBible.visualPalette!);
  });

  it("fullPrompt contains [PROSE VOICE]", () => {
    expect(result.fullPrompt).toContain("[PROSE VOICE]");
    expect(result.fullPrompt).toContain(fullBible.proseVoice!);
  });

  it("fullPrompt contains [ATMOSPHERIC NOTES]", () => {
    expect(result.fullPrompt).toContain("[ATMOSPHERIC NOTES]");
    expect(result.fullPrompt).toContain(fullBible.atmosphericNotes!);
  });

  it("fullPrompt contains [MATERIAL WORLD]", () => {
    expect(result.fullPrompt).toContain("[MATERIAL WORLD]");
    expect(result.fullPrompt).toContain(fullBible.materialWorld!);
  });

  it("Bible fields appear immediately after [WORLD AND COLLECTION CONTEXT]", () => {
    const worldIdx = tagIndex(result.fullPrompt, "WORLD AND COLLECTION CONTEXT");
    const vpIdx = tagIndex(result.fullPrompt, "VISUAL PALETTE");
    expect(worldIdx).toBeGreaterThanOrEqual(0);
    expect(vpIdx).toBeGreaterThan(worldIdx);
    // Nothing else should appear between WORLD... and VISUAL PALETTE
    const between = result.fullPrompt.slice(
      worldIdx + "[WORLD AND COLLECTION CONTEXT]".length,
      vpIdx,
    );
    expect(between).not.toMatch(/\[[A-Z].*?\]/);
  });

  it("Bible fields are in order: Visual Palette → Prose Voice → Atmospheric Notes → Material World", () => {
    const vp = tagIndex(result.fullPrompt, "VISUAL PALETTE");
    const pv = tagIndex(result.fullPrompt, "PROSE VOICE");
    const an = tagIndex(result.fullPrompt, "ATMOSPHERIC NOTES");
    const mw = tagIndex(result.fullPrompt, "MATERIAL WORLD");
    expect(vp).toBeGreaterThanOrEqual(0);
    expect(pv).toBeGreaterThan(vp);
    expect(an).toBeGreaterThan(pv);
    expect(mw).toBeGreaterThan(an);
  });

  it("[WORLD RULES] is the last section in fullPrompt", () => {
    const wrIdx = tagIndex(result.fullPrompt, "WORLD RULES");
    expect(wrIdx).toBeGreaterThanOrEqual(0);
    const afterRules = result.fullPrompt.slice(wrIdx + "[WORLD RULES]".length);
    expect(afterRules).not.toMatch(/\[[A-Z].*?\]/);
  });

  it("worldRules content is included in the [WORLD RULES] section", () => {
    expect(result.fullPrompt).toContain("No anachronistic technology.");
    expect(result.fullPrompt).toContain("No primary colours.");
  });

  it("sectionRecords includes an entry for each Bible field", () => {
    const keys = result.sectionRecords.map((r) => r.key);
    expect(keys).toContain("visual_palette");
    expect(keys).toContain("prose_voice");
    expect(keys).toContain("atmospheric_notes");
    expect(keys).toContain("material_world");
  });

  it("sectionRecords Bible entries have source='World Bible'", () => {
    const bibleKeys = ["visual_palette", "prose_voice", "atmospheric_notes", "material_world"];
    for (const key of bibleKeys) {
      const rec = result.sectionRecords.find((r) => r.key === key);
      expect(rec?.source).toBe("World Bible");
    }
  });

  it("isLegacyFormat is true", () => {
    expect(result.isLegacyFormat).toBe(true);
  });
});

// ── PP-1.0: null / undefined / whitespace fields omitted ─────────────────────

describe("compilePrompt (PP-1.0) — null/undefined Bible fields produce no section", () => {
  const sparseBible: WorldBible = {
    visualPalette: null,
    proseVoice: undefined,
    atmosphericNotes: "   ",
    materialWorld: "Rough linen.",
    worldRules: [],
  };

  const result = compilePrompt(makeChain(sparseBible), pp1Payload());

  it("fullPrompt does not contain [VISUAL PALETTE] when value is null", () => {
    expect(result.fullPrompt).not.toContain("[VISUAL PALETTE]");
  });

  it("fullPrompt does not contain [PROSE VOICE] when value is undefined", () => {
    expect(result.fullPrompt).not.toContain("[PROSE VOICE]");
  });

  it("fullPrompt does not contain [ATMOSPHERIC NOTES] when value is whitespace-only", () => {
    expect(result.fullPrompt).not.toContain("[ATMOSPHERIC NOTES]");
  });

  it("fullPrompt does contain [MATERIAL WORLD] when value is non-empty", () => {
    expect(result.fullPrompt).toContain("[MATERIAL WORLD]");
  });

  it("fullPrompt does not contain empty brackets (no [] remnants)", () => {
    expect(result.fullPrompt).not.toMatch(/\[\s*\]/);
  });

  it("fullPrompt does not contain [WORLD RULES] when worldRules is empty", () => {
    expect(result.fullPrompt).not.toContain("[WORLD RULES]");
  });
});

// ── PP-1.0: no Bible at all ───────────────────────────────────────────────────

describe("compilePrompt (PP-1.0) — no worldBible on chain", () => {
  const result = compilePrompt(makeChain(undefined), pp1Payload());

  it("fullPrompt contains no Bible section tags", () => {
    expect(result.fullPrompt).not.toContain("[VISUAL PALETTE]");
    expect(result.fullPrompt).not.toContain("[PROSE VOICE]");
    expect(result.fullPrompt).not.toContain("[ATMOSPHERIC NOTES]");
    expect(result.fullPrompt).not.toContain("[MATERIAL WORLD]");
    expect(result.fullPrompt).not.toContain("[WORLD RULES]");
  });

  it("sectionRecords has no World Bible entries", () => {
    const bibleKeys = ["visual_palette", "prose_voice", "atmospheric_notes", "material_world", "world_rules"];
    for (const key of bibleKeys) {
      expect(result.sectionRecords.find((r) => r.key === key)).toBeUndefined();
    }
  });
});
