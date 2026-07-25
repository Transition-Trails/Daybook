/**
 * Planner Hotspot Map routes
 *
 * Hotspots belong to a PAGE TEMPLATE (storeId + templateKey), not a generated
 * page instance.  Saving once gives template memory: any regeneration for a
 * different year, theme, palette or paper colour reuses the map automatically.
 *
 * GET    /stores/:storeId/planners/hotspots
 *          → { templates: { templateKey, count }[] }
 * GET    /stores/:storeId/planners/hotspots/:templateKey
 *          → PlannerHotspot[]
 * PUT    /stores/:storeId/planners/hotspots/:templateKey
 *          → bulk-replace all hotspots for this template; returns saved rows
 * DELETE /stores/:storeId/planners/hotspots/:id
 *          → 204
 * POST   /stores/:storeId/planners/hotspots/:templateKey/auto-detect
 *          → { proposed: ProposedHotspot[]; model; provider }
 *            NEVER saves automatically — seller reviews and calls PUT to save.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { plannerHotspotsTable } from "@workspace/db";
import type { PlannerHotspot } from "@workspace/db";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { callAi } from "../lib/ai-proxy";

const router: IRouter = Router();

// ── Inline store-scoping guard (same pattern as other store routes) ────────────

function assertSameStore(
  actor: { isSuperAdmin: boolean; storeId?: string | null },
  urlStoreId: string,
  res: Response,
): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.storeId !== urlStoreId) {
    res.status(403).json({ error: "Access denied: store mismatch" });
    return false;
  }
  return true;
}

// ── Valid template keys ────────────────────────────────────────────────────────

const VALID_TEMPLATE_KEYS = new Set([
  "cover", "home", "year", "month-divider", "month-calendar",
  "weekly", "daily", "todo", "notes", "section-divider", "note-paper",
]);

const VALID_TARGET_TYPES = new Set([
  "home", "cover", "year", "todo", "notes",
  "next-week", "prev-week", "next-day", "prev-day",
  "next-month", "prev-month", "month-for-week", "month-for-day",
  "month-divider", "month-calendar", "section-n", "url",
]);

// ── GET /stores/:storeId/planners/hotspots ────────────────────────────────────
// Returns which template keys have saved maps (summary, no hotspot data).

router.get(
  "/stores/:storeId/planners/hotspots",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const rows = await db
      .select({
        templateKey: plannerHotspotsTable.templateKey,
      })
      .from(plannerHotspotsTable)
      .where(eq(plannerHotspotsTable.storeId, storeId));

    // Count per templateKey
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.templateKey] = (counts[r.templateKey] ?? 0) + 1;

    const templates = Object.entries(counts).map(([templateKey, count]) => ({ templateKey, count }));
    res.json({ templates });
  },
);

// ── GET /stores/:storeId/planners/hotspots/:templateKey ───────────────────────

router.get(
  "/stores/:storeId/planners/hotspots/:templateKey",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, templateKey } = req.params as { storeId: string; templateKey: string };
    if (!assertSameStore(actor, storeId, res)) return;

    if (!VALID_TEMPLATE_KEYS.has(templateKey)) {
      res.status(400).json({ error: `Unknown templateKey "${templateKey}"` });
      return;
    }

    const hotspots = await db
      .select()
      .from(plannerHotspotsTable)
      .where(
        and(
          eq(plannerHotspotsTable.storeId, storeId),
          eq(plannerHotspotsTable.templateKey, templateKey),
        ),
      );

    res.json(hotspots);
  },
);

// ── PUT /stores/:storeId/planners/hotspots/:templateKey ───────────────────────
// Bulk-replace: deletes all existing hotspots for this (storeId, templateKey),
// then inserts the provided list.  This IS the "save reviewed map" action.

interface HotspotInput {
  x: number;
  y: number;
  w: number;
  h: number;
  targetType: string;
  targetRef?: string | null;
  confidence?: number | null;
  source?: "auto" | "manual";
  label?: string | null;
}

router.put(
  "/stores/:storeId/planners/hotspots/:templateKey",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, templateKey } = req.params as { storeId: string; templateKey: string };
    if (!assertSameStore(actor, storeId, res)) return;

    if (!VALID_TEMPLATE_KEYS.has(templateKey)) {
      res.status(400).json({ error: `Unknown templateKey "${templateKey}"` });
      return;
    }

    const { hotspots } = req.body as { hotspots: HotspotInput[] };
    if (!Array.isArray(hotspots)) {
      res.status(400).json({ error: "hotspots must be an array" });
      return;
    }

    // Validate every hotspot
    for (let i = 0; i < hotspots.length; i++) {
      const h = hotspots[i];
      if (
        typeof h.x !== "number" || h.x < 0 || h.x > 1 ||
        typeof h.y !== "number" || h.y < 0 || h.y > 1 ||
        typeof h.w !== "number" || h.w <= 0 || h.w > 1 ||
        typeof h.h !== "number" || h.h <= 0 || h.h > 1
      ) {
        res.status(400).json({ error: `hotspot[${i}]: x/y/w/h must be 0–1 normalized fractions` });
        return;
      }
      if (!VALID_TARGET_TYPES.has(h.targetType)) {
        res.status(400).json({ error: `hotspot[${i}]: unknown targetType "${h.targetType}"` });
        return;
      }
      if (h.targetType === "url" && (!h.targetRef || !/^https?:\/\//i.test(h.targetRef))) {
        res.status(400).json({ error: `hotspot[${i}]: targetType=url requires a valid https:// targetRef` });
        return;
      }
      if (h.confidence !== undefined && h.confidence !== null && (h.confidence < 0 || h.confidence > 1)) {
        res.status(400).json({ error: `hotspot[${i}]: confidence must be 0–1` });
        return;
      }
    }

    // Delete existing hotspots for this template
    await db
      .delete(plannerHotspotsTable)
      .where(
        and(
          eq(plannerHotspotsTable.storeId, storeId),
          eq(plannerHotspotsTable.templateKey, templateKey),
        ),
      );

    // Insert new hotspots (or no-op if empty — allows clearing a map)
    let saved: PlannerHotspot[] = [];
    if (hotspots.length > 0) {
      saved = await db
        .insert(plannerHotspotsTable)
        .values(
          hotspots.map((h) => ({
            id: randomUUID(),
            storeId,
            templateKey,
            x: h.x,
            y: h.y,
            w: h.w,
            h: h.h,
            targetType: h.targetType,
            targetRef: h.targetRef ?? null,
            confidence: h.confidence ?? null,
            source: h.source ?? "manual",
            label: h.label ?? null,
          })),
        )
        .returning();
    }

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "store.planner.hotspots.save",
      targetType: "planner-hotspot-map",
      targetId: `${storeId}:${templateKey}`,
      metadata: { templateKey, count: saved.length },
    });

    res.json({ saved, count: saved.length });
  },
);

// ── DELETE /stores/:storeId/planners/hotspots/:id ─────────────────────────────

router.delete(
  "/stores/:storeId/planners/hotspots/:id",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [deleted] = await db
      .delete(plannerHotspotsTable)
      .where(and(eq(plannerHotspotsTable.id, id), eq(plannerHotspotsTable.storeId, storeId)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Hotspot not found" });
      return;
    }

    res.status(204).send();
  },
);

// ── POST /stores/:storeId/planners/hotspots/:templateKey/auto-detect ──────────
// Claude vision proposes hotspots from a rendered page image.
// NEVER saves; seller must review and call PUT to commit.

const HOTSPOT_VISION_SYSTEM = `You are a planner PDF hotspot detector.
Given an image of a digital planner page, identify all regions that a buyer would want to tap as navigation links.
Common hotspot targets:
- Month name, year, back-arrow → "prev-month" or "home"
- Day cells in a month grid → "daily" pages
- Week header bars or day columns → "next-day" / "prev-day"
- "Home", "Index", logo in corner → "home"
- Prev/Next arrows → "prev-week"/"next-week" or "prev-day"/"next-day"
- Tab pills on edges → "month-divider"
- Section headings in index → "section-n"

Return ONLY valid JSON (no markdown):
{
  "hotspots": [
    {
      "x": 0.12,
      "y": 0.88,
      "w": 0.18,
      "h": 0.04,
      "targetType": "home",
      "targetRef": null,
      "label": "Home glyph",
      "confidence": 0.92
    }
  ]
}
x, y = bottom-left of rect as 0-1 fractions (PDF origin = bottom-left).
w, h = width/height as 0-1 fractions.
confidence = 0.0–1.0 per hotspot.
Only include hotspots you can actually see; do not hallucinate regions.`;

router.post(
  "/stores/:storeId/planners/hotspots/:templateKey/auto-detect",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, templateKey } = req.params as { storeId: string; templateKey: string };
    if (!assertSameStore(actor, storeId, res)) return;

    if (!VALID_TEMPLATE_KEYS.has(templateKey)) {
      res.status(400).json({ error: `Unknown templateKey "${templateKey}"` });
      return;
    }

    const { imageBase64, mediaType = "image/png" } = req.body as {
      imageBase64: string;
      mediaType?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    // Validate it's a real base64 string (rough check)
    if (!/^[A-Za-z0-9+/]+=*$/.test(imageBase64.replace(/\s/g, ""))) {
      res.status(400).json({ error: "imageBase64 must be a valid base64 string" });
      return;
    }

    try {
      // Vision call via callAi with image content
      const messages: Array<{
        role: "user";
        content: Array<{
          type: "text" | "image";
          text?: string;
          source?: { type: "base64"; media_type: string; data: string };
        }>;
      }> = [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: `This is a "${templateKey}" planner page. Identify all navigation hotspot regions.`,
            },
          ],
        },
      ];

      const result = await callAi(messages as any, "claude", HOTSPOT_VISION_SYSTEM);

      // Parse response
      const raw = result.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(502).json({ error: "Claude did not return valid JSON", raw: raw.slice(0, 400) });
        return;
      }

      let parsed: { hotspots: HotspotInput[] };
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        res.status(502).json({ error: "JSON parse failed", raw: raw.slice(0, 400) });
        return;
      }

      if (!Array.isArray(parsed?.hotspots)) {
        res.status(502).json({ error: "Claude response missing hotspots array", raw: raw.slice(0, 400) });
        return;
      }

      // Sanitize and clamp to valid ranges
      const proposed = parsed.hotspots
        .filter(
          (h) =>
            typeof h.x === "number" &&
            typeof h.y === "number" &&
            typeof h.w === "number" &&
            typeof h.h === "number" &&
            VALID_TARGET_TYPES.has(h.targetType),
        )
        .map((h) => ({
          x: Math.max(0, Math.min(1, h.x)),
          y: Math.max(0, Math.min(1, h.y)),
          w: Math.max(0.01, Math.min(1, h.w)),
          h: Math.max(0.01, Math.min(1, h.h)),
          targetType: h.targetType,
          targetRef: h.targetRef ?? null,
          label: h.label ?? null,
          confidence: typeof h.confidence === "number" ? Math.max(0, Math.min(1, h.confidence)) : 0.5,
          source: "auto" as const,
        }));

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "studio.planner.hotspot.auto-detect",
        targetType: "planner-hotspot-map",
        targetId: `${storeId}:${templateKey}`,
        metadata: { templateKey, proposed: proposed.length, model: result.model },
      });

      res.json({ proposed, model: result.model, provider: result.provider });
    } catch (err) {
      req.log.error({ err }, "hotspot auto-detect failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

export default router;
