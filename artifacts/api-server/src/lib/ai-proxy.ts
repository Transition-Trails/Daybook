import { logger } from "./logger";
import { generateImage } from "./worldsmith/image-generation";
import { createHash, randomUUID } from "node:crypto";
import { db, aiUsageRecordsTable, aiProviderConfigsTable } from "@workspace/db";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { decryptAiCredential } from "./ai-secrets";
import { reserveAiCall, finishAiCall, currentPricing, conservativeTextReservation } from "./ai-admission";

export {
  generateImage,
  resolveImageGenerationMetadata,
  validateImageGenerationConfiguration,
} from "./worldsmith/image-generation";
export type {
  ImageGenerationMetadata,
  ImageGenerationOptions,
  ImageGenerationQuality,
  ImageGenerationResult,
} from "./worldsmith/image-generation";

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
  /** Normalized attribution and policy context. Optional for legacy callers. */
  context?: AiCallContext;
  timeoutMs?: number;
}

export interface AiCallContext {
  storeId?: string;
  userId?: string;
  feature?: string;
  fundingSource?: "store" | "platform";
}

function countStrings(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((n, item) => n + countStrings(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((n, item) => n + countStrings(item), 0);
  return 0;
}

export function billableInputChars(messages: ChatMessage[], systemPrompt?: string, options?: AiCallOptions): number {
  return (systemPrompt?.length ?? 0) + messages.reduce((n, message) => n + countStrings(message.content), 0) +
    (options?.textAttachments ?? []).reduce((n, a) => n + a.name.length + a.text.length, 0) +
    (options?.imageAttachments ?? []).reduce((n, a) => n + a.name.length + a.base64.length, 0);
}

export function shouldKeepReservationUnaccounted(monthlyLimited: boolean, inputTokens?: number, outputTokens?: number, estimatedCostCents?: number): boolean {
  return monthlyLimited && (inputTokens === undefined || outputTokens === undefined || estimatedCostCents === undefined);
}
export function aiDedupeKey(provider: string, promptHash: string, scope: string, model: string): string {
  return `${provider}:${promptHash}:${scope}:${model}`;
}
export function openAiBaseUrlForCredentialSource(source: "database" | "legacy-integration" | "legacy-openai", integrationBaseUrl?: string): string {
  return source === "legacy-integration"
    ? (integrationBaseUrl ?? "https://api.openai.com/v1")
    : "https://api.openai.com/v1";
}

export function estimateCostFromPricing(
  pricing: { input: number; output: number } | undefined,
  usage: Record<string, number> | null,
): number | undefined {
  if (!pricing || !usage) return undefined;
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  if (input === undefined || output === undefined) return undefined;
  return Math.ceil((input * pricing.input + output * pricing.output) / 1_000_000);
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
  const effectiveProvider = provider === "chatgpt" || provider === "gemini" ? provider : "claude";
  const context = options?.context;
  const policy = await resolveAiPolicyForRequest(effectiveProvider, context?.storeId, {
    model: undefined,
    modality: "text",
  });
  const selectedContext = context ? { ...context, fundingSource: policy.fundingSource } : { fundingSource: policy.fundingSource };
  const controller = new AbortController();
  const effectiveOptions = { ...options, _credential: policy.credential, _model: policy.model, _baseUrl: policy.baseUrl, _signal: controller.signal };
  if (policy.denied) throw new Error(policy.denied);
  const requestId = randomUUID();
  const promptHash = createHash("sha256").update(JSON.stringify({ messages, systemPrompt })).digest("hex");
  const duplicateKey = aiDedupeKey(effectiveProvider, promptHash, context?.storeId ?? "platform", policy.model ?? DEFAULT_MODELS[effectiveProvider]!);
  if (inFlight.has(duplicateKey)) {
    await recordUsage({ requestId, context: selectedContext, provider: effectiveProvider, promptHash, status: "duplicate", durationMs: 0 });
    throw new Error("An identical AI request is already in flight");
  }
  const started = Date.now();
  const pricing = await currentPricing(effectiveProvider, policy.model ?? DEFAULT_MODELS[effectiveProvider]!);
  const reservationId = await reserveAiCall({
    dedupeKey: duplicateKey, provider: effectiveProvider, model: policy.model ?? DEFAULT_MODELS[effectiveProvider]!,
    storeId: context?.storeId, fundingSource: policy.fundingSource ?? "platform",
    configId: policy.configId,
    requestsPerDay: policy.requestsPerDay, estimatedCentsPerMonth: policy.estimatedCentsPerMonth,
    reservedCents: conservativeTextReservation(billableInputChars(messages, systemPrompt, options), pricing?.input ?? 0, pricing?.output ?? 0,
      policy.estimatedCentsPerMonth !== null && policy.estimatedCentsPerMonth !== undefined),
  });
  const operation = (async () => {
    switch (effectiveProvider) {
      case "chatgpt": return callOpenAI(messages, systemPrompt, effectiveOptions);
      case "gemini": return callGemini(messages, systemPrompt, effectiveOptions);
      default: return callClaude(messages, systemPrompt, effectiveOptions);
    }
  })();
  inFlight.set(duplicateKey, operation);
  try {
    const result = await withTimeout(operation, options?.timeoutMs ?? 120_000, controller);
    // Never release a reservation as completed before the usage audit row exists.
    const estimatedCostCents = estimateCostFromPricing(pricing, result.usage);
    const missingUsage = shouldKeepReservationUnaccounted(policy.estimatedCentsPerMonth !== null && policy.estimatedCentsPerMonth !== undefined,
      result.usage?.prompt_tokens ?? result.usage?.input_tokens, result.usage?.completion_tokens ?? result.usage?.output_tokens, estimatedCostCents);
    const persisted = await recordUsage({
      requestId, context: selectedContext, provider: result.provider, model: result.model, promptHash,
      status: "success", durationMs: Date.now() - started,
      inputTokens: result.usage?.prompt_tokens ?? result.usage?.input_tokens,
      outputTokens: result.usage?.completion_tokens ?? result.usage?.output_tokens,
      estimatedCostCents: missingUsage ? undefined : estimatedCostCents,
    });
    await finishAiCall(reservationId, persisted && !missingUsage ? "completed" : "unaccounted");
    return result;
  } catch (error) {
    await finishAiCall(reservationId, "failed");
    await recordUsage({
      requestId, context: selectedContext, provider: effectiveProvider, promptHash, status: "error",
      errorCategory: classifyAiError(error), durationMs: Date.now() - started,
    });
    throw error;
  } finally {
    // Do not admit a duplicate while the provider fetch is still settling.
    await operation.catch(() => undefined);
    inFlight.delete(duplicateKey);
  }
}

const inFlight = new Map<string, Promise<AiResponse>>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error("AI request timed out")); }, timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyAiError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timed out") || message.includes("timeout")) return "timeout";
  if (message.includes("configured") || message.includes("api key")) return "configuration";
  if (message.includes("429") || message.includes("quota")) return "rate_limit";
  return "provider";
}

async function recordUsage(input: {
  requestId: string; context?: AiCallContext; provider: string; model?: string | null;
  promptHash: string; status: string; errorCategory?: string; durationMs: number;
  inputTokens?: number; outputTokens?: number;
  estimatedCostCents?: number;
}): Promise<boolean> {
  try {
    await db.insert(aiUsageRecordsTable).values({
      requestId: input.requestId, storeId: input.context?.storeId, userId: input.context?.userId,
      feature: input.context?.feature ?? "unattributed", provider: input.provider, model: input.model,
      promptHash: input.promptHash, status: input.status, errorCategory: input.errorCategory,
      durationMs: input.durationMs, inputTokens: input.inputTokens, outputTokens: input.outputTokens,
      estimatedCostCents: input.estimatedCostCents,
      fundingSource: input.context?.fundingSource ?? "platform",
    });
    return true;
  } catch (error) {
    logger.error({ err: error }, "Failed to persist AI usage record");
    return false;
  }
}

type InternalAiOptions = AiCallOptions & { _credential?: string; _model?: string; _signal?: AbortSignal; _baseUrl?: string };
type AiPolicy = { credential?: string; model?: string; denied?: string; fundingSource?: "store" | "platform"; configId?: number; requestsPerDay?: number | null; estimatedCentsPerMonth?: number | null; baseUrl?: string };
const DEFAULT_MODELS: Record<string, string> = { claude: "claude-opus-4-5", chatgpt: "gpt-5", gemini: "gemini-2.0-flash" };

export async function resolveAiPolicyForRequest(
  provider: string,
  storeId?: string,
  options: { model?: string; modality?: "text" | "image" } = {},
): Promise<AiPolicy> {
  // Platform fallback selects a credential before the provider call; it never
  // retries a failed network request, since provider operations may be non-idempotent.
  const model = options.model ?? DEFAULT_MODELS[provider];
  try {
    const rows = await db.select().from(aiProviderConfigsTable).where(
      and(eq(aiProviderConfigsTable.provider, provider), storeId
        ? or(eq(aiProviderConfigsTable.storeId, storeId), isNull(aiProviderConfigsTable.storeId))
        : isNull(aiProviderConfigsTable.storeId)),
    );
    const config = rows.find((row) => storeId && row.storeId === storeId) ??
      rows.find((row) => row.storeId === null);
    // A tenant request is never allowed to silently become an environment-key
    // request.  Platform fallback is selected explicitly below.
    if (!config && storeId) return { denied: "AI provider is not configured for this store" };
    if (!config) {
      const integration = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const direct = process.env.OPENAI_API_KEY;
      return {
        model,
        credential: provider === "chatgpt" ? integration ?? direct : undefined,
        baseUrl: integration && provider === "chatgpt"
          ? openAiBaseUrlForCredentialSource("legacy-integration", process.env.AI_INTEGRATIONS_OPENAI_BASE_URL)
          : openAiBaseUrlForCredentialSource("legacy-openai"),
      };
    }
    if (!config.enabled) {
      if (storeId && config.storeId === storeId && config.allowPlatformFallback) {
        const [platform] = await db.select().from(aiProviderConfigsTable).where(
          and(eq(aiProviderConfigsTable.provider, provider), isNull(aiProviderConfigsTable.storeId)),
        ).limit(1);
        if (platform?.enabled && platform.encryptedCredential && platform.credentialIv && platform.credentialTag &&
            (!platform.allowedModels.length || platform.allowedModels.includes(model))) {
          return {
            fundingSource: "platform", configId: platform.id,
            requestsPerDay: platform.requestsPerDay, estimatedCentsPerMonth: platform.estimatedCentsPerMonth,
            credential: decryptAiCredential({
              ciphertext: platform.encryptedCredential, iv: platform.credentialIv, tag: platform.credentialTag,
            }),
            model, baseUrl: openAiBaseUrlForCredentialSource("database"),
          };
        }
      }
      return { denied: "AI provider is disabled by policy" };
    }
    if (storeId === undefined && config.storeId) return {};
    if (config.allowedModels.length && !config.allowedModels.includes(model)) {
      return { denied: `Model ${model} is not allowed for ${provider}` };
    }
    if (storeId && config.storeId === null && !config.allowPlatformFallback) {
      return { denied: "Platform fallback is disabled for this provider" };
    }
    // A store config may opt into the platform credential. Resolve that
    // credential directly rather than allowing the provider client to fall
    // through to process.env after a store lookup.
    if (storeId && config.storeId === storeId && !config.encryptedCredential) {
      if (!config.allowPlatformFallback) return { denied: "No store AI credential is configured" };
      const [platform] = await db.select().from(aiProviderConfigsTable).where(
        and(eq(aiProviderConfigsTable.provider, provider), isNull(aiProviderConfigsTable.storeId)),
      ).limit(1);
      if (!platform?.enabled || !platform.encryptedCredential || !platform.credentialIv || !platform.credentialTag) {
        return { denied: "No valid store credential or explicitly enabled platform fallback is configured" };
      }
      if (platform.allowedModels.length && !platform.allowedModels.includes(model)) {
        return { denied: `Model ${model} is not allowed for ${provider}` };
      }
      return {
        fundingSource: "platform", configId: platform.id,
        requestsPerDay: platform.requestsPerDay, estimatedCentsPerMonth: platform.estimatedCentsPerMonth,
        credential: decryptAiCredential({
          ciphertext: platform.encryptedCredential, iv: platform.credentialIv, tag: platform.credentialTag,
        }),
        model, baseUrl: openAiBaseUrlForCredentialSource("database"),
      };
    }
    if (config.requestsPerDay !== null) {
      const since = new Date(Date.now() - 86_400_000);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(aiUsageRecordsTable)
        .where(and(gte(aiUsageRecordsTable.createdAt, since), eq(aiUsageRecordsTable.provider, provider),
       storeId && config.storeId === storeId
         ? eq(aiUsageRecordsTable.storeId, storeId)
         : config.storeId === null
           ? eq(aiUsageRecordsTable.fundingSource, "platform")
           : isNull(aiUsageRecordsTable.storeId)));
      if (Number(count) >= config.requestsPerDay) return { denied: "AI daily request quota exceeded" };
    }
    if (config.estimatedCentsPerMonth !== null) {
       const now = new Date();
       const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${aiUsageRecordsTable.estimatedCostCents}), 0)` })
        .from(aiUsageRecordsTable)
        .where(and(gte(aiUsageRecordsTable.createdAt, since), eq(aiUsageRecordsTable.provider, provider),
       storeId && config.storeId === storeId
         ? eq(aiUsageRecordsTable.storeId, storeId)
         : config.storeId === null
           ? eq(aiUsageRecordsTable.fundingSource, "platform")
           : isNull(aiUsageRecordsTable.storeId)));
      if (Number(total) >= config.estimatedCentsPerMonth) return { denied: "AI monthly cost quota exceeded" };
    }
    if (config.encryptedCredential && config.credentialIv && config.credentialTag) {
      return { fundingSource: config.storeId ? "store" : "platform", configId: config.id,
        requestsPerDay: config.requestsPerDay, estimatedCentsPerMonth: config.estimatedCentsPerMonth,
        credential: decryptAiCredential({
        ciphertext: config.encryptedCredential, iv: config.credentialIv, tag: config.credentialTag,
      }), model, baseUrl: openAiBaseUrlForCredentialSource("database") };
    }
    return { fundingSource: config.storeId ? "store" : "platform", configId: config.id,
      requestsPerDay: config.requestsPerDay, estimatedCentsPerMonth: config.estimatedCentsPerMonth, model };
  } catch (error) {
    if (storeId) throw new Error("AI governance policy unavailable for store");
    logger.warn({ err: error }, "Legacy platform AI policy lookup unavailable");
    // Environment credentials are only a legacy platform escape hatch when a
    // successful policy lookup proved that no platform config exists.
    throw new Error("AI governance policy unavailable");
  }
}

async function callClaude(
  messages: ChatMessage[],
  systemPrompt?: string,
  options?: InternalAiOptions,
): Promise<AiResponse> {
  const apiKey = options?._credential ?? process.env.ANTHROPIC_API_KEY;
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
    model: options?._model ?? "claude-opus-4-5",
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
    signal: options?._signal,
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
  options?: InternalAiOptions,
): Promise<AiResponse> {
  // Prefer the Replit AI integration proxy; fall back to direct OpenAI key
  const apiKey =
    options?._credential ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI API key configured (set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY)");

  const baseUrl = (options?._baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");

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
    model: options?._model ?? "gpt-5",
      messages: builtMessages,
      max_completion_tokens: 2048,
    }),
    signal: options?._signal,
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
  options?: InternalAiOptions,
): Promise<AiResponse> {
  const apiKey = options?._credential ?? process.env.GEMINI_API_KEY;
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
  body.generationConfig = { maxOutputTokens: 2048 };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${options?._model ?? "gemini-2.0-flash"}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options?._signal,
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
    model: options?._model ?? "gemini-2.0-flash",
    usage: data.usageMetadata,
  };
}

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
