import { describe, expect, it } from "vitest";
import {
  CONCEPT_IMAGE_AREA,
  CONCEPT_IMAGE_RENDER_AREA,
  getDetailCropSourceRects,
  getFittedConceptImageBox,
} from "../lib/worldsmith/spec-board-template.js";

describe("WorldSmith specification-board crop geometry", () => {
  it("derives square-image detail crops from the fitted image rather than the full panel", () => {
    const imageBox = getFittedConceptImageBox(1024, 1024);
    const crops = getDetailCropSourceRects(imageBox);

    expect(imageBox.x).toBeGreaterThan(CONCEPT_IMAGE_AREA.x);
    expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(
      CONCEPT_IMAGE_RENDER_AREA.y + CONCEPT_IMAGE_RENDER_AREA.height,
    );
    for (const crop of crops) {
      expect(crop.x).toBeGreaterThanOrEqual(imageBox.x);
      expect(crop.y).toBeGreaterThanOrEqual(imageBox.y);
      expect(crop.x + crop.width).toBeLessThanOrEqual(imageBox.x + imageBox.width);
      expect(crop.y + crop.height).toBeLessThanOrEqual(imageBox.y + imageBox.height);
    }
  });

  it("keeps wide and tall source images inside the rendered area", () => {
    for (const [width, height] of [[1792, 1024], [1024, 1792]]) {
      const imageBox = getFittedConceptImageBox(width, height);
      expect(imageBox.x).toBeGreaterThanOrEqual(CONCEPT_IMAGE_RENDER_AREA.x);
      expect(imageBox.y).toBeGreaterThanOrEqual(CONCEPT_IMAGE_RENDER_AREA.y);
      expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(
        CONCEPT_IMAGE_RENDER_AREA.x + CONCEPT_IMAGE_RENDER_AREA.width,
      );
      expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(
        CONCEPT_IMAGE_RENDER_AREA.y + CONCEPT_IMAGE_RENDER_AREA.height,
      );
    }
  });
});