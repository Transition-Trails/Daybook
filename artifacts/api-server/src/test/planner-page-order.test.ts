import { describe, expect, it } from "vitest";
import { getPlannerPageDescriptors, reconcilePlannerPageOrder } from "@workspace/db/planner-pages";
import { flattenPageIds, generatePageIds, type GeneratorConfig } from "../lib/pdf-generator";

const config: GeneratorConfig = {
  setup: {
    weekStart: "mon",
    orientation: "vertical",
    startMonth: 0,
    startYear: 2027,
    monthCount: 1,
    datingMode: "dated",
  },
  style: {
    notePaper: "dot",
    sections: [],
  },
  output: {
    calMode: "none",
    eventMins: 60,
    aiInPdf: false,
  },
  sections: [],
};

describe("planner page ordering", () => {
  it("honors a saved page order and appends pages missing from it", () => {
    const pages = getPlannerPageDescriptors(config.setup, config.style);
    const ordered = reconcilePlannerPageOrder(pages, [
      { type: "notes", index: 0 },
      { type: "cover", index: 0 },
      { type: "missing", index: 99 },
    ]);

    expect(ordered.slice(0, 2)).toEqual([
      { type: "notes", index: 0 },
      { type: "cover", index: 0 },
    ]);
    expect(ordered).toHaveLength(pages.length);
    expect(new Set(ordered.map((page) => `${page.type}:${page.index}`)).size).toBe(pages.length);
  });

  it("serializes PDF pages in the saved order without changing page IDs", () => {
    const map = generatePageIds(config);
    const ordered = flattenPageIds(map, [
      { type: "notes", index: 0 },
      { type: "cover", index: 0 },
      { type: "weekly", index: 0 },
    ]);

    expect(ordered.slice(0, 3)).toEqual(["notes", "cover", map.weeklies[0]]);
    expect(new Set(ordered)).toEqual(new Set(flattenPageIds(map)));
  });
});