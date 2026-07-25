/**
 * Style Presets — per-store reusable styling profiles for the Sticker Studio batch toolbar.
 *
 * GET    /stores/:storeId/sticker-presets          — list store's presets
 * POST   /stores/:storeId/sticker-presets          — create a preset (store_owner)
 * GET    /stores/:storeId/sticker-presets/:id      — get a single preset
 * PATCH  /stores/:storeId/sticker-presets/:id      — update a preset (store_owner)
 * DELETE /stores/:storeId/sticker-presets/:id      — delete a preset (store_owner)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { stylePresetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import type { ActorContext } from "../lib/roles";

function assertSameStore(actor: ActorContext, urlStoreId: string, res: import("express").Response): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.storeId !== urlStoreId) {
    res.status(403).json({ error: "Access denied: store mismatch" });
    return false;
  }
  return true;
}

const router = Router();

// ── GET /stores/:storeId/sticker-presets ─────────────────────────────────────

router.get(
  "/stores/:storeId/sticker-presets",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const rows = await db
      .select()
      .from(stylePresetsTable)
      .where(eq(stylePresetsTable.storeId, storeId))
      .orderBy(stylePresetsTable.createdAt);

    res.json(rows);
  },
);

// ── POST /stores/:storeId/sticker-presets ────────────────────────────────────

router.post(
  "/stores/:storeId/sticker-presets",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const {
      name,
      borderStyle = "none",
      borderWidth,
      borderColor,
      sizeInMm,
      shadowStyle,
      shadowLiftPx,
      exportTargets,
    } = req.body as {
      name?: string;
      borderStyle?: string;
      borderWidth?: number;
      borderColor?: string;
      sizeInMm?: number;
      shadowStyle?: string;
      shadowLiftPx?: number;
      exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
    };

    if (!name || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [preset] = await db
      .insert(stylePresetsTable)
      .values({
        storeId,
        name: name.trim(),
        borderStyle,
        borderWidth: borderWidth ?? null,
        borderColor: borderColor ?? null,
        sizeInMm: sizeInMm ?? null,
        shadowStyle: shadowStyle ?? null,
        shadowLiftPx: shadowLiftPx ?? null,
        exportTargets: exportTargets ?? { goodnotes: true, ink: true, cricut: false },
      })
      .returning();

    res.status(201).json(preset);
  },
);

// ── GET /stores/:storeId/sticker-presets/:id ─────────────────────────────────

router.get(
  "/stores/:storeId/sticker-presets/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [preset] = await db
      .select()
      .from(stylePresetsTable)
      .where(and(eq(stylePresetsTable.id, id), eq(stylePresetsTable.storeId, storeId)));

    if (!preset) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }
    res.json(preset);
  },
);

// ── PATCH /stores/:storeId/sticker-presets/:id ───────────────────────────────

router.patch(
  "/stores/:storeId/sticker-presets/:id",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [existing] = await db
      .select()
      .from(stylePresetsTable)
      .where(and(eq(stylePresetsTable.id, id), eq(stylePresetsTable.storeId, storeId)));

    if (!existing) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }

    const {
      name,
      borderStyle,
      borderWidth,
      borderColor,
      sizeInMm,
      shadowStyle,
      shadowLiftPx,
      exportTargets,
    } = req.body as Partial<{
      name: string;
      borderStyle: string;
      borderWidth: number;
      borderColor: string;
      sizeInMm: number;
      shadowStyle: string;
      shadowLiftPx: number;
      exportTargets: { goodnotes: boolean; ink: boolean; cricut: boolean };
    }>;

    const updateData: Partial<typeof stylePresetsTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (borderStyle !== undefined) updateData.borderStyle = borderStyle;
    if (borderWidth !== undefined) updateData.borderWidth = borderWidth;
    if (borderColor !== undefined) updateData.borderColor = borderColor;
    if (sizeInMm !== undefined) updateData.sizeInMm = sizeInMm;
    if (shadowStyle !== undefined) updateData.shadowStyle = shadowStyle;
    if (shadowLiftPx !== undefined) updateData.shadowLiftPx = shadowLiftPx;
    if (exportTargets !== undefined) updateData.exportTargets = exportTargets;

    if (Object.keys(updateData).length === 0) {
      res.json(existing);
      return;
    }

    const [updated] = await db
      .update(stylePresetsTable)
      .set(updateData)
      .where(and(eq(stylePresetsTable.id, id), eq(stylePresetsTable.storeId, storeId)))
      .returning();

    res.json(updated);
  },
);

// ── DELETE /stores/:storeId/sticker-presets/:id ──────────────────────────────

router.delete(
  "/stores/:storeId/sticker-presets/:id",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [existing] = await db
      .select({ id: stylePresetsTable.id })
      .from(stylePresetsTable)
      .where(and(eq(stylePresetsTable.id, id), eq(stylePresetsTable.storeId, storeId)));

    if (!existing) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }

    await db
      .delete(stylePresetsTable)
      .where(and(eq(stylePresetsTable.id, id), eq(stylePresetsTable.storeId, storeId)));

    res.status(204).send();
  },
);

export default router;
