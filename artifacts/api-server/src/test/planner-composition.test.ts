import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import {
  InvalidPlannerCompositionError,
  containGeometryForBinding,
  layoutAppliesToPage,
  placementHiddenByLayout,
  placementAppliesToPage,
  resolvePlacementGeometry,
  validateCompositionTargets,
  validatePlannerComposition,
} from "../lib/planner-composition";
import { buildPdf, buildPreviewPdf, generatePageIds, selectPreviewPageIds } from "../lib/pdf-generator";
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

function pageContentBytes(document: PDFDocument, pageIndex: number): Buffer {
  const contents = document.getPage(pageIndex).node.Contents();
  const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return Buffer.concat(objects.map((object) => {
    const stream = document.context.lookup(object);
    return stream instanceof PDFRawStream ? Buffer.from(stream.getContents()) : Buffer.from(String(stream));
  }));
}

describe("planner widget composition", () => {
  it("reserves the binding edge without moving artwork already inside the gutter-safe area", () => {
    expect(containGeometryForBinding(
      { x: 0.06, y: 0.06, w: 0.88, h: 0.88 },
      "left",
    )).toEqual({ x: 0.1, y: 0.06, w: 0.84, h: 0.88 });
    const rightBound = containGeometryForBinding(
      { x: 0.06, y: 0.06, w: 0.88, h: 0.88 },
      "right",
    );
    expect(rightBound).toMatchObject({ x: 0.06, y: 0.06, h: 0.88 });
    expect(rightBound.w).toBeCloseTo(0.84, 12);
    expect(containGeometryForBinding(
      { x: 0.12, y: 0.2, w: 0.3, h: 0.2 },
      "left",
    )).toEqual({ x: 0.12, y: 0.2, w: 0.3, h: 0.2 });
  });

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

  it("accepts bounded version 2 layouts and resolves their scope", () => {
    const assignment = {
      id: "layout-assignment-1",
      pageType: "daily",
      pageIndex: 2,
      scope: "range" as const,
      rangeStart: 2,
      rangeEnd: 4,
      layout: {
        id: "starter-two-columns",
        name: "Two columns",
        sections: [
          { id: "left", x: 0.06, y: 0.06, w: 0.42, h: 0.88 },
          { id: "right", x: 0.52, y: 0.06, w: 0.42, h: 0.88 },
        ],
      },
    };
    const validated = validatePlannerComposition({ version: 2, placements: [], layouts: [assignment] });
    expect(validated.layouts).toEqual([assignment]);
    expect(layoutAppliesToPage(assignment, "daily", 3)).toBe(true);
    expect(layoutAppliesToPage(assignment, "daily", 5)).toBe(false);
    expect(resolvePlacementGeometry(placement, validated, "daily", 3))
      .toEqual(assignment.layout.sections[0]);
    expect(resolvePlacementGeometry(placement, validated, "daily", 5))
      .toEqual({ x: placement.x, y: placement.y, w: placement.w, h: placement.h });
  });

  it("rejects overlapping or unsafe layout sections", () => {
    const layout = {
      id: "layout-assignment-1",
      pageType: "daily",
      pageIndex: 0,
      scope: "page",
      layout: {
        id: "bad-layout",
        name: "Bad layout",
        sections: [
          { id: "a", x: 0.06, y: 0.06, w: 0.5, h: 0.5 },
          { id: "b", x: 0.5, y: 0.4, w: 0.3, h: 0.3 },
        ],
      },
    };
    expect(() => validatePlannerComposition({ version: 2, placements: [], layouts: [layout] }))
      .toThrow("cannot overlap");
    expect(() => validatePlannerComposition({
      version: 2,
      placements: [],
      layouts: [{ ...layout, layout: { ...layout.layout, sections: [{ id: "edge", x: 0.01, y: 0.06, w: 0.3, h: 0.3 }] } }],
    })).toThrow("safe margin");
  });

  it("keeps a one-section matching layout collision-safe on pages generated later", () => {
    const composition = validatePlannerComposition({
      version: 2,
      placements: [
        { ...placement, id: "kept", pageType: "daily", scope: "matching" },
        { ...placement, id: "hidden", widgetId: "widget-2", pageType: "daily", scope: "matching" },
      ],
      layouts: [{
        id: "all-daily",
        pageType: "daily",
        pageIndex: 0,
        scope: "matching",
        layout: {
          id: "one",
          name: "One",
          sections: [{ id: "only", x: 0.06, y: 0.06, w: 0.88, h: 0.88 }],
        },
        placementSections: { kept: "only" },
        hiddenPlacementIds: ["hidden"],
      }],
    });
    expect(resolvePlacementGeometry(composition.placements[0], composition, "daily", 500))
      .toEqual({ id: "only", x: 0.06, y: 0.06, w: 0.88, h: 0.88 });
    expect(placementHiddenByLayout(composition.placements[1], composition, "daily", 500)).toBe(true);
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

  it("copies a later repeated page from the export without changing its geometry or drawing stream", async () => {
    const config = {
      setup: {
        weekStart: "mon" as const,
        orientation: "landscape" as const,
        startMonth: 0,
        startYear: 2027,
        monthCount: 2,
      },
      style: {
        size: "A5" as const,
        renderStyle: "flat" as const,
        sections: ["Projects"],
        composition: {
          version: 1 as const,
          placements: [{
            ...placement,
            pageIndex: 40,
            settings: { label: "Later tracker", paletteSlot: "accent" as const, visible: true },
          }],
        },
      },
      output: { calMode: "none" as const, eventMins: 60 as const, aiInPdf: false },
      sections: ["Projects"],
    };
    const widgets = [{
      id: "widget-1",
      name: "Test tracker",
      svgData: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="{{slot:accent}}"/></svg>',
    }];
    const ids = generatePageIds(config);
    const selectedIds = selectPreviewPageIds(config);
    const targetId = ids.dailies[40];
    expect(selectedIds).toContain(targetId);

    const [exported, preview] = await Promise.all([
      buildPdf(config, ["#ffffff", "#172033", "#d2694f"], undefined, undefined, undefined, undefined, false, undefined, false, undefined, widgets),
      buildPreviewPdf(config, ["#ffffff", "#172033", "#d2694f"], undefined, undefined, undefined, undefined, undefined, widgets),
    ]);
    const exportDocument = await PDFDocument.load(exported.buffer);
    const previewDocument = await PDFDocument.load(preview.buffer);
    const exportIndex = [
      ids.cover, ids.home, ids.year,
      ...ids.monthDividers, ...ids.monthCalendars, ...ids.weeklies, ...ids.dailies,
      ids.todo, ids.notes, ...ids.sectionDividers, ...ids.notePaper,
    ].indexOf(targetId);
    const previewIndex = selectedIds.indexOf(targetId);

    expect(previewDocument.getPage(previewIndex).getSize()).toEqual(exportDocument.getPage(exportIndex).getSize());
    expect(pageContentBytes(previewDocument, previewIndex)).toEqual(pageContentBytes(exportDocument, exportIndex));
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
