/**
 * Widgets — per-store functional overlay assets (7-day trackers, 30-day habit grids, etc.)
 * Widgets are placed overlays that accept the planner palette for recolouring.
 * They are NOT sticker function types — they live in the widgetsTable.
 *
 * GET    /stores/:storeId/widgets
 * POST   /stores/:storeId/widgets
 * GET    /stores/:storeId/widgets/:widgetId
 * PATCH  /stores/:storeId/widgets/:widgetId
 * DELETE /stores/:storeId/widgets/:widgetId
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { widgetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import type { ActorContext } from "../lib/roles";

function assertSameStore(actor: ActorContext, urlStoreId: string, res: Response): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.storeId !== urlStoreId) {
    res.status(403).json({ error: "Access denied: store mismatch" });
    return false;
  }
  return true;
}

const router = Router();

// ── GET /stores/:storeId/widgets ─────────────────────────────────────────────

router.get(
  "/stores/:storeId/widgets",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const rows = await db
      .select()
      .from(widgetsTable)
      .where(eq(widgetsTable.authoredByStoreId, storeId))
      .orderBy(widgetsTable.createdAt);

    res.json(rows);
  },
);

// ── POST /stores/:storeId/widgets ────────────────────────────────────────────

router.post(
  "/stores/:storeId/widgets",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const {
      name,
      sizeVariants = [],
      svgData,
      paletteSlots,
      status = "draft",
    } = req.body as {
      name?: string;
      sizeVariants?: string[];
      svgData?: string;
      paletteSlots?: Record<string, string>;
      status?: "draft" | "live";
    };

    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [widget] = await db
      .insert(widgetsTable)
      .values({
        name: name.trim(),
        storeId,
        sizeVariants,
        svgData: svgData ?? null,
        paletteSlots: paletteSlots ?? null,
        status,
        origin: "owned",
        authoredByStoreId: storeId,
      })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "widget.create",
      targetType: "widget",
      targetId: widget.id,
      metadata: { name: widget.name, storeId },
    });

    res.status(201).json(widget);
  },
);

// ── GET /stores/:storeId/widgets/:widgetId ───────────────────────────────────

router.get(
  "/stores/:storeId/widgets/:widgetId",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, widgetId } = req.params as { storeId: string; widgetId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [widget] = await db
      .select()
      .from(widgetsTable)
      .where(and(eq(widgetsTable.id, widgetId), eq(widgetsTable.authoredByStoreId, storeId)));

    if (!widget) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }
    res.json(widget);
  },
);

// ── PATCH /stores/:storeId/widgets/:widgetId ─────────────────────────────────

router.patch(
  "/stores/:storeId/widgets/:widgetId",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, widgetId } = req.params as { storeId: string; widgetId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [existing] = await db
      .select({ id: widgetsTable.id })
      .from(widgetsTable)
      .where(and(eq(widgetsTable.id, widgetId), eq(widgetsTable.authoredByStoreId, storeId)));

    if (!existing) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }

    const {
      name, sizeVariants, svgData, paletteSlots, status,
    } = req.body as Partial<{
      name: string;
      sizeVariants: string[];
      svgData: string;
      paletteSlots: Record<string, string>;
      status: "draft" | "live";
    }>;

    const updateData: Partial<typeof widgetsTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (sizeVariants !== undefined) updateData.sizeVariants = sizeVariants;
    if (svgData !== undefined) updateData.svgData = svgData;
    if (paletteSlots !== undefined) updateData.paletteSlots = paletteSlots;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      const [row] = await db.select().from(widgetsTable).where(eq(widgetsTable.id, widgetId));
      res.json(row);
      return;
    }

    const [updated] = await db
      .update(widgetsTable)
      .set(updateData)
      .where(and(eq(widgetsTable.id, widgetId), eq(widgetsTable.authoredByStoreId, storeId)))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "widget.update",
      targetType: "widget",
      targetId: widgetId,
      metadata: { storeId, fields: Object.keys(updateData) },
    });

    res.json(updated);
  },
);

// ── DELETE /stores/:storeId/widgets/:widgetId ────────────────────────────────

router.delete(
  "/stores/:storeId/widgets/:widgetId",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, widgetId } = req.params as { storeId: string; widgetId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [existing] = await db
      .select({ id: widgetsTable.id })
      .from(widgetsTable)
      .where(and(eq(widgetsTable.id, widgetId), eq(widgetsTable.authoredByStoreId, storeId)));

    if (!existing) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }

    await db
      .delete(widgetsTable)
      .where(and(eq(widgetsTable.id, widgetId), eq(widgetsTable.authoredByStoreId, storeId)));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "widget.delete",
      targetType: "widget",
      targetId: widgetId,
      metadata: { storeId },
    });

    res.status(204).send();
  },
);

export default router;
