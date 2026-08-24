import { afterEach, describe, expect, it } from "vitest";
import {
  getWorldsmithImageTarget,
  getWorldsmithPreviewGeneration,
  validateWorldsmithPreviewGenerationConfiguration,
} from "../lib/worldsmith/image-targets.js";

function dimensions(size: string): [number, number] {
  return size.split("x").map(Number) as [number, number];
}

afterEach(() => {
  delete process.env.SPEC_PREVIEW_QUALITY;
  delete process.env.WS_IMAGE_TARGET_DPI;
  delete process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES;
});

describe("WorldSmith image targets", () => {
  it("uses the readiness-owned orientation taxonomy and the normal pixel budget for Hero Paper", () => {
    const target = getWorldsmithImageTarget("Hero Paper", "Landscape");
    const [width, height] = dimensions(target.size);

    expect(target.orientation).toBe("square");
    expect(width).toBe(1808);
    expect(height).toBe(1808);
    expect(width * height).toBeLessThanOrEqual(2560 * 1440);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
    expect(target).toMatchObject({ dpi: 150, requestedDpi: 150 });
  });

  it("derives a landscape Journal Card target within the normal pixel budget", () => {
    const target = getWorldsmithImageTarget("Journal Card", "Landscape");
    const [width, height] = dimensions(target.size);

    expect(target.orientation).toBe("landscape");
    expect(width).toBeGreaterThan(height);
    expect(width * height).toBeLessThanOrEqual(2560 * 1440);
    expect(width % 16).toBe(0);
    expect(height % 16).toBe(0);
  });

  it("uses the full normal square budget when a 160-DPI target is requested", () => {
    process.env.WS_IMAGE_TARGET_DPI = "160";
    const target = getWorldsmithImageTarget("Hero Paper");

    expect(target).toMatchObject({
      size: "1920x1920",
      dpi: 160,
      requestedDpi: 160,
    });
  });

  it("uses the same landscape target and configured quality for preview generation identity", () => {
    process.env.SPEC_PREVIEW_QUALITY = "high";
    const preview = getWorldsmithPreviewGeneration("Journal Card", "Landscape");
    const [width, height] = dimensions(preview.metadata.settings.size);

    expect(width).toBeGreaterThan(height);
    expect(preview.metadata.settings.quality).toBe("high");
  });

  it("rejects unsupported preview quality before the server starts", () => {
    process.env.SPEC_PREVIEW_QUALITY = "ultra";
    expect(validateWorldsmithPreviewGenerationConfiguration)
      .toThrow('Unsupported SPEC_PREVIEW_QUALITY "ultra"');
  });
});