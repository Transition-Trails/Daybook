import { logger } from "./logger";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
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
): Promise<AiResponse> {
  switch (provider) {
    case "claude":
      return callClaude(messages, systemPrompt);
    case "chatgpt":
      return callOpenAI(messages, systemPrompt);
    case "gemini":
      return callGemini(messages, systemPrompt);
    default:
      return callClaude(messages, systemPrompt);
  }
}

async function callClaude(
  messages: ChatMessage[],
  systemPrompt?: string,
): Promise<AiResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: messages.filter((m) => m.role !== "system"),
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
): Promise<AiResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const msgs: ChatMessage[] = [];
  if (systemPrompt) msgs.push({ role: "system", content: systemPrompt });
  msgs.push(...messages);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: msgs,
      max_tokens: 2048,
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
): Promise<AiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const parts = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

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

/**
 * Generate an image via the Replit AI integration proxy (gpt-image-1).
 * Falls back to direct OpenAI if the integration env vars are absent.
 *
 * Returns a base64 data URL: `data:<mime>;base64,...`
 * The proxy always returns base64 — no response_format param needed/allowed.
 */
export async function callDallE(
  prompt: string,
  options: {
    size?: "1024x1024" | "1792x1024" | "1024x1792";
    quality?: "standard" | "hd";
    style?: "natural" | "vivid";  // kept for API compat but ignored by gpt-image-1
  } = {},
): Promise<string> {
  // Prefer the AI integration credentials; fall back to the raw OPENAI_API_KEY
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI API key configured (set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY)");

  const baseUrl = (
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  // gpt-image-1 size mapping — the model only accepts these values:
  //   1024x1024 | 1536x1024 (landscape) | 1024x1536 (portrait) | auto
  const sizeMap: Record<string, string> = {
    "1024x1024": "1024x1024",
    "1792x1024": "1536x1024",  // landscape → nearest gpt-image-1 size
    "1024x1792": "1024x1536",  // portrait  → nearest gpt-image-1 size
  };
  const size = sizeMap[options.size ?? "1024x1024"] ?? "1024x1024";

  const body: Record<string, unknown> = {
    model: "gpt-image-1",
    prompt,
    n: 1,
    size,
    // quality: gpt-image-1 accepts "low" | "medium" | "high" | "auto"
    // Map the legacy "hd" → "high", "standard" → "medium"
    quality: options.quality === "hd" ? "high" : "medium",
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
      throw new Error(`DALL-E error ${res.status}: ${err}`);
    }

    // gpt-image-1 via Replit integration always returns b64_json.
    // Fall back to downloading a URL if somehow a url is returned instead.
    const data = (await res.json()) as {
      data: Array<{ url?: string; b64_json?: string }>;
    };
    const item = data.data[0];
    if (!item) throw new Error("Image generation returned no data");

    if (item.b64_json) {
      return `data:image/png;base64,${item.b64_json}`;
    }

    if (item.url) {
      const imgRes = await fetch(item.url, { signal: controller.signal });
      if (!imgRes.ok) throw new Error(`Failed to download generated image: ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
      return `data:${ct};base64,${b64}`;
    }

    throw new Error("Image generation response contained neither url nor b64_json");
  } finally {
    clearTimeout(timeout);
  }
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
