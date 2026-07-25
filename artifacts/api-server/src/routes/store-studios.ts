/**
 * Store Studio — server-side generate endpoints with profile grounding.
 *
 * POST /stores/:storeId/studios/theme/generate
 * POST /stores/:storeId/studios/pack/generate
 * POST /stores/:storeId/studios/edition/generate
 * POST /stores/:storeId/studios/trends/generate
 *
 * Each endpoint: requireStoreAccess + aiEnabled gate → fetch store profile →
 * buildProfileGrounding → prepend to hardcoded studio system prompt → callAi →
 * parse response → writeAudit → return parsed JSON.
 *
 * The system prompts are verbatim copies of the frontend SYSTEM_PROMPT constants
 * (kept identical so Claude's output format is unchanged). Grounding is prepended.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { storeProfilesTable, storeFlagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { callAi } from "../lib/ai-proxy";
import { buildProfileGrounding } from "../lib/profile-grounding";

const router: IRouter = Router();

// ── Shared helpers ────────────────────────────────────────────────────────────

async function checkAiEnabled(storeId: string, res: Response): Promise<boolean> {
  const [flags] = await db
    .select()
    .from(storeFlagsTable)
    .where(eq(storeFlagsTable.storeId, storeId));
  if (!flags?.aiEnabled) {
    res.status(403).json({ error: "AI features are not enabled for this store" });
    return false;
  }
  return true;
}

async function fetchGrounding(storeId: string): Promise<string> {
  const [profile] = await db
    .select()
    .from(storeProfilesTable)
    .where(eq(storeProfilesTable.storeId, storeId));
  return buildProfileGrounding(profile ?? null);
}

/** Defensive JSON parse — strips markdown fences, returns null on failure. */
function parseJson<T>(raw: string): T | null {
  try {
    const stripped = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const objMatch = stripped.match(/\{[\s\S]*\}/);
    const arrMatch = stripped.match(/\[[\s\S]*\]/);
    let candidate: string | null = null;
    if (objMatch && arrMatch) {
      candidate = stripped.indexOf("{") < stripped.indexOf("[") ? objMatch[0] : arrMatch[0];
    } else {
      candidate = objMatch?.[0] ?? arrMatch?.[0] ?? null;
    }
    return candidate ? (JSON.parse(candidate) as T) : null;
  } catch {
    return null;
  }
}

// ── Studio system prompts (verbatim from frontend constants) ──────────────────

const THEME_SYSTEM_PROMPT = `You are a professional color palette designer for a premium digital planner brand.
When given a mood, season, or brand feel, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "short evocative theme name (2-4 words)",
  "description": "one sentence that captures the mood and use case",
  "colors": ["#hex1","#hex2","#hex3","#hex4","#hex5","#hex6"]
}
The 6 colors in order: accent (primary brand color), accent-dark (deepened accent for hover/text), secondary (complementary mid-tone), tertiary (soft supporting tone), ink (dark text color), paper (lightest background).
Choose colors that feel cohesive, premium, and work well on screen.`;

const PACK_SYSTEM_PROMPT = `You are a creative director for a premium digital planner brand.
When given a sticker pack concept, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "punchy pack name (2-5 words)",
  "tags": ["tag1","tag2","tag3","tag4"],
  "ideas": [
    "brief sticker idea (e.g. 'a coffee cup with Monday energy text')",
    "...", "...", "..."
  ]
}
tags: 4 short keywords describing the vibe/audience (e.g. "cosy", "productivity", "ADHD-friendly").
ideas: exactly 4 sticker concepts — be specific about the illustration and any text overlay.`;

const EDITION_SYSTEM_PROMPT = `You are a product designer for a premium digital planner brand.
When given a planner edition concept, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "edition name (3-6 words, e.g. 'The Christmas 2026 Planner')",
  "description": "2-sentence pitch that captures who it's for and what makes it special",
  "sections": ["Section A","Section B","Section C","Section D","Section E"],
  "palette": ["#hex1","#hex2","#hex3","#hex4","#hex5","#hex6"],
  "priceLow": 12,
  "priceHigh": 18
}
sections: 5–7 planner section names that make sense for this theme.
palette 6 colors: accent, accent-dark, secondary, tertiary, ink, paper — cohesive and on-theme.
priceLow/priceHigh: suggested USD retail price range (integers).`;

const TRENDS_SYSTEM_PROMPT = `You are a trend analyst for a premium digital planner brand.
When given a research focus, respond ONLY with a valid JSON array — no markdown, no explanation.
[
  { "trend": "short trend name", "insight": "1-2 sentences on why this is relevant now", "idea": "specific planner product idea that capitalises on this trend" },
  ...
]
Return exactly 5 objects. Be specific and actionable — the "idea" should be a concrete product concept a designer can work from immediately.`;

// ── POST /stores/:storeId/studios/theme/generate ──────────────────────────────

router.post(
  "/stores/:storeId/studios/theme/generate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!(await checkAiEnabled(storeId, res))) return;

    const { prompt } = req.body as { prompt: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = grounding ? `${grounding}\n\n${THEME_SYSTEM_PROMPT}` : THEME_SYSTEM_PROMPT;

    try {
      const result = await callAi(
        [{ role: "user", content: prompt.trim() }],
        "claude",
        systemPrompt,
      );

      const parsed = parseJson<{ name: string; description: string; colors: string[] }>(result.content);
      if (!parsed) {
        res.status(502).json({ error: "Claude returned malformed JSON", raw: result.content });
        return;
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "studio.theme.generate",
        targetType: "studio",
        metadata: { model: result.model, grounded: !!grounding },
      });

      res.json({ ...parsed, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "theme studio generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/studios/pack/generate ───────────────────────────────

router.post(
  "/stores/:storeId/studios/pack/generate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!(await checkAiEnabled(storeId, res))) return;

    const { prompt } = req.body as { prompt: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = grounding ? `${grounding}\n\n${PACK_SYSTEM_PROMPT}` : PACK_SYSTEM_PROMPT;

    try {
      const result = await callAi(
        [{ role: "user", content: prompt.trim() }],
        "claude",
        systemPrompt,
      );

      const parsed = parseJson<{ name: string; tags: string[]; ideas: string[] }>(result.content);
      if (!parsed) {
        res.status(502).json({ error: "Claude returned malformed JSON", raw: result.content });
        return;
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "studio.pack.generate",
        targetType: "studio",
        metadata: { model: result.model, grounded: !!grounding },
      });

      res.json({ ...parsed, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "pack studio generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/studios/edition/generate ────────────────────────────

router.post(
  "/stores/:storeId/studios/edition/generate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!(await checkAiEnabled(storeId, res))) return;

    const { prompt } = req.body as { prompt: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = grounding ? `${grounding}\n\n${EDITION_SYSTEM_PROMPT}` : EDITION_SYSTEM_PROMPT;

    try {
      const result = await callAi(
        [{ role: "user", content: prompt.trim() }],
        "claude",
        systemPrompt,
      );

      const parsed = parseJson<{
        name: string;
        description: string;
        sections: string[];
        palette: string[];
        priceLow: number;
        priceHigh: number;
      }>(result.content);
      if (!parsed) {
        res.status(502).json({ error: "Claude returned malformed JSON", raw: result.content });
        return;
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "studio.edition.generate",
        targetType: "studio",
        metadata: { model: result.model, grounded: !!grounding },
      });

      res.json({ ...parsed, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "edition studio generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/studios/trends/generate ─────────────────────────────

router.post(
  "/stores/:storeId/studios/trends/generate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!(await checkAiEnabled(storeId, res))) return;

    const { prompt } = req.body as { prompt: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    // Grounding gives Claude audience + brand context to make trends more relevant.
    const systemPrompt = grounding
      ? `${grounding}\n\nApply the store's identity above when generating trend ideas — make the "idea" fields relevant to this specific brand and audience.\n\n${TRENDS_SYSTEM_PROMPT}`
      : TRENDS_SYSTEM_PROMPT;

    try {
      const result = await callAi(
        [{ role: "user", content: prompt.trim() }],
        "claude",
        systemPrompt,
      );

      const parsed = parseJson<Array<{ trend: string; insight: string; idea: string }>>(result.content);
      if (!parsed || !Array.isArray(parsed)) {
        res.status(502).json({ error: "Claude returned malformed JSON", raw: result.content });
        return;
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "studio.trends.generate",
        targetType: "studio",
        metadata: { model: result.model, grounded: !!grounding },
      });

      res.json({ trends: parsed.slice(0, 5), model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "trend research generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/studios/planner/copilot ────────────────────────────
// Conversational AI assistant grounded in store profile, aware of planner context.

const PLANNER_COPILOT_SYSTEM = `You are a helpful planner-design assistant embedded in a store admin studio.
You help store owners make decisions about their digital planners: styling, layout, cover copy, section naming, binding choices, and so on.
Be concise (2-4 sentences max unless a list is genuinely needed), warm, and actionable.
Do not make up specific product SKUs or prices. Do not suggest software tools other than what's in this studio.`;

router.post(
  "/stores/:storeId/studios/planner/copilot",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const { storeId } = req.params as { storeId: string };
    if (!(await checkAiEnabled(storeId, res))) return;

    const { message, context, history = [] } = req.body as {
      message: string;
      context?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = [
      grounding ? grounding + "\n\n" : "",
      PLANNER_COPILOT_SYSTEM,
      context ? `\n\nCurrent studio context: ${context}` : "",
    ].join("");

    // Build conversation history + new message
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...(history.slice(-10) as Array<{ role: "user" | "assistant"; content: string }>),
      { role: "user", content: message.trim() },
    ];

    try {
      const result = await callAi(messages, "claude", systemPrompt);
      const text = result.content?.trim() ?? "I couldn't generate a response. Please try again.";
      res.json({ text, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "planner copilot failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── SVG sanitisation helper ───────────────────────────────────────────────────
// Strips script tags, event handlers, foreignObject and javascript: URIs from
// AI-generated SVG before it leaves the server. Defence-in-depth alongside
// client-side sanitisation in the admin UI.

function sanitizeSvgServerSide(svg: string): string {
  // Remove <script> blocks (including async / type variants)
  svg = svg.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  // Remove <foreignObject> blocks (can embed arbitrary HTML)
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
  svg = svg.replace(/<foreignObject[^>]*\/>/gi, "");
  // Remove inline event handlers (on*= attributes)
  svg = svg.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Replace javascript: URIs in href / xlink:href / src
  svg = svg.replace(/((?:xlink:)?href|src)\s*=\s*["']javascript:[^"']*["']/gi, '$1="#"');
  return svg;
}

// ── POST /stores/:storeId/studios/insert/generate ─────────────────────────────
// Claude generates a recolourable vector SVG insert page in the store's palette.
// Optionally accepts an exampleImageBase64 (vision) to rebuild as clean vector.

const INSERT_SYSTEM_PROMPT = `You are a vector SVG designer for premium digital planner inserts.
When given a design brief, emit ONLY a self-contained SVG element — no markdown, no explanation.
Requirements:
- Use palette slot placeholders: {{slot:accent}}, {{slot:ink}}, {{slot:paper}}, {{slot:secondary}} where appropriate.
- Output must be a valid SVG string starting with <svg and ending with </svg>.
- Include a JSON comment immediately after the opening <svg tag:
  <!-- HOTSPOT_MAP: { "placeholders": [{"id":"slot1","x":0,"y":0,"w":100,"h":50,"label":"text"}] } -->
- The SVG should be a full page layout (A5 portrait: 148mm × 210mm at 72 dpi = 419×595px).
- Make it clean, functional, and recolourable — no raster images, pure vector only.`;

router.post(
  "/stores/:storeId/studios/insert/generate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!(await checkAiEnabled(storeId, res))) return;

    const { prompt, exampleImageBase64 } = req.body as {
      prompt: string;
      exampleImageBase64?: string;
    };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = grounding ? `${grounding}\n\n${INSERT_SYSTEM_PROMPT}` : INSERT_SYSTEM_PROMPT;

    try {
      // Build messages — include example image if provided (vision)
      const messages: Array<{ role: "user"; content: string | Array<{ type: string; [k: string]: unknown }> }> = [];
      if (exampleImageBase64?.startsWith("data:image/")) {
        const mimeMatch = exampleImageBase64.match(/^data:(image\/[a-z+]+);base64,/);
        const mediaType = (mimeMatch?.[1] ?? "image/png") as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
        const b64 = exampleImageBase64.replace(/^data:image\/[a-z+]+;base64,/, "");
        messages.push({
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: `Rebuild this as a clean, fully vectorised SVG planner insert page in the store palette. Additional brief: ${prompt.trim()}` },
          ],
        });
      } else {
        messages.push({ role: "user", content: prompt.trim() });
      }

      const result = await callAi(messages as Parameters<typeof callAi>[0], "claude", systemPrompt);

      // Validate SVG
      const svgMatch = result.content?.match(/<svg[\s\S]*<\/svg>/i);
      if (!svgMatch) {
        res.status(502).json({ error: "Claude did not return a valid SVG", raw: result.content?.slice(0, 300) });
        return;
      }
      const svgData = sanitizeSvgServerSide(svgMatch[0]);

      // Extract hotspot map from comment if present
      let hotspotMap: unknown = null;
      const hotspotMatch = svgData.match(/<!--\s*HOTSPOT_MAP:\s*(\{[\s\S]*?\})\s*-->/);
      if (hotspotMatch) {
        try { hotspotMap = JSON.parse(hotspotMatch[1]); } catch { /* ignore */ }
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "studio.insert.generate",
        targetType: "studio",
        metadata: { model: result.model, grounded: !!grounding, hasVision: !!exampleImageBase64 },
      });

      res.json({ svgData, hotspotMap, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "insert studio generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/studios/widget/generate ─────────────────────────────
// Claude generates a recolourable functional widget SVG (7-day tracker, 30-day habit grid, etc.)

const WIDGET_SYSTEM_PROMPT = `You are a vector SVG designer for premium digital planner widgets.
When given a widget brief, emit ONLY a self-contained SVG element — no markdown, no explanation.
Requirements:
- Use palette slot placeholders: {{slot:accent}}, {{slot:ink}}, {{slot:paper}}, {{slot:secondary}}.
- Output must be a valid SVG string starting with <svg and ending with </svg>.
- The SVG should be compact (e.g. 200×150px for a 7-day tracker, 300×200px for a month grid).
- Include interactive hotspot hints as a comment:
  <!-- HOTSPOT_MAP: { "slots": [{"id":"day1","x":0,"y":0,"w":25,"h":25}] } -->
- Clean, functional vector — no raster images.`;

router.post(
  "/stores/:storeId/studios/widget/generate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!(await checkAiEnabled(storeId, res))) return;

    const { prompt, sizeVariant } = req.body as {
      prompt: string;
      sizeVariant?: "7-day" | "30-day" | "month";
    };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = grounding ? `${grounding}\n\n${WIDGET_SYSTEM_PROMPT}` : WIDGET_SYSTEM_PROMPT;
    const userMsg = sizeVariant
      ? `${prompt.trim()} [size variant: ${sizeVariant}]`
      : prompt.trim();

    try {
      const result = await callAi([{ role: "user", content: userMsg }], "claude", systemPrompt);

      const svgMatch = result.content?.match(/<svg[\s\S]*<\/svg>/i);
      if (!svgMatch) {
        res.status(502).json({ error: "Claude did not return a valid SVG", raw: result.content?.slice(0, 300) });
        return;
      }
      const svgData = sanitizeSvgServerSide(svgMatch[0]);

      let hotspotMap: unknown = null;
      const hotspotMatch = svgData.match(/<!--\s*HOTSPOT_MAP:\s*(\{[\s\S]*?\})\s*-->/);
      if (hotspotMatch) {
        try { hotspotMap = JSON.parse(hotspotMatch[1]); } catch { /* ignore */ }
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "studio.widget.generate",
        targetType: "studio",
        metadata: { model: result.model, grounded: !!grounding, sizeVariant },
      });

      res.json({ svgData, hotspotMap, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "widget studio generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

export default router;
