import { ORIENTATION_AWARE_TYPES } from "@workspace/api-zod/readiness";
import {
  resolveImageGenerationMetadata,
  type ImageGenerationMetadata,
  type ImageGenerationQuality,
} from "../ai-proxy";

export interface WorldsmithImageTarget {
  size: string;
  dpi: number;
  printWidthIn: number;
  printHeightIn: number;
  orientation: "landscape" | "portrait" | "square";
}

const PRINT_SIZES_IN: Record<string, readonly [number, number]> = {
  "Hero Paper": [12, 12],
  "Decorative Paper": [12, 12],
  "Coordinating Paper": [12, 12],
  "Journal Card": [3, 4],
  "Ephemera Sheet": [8.5, 11],
  "Notepaper": [8.5, 11],
  "Endpaper": [8.5, 11],
};

const ROUND_TO = 16;
const MIN_SIDE = 512;
const ALLOWED_QUALITY = new Set<ImageGenerationQuality>(["low", "medium", "high", "standard", "hd"]);

function configuredDpi(): number {
  const parsed = Number(process.env.WS_IMAGE_TARGET_DPI ?? 150);
  return Number.isFinite(parsed) && parsed >= 72 && parsed <= 600 ? parsed : 150;
}

function isExperimentalSizeEnabled(): boolean {
  return process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES === "true";
}

function roundToSupportedDimension(value: number): number {
  return Math.max(MIN_SIDE, Math.round(value / ROUND_TO) * ROUND_TO);
}

/**
 * Resolves a production-oriented render target. Orientation awareness is owned
 * by the shared readiness contract; this helper only translates that contract
 * into safe image dimensions.
 */
export function getWorldsmithImageTarget(
  componentType: string | undefined,
  requestedOrientation?: string | null,
): WorldsmithImageTarget {
  const type = componentType?.trim() ?? "";
  const [baseWidth, baseHeight] = PRINT_SIZES_IN[type] ?? [8.5, 8.5];
  const orientationAware = ORIENTATION_AWARE_TYPES.has(type);
  const normalizedOrientation = requestedOrientation?.trim().toLowerCase() ?? "";

  let printWidthIn = baseWidth;
  let printHeightIn = baseHeight;
  if (orientationAware && normalizedOrientation.startsWith("landscape") && baseHeight > baseWidth) {
    [printWidthIn, printHeightIn] = [baseHeight, baseWidth];
  } else if (orientationAware && normalizedOrientation.startsWith("portrait") && baseWidth > baseHeight) {
    [printWidthIn, printHeightIn] = [baseHeight, baseWidth];
  }

  const orientation = printWidthIn === printHeightIn
    ? "square"
    : printWidthIn > printHeightIn ? "landscape" : "portrait";
  const dpi = configuredDpi();
  const maxLongSide = isExperimentalSizeEnabled() ? 3840 : 2560;
  const maxShortSide = isExperimentalSizeEnabled() ? 2160 : 1440;
  const longSide = Math.max(printWidthIn, printHeightIn) * dpi;
  const shortSide = Math.min(printWidthIn, printHeightIn) * dpi;
  const scale = Math.min(1, maxLongSide / longSide, maxShortSide / shortSide);

  const rawWidth = printWidthIn * dpi * scale;
  const rawHeight = printHeightIn * dpi * scale;
  const width = roundToSupportedDimension(rawWidth);
  const height = roundToSupportedDimension(rawHeight);

  return {
    size: `${width}x${height}`,
    dpi,
    printWidthIn,
    printHeightIn,
    orientation,
  };
}

function configuredPreviewQuality(): ImageGenerationQuality {
  const quality = (process.env.SPEC_PREVIEW_QUALITY ?? "medium").trim() as ImageGenerationQuality;
  if (!ALLOWED_QUALITY.has(quality)) {
    throw new Error(`Unsupported SPEC_PREVIEW_QUALITY "${quality}". Supported values: low, medium, high, standard, hd.`);
  }
  return quality;
}

/** Resolves the exact image identity shared by WorldSmith compilation and preview generation. */
export function getWorldsmithPreviewGeneration(
  componentType: string | undefined,
  orientation?: string | null,
): { target: WorldsmithImageTarget; metadata: ImageGenerationMetadata } {
  const target = getWorldsmithImageTarget(componentType, orientation);
  return {
    target,
    metadata: resolveImageGenerationMetadata({
      size: target.size,
      quality: configuredPreviewQuality(),
    }),
  };
}

export function validateWorldsmithPreviewGenerationConfiguration(): void {
  configuredPreviewQuality();
}