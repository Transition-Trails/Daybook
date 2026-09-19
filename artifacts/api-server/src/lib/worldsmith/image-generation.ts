/**
 * WorldSmith image-generation core.
 *
 * Every WorldSmith image path uses this module so the request's effective
 * provider, model, version, size, and quality remain auditable alongside the
 * returned image data.
 */
import { logger } from "../logger";
import { createHash, randomUUID } from "node:crypto";
import { db, aiUsageRecordsTable } from "@workspace/db";
import { resolveAiPolicyForRequest } from "../ai-proxy";
import { reserveAiCall, finishAiCall, currentPricing, conservativeImageReservation } from "../ai-admission";

const SUPPORTED_IMAGE_MODELS = new Set(["gpt-image-1", "gpt-image-2"]);
export const MIN_IMAGE_PIXELS = 1024 * 1024;
const DEFAULT_IMAGE_GENERATION_TIMEOUT_MS = 180_000;
const LEGACY_SIZE_MAP: Record<string, string> = {
  "1792x1024": "1536x1024",
  "1024x1792": "1024x1536",
};
const imageInFlight = new Set<string>();

export type ImageGenerationQuality = "low" | "medium" | "high" | "standard" | "hd";

export interface ImageGenerationOptions {
  size?: string;
  quality?: ImageGenerationQuality;
  context?: { storeId?: string; userId?: string; feature?: string; fundingSource?: "store" | "platform" };
  allowPlatformFallback?: boolean;
}

export interface ImageGenerationMetadata {
  provider: "chatgpt" | "replit_ai_integrations" | "openai";
  model: string;
  modelVersion?: string;
  settings: { size: string; quality: "low" | "medium" | "high" };
}

export interface ImageGenerationResult extends ImageGenerationMetadata {
  dataUrl: string;
}

export class ImageGenerationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Image generation timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = "ImageGenerationTimeoutError";
  }
}

function imageGenerationTimeoutMs(): number {
  const configured = Number(process.env.WS_IMAGE_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_IMAGE_GENERATION_TIMEOUT_MS;
  return Math.min(600_000, Math.max(30_000, Math.round(configured)));
}

function configuredImageModel(): string {
  return (process.env.WS_IMAGE_MODEL ?? "gpt-image-2").trim();
}

function imageProvider(): ImageGenerationMetadata["provider"] {
  return process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
    ? "replit_ai_integrations"
    : "openai";
}

function effectiveQuality(requested: ImageGenerationQuality | undefined): "low" | "medium" | "high" {
  const quality = requested ?? "medium";
  if (quality === "standard") {
    logger.warn({ requestedQuality: quality, effectiveQuality: "medium" }, "Image quality mapped to GPT Image setting");
    return "medium";
  }
  if (quality === "hd") {
    logger.warn({ requestedQuality: quality, effectiveQuality: "high" }, "Image quality mapped to GPT Image setting");
    return "high";
  }
  return quality;
}

function validateGptImage2Size(size: string): string {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) throw new Error(`Invalid GPT Image 2 size "${size}"; use WIDTHxHEIGHT.`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  const ratio = width / height;
  const experimental = process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES === "true";
  // Verified against the Replit AI proxy on 2026-08-24: gpt-image-2 accepts
  // a normal-mode 1920x1920 request. Treat 2560x1440 as a pixel budget, not
  // independent long/short-side limits, so square WorldSmith artwork retains
  // the same permitted resolution as a landscape render.
  const maxPixels = experimental ? 3840 * 2160 : 2560 * 1440;
  if (
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    ratio < 1 / 3 ||
    ratio > 3 ||
    width * height < MIN_IMAGE_PIXELS ||
    width * height > maxPixels
  ) {
    const ceiling = experimental ? "8,294,400 pixels (3840x2160)" : "3,686,400 pixels (2560x1440)";
    throw new Error(`Unsupported GPT Image 2 size "${size}"; dimensions must be multiples of 16, ratio 1:3–3:1, and within a ${ceiling} budget with at least ${MIN_IMAGE_PIXELS.toLocaleString()} pixels.`);
  }
  return size;
}

/** Rejects unsupported model configuration before the server starts accepting work. */
export function validateImageGenerationConfiguration(): void {
  const model = configuredImageModel();
  if (!SUPPORTED_IMAGE_MODELS.has(model)) {
    throw new Error(`Unsupported WS_IMAGE_MODEL "${model}". Supported models: ${[...SUPPORTED_IMAGE_MODELS].join(", ")}.`);
  }
}

/** Resolves the exact effective request settings for audit and prompt hashing. */
export function resolveImageGenerationMetadata(options: ImageGenerationOptions = {}): ImageGenerationMetadata {
  validateImageGenerationConfiguration();
  const model = configuredImageModel();
  const requestedSize = options.size ?? "1024x1024";
  const size = model === "gpt-image-1"
    ? LEGACY_SIZE_MAP[requestedSize] ?? "1024x1024"
    : validateGptImage2Size(requestedSize);
  if (model === "gpt-image-1" && size !== requestedSize) {
    logger.warn({ requestedSize, effectiveSize: size, model }, "Image size mapped for GPT Image 1 compatibility");
  }
  return {
    provider: imageProvider(),
    model,
    modelVersion: process.env.WS_IMAGE_MODEL_VERSION?.trim() || undefined,
    settings: { size, quality: effectiveQuality(options.quality) },
  };
}

/** Generates an image and returns its data URL plus auditable effective metadata. */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {},
): Promise<ImageGenerationResult> {
  const metadata = resolveImageGenerationMetadata(options);
  const policy = await resolveAiPolicyForRequest("chatgpt", options.context?.storeId, {
    model: metadata.model,
    modality: "image",
  });
  if (policy.denied) throw new Error(policy.denied);
  const requestId = randomUUID();
  const promptHash = createHash("sha256").update(prompt).digest("hex");
  const duplicateKey = `${options.context?.storeId ?? "platform"}:${promptHash}:${metadata.model}`;
  if (imageInFlight.has(duplicateKey)) {
    await recordImageUsage(requestId, promptHash, options, metadata, "duplicate", 0, "duplicate", policy.fundingSource, undefined, "duplicate");
    throw new Error("An identical image request is already in flight");
  }
  imageInFlight.add(duplicateKey);
  let reservationId: number;
  const pricing = await currentPricing("chatgpt", metadata.model);
  try {
    reservationId = await reserveAiCall({
    dedupeKey: duplicateKey, provider: "chatgpt", model: metadata.model,
    storeId: options.context?.storeId, fundingSource: policy.fundingSource ?? "platform",
    configId: policy.configId, requestsPerDay: policy.requestsPerDay,
    estimatedCentsPerMonth: policy.estimatedCentsPerMonth,
    reservedCents: conservativeImageReservation(pricing?.image, policy.estimatedCentsPerMonth !== null && policy.estimatedCentsPerMonth !== undefined),
    });
  } catch (error) {
    imageInFlight.delete(duplicateKey);
    if (error instanceof Error && error.message.includes("identical")) {
      await recordImageUsage(requestId, promptHash, options, metadata, "duplicate", 0, "duplicate", policy.fundingSource, undefined, "duplicate");
    }
    throw error;
  }
  const started = Date.now();
  const apiKey = policy.credential ?? (
    !options.context?.storeId && policy.fundingSource === undefined
      ? process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY
      : undefined
  );
  if (!apiKey) {
    imageInFlight.delete(duplicateKey);
    await finishAiCall(reservationId, "failed");
    throw new Error("No OpenAI API key configured (set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY)");
  }

  const baseUrl = (policy.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");

  const body = {
    model: metadata.model,
    prompt,
    n: 1,
    size: metadata.settings.size,
    quality: metadata.settings.quality,
  };

  const controller = new AbortController();
  const timeoutMs = imageGenerationTimeoutMs();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Image generation error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      data: Array<{ url?: string; b64_json?: string }>;
    };
    const item = data.data[0];
    if (!item) throw new Error("Image generation returned no data");

      if (item.b64_json) {
      const persisted = await recordImageUsage(requestId, promptHash, options, metadata, "success", Date.now() - started, undefined,
        policy.fundingSource, pricing?.image ?? undefined, pricing?.image == null ? "missing_pricing" : null);
      await finishAiCall(reservationId, persisted ? "completed" : "unaccounted");
      return { ...metadata, dataUrl: `data:image/png;base64,${item.b64_json}` };
    }

    if (item.url) {
      const imgRes = await fetch(item.url, { signal: controller.signal });
      if (!imgRes.ok) throw new Error(`Failed to download generated image: ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
      const persisted = await recordImageUsage(requestId, promptHash, options, metadata, "success", Date.now() - started, undefined,
        policy.fundingSource, pricing?.image ?? undefined, pricing?.image == null ? "missing_pricing" : null);
      await finishAiCall(reservationId, persisted ? "completed" : "unaccounted");
      return { ...metadata, dataUrl: `data:${ct};base64,${b64}` };
    }

    throw new Error("Image generation response contained neither url nor b64_json");
  } catch (error) {
    await recordImageUsage(requestId, promptHash, options, metadata, "error", Date.now() - started,
      error instanceof Error ? error.name : "provider", policy.fundingSource, undefined, "failed_cost_unknown");
    await finishAiCall(reservationId, "failed");
    if (timedOut && error instanceof Error && error.name === "AbortError") {
      throw new ImageGenerationTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    imageInFlight.delete(duplicateKey);
  }
}

async function recordImageUsage(
  requestId: string, promptHash: string, options: ImageGenerationOptions,
  metadata: ImageGenerationMetadata, status: string, durationMs: number, errorCategory?: string,
  fundingSource?: "store" | "platform", estimatedCostCents?: number,
  costUnavailableReason?: "missing_pricing" | "duplicate" | "failed_cost_unknown" | null,
): Promise<boolean> {
  try {
    await db.insert(aiUsageRecordsTable).values({
      requestId, promptHash, provider: "chatgpt", model: metadata.model, status,
      errorCategory, durationMs, feature: options.context?.feature ?? "image.generate",
      storeId: options.context?.storeId, userId: options.context?.userId,
      fundingSource: fundingSource ?? options.context?.fundingSource ?? "platform",
      estimatedCostCents,
      costUnavailableReason,
    });
    return true;
  } catch (error) { logger.warn({ err: error }, "Failed to persist image usage record"); return false; }
}