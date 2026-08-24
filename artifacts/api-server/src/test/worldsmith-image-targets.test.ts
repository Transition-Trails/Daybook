import {
  missingOrientationAwarePrintSizes,
  ORIENTATION_AWARE_TYPES,
} from "@workspace/api-zod/readiness";
import { afterEach, describe, expect, it } from "vitest";
import {
  getWorldsmithImageTarget,
  getWorldsmithPreviewGeneration,
  validateWorldsmithPreviewGenerationConfiguration,
  WORLD_SMITH_PRINT_SIZES_IN,
} from "../lib/worldsmith/image-targets.js";

function dimensions(size: string): [number, number] {
  return size.split("x").map(Number) as [number, number];
}

const ORIENTATIONS = ["portrait", "landscape"] as const;

type PrintSize = {
  componentType: string;
  printWidthIn: number;
  printHeightIn: number;
  orientationAware: boolean;
};

const PRINT_SIZES: PrintSize[] = Object.entries(WORLD_SMITH_PRINT_SIZES_IN).map(
  ([componentType, [printWidthIn, printHeightIn]]) => ({
    componentType,
    printWidthIn,
    printHeightIn,
    orientationAware: ORIENTATION_AWARE_TYPES.has(componentType),
  }),
);
type TargetCase = {
  printSize: PrintSize;
  requestedOrientation: (typeof ORIENTATIONS)[number] | undefined;
};

const TARGET_CASES: TargetCase[] = PRINT_SIZES.flatMap((printSize): TargetCase[] =>
  printSize.orientationAware
    ? ORIENTATIONS.map((requestedOrientation) => ({ printSize, requestedOrientation }))
    : [{ printSize, requestedOrientation: undefined }],
);
const DPIS = [72, 150, 300] as const;
const ROUND_TO = 16;
const NORMAL_PIXEL_BUDGET = 2560 * 1440;
const EXPERIMENTAL_PIXEL_BUDGET = 3840 * 2160;

function expectedPrintDimensions(
  printSize: PrintSize,
  requestedOrientation: (typeof ORIENTATIONS)[number] | undefined,
): [number, number] {
  const { printWidthIn, printHeightIn } = printSize;
  if (!printSize.orientationAware || printWidthIn === printHeightIn) {
    return [printWidthIn, printHeightIn];
  }
  if (
    (requestedOrientation === "landscape" && printWidthIn < printHeightIn) ||
    (requestedOrientation === "portrait" && printWidthIn > printHeightIn)
  ) {
    return [printHeightIn, printWidthIn];
  }
  return [printWidthIn, printHeightIn];
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

  it("requires every orientation-aware component type to have explicit print dimensions", () => {
    expect(missingOrientationAwarePrintSizes(WORLD_SMITH_PRINT_SIZES_IN)).toEqual([]);
  });

  it("reports a newly declared orientation-aware type instead of using the square fallback", () => {
    const futureComponentType = "Future Orientation-Aware Paper";
    const orientationAwareTypes = ORIENTATION_AWARE_TYPES as Set<string>;
    orientationAwareTypes.add(futureComponentType);

    try {
      expect(() => validateWorldsmithPreviewGenerationConfiguration())
        .toThrow(`orientation-aware component type(s): ${futureComponentType}`);
      expect(() => getWorldsmithImageTarget(futureComponentType, "landscape"))
        .toThrow(`orientation-aware component type "${futureComponentType}"`);
    } finally {
      orientationAwareTypes.delete(futureComponentType);
    }
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
      TARGET_CASES.flatMap(({ printSize, requestedOrientation }) =>
        DPIS.map((dpi) => ({
          ...printSize,
          requestedOrientation,
          dpi,
          experimental,
        })),
      ),
    ),
  )(
    "keeps $componentType $requestedOrientation at $dpi DPI within the $experimental pixel budget",
    ({
      componentType,
      printWidthIn,
      printHeightIn,
      orientationAware,
      requestedOrientation,
      dpi,
      experimental,
    }) => {
      process.env.WS_IMAGE_TARGET_DPI = String(dpi);
      if (experimental) {
        process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES = "true";
      }

      const target = getWorldsmithImageTarget(componentType, requestedOrientation);
      const [width, height] = dimensions(target.size);
      const maxPixels = experimental ? EXPERIMENTAL_PIXEL_BUDGET : NORMAL_PIXEL_BUDGET;
      const [expectedPrintWidthIn, expectedPrintHeightIn] = expectedPrintDimensions(
        { componentType, printWidthIn, printHeightIn, orientationAware },
        requestedOrientation,
      );
      const expectedAspectRatio = expectedPrintWidthIn / expectedPrintHeightIn;
      const actualAspectRatio = width / height;
      // Both dimensions can be half a supported-dimension step away from the
      // ideal target, so account for their combined effect on the ratio.
      const maxQuantizationError =
        (ROUND_TO / 2) * (1 / height + expectedAspectRatio / height);

      expect(target).toMatchObject({
        printWidthIn: expectedPrintWidthIn,
        printHeightIn: expectedPrintHeightIn,
        requestedDpi: dpi,
      });
      expect(target.dpi).toBe(
        Math.floor(Math.min(width / expectedPrintWidthIn, height / expectedPrintHeightIn)),
      );
      expect(width).toBeGreaterThanOrEqual(512);
      expect(height).toBeGreaterThanOrEqual(512);
      expect(width % ROUND_TO).toBe(0);
      expect(height % ROUND_TO).toBe(0);
      expect(width * height).toBeLessThanOrEqual(maxPixels);
      expect(Math.abs(actualAspectRatio - expectedAspectRatio)).toBeLessThanOrEqual(maxQuantizationError);
    },
  );

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