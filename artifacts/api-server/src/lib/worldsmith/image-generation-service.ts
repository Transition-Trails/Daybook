/**
 * Shared WorldSmith image generation and persistence service.
 *
 * This module deliberately knows nothing about a particular visual layout.
 * Callers provide a prompt and an image buffer; spec boards, canon records,
 * and future production artwork can use the same model configuration,
 * generation error handling, Notion attachment, and audit trail.
 */

import { randomUUID } from "crypto";
import {
  missingOrientationAwarePrintSizes,
  ORIENTATION_AWARE_TYPES,
} from "@workspace/api-zod/readiness";
import {
  db,
  worldsmithImageTargetsTable,
  worldsmithSpecPreviewsTable,
  type SpecPreviewOutputMetadata,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  attachUploadToPageProperty,
  uploadFileToNotion,
} from "../notion-client";
import {
  generateImage,
  type ImageGenerationMetadata,
  type ImageGenerationQuality,
  resolveImageGenerationMetadata,
} from "./image-generation";
import { logger } from "../logger";

const ALLOWED_QUALITY = new Set<ImageGenerationQuality>(["low", "medium", "high", "standard", "hd"]);
export const WORLD_SMITH_PRINT_SIZES_IN: Readonly<Record<string, readonly [number, number]>> = {
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

export interface WorldsmithImageTarget {
  size: string;
  /** Effective, conservative DPI implied by the generated pixel dimensions. */
  dpi: number;
  /** Configured target DPI before a provider-safe resolution cap is applied. */
  requestedDpi: number;
  printWidthIn: number;
  printHeightIn: number;
  orientation: "landscape" | "portrait" | "square";
}

function configuredDpi(): number {
  const parsed = Number(process.env.WS_IMAGE_TARGET_DPI ?? 150);
  return Number.isFinite(parsed) && parsed >= 72 && parsed <= 600 ? parsed : 150;
}

function isExperimentalSizeEnabled(): boolean {
  return process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES === "true";
}

function roundToSupportedDimension(value: number): number {
  return Math.round(value / ROUND_TO) * ROUND_TO;
}

function applyMinSide(width: number, height: number): readonly [number, number] {
  const shortest = Math.min(width, height);
  if (shortest >= MIN_SIDE) {
    return [width, height];
  }
  const scale = MIN_SIDE / shortest;
  return [width * scale, height * scale];
}

function clampRoundedTargetToPixelBudget(
  initialWidth: number,
  initialHeight: number,
  maxPixels: number,
): readonly [number, number] {
  let width = initialWidth;
  let height = initialHeight;
  while (width * height > maxPixels) {
    if (width >= height && width > MIN_SIDE) {
      width -= ROUND_TO;
    } else if (height > MIN_SIDE) {
      height -= ROUND_TO;
    } else {
      break;
    }
  }
  return [width, height];
}

function resolveWorldsmithImageTarget(
  componentType: string | undefined,
  requestedOrientation?: string | null,
  printSize?: readonly [number, number],
): WorldsmithImageTarget {
  const type = componentType?.trim() ?? "";
  const orientationAware = ORIENTATION_AWARE_TYPES.has(type);
  if (orientationAware && !printSize) {
    throw new Error(
      `WorldSmith print-size catalog is missing explicit dimensions for orientation-aware component type "${type}".`,
    );
  }
  const [baseWidth, baseHeight] = printSize ?? [8.5, 8.5];
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
  const requestedDpi = configuredDpi();
  const maxPixels = isExperimentalSizeEnabled() ? 3840 * 2160 : 2560 * 1440;
  const requestedPixels = printWidthIn * requestedDpi * printHeightIn * requestedDpi;
  const scale = Math.min(1, Math.sqrt(maxPixels / requestedPixels));
  const [rawWidth, rawHeight] = applyMinSide(
    printWidthIn * requestedDpi * scale,
    printHeightIn * requestedDpi * scale,
  );
  const [width, height] = clampRoundedTargetToPixelBudget(
    roundToSupportedDimension(rawWidth),
    roundToSupportedDimension(rawHeight),
    maxPixels,
  );
  const effectiveDpi = Math.floor(Math.min(width / printWidthIn, height / printHeightIn));
  return {
    size: `${width}x${height}`,
    dpi: effectiveDpi,
    requestedDpi,
    printWidthIn,
    printHeightIn,
    orientation,
  };
}

/** Backwards-compatible target resolver using the bundled baseline dimensions. */
export function getWorldsmithImageTarget(
  componentType: string | undefined,
  requestedOrientation?: string | null,
): WorldsmithImageTarget {
  const type = componentType?.trim() ?? "";
  return resolveWorldsmithImageTarget(componentType, requestedOrientation, WORLD_SMITH_PRINT_SIZES_IN[type]);
}

/**
 * Resolve the print target from the managed catalog. This intentionally reads
 * the database at generation time so an admin edit takes effect across every
 * API instance immediately, rather than waiting on process-local cache state.
 */
export async function getManagedWorldsmithImageTarget(
  componentType: string | undefined,
  requestedOrientation?: string | null,
): Promise<WorldsmithImageTarget> {
  const type = componentType?.trim() ?? "";
  if (!ORIENTATION_AWARE_TYPES.has(type)) {
    return resolveWorldsmithImageTarget(componentType, requestedOrientation);
  }
  const fallback = WORLD_SMITH_PRINT_SIZES_IN[type];

  try {
    const [row] = await db
      .select({
        printWidthIn: worldsmithImageTargetsTable.printWidthIn,
        printHeightIn: worldsmithImageTargetsTable.printHeightIn,
      })
      .from(worldsmithImageTargetsTable)
      .where(eq(worldsmithImageTargetsTable.componentType, type))
      .limit(1);

    if (!row) {
      logger.warn(
        { componentType: type, fallbackPrintSize: fallback },
        "WorldSmith managed image target is missing — using bundled print-size catalog",
      );
    }

    return resolveWorldsmithImageTarget(
      componentType,
      requestedOrientation,
      row ? [row.printWidthIn, row.printHeightIn] : fallback,
    );
  } catch (err) {
    logger.warn(
      { componentType: type, fallbackPrintSize: fallback, err },
      "WorldSmith managed image target lookup failed — using bundled print-size catalog",
    );
    return resolveWorldsmithImageTarget(componentType, requestedOrientation, fallback);
  }
}

function configuredPreviewQuality(): ImageGenerationQuality {
  const quality = (process.env.SPEC_PREVIEW_QUALITY ?? "medium").trim() as ImageGenerationQuality;
  if (!ALLOWED_QUALITY.has(quality)) {
    throw new Error(`Unsupported SPEC_PREVIEW_QUALITY "${quality}". Supported values: low, medium, high, standard, hd.`);
  }
  return quality;
}

/** Resolves the exact target and image-model identity shared by compilation and generation. */
export function getWorldsmithPreviewGeneration(
  componentType: string | undefined,
  orientation?: string | null,
) {
  const target = getWorldsmithImageTarget(componentType, orientation);
  return {
    target,
    metadata: resolveImageGenerationMetadata({
      size: target.size,
      quality: configuredPreviewQuality(),
    }),
  };
}

export async function getManagedWorldsmithPreviewGeneration(
  componentType: string | undefined,
  orientation?: string | null,
) {
  const target = await getManagedWorldsmithImageTarget(componentType, orientation);
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
  const missingPrintSizes = missingOrientationAwarePrintSizes(WORLD_SMITH_PRINT_SIZES_IN);
  if (missingPrintSizes.length > 0) {
    throw new Error(
      `WorldSmith print-size catalog is missing explicit dimensions for orientation-aware component type(s): ${missingPrintSizes.join(", ")}.`,
    );
  }
}

export interface WorldsmithImageGeneration {
  target: WorldsmithImageTarget;
  metadata?: ImageGenerationMetadata;
  buffer?: Buffer;
  error?: string;
}

export interface GenerateWorldsmithImageInput {
  prompt: string;
  componentType?: string;
  orientation?: string | null;
  logContext?: Record<string, unknown>;
}

/** Resolve the shared target and effective model settings without making a model call. */
export async function resolveWorldsmithImageGeneration(
  componentType?: string,
  orientation?: string | null,
) {
  return getManagedWorldsmithPreviewGeneration(componentType, orientation);
}

/**
 * Resolve the production target and generate an image with the effective
 * WorldSmith model settings. Image-provider failures are intentionally
 * returned as a non-fatal result: preview callers keep their placeholder and
 * record a retryable success_placeholder audit row.
 */
export async function generateWorldsmithImage(
  input: GenerateWorldsmithImageInput,
): Promise<WorldsmithImageGeneration> {
  const context = input.logContext ?? {};
  let target: WorldsmithImageTarget | undefined;

  try {
    const generation = await resolveWorldsmithImageGeneration(input.componentType, input.orientation);
    target = generation.target;

    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
      const error = "No OpenAI API key configured — set OPENAI_API_KEY or run the Replit AI integration setup.";
      logger.warn(context, error);
      return { target, error };
    }

    logger.info(
      { ...context, promptLength: input.prompt.length },
      "Calling configured image model for concept visual",
    );
    const generated = await generateImage(input.prompt, {
      size: generation.metadata.settings.size,
      quality: generation.metadata.settings.quality,
    });
    const { dataUrl, ...metadata } = generated;
    const b64 = dataUrl.replace(/^data:image\/[a-z+]+;base64,/, "");
    return {
      target: generation.target,
      metadata,
      buffer: Buffer.from(b64, "base64"),
    };
  } catch (err) {
    const error = String(err);
    logger.warn(
      { ...context, err },
      "WorldSmith image generation failed — using the caller's placeholder",
    );
    return {
      target: target ?? getWorldsmithImageTarget(input.componentType, input.orientation),
      error,
    };
  }
}

export interface UploadWorldsmithImageInput {
  buffer: Buffer;
  filename: string;
  notionPageId: string;
  propertyName: string;
}

/** Upload an image to Notion and attach the resulting upload to a page property. */
export async function uploadWorldsmithImage(
  input: UploadWorldsmithImageInput,
): Promise<string> {
  const uploadId = await uploadFileToNotion(input.buffer, input.filename, "image/png");
  await attachUploadToPageProperty(
    input.notionPageId,
    input.propertyName,
    uploadId,
    input.filename,
  );
  return uploadId;
}

export interface WorldsmithImageAuditFields {
  templateVersion: string;
  specPageId: string;
  promptHash: string;
  status: string;
  previewFilename?: string;
  previewObjectPath?: string;
  provider?: string;
  model?: string;
  notionUploadId?: string;
  productionItem?: string;
  previousStatus?: string;
  newStatus?: string;
  notionPageUrl?: string;
  error?: string;
  dryRun?: boolean;
  outputMetadata?: SpecPreviewOutputMetadata;
}

/**
 * Persist the WorldSmith image audit row. Audit persistence is best-effort,
 * matching the existing preview behavior so a database outage does not turn a
 * successfully uploaded image into a false generation failure.
 */
export async function saveWorldsmithImageAudit(
  fields: WorldsmithImageAuditFields,
): Promise<void> {
  try {
    await db.insert(worldsmithSpecPreviewsTable).values({
      id: randomUUID(),
      specPageId: fields.specPageId,
      promptHash: fields.promptHash,
      templateVersion: fields.templateVersion,
      status: fields.status,
      previewFilename: fields.previewFilename ?? null,
      previewObjectPath: fields.previewObjectPath ?? null,
      provider: fields.provider ?? null,
      model: fields.model ?? null,
      notionUploadId: fields.notionUploadId ?? null,
      productionItem: fields.productionItem ?? null,
      previousStatus: fields.previousStatus ?? null,
      newStatus: fields.newStatus ?? null,
      notionPageUrl: fields.notionPageUrl ?? null,
      error: fields.error ?? null,
      dryRun: fields.dryRun ?? false,
      outputMetadata: fields.outputMetadata ?? null,
    });
  } catch (err) {
    logger.warn({ err }, "Could not save spec preview audit record — non-fatal");
  }
}