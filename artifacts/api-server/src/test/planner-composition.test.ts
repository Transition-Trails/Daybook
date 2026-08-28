import { describe, expect, it } from "vitest";
import {
  InvalidPlannerCompositionError,
  placementAppliesToPage,
  validateCompositionTargets,
  validatePlannerComposition,
} from "../lib/planner-composition";
import { buildPreviewPdf } from "../lib/pdf-generator";
import { generatePageIds } from "../lib/pdf-generator";
import { getPlannerPageCounts } from "@workspace/db/planner-pages";

const placement = {
  id: "placement-1",
  widgetId: "widget-1",
  pageType: "daily",
  pageIndex: 2,
  x: 0.1,
  y: 0.12,
  w: 0.3,
  h: 0.2,
  scope: "page" as const,
};

describe("planner widget composition", () => {
  it.each([
    { weekStart: "mon" as const, startMonth: 0, startYear: 2027, monthCount: 1, sections: [] as string[], notePaper: "dot" as const },
    { weekStart: "sun" as const, startMonth: 11, startYear: 2027, monthCount: 2, sections: ["Goals", "Projects"], notePaper: "mixed" as const },
    { weekStart: "mon" as const, startMonth: 1, startYear: 2028, monthCount: 12, sections: ["Journal"], notePaper: "lined" as const },
  ])("keeps shared page counts aligned with generated export pages", (scenario) => {
    const setup = {
      weekStart: scenario.weekStart,
      orientation: "vertical" as const,
      startMonth: scenario.startMonth,
      startYear: scenario.startYear,
      monthCount: scenario.monthCount,
    };
    const style = { sections: scenario.sections, notePaper: scenario.notePaper };
    const counts = getPlannerPageCounts(setup, style);
    const ids = generatePageIds({
      setup,
      style,
      output: { calMode: "none", eventMins: 60, aiInPdf: false },
      sections: scenario.sections,
    });

    expect({
      cover: ids.cover ? 1 : 0,
      home: ids.home ? 1 : 0,
      year: ids.year ? 1 : 0,
      "month-divider": ids.monthDividers.length,
      "month-calendar": ids.monthCalendars.length,
      weekly: ids.weeklies.length,
      daily: ids.dailies.length,
      todo: ids.todo ? 1 : 0,
      notes: ids.notes ? 1 : 0,
      "section-divider": ids.sectionDividers.length,
      "note-paper": ids.notePaper.length,
    }).toEqual(counts);
  });

  it("accepts versioned placements inside the safe area", () => {
    expect(validatePlannerComposition({ version: 1, placements: [placement] })).toEqual({
      version: 1,
      placements: [placement],
    });
  });

  it("rejects placements that cross an unsafe page edge", () => {
    expect(() =>
      validatePlannerComposition({
        version: 1,
        placements: [{ ...placement, x: 0.01 }],
      }),
    ).toThrow(InvalidPlannerCompositionError);
  });

  it("applies current-page, matching-page, and range scopes explicitly", () => {
    expect(placementAppliesToPage(placement, "daily", 2)).toBe(true);
    expect(placementAppliesToPage(placement, "daily", 3)).toBe(false);
    expect(placementAppliesToPage({ ...placement, scope: "matching" }, "daily", 30)).toBe(true);
    expect(
      placementAppliesToPage(
        { ...placement, scope: "range", rangeStart: 3, rangeEnd: 5 },
        "daily",
        4,
      ),
    ).toBe(true);
    expect(
      placementAppliesToPage(
        { ...placement, scope: "range", rangeStart: 3, rangeEnd: 5 },
        "daily",
        6,
      ),
    ).toBe(false);
  });

  it("rejects malformed ranges and duplicate ids", () => {
    expect(() =>
      validatePlannerComposition({
        version: 1,
        placements: [
          { ...placement, scope: "range", rangeStart: 5, rangeEnd: 3 },
        ],
      }),
    ).toThrow("valid page range");
    expect(() =>
      validatePlannerComposition({
        version: 1,
        placements: [placement, { ...placement, widgetId: "widget-2" }],
      }),
    ).toThrow("unique id");
  });

  it("rejects page indexes that the configured planner will never generate", () => {
    expect(() => validateCompositionTargets(
      { version: 1, placements: [{ ...placement, pageIndex: 999 }] },
      { weekStart: "mon", orientation: "vertical", startMonth: 0, startYear: 2027, monthCount: 1 },
      { sections: [] },
    )).toThrow("generates no page at that index");
  });

  it("rejects ranges beyond the generated count with an actionable bound", () => {
    expect(() => validateCompositionTargets(
      {
        version: 1,
        placements: [{ ...placement, pageType: "cover", pageIndex: 0, scope: "range", rangeStart: 0, rangeEnd: 2 }],
      },
      { weekStart: "mon", orientation: "vertical", startMonth: 0, startYear: 2027, monthCount: 1 },
      { sections: [] },
    )).toThrow("indexed 0 through 0");
  });

  it("accepts all three mixed note-paper pages", () => {
    expect(() => validateCompositionTargets(
      { version: 1, placements: [{ ...placement, pageType: "note-paper", pageIndex: 2 }] },
      { weekStart: "mon", orientation: "vertical", startMonth: 0, startYear: 2027, monthCount: 1 },
      { notePaper: "mixed", sections: [] },
    )).not.toThrow();
  });

  it("renders a saved widget placement through the planner preview path", async () => {
    const result = await buildPreviewPdf(
      {
        setup: {
          weekStart: "mon",
          orientation: "vertical",
          startMonth: 0,
          startYear: 2027,
          monthCount: 1,
        },
        style: {
          renderStyle: "flat",
          composition: { version: 1, placements: [placement] },
        },
        output: { calMode: "none", eventMins: 60, aiInPdf: false },
        sections: [],
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [{
        id: "widget-1",
        name: "Test tracker",
        svgData: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="{{slot:accent}}"/></svg>',
      }],
    );

    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.buffer.byteLength).toBeGreaterThan(1_000);
  });

  it("fails preview explicitly when a visible placement has no renderable widget", async () => {
    await expect(buildPreviewPdf({
      setup: {
        weekStart: "mon",
        orientation: "vertical",
        startMonth: 0,
        startYear: 2027,
        monthCount: 1,
      },
      style: {
        renderStyle: "flat",
        composition: { version: 1, placements: [placement] },
      },
      output: { calMode: "none", eventMins: 60, aiInPdf: false },
      sections: [],
    })).rejects.toThrow("cannot be rendered");
  });
});
