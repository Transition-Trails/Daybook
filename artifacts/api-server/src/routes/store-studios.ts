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

export default router;
