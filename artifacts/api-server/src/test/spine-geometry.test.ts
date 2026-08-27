import { describe, expect, it } from "vitest";
import { calculateSpineTiles } from "../lib/pdf-generator";

describe("spine tiling geometry", () => {
  it("preserves aspect ratio, remains media-box clipped, and renders none as empty", () => {
    const pageWidth = 420;
    const pageHeight = 595;
    const aspect = 0.1353;
    const tiles = calculateSpineTiles(pageWidth, pageHeight, {
      unitAspect: aspect,
      gapRatio: 0,
      orientation: "vertical",
    });

    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.width / tile.height).toBeCloseTo(aspect, 6);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(pageWidth);
      expect(tile.y).toBeLessThan(pageHeight);
    }
    expect(calculateSpineTiles(pageWidth, pageHeight, null)).toEqual([]);
  });

  it("preserves horizontal asset aspect and starts every tile inside the page", () => {
    const pageWidth = 595;
    const pageHeight = 420;
    const aspect = 11.9;
    const tiles = calculateSpineTiles(pageWidth, pageHeight, {
      unitAspect: aspect,
      gapRatio: 0,
      orientation: "horizontal",
    });

    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.width / tile.height).toBeCloseTo(aspect, 6);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(pageWidth);
      expect(tile.y).toBeLessThan(pageHeight);
    }
    expect(calculateSpineTiles(pageWidth, pageHeight, null)).toEqual([]);
  });
});