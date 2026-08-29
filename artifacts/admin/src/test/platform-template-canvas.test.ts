import { describe, expect, it } from "vitest";
import {
  createPlannerGridSlots,
  placementSlotIndex,
  reorderPlannerPages,
} from "@/pages/studios/PlatformTemplateCanvas";
import type { PlannerWidgetPlacement } from "@/lib/api";
import {
  LEGACY_PLANNER_LAYOUT,
  STARTER_PLANNER_LAYOUTS,
  STARTER_WIDGET_COUNTS,
  buildMatchingLayoutPlacementDefaults,
  buildPageLayoutPlacementState,
  containPlannerGeometryForBinding,
  createEditablePlannerGridLayout,
  resolvePlannerPageLayout,
  updatePlannerGrid,
  validatePlannerPageLayout,
} from "@/lib/planner-page-layouts";

describe("platform template bounded widget grid", () => {
  it("creates eight non-overlapping slots inside the production safe area", () => {
    const slots = createPlannerGridSlots();

    expect(slots).toHaveLength(8);
    for (const slot of slots) {
      expect(slot.x).toBeGreaterThanOrEqual(0.06);
      expect(slot.y).toBeGreaterThanOrEqual(0.06);
      expect(slot.x + slot.w).toBeCloseTo(Math.min(slot.x + slot.w, 0.94), 10);
      expect(slot.y + slot.h).toBeCloseTo(Math.min(slot.y + slot.h, 0.94), 10);
    }

    for (const slot of slots) {
      for (const other of slots) {
        if (slot.index === other.index) continue;
        const overlaps =
          slot.x < other.x + other.w &&
          slot.x + slot.w > other.x &&
          slot.y < other.y + other.h &&
          slot.y + slot.h > other.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("maps a saved placement back to the slot it occupies", () => {
    const slots = createPlannerGridSlots();
    const slot = slots[5];
    const placement: PlannerWidgetPlacement = {
      id: "placement-1",
      widgetId: "widget-1",
      pageType: "weekly",
      pageIndex: 0,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      scope: "page",
    };

    expect(placementSlotIndex(placement, slots)).toBe(5);
  });
});

describe("reusable planner page layouts", () => {
  it("keeps layout artwork clear of either binding edge", () => {
    expect(containPlannerGeometryForBinding(
      { x: 0.06, y: 0.06, w: 0.88, h: 0.88 },
      "left",
    )).toEqual({ x: 0.1, y: 0.06, w: 0.84, h: 0.88 });
    const rightBound = containPlannerGeometryForBinding(
      { x: 0.06, y: 0.06, w: 0.88, h: 0.88 },
      "right",
    );
    expect(rightBound).toMatchObject({ x: 0.06, y: 0.06, h: 0.88 });
    expect(rightBound.w).toBeCloseTo(0.84, 12);
  });

  it("uses the legacy eight-space layout for existing compositions", () => {
    expect(resolvePlannerPageLayout(
      { version: 1, placements: [] },
      "weekly",
      0,
    )).toEqual(LEGACY_PLANNER_LAYOUT);
  });

  it("uses the most recent applicable layout snapshot", () => {
    const first = { id: "one", name: "One", sections: [{ id: "a", x: 0.06, y: 0.06, w: 0.88, h: 0.88 }] };
    const second = { id: "two", name: "Two", sections: [
      { id: "a", x: 0.06, y: 0.06, w: 0.431, h: 0.88 },
      { id: "b", x: 0.509, y: 0.06, w: 0.431, h: 0.88 },
    ] };
    expect(resolvePlannerPageLayout({
      version: 2,
      placements: [],
      layouts: [
        { id: "all", layout: first, pageType: "weekly", pageIndex: 0, scope: "matching" },
        { id: "page", layout: second, pageType: "weekly", pageIndex: 3, scope: "page" },
      ],
    }, "weekly", 3)).toEqual(second);
  });

  it("rejects imported layouts outside the safe area", () => {
    expect(() => validatePlannerPageLayout({
      name: "Unsafe",
      sections: [{ id: "edge", x: 0.01, y: 0.06, w: 0.2, h: 0.2 }],
    })).toThrow("safe area");
  });

  it("keeps one widget and hides collisions when eight spaces shrink to one", () => {
    const placements = LEGACY_PLANNER_LAYOUT.sections.map((section, index): PlannerWidgetPlacement => ({
      id: `placement-${index}`,
      widgetId: `widget-${index}`,
      pageType: "weekly",
      pageIndex: 0,
      x: section.x,
      y: section.y,
      w: section.w,
      h: section.h,
      scope: "page",
    }));
    const state = buildPageLayoutPlacementState(
      placements,
      [{ type: "weekly", index: 0 }],
      STARTER_PLANNER_LAYOUTS.find((layout) => layout.id === "starter-1-grid")!,
    );
    expect(Object.keys(state.pagePlacementSections["weekly:0"])).toHaveLength(1);
    expect(state.pageHiddenPlacementIds["weekly:0"]).toHaveLength(7);
  });

  it("never binds more than one widget to each section when shrinking to two", () => {
    const placements = LEGACY_PLANNER_LAYOUT.sections.map((section, index): PlannerWidgetPlacement => ({
      id: `placement-${index}`,
      widgetId: `widget-${index}`,
      pageType: "weekly",
      pageIndex: 0,
      x: section.x,
      y: section.y,
      w: section.w,
      h: section.h,
      scope: "page",
    }));
    const state = buildPageLayoutPlacementState(
      placements,
      [{ type: "weekly", index: 0 }],
      STARTER_PLANNER_LAYOUTS.find((layout) => layout.id === "starter-2-wide")!,
    );
    const bindings = Object.values(state.pagePlacementSections["weekly:0"]);
    expect(bindings).toHaveLength(2);
    expect(new Set(bindings).size).toBe(2);
    expect(state.pageHiddenPlacementIds["weekly:0"]).toHaveLength(6);
  });

  it("creates collision-safe defaults for matching pages generated later", () => {
    const placements = LEGACY_PLANNER_LAYOUT.sections.map((section, index): PlannerWidgetPlacement => ({
      id: `matching-${index}`,
      widgetId: `widget-${index}`,
      pageType: "daily",
      pageIndex: 0,
      x: section.x,
      y: section.y,
      w: section.w,
      h: section.h,
      scope: "matching",
    }));
    const defaults = buildMatchingLayoutPlacementDefaults(
      placements,
      "daily",
      STARTER_PLANNER_LAYOUTS.find((layout) => layout.id === "starter-1-grid")!,
    );
    expect(Object.keys(defaults.placementSections)).toHaveLength(1);
    expect(defaults.hiddenPlacementIds).toHaveLength(7);
  });

  it("offers every supplied widget count from 1 through 12 except 10", () => {
    expect([...STARTER_WIDGET_COUNTS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
    expect(new Set(STARTER_PLANNER_LAYOUTS.map((layout) => layout.sections.length)))
      .toEqual(new Set(STARTER_WIDGET_COUNTS));
    for (const layout of STARTER_PLANNER_LAYOUTS) {
      expect(() => validatePlannerPageLayout(layout)).not.toThrow();
    }
  });

  it("creates independent bounded grids for both pages of a spread", () => {
    const layout = createEditablePlannerGridLayout("spread", "Spread", true);
    expect(layout.grids).toHaveLength(2);
    expect(layout.sections).toHaveLength(16);
    expect(layout.grids?.map((grid) => grid.side)).toEqual(["left", "right"]);
    expect(Math.max(...layout.sections.slice(0, 8).map((section) => section.x + section.w))).toBeLessThanOrEqual(0.47);
    expect(Math.min(...layout.sections.slice(8).map((section) => section.x))).toBeGreaterThanOrEqual(0.53);
  });

  it("preserves stable cells while adding and removing grid rows", () => {
    const layout = createEditablePlannerGridLayout("spread", "Spread", true);
    const left = layout.grids![0];
    const expanded = updatePlannerGrid(layout, left.id, { rows: 3 });
    expect(expanded.sections.map((section) => section.id)).toEqual(expect.arrayContaining([
      "left-grid-r1-c1",
      "left-grid-r1-c2",
      "left-grid-r2-c1",
      "left-grid-r2-c2",
    ]));
    const shrunk = updatePlannerGrid(expanded, left.id, { rows: 1 });
    expect(shrunk.sections.map((section) => section.id)).toContain("left-grid-r1-c1");
    expect(shrunk.sections.map((section) => section.id)).not.toContain("left-grid-r2-c1");
  });

  it("clamps editable grid geometry and refuses changes beyond 24 cells", () => {
    const layout = createEditablePlannerGridLayout("spread", "Spread", true);
    const left = layout.grids![0];
    const bounded = updatePlannerGrid(layout, left.id, { w: 2, h: 2 });
    expect(bounded.grids![0].x + bounded.grids![0].w).toBeLessThanOrEqual(0.47);
    expect(bounded.grids![0].y + bounded.grids![0].h).toBeLessThanOrEqual(0.94);
    const atLimit = updatePlannerGrid(bounded, left.id, { rows: 4, columns: 4 });
    expect(atLimit.sections).toHaveLength(24);
    expect(updatePlannerGrid(atLimit, left.id, { rows: 5, columns: 4 })).toBe(atLimit);
  });
});

describe("platform template page ordering", () => {
  it("moves a page while preserving every stable page identity", () => {
    const pages = [
      { type: "cover", index: 0 },
      { type: "weekly", index: 0 },
      { type: "weekly", index: 1 },
    ];

    const reordered = reorderPlannerPages(pages, 2, 0);

    expect(reordered).toEqual([
      { type: "weekly", index: 1 },
      { type: "cover", index: 0 },
      { type: "weekly", index: 0 },
    ]);
    expect(pages[0]).toEqual({ type: "cover", index: 0 });
  });

  it("ignores invalid move targets", () => {
    const pages = ["cover", "home"];
    expect(reorderPlannerPages(pages, 0, -1)).toBe(pages);
    expect(reorderPlannerPages(pages, 4, 0)).toBe(pages);
  });
});