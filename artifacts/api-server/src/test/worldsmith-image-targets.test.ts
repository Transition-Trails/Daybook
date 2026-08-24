import { afterEach, describe, expect, it } from "vitest";
import {
  getWorldsmithImageTarget,
  getWorldsmithPreviewGeneration,
  validateWorldsmithPreviewGenerationConfiguration,
} from "../lib/worldsmith/image-targets.js";

function dimensions(size: string): [number, number] {
  return size.split("x").map(Number) as [number, number];
}

const PRINT_SIZES = [
  ["Hero Paper", 12, 12],
  ["Decorative Paper", 12, 12],
  ["Coordinating Paper", 12, 12],
  ["Journal Card", 3, 4],
  ["Ephemera Sheet", 8.5, 11],
  ["Notepaper", 8.5, 11],
  ["Endpaper", 8.5, 11],
] as const;
const DPIS = [72, 150, 300] as const;
const ROUND_TO = 16;
const NORMAL_PIXEL_BUDGET = 2560 * 1440;
const EXPERIMENTAL_PIXEL_BUDGET = 3840 * 2160;

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

  it.each(DPIS)("keeps Journal Card rectangular at %d DPI", (dpi) => {
    process.env.WS_IMAGE_TARGET_DPI = String(dpi);
    const target = getWorldsmithImageTarget("Journal Card");
    const [width, height] = dimensions(target.size);

    expect(width).toBeLessThan(height);
    expect(width % ROUND_TO).toBe(0);
    expect(height % ROUND_TO).toBe(0);
  });

  it("uniformly applies the minimum side before rounding Journal Card at 150 DPI", () => {
    process.env.WS_IMAGE_TARGET_DPI = "150";
    const target = getWorldsmithImageTarget("Journal Card");

    expect(target.size).toBe("512x688");
  });

  it.each(
    [false, true].flatMap((experimental) =>
      PRINT_SIZES.flatMap(([componentType, printWidthIn, printHeightIn]) =>
        DPIS.map((dpi) => ({
          componentType,
          printWidthIn,
          printHeightIn,
          dpi,
          experimental,
        })),
      ),
    ),
  )(
    "keeps $componentType at $dpi DPI within the $experimental pixel budget",
    ({ componentType, printWidthIn, printHeightIn, dpi, experimental }) => {
      process.env.WS_IMAGE_TARGET_DPI = String(dpi);
      if (experimental) {
        process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES = "true";
      }

      const target = getWorldsmithImageTarget(componentType);
      const [width, height] = dimensions(target.size);
      const maxPixels = experimental ? EXPERIMENTAL_PIXEL_BUDGET : NORMAL_PIXEL_BUDGET;
      const expectedAspectRatio = printWidthIn / printHeightIn;
      const actualAspectRatio = width / height;
      const maxQuantizationError = ROUND_TO / Math.min(width, height);

      expect(target).toMatchObject({ printWidthIn, printHeightIn, requestedDpi: dpi });
      expect(target.dpi).toBe(Math.floor(Math.min(width / printWidthIn, height / printHeightIn)));
      expect(width).toBeGreaterThanOrEqual(512);
      expect(height).toBeGreaterThanOrEqual(512);
      expect(width % ROUND_TO).toBe(0);
      expect(height % ROUND_TO).toBe(0);
      expect(width * height).toBeLessThanOrEqual(maxPixels);
      expect(Math.abs(actualAspectRatio - expectedAspectRatio)).toBeLessThanOrEqual(maxQuantizationError);
    },
  );

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