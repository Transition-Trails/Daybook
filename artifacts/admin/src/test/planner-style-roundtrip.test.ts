/**
 * Round-trip test: BuildState font/style fields → style patch → templateToBuildState
 *
 * Verifies that all four font roles, backgroundId, binding, and paperColour
 * survive a full save-then-restore cycle without data loss or mutation.
 * Existing drafts without font data must open cleanly (no crash, safe defaults).
 */
import { describe, it, expect } from "vitest";
import {
  templateToBuildState,
  buildStateToStylePatch,
  DEFAULT_BUILD,
  type PlatformPlannerConfig,
} from "@/pages/studios/PlannerStudioHub";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTemplate(style: Record<string, unknown>): PlatformPlannerConfig {
  return {
    id:            "tpl-test",
    name:          "Test template",
    status:        "draft",
    productType:   "planner",
    editionId:     null,
    generatedAt:   null,
    drive:         { pdfFileId: null, configFileId: null },
    setup: {
      weekStart:   "mon",
      orientation: "vertical",
      startMonth:  0,
      startYear:   2027,
      monthCount:  12,
      datingMode:  "dated",
    },
    style,
    output: { calMode: "none", eventMins: 60, aiInPdf: false },
  } as unknown as PlatformPlannerConfig;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("planner style round-trip", () => {
  it("restores all four font roles from a saved draft", () => {
    const savedStyle = {
      themeId:   "theme-a",
      paletteId: "pal-b",
      tabPos:    "right",
      sections:  ["Goals", "Notes"],
      packIds:   ["pack-1"],
      insertIds: [],
      fonts: {
        heading:    "Playfair Display",
        subheading: "Lora",
        script:     "Cormorant Garamond",
        accent:     "DM Serif Display",
      },
    };

    const tpl   = makeTemplate(savedStyle);
    const state = templateToBuildState(tpl);

    expect(state.headingFont).toBe("Playfair Display");
    expect(state.subheadingFont).toBe("Lora");
    expect(state.bodyFont).toBe("Cormorant Garamond");   // stored as script
    expect(state.accentFont).toBe("DM Serif Display");
  });

  it("round-trips fonts through buildStateToStylePatch → templateToBuildState", () => {
    const original = {
      headingFont:    "EB Garamond",
      subheadingFont: "Work Sans",
      bodyFont:       "Spectral",
      accentFont:     "Inter",
      backgroundId:   "bg-001",
      bindingType:    "coil",
      bindingFinish:  "rose-gold",
      paperColour:    "cream",
    };

    // Simulate the BuildCenter styleMut payload
    const patch = buildStateToStylePatch({
      themeId: "", paletteId: "", tabPos: "right",
      sections: [], packIds: [], insertIds: [],
      editionId: "", editionName: "", startYear: "2027", startMonth: "1",
      endYear: "2027", endMonth: "12", paperSize: "A5", weeklyType: "vertical",
      themeName: "", productIds: [], productType: "planner",
      datingMode: "dated", weekStart: "mon",
      ...original,
    });

    // The patch is then shallow-merged into existing style on the server.
    // Simulate that merge and restore.
    const tpl   = makeTemplate(patch as Record<string, unknown>);
    const state = templateToBuildState(tpl);

    expect(state.headingFont).toBe("EB Garamond");
    expect(state.subheadingFont).toBe("Work Sans");
    expect(state.bodyFont).toBe("Spectral");
    expect(state.accentFont).toBe("Inter");
    expect(state.backgroundId).toBe("bg-001");
    expect(state.bindingType).toBe("coil");
    expect(state.bindingFinish).toBe("rose-gold");
    expect(state.paperColour).toBe("cream");
  });

  it("opens an old draft with no font data without crashing", () => {
    const legacyStyle = { themeId: "theme-old", tabPos: "right", sections: [] };
    const tpl   = makeTemplate(legacyStyle);
    const state = templateToBuildState(tpl);

    // All font fields must default to empty string — never crash or undefined
    expect(state.headingFont).toBe("");
    expect(state.subheadingFont).toBe("");
    expect(state.bodyFont).toBe("");
    expect(state.accentFont).toBe("");
    expect(state.backgroundId).toBe("");
    expect(state.paperColour).toBe("white");
    expect(state.bindingType).toBe("coil");
    expect(state.bindingFinish).toBe("gold");
  });

  it("buildStateToStylePatch omits fonts key when all roles are empty", () => {
    const patch = buildStateToStylePatch({
      themeId: "t1", paletteId: "", tabPos: "right",
      sections: [], packIds: [], insertIds: [],
      editionId: "", editionName: "", startYear: "2027", startMonth: "1",
      endYear: "2027", endMonth: "12", paperSize: "A5", weeklyType: "vertical",
      themeName: "", productIds: [], productType: "planner",
      datingMode: "dated", weekStart: "mon",
      headingFont: "", subheadingFont: "", bodyFont: "", accentFont: "",
      backgroundId: "", bindingType: "coil", bindingFinish: "gold", paperColour: "white",
    });

    expect((patch as any).fonts).toBeUndefined();
  });

  it("BuildCenter save does not overwrite PaperCompose binding/paperColour choices", () => {
    // Simulate a template that already has custom binding/paperColour saved
    // by a prior PaperCompose interaction.
    const persistedStyle = {
      themeId:     "theme-a",
      paletteId:   "",
      tabPos:      "right",
      sections:    [],
      packIds:     [],
      insertIds:   [],
      binding:     { type: "twin-loop", finish: "rose-gold" },
      paperColour: "cream",
    };
    const savedSt = persistedStyle as any;

    // Simulate what BuildCenter.styleMut now does: carry forward saved binding/paperColour.
    const patch = buildStateToStylePatch({
      ...DEFAULT_BUILD,
      themeId: "theme-b",   // user just switched theme
      paletteId: "pal-2",
      tabPos: "right", sections: [], packIds: [], insertIds: [],
      headingFont: "Lora", subheadingFont: "", bodyFont: "", accentFont: "",
      backgroundId: "",
      // These are the lines that matter — read from saved style, NOT DEFAULT_BUILD
      bindingType:   (savedSt?.binding as any)?.type   ?? DEFAULT_BUILD.bindingType,
      bindingFinish: (savedSt?.binding as any)?.finish  ?? DEFAULT_BUILD.bindingFinish,
      paperColour:   savedSt?.paperColour               ?? DEFAULT_BUILD.paperColour,
    });

    // The patch must carry forward the PaperCompose choices untouched
    expect((patch as any).binding).toEqual({ type: "twin-loop", finish: "rose-gold" });
    expect((patch as any).paperColour).toBe("cream");

    // And the new theme/font choices must also be present
    expect((patch as any).themeId).toBe("theme-b");
    expect((patch as any).fonts).toEqual({ heading: "Lora" });
  });

  it("buildStateToStylePatch includes only the populated font roles", () => {
    const patch = buildStateToStylePatch({
      themeId: "", paletteId: "", tabPos: "right",
      sections: [], packIds: [], insertIds: [],
      editionId: "", editionName: "", startYear: "2027", startMonth: "1",
      endYear: "2027", endMonth: "12", paperSize: "A5", weeklyType: "vertical",
      themeName: "", productIds: [], productType: "planner",
      datingMode: "dated", weekStart: "mon",
      headingFont: "Lora", subheadingFont: "", bodyFont: "", accentFont: "",
      backgroundId: "", bindingType: "coil", bindingFinish: "gold", paperColour: "white",
    });

    expect((patch as any).fonts).toEqual({ heading: "Lora" });
  });
});
