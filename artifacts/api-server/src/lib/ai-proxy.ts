import { logger } from "./logger";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** An image attachment already converted to base64 for the final AI call. */
export interface AttachmentBlock {
  /** base64-encoded bytes (no data-URL prefix) */
  base64: string;
  /** e.g. "image/jpeg" */
  mediaType: string;
  /** Original filename, shown as alt text */
  name: string;
}

/** Inline text extracted from a document attachment (plain-text, markdown). */
export interface TextAttachment {
  text: string;
  name: string;
}

export interface AiCallOptions {
  /** Base64 image attachments passed as vision blocks on the last user turn. */
  imageAttachments?: AttachmentBlock[];
  /** Inline text extracted from documents, prepended to the last user message. */
  textAttachments?: TextAttachment[];
}

interface AiResponse {
  content: string;
  provider: string;
  model: string | null;
  usage: Record<string, number> | null;
}

export async function callAi(
  messages: ChatMessage[],
  provider: string,
  systemPrompt?: string,
  options?: AiCallOptions,
): Promise<AiResponse> {
  switch (provider) {
    case "claude":
      return callClaude(messages, systemPrompt, options);
    case "chatgpt":
      return callOpenAI(messages, systemPrompt, options);
    case "gemini":
      return callGemini(messages, systemPrompt, options);
    default:
      return callClaude(messages, systemPrompt, options);
  }
}

async function callClaude(
  messages: ChatMessage[],
  systemPrompt?: string,
  options?: AiCallOptions,
): Promise<AiResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // Build Anthropic message array. The last user message may include image
  // vision blocks when the caller supplies imageAttachments.
  type ClaudeContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

  const claudeMessages: { role: "user" | "assistant"; content: string | ClaudeContentBlock[] }[] =
    messages
      .filter((m) => m.role !== "system")
      .map((m, idx, arr) => {
        const isLast = idx === arr.length - 1;
        const isLastUser = isLast && m.role === "user";
        if (!isLastUser) return { role: m.role as "user" | "assistant", content: m.content };

        // Build rich content blocks for the final user turn
        const blocks: ClaudeContentBlock[] = [];

        // Prepend inline text attachments (plain-text / markdown documents)
        if (options?.textAttachments?.length) {
          const docParts = options.textAttachments
            .map(a => `[Attached document: ${a.name}]\n${a.text}`)
            .join("\n\n---\n\n");
          blocks.push({ type: "text", text: docParts });
        }

        // User message text
        blocks.push({ type: "text", text: m.content });

        // Vision blocks for image attachments
        if (options?.imageAttachments?.length) {
          for (const img of options.imageAttachments) {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.base64 },
            });
          }
        }

        if (blocks.length === 1 && blocks[0]!.type === "text") {
          // No extra blocks — send as plain string to minimise payload
          return { role: "user" as const, content: m.content };
        }
        return { role: "user" as const, content: blocks };
      });

  const body: Record<string, unknown> = {
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: claudeMessages,
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error: ${err}`);
  }

  const data = (await res.json()) as {
    content: Array<{ text: string }>;
    model: string;
    usage: Record<string, number>;
  };

  return {
    content: data.content[0]?.text ?? "",
    provider: "claude",
    model: data.model,
    usage: data.usage,
  };
}

async function callOpenAI(
  messages: ChatMessage[],
  systemPrompt?: string,
  options?: AiCallOptions,
): Promise<AiResponse> {
  // Prefer the Replit AI integration proxy; fall back to direct OpenAI key
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI API key configured (set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY)");

  const baseUrl = (
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  // Build messages, injecting vision + document content on the final user turn
  type OAIContent =
    | string
    | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

  const builtMessages: { role: string; content: OAIContent }[] = [];
  if (systemPrompt) builtMessages.push({ role: "system", content: systemPrompt });

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const isLast = i === messages.length - 1;
    const isLastUser = isLast && m.role === "user";

    if (!isLastUser || (!options?.imageAttachments?.length && !options?.textAttachments?.length)) {
      builtMessages.push({ role: m.role, content: m.content });
      continue;
    }

    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

    // Prepend text documents
    if (options.textAttachments?.length) {
      const docText = options.textAttachments
        .map(a => `[Attached document: ${a.name}]\n${a.text}`)
        .join("\n\n---\n\n");
      parts.push({ type: "text", text: docText });
    }

    parts.push({ type: "text", text: m.content });

    // Vision blocks
    for (const img of options.imageAttachments ?? []) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
      });
    }

    builtMessages.push({ role: m.role, content: parts });
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5",
      messages: builtMessages,
      max_completion_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage: Record<string, number>;
  };

  return {
    content: data.choices[0]?.message.content ?? "",
    provider: "chatgpt",
    model: data.model,
    usage: data.usage,
  };
}

async function callGemini(
  messages: ChatMessage[],
  systemPrompt?: string,
  options?: AiCallOptions,
): Promise<AiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  type GeminiPart =
    | { text: string }
    | { inline_data: { mime_type: string; data: string } };

  const parts = messages.map((m, index) => {
    const isLastUser = index === messages.length - 1 && m.role === "user";
    const content: GeminiPart[] = [];

    if (isLastUser && options?.textAttachments?.length) {
      content.push({
        text: options.textAttachments
          .map((attachment) => `[Attached document: ${attachment.name}]\n${attachment.text}`)
          .join("\n\n---\n\n"),
      });
    }

    content.push({ text: m.content });

    if (isLastUser && options?.imageAttachments?.length) {
      for (const image of options.imageAttachments) {
        content.push({
          inline_data: {
            mime_type: image.mediaType,
            data: image.base64,
          },
        });
      }
    }

    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: content,
    };
  });

  const body: Record<string, unknown> = { contents: parts };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${err}`);
  }

  const data = (await res.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> };
    }>;
    usageMetadata: Record<string, number>;
  };

  return {
    content: data.candidates[0]?.content.parts[0]?.text ?? "",
    provider: "gemini",
    model: "gemini-2.0-flash",
    usage: data.usageMetadata,
  };
}

// ── Image generation ─────────────────────────────────────────────────────────

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

/** Resolves the provider, model, version, and actual request settings for audit and hashing. */
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

/** Generates an image and returns a stable image data URL plus auditable effective metadata. */
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

    // gpt-image-1 via Replit integration always returns b64_json.
    // Fall back to downloading a URL if somehow a url is returned instead.
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

/** @deprecated Use generateImage() to retain effective generation metadata. */
export const callDallE = async (prompt: string, options: ImageGenerationOptions = {}): Promise<string> =>
  (await generateImage(prompt, options)).dataUrl;

// Structured AI helpers for admin studio features
export async function aiDraftTheme(concept: string, season?: string, audience?: string): Promise<Record<string, unknown>> {
  const prompt = `You are a design expert specializing in digital planners for GoodNotes, Notability, and Noteshelf.

Draft a planner theme with this concept: "${concept}"${season ? `, season: ${season}` : ""}${audience ? `, audience: ${audience}` : ""}.

Respond with valid JSON (no markdown) matching this schema:
{
  "name": "Theme Name",
  "description": "2-3 sentence description",
  "palette": {
    "primary": "#hexcolor",
    "secondary": "#hexcolor",
    "accent": "#hexcolor",
    "background": "#hexcolor",
    "text": "#hexcolor"
  },
  "coverColor": "#hexcolor",
  "accentColor": "#hexcolor",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const result = await callAi(
    [{ role: "user", content: prompt }],
    process.env.DEFAULT_AI_PROVIDER ?? "claude",
  );

  try {
    return JSON.parse(result.content) as Record<string, unknown>;
  } catch {
    return { name: concept, description: result.content, palette: {}, coverColor: "#6366f1", accentColor: "#f59e0b", tags: [] };
  }
}

export async function aiDraftStickerPack(concept: string, style?: string, audience?: string): Promise<Record<string, unknown>> {
  const prompt = `You are a digital sticker designer for planners.

Draft a sticker pack concept: "${concept}"${style ? `, style: ${style}` : ""}${audience ? `, audience: ${audience}` : ""}.

Respond with valid JSON (no markdown):
{
  "name": "Pack Name",
  "description": "2-3 sentences",
  "suggestedCount": 24,
  "concepts": ["sticker idea 1", "sticker idea 2", "sticker idea 3", "sticker idea 4", "sticker idea 5"]
}`;

  const result = await callAi(
    [{ role: "user", content: prompt }],
    process.env.DEFAULT_AI_PROVIDER ?? "claude",
  );

  try {
    return JSON.parse(result.content) as Record<string, unknown>;
  } catch {
    return { name: concept, description: result.content, suggestedCount: 24, concepts: [] };
  }
}

export async function aiDraftEdition(concept: string, audience?: string, tier: string = "basic"): Promise<Record<string, unknown>> {
  const prompt = `You are a product manager for a digital planner business.

Draft an edition for: "${concept}"${audience ? `, audience: ${audience}` : ""}, tier: ${tier}.

Respond with valid JSON (no markdown):
{
  "name": "Edition Name",
  "description": "2-3 sentences",
  "suggestedSections": ["section1", "section2", "section3"],
  "priceRange": { "oneTime": 19.99, "yearly": 9.99, "lifetime": 49.99 },
  "marketingCopy": "One compelling sentence for this edition."
}`;

  const result = await callAi(
    [{ role: "user", content: prompt }],
    process.env.DEFAULT_AI_PROVIDER ?? "claude",
  );

  try {
    return JSON.parse(result.content) as Record<string, unknown>;
  } catch {
    return {
      name: concept,
      description: result.content,
      suggestedSections: [],
      priceRange: { oneTime: 19.99, yearly: 9.99, lifetime: 49.99 },
      marketingCopy: "",
    };
  }
}

export async function aiTrendResearch(query: string, audience?: string, season?: string): Promise<Record<string, unknown>> {
  const prompt = `You are a market researcher specializing in digital planners and productivity tools.

Research planner trends for: "${query}"${audience ? `, audience: ${audience}` : ""}${season ? `, season: ${season}` : ""}.

Respond with valid JSON (no markdown):
{
  "trends": ["trend1", "trend2", "trend3", "trend4", "trend5"],
  "suggestedThemes": ["theme idea 1", "theme idea 2", "theme idea 3"],
  "suggestedEditions": ["edition idea 1", "edition idea 2"],
  "marketingAngles": ["angle1", "angle2", "angle3"],
  "summary": "2-3 sentence research summary."
}`;

  const result = await callAi(
    [{ role: "user", content: prompt }],
    process.env.DEFAULT_AI_PROVIDER ?? "claude",
  );

  try {
    return JSON.parse(result.content) as Record<string, unknown>;
  } catch {
    return {
      trends: [],
      suggestedThemes: [],
      suggestedEditions: [],
      marketingAngles: [],
      summary: result.content,
    };
  }
}
