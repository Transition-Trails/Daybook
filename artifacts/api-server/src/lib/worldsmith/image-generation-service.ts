/**
 * Shared WorldSmith image generation and persistence service.
 *
 * This module deliberately knows nothing about a particular visual layout.
 * Callers provide a prompt and an image buffer; spec boards, canon records,
 * and future production artwork can use the same model configuration,
 * generation error handling, Notion attachment, and audit trail.
 */

import { randomUUID } from "crypto";
import { ORIENTATION_AWARE_TYPES } from "@workspace/api-zod/readiness";
import { db, worldsmithSpecPreviewsTable, type SpecPreviewOutputMetadata } from "@workspace/db";
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

export interface WorldsmithImageTarget {
  size: string;
  dpi: number;
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
  return Math.max(MIN_SIDE, Math.round(value / ROUND_TO) * ROUND_TO);
}

/** Resolve a safe production render target from the component's print dimensions. */
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

  const width = roundToSupportedDimension(printWidthIn * dpi * scale);
  const height = roundToSupportedDimension(printHeightIn * dpi * scale);
  return { size: `${width}x${height}`, dpi, printWidthIn, printHeightIn, orientation };
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

export function validateWorldsmithPreviewGenerationConfiguration(): void {
  configuredPreviewQuality();
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
export function resolveWorldsmithImageGeneration(
  componentType?: string,
  orientation?: string | null,
) {
  return getWorldsmithPreviewGeneration(componentType, orientation);
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
  const generation = resolveWorldsmithImageGeneration(input.componentType, input.orientation);
  const context = input.logContext ?? {};

  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
    const error = "No OpenAI API key configured — set OPENAI_API_KEY or run the Replit AI integration setup.";
    logger.warn(context, error);
    return { target: generation.target, error };
  }

  try {
    logger.info(
      { ...context, promptLength: input.prompt.length },
      "Calling DALL-E for concept visual",
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
      "DALL-E concept visual failed — using the caller's placeholder",
    );
    return { target: generation.target, error };
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