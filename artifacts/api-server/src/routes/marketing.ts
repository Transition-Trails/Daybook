/**
 * Marketing Studio routes (store-scoped, AI-gated, audited)
 *
 * POST /stores/:storeId/marketing/generate/listing  — Etsy/channel listing copy
 * POST /stores/:storeId/marketing/generate/social   — social captions + hashtags
 * POST /stores/:storeId/marketing/generate/mockup   — stubbed image scene frames
 * GET  /stores/:storeId/marketing/assets            — list saved assets
 * POST /stores/:storeId/marketing/assets            — save an asset
 * DELETE /stores/:storeId/marketing/assets/:id      — delete an asset
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  storeProfilesTable,
  storeFlagsTable,
  marketingAssetsTable,
  editionsTable,
  stickerPacksTable,
} from "@workspace/db";
import { eq, and, ne, desc } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { callAi } from "../lib/ai-proxy";
import { buildProfileGrounding } from "../lib/profile-grounding";
import type { StoreProfileVoice } from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return `mkt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Defensive JSON parse — returns null on failure rather than throwing. */
function tryParseJson<T>(raw: string): T | null {
  try {
    const stripped = raw
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const objMatch = stripped.match(/\{[\s\S]*\}/);
    const arrMatch = stripped.match(/\[[\s\S]*\]/);
    let candidate: string | null = null;
    if (objMatch && arrMatch) {
      candidate = stripped.indexOf("{") < stripped.indexOf("[") ? objMatch[0] : arrMatch[0];
    } else {
      candidate = objMatch?.[0] ?? arrMatch?.[0] ?? null;
    }
    if (!candidate) return null;
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

/** Check aiEnabled flag for the store. */
async function assertAiEnabled(storeId: string, res: Response): Promise<boolean> {
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

/** Fetch store profile and build grounding block. */
async function getGrounding(
  storeId: string,
  voiceOverride?: Partial<StoreProfileVoice>,
): Promise<string> {
  const [profile] = await db
    .select()
    .from(storeProfilesTable)
    .where(eq(storeProfilesTable.storeId, storeId));
  return buildProfileGrounding(profile ?? null, voiceOverride);
}

/** Build a human-readable product brief from edition or pack. */
async function buildProductBrief(
  editionId?: string,
  packId?: string,
): Promise<string> {
  if (editionId) {
    const [ed] = await db
      .select()
      .from(editionsTable)
      .where(and(eq(editionsTable.id, editionId), ne(editionsTable.status, "deleted")));
    if (ed) {
      const sections = Array.isArray(ed.sections) ? (ed.sections as string[]).join(", ") : "";
      const price = ed.priceLow != null ? `$${ed.priceLow}–$${ed.priceHigh}` : "";
      return [
        `Product type: Digital planner edition`,
        `Name: ${ed.name}`,
        sections ? `Sections: ${sections}` : "",
        price ? `Price range: ${price}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
  if (packId) {
    const [pack] = await db
      .select()
      .from(stickerPacksTable)
      .where(and(eq(stickerPacksTable.id, packId), ne(stickerPacksTable.status, "deleted")));
    if (pack) {
      const tags = Array.isArray(pack.tags) ? (pack.tags as string[]).join(", ") : "";
      const price = pack.price != null ? `$${pack.price}` : "";
      return [
        `Product type: Digital sticker pack`,
        `Name: ${pack.name}`,
        tags ? `Tags/themes: ${tags}` : "",
        price ? `Price: ${price}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
  return "";
}

// ── POST /stores/:storeId/marketing/generate/listing ─────────────────────────

router.post(
  "/stores/:storeId/marketing/generate/listing",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };

    if (!(await assertAiEnabled(storeId, res))) return;

    const {
      editionId,
      packId,
      brief,
      voiceOverride,
      channel = "etsy",
    } = req.body as {
      editionId?: string;
      packId?: string;
      brief?: string;
      voiceOverride?: Partial<StoreProfileVoice>;
      channel?: "etsy" | "tiktok" | "storefront";
    };

    const grounding = await getGrounding(storeId, voiceOverride);
    const productBrief = await buildProductBrief(editionId, packId);

    const channelRules =
      channel === "etsy"
        ? `Channel: Etsy. Rules: title max 140 chars, exactly 13 tags (comma-separated single/hyphenated words), description 150–300 words with natural keyword placement.`
        : channel === "tiktok"
        ? `Channel: TikTok Shop. Rules: punchy title under 80 chars, short description 50–100 words, 5–10 hashtags.`
        : `Channel: Daybook Storefront. Rules: clear title under 100 chars, description 100–200 words that converts.`;

    const systemPrompt = [
      grounding,
      "",
      "## Task",
      "You are a copywriter specialising in digital planner products. Write an on-brand product listing.",
      channelRules,
      "Respond ONLY with valid JSON — no markdown, no explanation.",
      `{
  "title": "...",
  "description": "...",
  "tags": ["tag1","tag2",...]
}`,
    ].join("\n");

    const userMessage = [
      productBrief ? `Product details:\n${productBrief}` : "",
      brief ? `Additional brief:\n${brief}` : "",
      !productBrief && !brief ? "Write a listing for this store's flagship digital planner product." : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const result = await callAi(
        [{ role: "user", content: userMessage }],
        "claude",
        systemPrompt,
      );

      const parsed = tryParseJson<{ title: string; description: string; tags: string[] }>(result.content);
      if (!parsed) {
        res.status(502).json({ error: "Claude returned malformed JSON", raw: result.content });
        return;
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "marketing.generate.listing",
        targetType: "marketing",
        metadata: { channel, editionId, packId, model: result.model },
      });

      res.json({ ...parsed, channel, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "marketing listing generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/marketing/generate/social ──────────────────────────

router.post(
  "/stores/:storeId/marketing/generate/social",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };

    if (!(await assertAiEnabled(storeId, res))) return;

    const {
      editionId,
      packId,
      brief,
      voiceOverride,
      channels = ["instagram"],
    } = req.body as {
      editionId?: string;
      packId?: string;
      brief?: string;
      voiceOverride?: Partial<StoreProfileVoice>;
      channels?: ("instagram" | "pinterest" | "tiktok")[];
    };

    const grounding = await getGrounding(storeId, voiceOverride);
    const productBrief = await buildProductBrief(editionId, packId);

    const channelGuide = channels
      .map((c) => {
        if (c === "instagram") return "instagram: caption 150–220 chars, 20–25 hashtags";
        if (c === "pinterest") return "pinterest: description 100–200 chars, 5–10 hashtags";
        if (c === "tiktok") return "tiktok: hook in first 5 words, caption 80–150 chars, 5–10 hashtags";
        return c;
      })
      .join("; ");

    const systemPrompt = [
      grounding,
      "",
      "## Task",
      "You are a social media copywriter for a digital planner brand. Write platform-native captions.",
      `Channels to cover: ${channels.join(", ")}. Guidelines: ${channelGuide}.`,
      "Respond ONLY with valid JSON — no markdown, no explanation.",
      `{
  "posts": [
    { "channel": "instagram", "caption": "...", "hashtags": ["#tag1","#tag2"] }
  ]
}`,
    ].join("\n");

    const userMessage = [
      productBrief ? `Product details:\n${productBrief}` : "",
      brief ? `Additional brief:\n${brief}` : "",
      !productBrief && !brief ? "Write social posts promoting this store's digital planner products." : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const result = await callAi(
        [{ role: "user", content: userMessage }],
        "claude",
        systemPrompt,
      );

      const parsed = tryParseJson<{ posts: { channel: string; caption: string; hashtags: string[] }[] }>(result.content);
      if (!parsed) {
        res.status(502).json({ error: "Claude returned malformed JSON", raw: result.content });
        return;
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "marketing.generate.social",
        targetType: "marketing",
        metadata: { channels, editionId, packId, model: result.model },
      });

      res.json({ ...parsed, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "marketing social generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/marketing/generate/mockup ──────────────────────────
// STUBBED — image generation is not wired to a real model yet.
// Returns clearly-marked simulated frames with scene descriptions.
// Replace the stub body with a real image model call when available.

router.post(
  "/stores/:storeId/marketing/generate/mockup",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };

    if (!(await assertAiEnabled(storeId, res))) return;

    const { editionId, packId, brief, sceneDescription } = req.body as {
      editionId?: string;
      packId?: string;
      brief?: string;
      sceneDescription?: string;
    };

    const productBrief = await buildProductBrief(editionId, packId);
    const productName = editionId || packId
      ? (productBrief.match(/Name: (.+)/)?.[1] ?? "Product")
      : "Digital Planner";

    // ── STUB: generate placeholder scene descriptions via Claude, ─────────
    // then return simulated frame placeholders. When a real image-generation
    // endpoint is available, replace the "frames" block below with actual
    // image API calls using the same scene descriptions.
    const scenePrompt = [
      `Generate 3 distinct product mockup scene descriptions for: ${productName}.`,
      sceneDescription ? `Style direction: ${sceneDescription}` : "",
      brief ? `Brief: ${brief}` : "",
      `Respond with JSON: { "scenes": [{ "label": "...", "description": "..." }] }`,
    ]
      .filter(Boolean)
      .join(" ");

    let scenes: { label: string; description: string }[] = [
      { label: "Desk setup", description: `${productName} open on a wooden desk beside a coffee mug and succulent` },
      { label: "Flat lay", description: `${productName} flat lay with pastel stationery and washi tape` },
      { label: "iPad close-up", description: `${productName} displayed on iPad Pro with Apple Pencil on a linen background` },
    ];

    try {
      const result = await callAi([{ role: "user", content: scenePrompt }], "claude");
      const parsed = tryParseJson<{ scenes: { label: string; description: string }[] }>(result.content);
      if (parsed?.scenes?.length) scenes = parsed.scenes.slice(0, 3);
    } catch {
      // fall through to default scenes
    }

    // Placeholder SVG frame (800×600, brand-neutral) — replace with real image URLs
    const placeholderSvg = (label: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#f3ede3"/><rect x="150" y="100" width="500" height="400" rx="12" fill="#e8ddd0" stroke="#c9b9a8" stroke-width="2"/><text x="400" y="260" font-family="serif" font-size="18" fill="#8a7a6b" text-anchor="middle">SIMULATED MOCKUP</text><text x="400" y="295" font-family="sans-serif" font-size="13" fill="#a0907f" text-anchor="middle">${label}</text><text x="400" y="330" font-family="sans-serif" font-size="11" fill="#b8a898" text-anchor="middle">Image generation not yet wired</text></svg>`)}`;

    const frames = scenes.map((s, i) => ({
      id: `frame_${i + 1}`,
      label: s.label,
      description: s.description,
      imageSrc: placeholderSvg(s.label),
      simulated: true, // ← always true until real image generation is wired
    }));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "marketing.generate.mockup",
      targetType: "marketing",
      metadata: { editionId, packId, frameCount: frames.length, simulated: true },
    });

    res.json({
      frames,
      simulated: true,
      notice: "Mockup frames are AI-described scene placeholders. Wire a real image-generation model to produce actual images.",
    });
  },
);

// ── GET /stores/:storeId/marketing/assets ─────────────────────────────────────

router.get(
  "/stores/:storeId/marketing/assets",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const { storeId } = req.params as { storeId: string };
    const { type, status } = req.query as { type?: string; status?: string };

    let query = db
      .select()
      .from(marketingAssetsTable)
      .where(eq(marketingAssetsTable.storeId, storeId))
      .$dynamic();

    if (type) {
      query = query.where(and(
        eq(marketingAssetsTable.storeId, storeId),
        eq(marketingAssetsTable.assetType, type),
      ));
    }
    if (status) {
      query = query.where(and(
        eq(marketingAssetsTable.storeId, storeId),
        eq(marketingAssetsTable.status, status),
      ));
    }

    const assets = await db
      .select()
      .from(marketingAssetsTable)
      .where(eq(marketingAssetsTable.storeId, storeId))
      .orderBy(desc(marketingAssetsTable.createdAt));

    res.json(assets);
  },
);

// ── POST /stores/:storeId/marketing/assets ────────────────────────────────────

router.post(
  "/stores/:storeId/marketing/assets",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };

    const {
      assetType,
      title,
      data,
      sourceEditionId,
      sourcePackId,
      channelTarget,
      voiceSnapshot,
    } = req.body as {
      assetType: string;
      title: string;
      data: Record<string, unknown>;
      sourceEditionId?: string;
      sourcePackId?: string;
      channelTarget?: string;
      voiceSnapshot?: Record<string, unknown>;
    };

    if (!assetType || !title || !data) {
      res.status(400).json({ error: "assetType, title, and data are required" });
      return;
    }
    if (!["listing", "social", "mockup"].includes(assetType)) {
      res.status(400).json({ error: "assetType must be listing, social, or mockup" });
      return;
    }

    const id = genId();
    const [asset] = await db
      .insert(marketingAssetsTable)
      .values({
        id,
        storeId,
        assetType,
        title,
        data,
        status: "saved",
        sourceEditionId: sourceEditionId ?? null,
        sourcePackId: sourcePackId ?? null,
        channelTarget: channelTarget ?? null,
        voiceSnapshot: voiceSnapshot ?? null,
      })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "marketing.asset.save",
      targetType: "marketing_asset",
      targetId: id,
      metadata: { assetType, title, channelTarget },
    });

    res.status(201).json(asset);
  },
);

// ── DELETE /stores/:storeId/marketing/assets/:id ──────────────────────────────

router.delete(
  "/stores/:storeId/marketing/assets/:id",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };

    const [asset] = await db
      .select()
      .from(marketingAssetsTable)
      .where(and(eq(marketingAssetsTable.id, id), eq(marketingAssetsTable.storeId, storeId)));

    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    await db
      .delete(marketingAssetsTable)
      .where(and(eq(marketingAssetsTable.id, id), eq(marketingAssetsTable.storeId, storeId)));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "marketing.asset.delete",
      targetType: "marketing_asset",
      targetId: id,
      metadata: { assetType: asset.assetType, title: asset.title },
    });

    res.sendStatus(204);
  },
);

export default router;
