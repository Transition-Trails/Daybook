import { describe, expect, it } from "vitest";
import {
  createPlannerGridSlots,
  placementSlotIndex,
  reorderPlannerPages,
} from "@/pages/studios/PlatformTemplateCanvas";
import type { PlannerWidgetPlacement } from "@/lib/api";

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