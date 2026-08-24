/**
 * WorldSmith image-generation core.
 *
 * Every WorldSmith image path uses this module so the request's effective
 * provider, model, version, size, and quality remain auditable alongside the
 * returned image data.
 */
import { logger } from "../logger";

const SUPPORTED_IMAGE_MODELS = new Set(["gpt-image-1", "gpt-image-2"]);
const LEGACY_SIZE_MAP: Record<string, string> = {
  "1792x1024": "1536x1024",
  "1024x1792": "1024x1536",
};

export type ImageGenerationQuality = "low" | "medium" | "high" | "standard" | "hd";

export interface ImageGenerationOptions {
  size?: string;
  quality?: ImageGenerationQuality;
}

export interface ImageGenerationMetadata {
  provider: "replit_ai_integrations" | "openai";
  model: string;
  modelVersion?: string;
  settings: { size: string; quality: "low" | "medium" | "high" };
}

export interface ImageGenerationResult extends ImageGenerationMetadata {
  dataUrl: string;
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
  const maxLongSide = experimental ? 3840 : 2560;
  const maxShortSide = experimental ? 2160 : 1440;
  if (
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    ratio < 1 / 3 ||
    ratio > 3 ||
    Math.max(width, height) > maxLongSide ||
    Math.min(width, height) > maxShortSide
  ) {
    const ceiling = experimental ? "3840x2160" : "2560x1440";
    throw new Error(`Unsupported GPT Image 2 size "${size}"; dimensions must be multiples of 16, ratio 1:3–3:1, and within ${ceiling}.`);
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
  const apiKey = metadata.provider === "replit_ai_integrations"
    ? process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI API key configured (set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY)");

  const baseUrl = (
    metadata.provider === "replit_ai_integrations"
      ? (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1")
      : "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  const body = {
    model: metadata.model,
    prompt,
    n: 1,
    size: metadata.settings.size,
    quality: metadata.settings.quality,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
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
      return { ...metadata, dataUrl: `data:image/png;base64,${item.b64_json}` };
    }

    if (item.url) {
      const imgRes = await fetch(item.url, { signal: controller.signal });
      if (!imgRes.ok) throw new Error(`Failed to download generated image: ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
      return { ...metadata, dataUrl: `data:${ct};base64,${b64}` };
    }

    throw new Error("Image generation response contained neither url nor b64_json");
  } finally {
    clearTimeout(timeout);
  }
}