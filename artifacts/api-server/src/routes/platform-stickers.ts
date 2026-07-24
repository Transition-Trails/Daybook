/**
 * Platform Sticker Library — mutation routes (super_admin only)
 *
 * All routes require requireSuperAdmin. The existing
 * GET /platform/stickers lives in platform.ts.
 *
 * Route list
 * ──────────
 * POST   /platform/stickers/bulk/function-type   bulk set functionType
 * POST   /platform/stickers/bulk/add-to-pack     bulk add to a platform pack
 * POST   /platform/stickers/bulk/publish         bulk publish/unpublish
 * DELETE /platform/stickers/bulk                 bulk soft-delete
 *
 * POST   /platform/stickers                      create starter sticker (runs pipeline)
 * GET    /platform/stickers/:id                  get one
 * PATCH  /platform/stickers/:id                  edit any sticker (super_admin support)
 * POST   /platform/stickers/:id/duplicate        clone as draft starter
 * GET    /platform/stickers/:id/usage            pack / edition usage
 * DELETE /platform/stickers/:id                  soft-delete with pack guard
 *
 * NOTE: bulk routes are declared BEFORE /:id to prevent param capture.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  stickersLibraryTable,
  packStickersTable,
  stickerPacksTable,
  editionsTable,
  STICKER_FUNCTION_TYPES,
  type StickerFunctionType,
} from "@workspace/db";
import {
  eq,
  and,
  ne,
  isNull,
  inArray,
  sql,
  desc,
} from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import {
  removeBackground,
  applyBorderAndSize,
  generateCutlineSvg,
} from "../lib/imageProcessing";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return `stk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function isValidFunctionType(v: unknown): v is StickerFunctionType {
  return STICKER_FUNCTION_TYPES.includes(v as StickerFunctionType);
}

/** Normalize a name for duplicate detection: trim, collapse whitespace, lowercase. */
function normalizeName(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Find any non-deleted platform starter sticker with the same normalized name.
 * Used by the create route to prevent duplicate platform drafts.
 */
async function findPlatformStickerDup(
  name: string,
): Promise<{ id: string; name: string; status: string } | null> {
  const rows = (await db
    .select({ id: stickersLibraryTable.id, name: stickersLibraryTable.name, status: stickersLibraryTable.status })
    .from(stickersLibraryTable)
    .where(
      and(
        eq(stickersLibraryTable.origin, "starter"),
        isNull(stickersLibraryTable.authoredByStoreId),
        ne(stickersLibraryTable.status, "deleted"),
      ),
    )) as { id: string; name: string; status: string }[];
  const norm = normalizeName(name);
  return rows.find((r) => normalizeName(r.name) === norm) ?? null;
}

/** Run the full processing pipeline (bg removal → border → resize → cutline). */
async function runPipeline(params: {
  imageBase64: string;
  borderStyle?: string;
  borderWidth?: number | null;
  borderColor?: string | null;
  sizeInMm?: number | null;
  exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
}): Promise<{ processedImageData: string; cutlineSvg: string | null }> {
  const {
    imageBase64,
    borderStyle = "none",
    borderWidth,
    borderColor,
    sizeInMm,
    exportTargets = { goodnotes: true, ink: true, cricut: false },
  } = params;

  let processed = await removeBackground(imageBase64);

  if (borderStyle !== "none" || sizeInMm) {
    processed = await applyBorderAndSize(
      processed,
      borderStyle,
      borderWidth ?? null,
      borderColor ?? null,
      sizeInMm ?? null,
    );
  }

  const cutlineSvg = exportTargets.cricut
    ? await generateCutlineSvg(processed)
    : null;

  return { processedImageData: processed, cutlineSvg };
}

/**
 * Fetch a single sticker for mutation (no origin restriction — super_admin
 * can edit any sticker for support purposes).
 */
async function getPlatformSticker(
  id: string,
  res: Response,
): Promise<typeof stickersLibraryTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(stickersLibraryTable)
    .where(eq(stickersLibraryTable.id, id));

  if (!row || row.status === "deleted") {
    res.status(404).json({ error: "Sticker not found" });
    return null;
  }
  return row;
}

/**
 * For bulk operations: only operate on platform-owned (origin='starter')
 * stickers. Store-owned stickers remain managed by their authoring store.
 */
async function resolveStarterIds(
  ids: string[],
): Promise<{ valid: string[]; invalidCount: number }> {
  if (!ids.length) return { valid: [], invalidCount: 0 };
  const rows = await db
    .select({ id: stickersLibraryTable.id, origin: stickersLibraryTable.origin })
    .from(stickersLibraryTable)
    .where(inArray(stickersLibraryTable.id, ids));

  const valid = rows
    .filter((r) => r.origin === "starter")
    .map((r) => r.id);

  return { valid, invalidCount: ids.length - valid.length };
}

// ═════════════════════════════════════════════════════════════════════════════
// BULK ROUTES  (must appear before /:id)
// ═════════════════════════════════════════════════════════════════════════════

// ── POST /platform/stickers/bulk/function-type ────────────────────────────────

router.post(
  "/platform/stickers/bulk/function-type",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids, functionType } = req.body as { ids?: unknown; functionType?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }
    if (!isValidFunctionType(functionType)) {
      res.status(400).json({ error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` });
      return;
    }

    const { valid, invalidCount } = await resolveStarterIds(ids as string[]);
    if (!valid.length) {
      res.status(403).json({ error: "No eligible platform stickers in the selection" });
      return;
    }

    await db
      .update(stickersLibraryTable)
      .set({ functionType })
      .where(inArray(stickersLibraryTable.id, valid));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "sticker.bulk.set-function-type",
      targetType: "sticker",
      metadata: { functionType, count: valid.length, skipped: invalidCount },
    });

    res.json({ updated: valid.length, skipped: invalidCount });
  },
);

// ── POST /platform/stickers/bulk/add-to-pack ─────────────────────────────────

router.post(
  "/platform/stickers/bulk/add-to-pack",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids, packId } = req.body as { ids?: unknown; packId?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }
    if (typeof packId !== "string" || !packId) {
      res.status(400).json({ error: "packId is required" });
      return;
    }

    // Verify the pack exists (platform packs have origin='starter'/'licensed')
    const [pack] = await db
      .select({ id: stickerPacksTable.id, origin: stickerPacksTable.origin })
      .from(stickerPacksTable)
      .where(and(eq(stickerPacksTable.id, packId), ne(stickerPacksTable.status, "deleted")));

    if (!pack) {
      res.status(404).json({ error: "Pack not found" });
      return;
    }

    const { valid, invalidCount } = await resolveStarterIds(ids as string[]);
    if (!valid.length) {
      res.status(403).json({ error: "No eligible platform stickers in the selection" });
      return;
    }

    // Determine max position
    const [posRow] = await db
      .select({ maxPos: sql<number>`max(${packStickersTable.position})` })
      .from(packStickersTable)
      .where(eq(packStickersTable.packId, packId));
    const basePos = (posRow?.maxPos ?? -1) + 1;

    const values = valid.map((stickerId, i) => ({
      packId,
      stickerId,
      position: basePos + i,
    }));

    await db.insert(packStickersTable).values(values).onConflictDoNothing();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "sticker.bulk.add-to-pack",
      targetType: "pack",
      targetId: packId,
      metadata: { count: valid.length, skipped: invalidCount },
    });

    res.json({ added: valid.length, skipped: invalidCount });
  },
);

// ── POST /platform/stickers/bulk/publish ──────────────────────────────────────

router.post(
  "/platform/stickers/bulk/publish",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids, publish } = req.body as { ids?: unknown; publish?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }
    if (typeof publish !== "boolean") {
      res.status(400).json({ error: "publish (boolean) is required" });
      return;
    }

    const { valid, invalidCount } = await resolveStarterIds(ids as string[]);
    if (!valid.length) {
      res.status(403).json({ error: "No eligible platform stickers in the selection" });
      return;
    }

    const newStatus = publish ? "live" : "draft";
    await db
      .update(stickersLibraryTable)
      .set({ status: newStatus })
      .where(inArray(stickersLibraryTable.id, valid));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: publish ? "sticker.bulk.publish" : "sticker.bulk.unpublish",
      targetType: "sticker",
      metadata: { count: valid.length, skipped: invalidCount },
    });

    res.json({ updated: valid.length, skipped: (ids as string[]).length - valid.length });
  },
);

// ── DELETE /platform/stickers/bulk ───────────────────────────────────────────

router.delete(
  "/platform/stickers/bulk",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids } = req.body as { ids?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }

    const { valid, invalidCount } = await resolveStarterIds(ids as string[]);
    if (!valid.length) {
      res.status(403).json({ error: "No eligible platform stickers in the selection" });
      return;
    }

    await db.delete(packStickersTable).where(inArray(packStickersTable.stickerId, valid));
    await db
      .update(stickersLibraryTable)
      .set({ status: "deleted" })
      .where(inArray(stickersLibraryTable.id, valid));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "sticker.bulk.delete",
      targetType: "sticker",
      metadata: { count: valid.length, skipped: invalidCount },
    });

    res.json({ deleted: valid.length, skipped: invalidCount });
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// COLLECTION ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// ── POST /platform/stickers ───────────────────────────────────────────────────

router.post(
  "/platform/stickers",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;

    const {
      name,
      tags,
      functionType,
      imageBase64,
      borderStyle,
      borderWidth,
      borderColor,
      sizeInMm,
      exportTargets,
      status: reqStatus,
    } = req.body as {
      name?: string;
      tags?: string[];
      functionType?: string;
      imageBase64?: string;
      borderStyle?: string;
      borderWidth?: number;
      borderColor?: string;
      sizeInMm?: number;
      exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
      status?: "draft" | "live";
    };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!isValidFunctionType(functionType)) {
      res.status(400).json({ error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` });
      return;
    }
    if (!imageBase64 || !imageBase64.startsWith("data:image/")) {
      res.status(400).json({ error: "imageBase64 must be a base64-encoded image data URL (data:image/...)" });
      return;
    }

    const status: "draft" | "live" = reqStatus === "live" ? "live" : "draft";

    // ── Dedup guard — check before the expensive pipeline ──────────────────
    const dup = await findPlatformStickerDup(name);
    if (dup && dup.status === "live") {
      res.status(409).json({
        error: `A live platform sticker named "${name}" already exists — open it to edit instead.`,
        existingId: dup.id,
      });
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    const resolvedExportTargets = exportTargets ?? { goodnotes: true, ink: true, cricut: false };
    const resolvedBorderStyle = borderStyle ?? "none";

    let processedImageData: string;
    let cutlineSvg: string | null = null;

    try {
      const result = await runPipeline({
        imageBase64,
        borderStyle: resolvedBorderStyle,
        borderWidth,
        borderColor,
        sizeInMm,
        exportTargets: resolvedExportTargets,
      });
      processedImageData = result.processedImageData;
      cutlineSvg = result.cutlineSvg;
    } catch (pipelineErr) {
      req.log.error({ err: pipelineErr }, "platform sticker pipeline failed");
      res.status(500).json({ error: "Image processing failed" });
      return;
    }

    const stickerFields = {
      name,
      tags: (tags ?? []) as string[],
      functionType: functionType as StickerFunctionType,
      status,
      borderStyle: resolvedBorderStyle,
      borderWidth: borderWidth ?? null,
      borderColor: borderColor ?? null,
      sizeInMm: sizeInMm ?? null,
      exportTargets: resolvedExportTargets,
      processedImageData,
      cutlineSvg,
    };

    try {
      if (dup) {
        // Existing draft — update in place instead of inserting a second row.
        const [updated] = await db
          .update(stickersLibraryTable)
          .set(stickerFields)
          .where(eq(stickersLibraryTable.id, dup.id))
          .returning();
        await writeAudit(db, {
          actorUserId: actor.userId,
          actorRole: actor.effectiveRole,
          scope: "platform",
          action: "sticker.edit",
          targetType: "sticker",
          targetId: dup.id,
          metadata: { name, functionType, status, origin: "starter", upserted: true },
        });
        res.json({ ...updated, upserted: true });
      } else {
        // No collision — create a fresh row.
        const id = genId();
        const [row] = await db
          .insert(stickersLibraryTable)
          .values({
            id,
            origin: "starter",
            authoredByStoreId: null,
            ...stickerFields,
          })
          .returning();
        await writeAudit(db, {
          actorUserId: actor.userId,
          actorRole: actor.effectiveRole,
          scope: "platform",
          action: status === "live" ? "sticker.publish" : "sticker.create",
          targetType: "sticker",
          targetId: id,
          metadata: { name, functionType, status, origin: "starter" },
        });
        res.status(201).json(row);
      }
    } catch (err) {
      req.log.error({ err }, "platform sticker create failed");
      res.status(500).json({ error: "Create failed" });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// ITEM ROUTES  (/:id must come after bulk routes)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /platform/stickers/:id ────────────────────────────────────────────────

router.get(
  "/platform/stickers/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const row = await getPlatformSticker(id, res);
    if (!row) return;

    const packs = await db
      .select({ packId: packStickersTable.packId, position: packStickersTable.position })
      .from(packStickersTable)
      .where(eq(packStickersTable.stickerId, id));

    res.json({ ...row, packs });
  },
);

// ── PATCH /platform/stickers/:id ─────────────────────────────────────────────

router.patch(
  "/platform/stickers/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const row = await getPlatformSticker(id, res);
    if (!row) return;

    const {
      name,
      tags,
      functionType,
      imageBase64,
      borderStyle,
      borderWidth,
      borderColor,
      sizeInMm,
      exportTargets,
      status,
    } = req.body as {
      name?: string;
      tags?: string[];
      functionType?: string;
      imageBase64?: string;
      borderStyle?: string;
      borderWidth?: number | null;
      borderColor?: string | null;
      sizeInMm?: number | null;
      exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
      status?: "draft" | "live";
    };

    if (functionType !== undefined && !isValidFunctionType(functionType)) {
      res.status(400).json({ error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` });
      return;
    }

    const pipelineFields = [imageBase64, borderStyle, borderWidth, borderColor, sizeInMm, exportTargets];
    const pipelineChanged = pipelineFields.some((f) => f !== undefined);

    type UpdateData = Partial<typeof stickersLibraryTable.$inferInsert>;
    const updateData: UpdateData = {};
    if (name !== undefined) updateData.name = name;
    if (tags !== undefined) updateData.tags = tags as string[];
    if (functionType !== undefined) updateData.functionType = functionType as StickerFunctionType;
    if (status !== undefined) updateData.status = status;
    if (borderStyle !== undefined) updateData.borderStyle = borderStyle;
    if (borderWidth !== undefined) updateData.borderWidth = borderWidth;
    if (borderColor !== undefined) updateData.borderColor = borderColor;
    if (sizeInMm !== undefined) updateData.sizeInMm = sizeInMm;
    if (exportTargets !== undefined) updateData.exportTargets = exportTargets;

    if (pipelineChanged) {
      const effectiveImage = imageBase64 ?? row.processedImageData ?? "";
      if (!effectiveImage.startsWith("data:image/")) {
        res.status(400).json({ error: "No usable image data for pipeline re-run" });
        return;
      }

      try {
        const result = await runPipeline({
          imageBase64: effectiveImage,
          borderStyle: borderStyle ?? row.borderStyle,
          borderWidth: borderWidth ?? row.borderWidth,
          borderColor: borderColor ?? row.borderColor,
          sizeInMm: sizeInMm ?? row.sizeInMm,
          exportTargets: exportTargets ?? (row.exportTargets as { goodnotes: boolean; ink: boolean; cricut: boolean }),
        });
        updateData.processedImageData = result.processedImageData;
        updateData.cutlineSvg = result.cutlineSvg;
      } catch (pipelineErr) {
        req.log.error({ err: pipelineErr }, "platform sticker pipeline re-run failed");
        res.status(500).json({ error: "Image processing failed" });
        return;
      }
    }

    if (Object.keys(updateData).length === 0) {
      res.json(row);
      return;
    }

    const [updated] = await db
      .update(stickersLibraryTable)
      .set(updateData)
      .where(eq(stickersLibraryTable.id, id))
      .returning();

    const prevStatus = row.status;
    const auditAction =
      prevStatus !== updated.status
        ? updated.status === "live"
          ? "sticker.publish"
          : "sticker.unpublish"
        : "sticker.edit";

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: auditAction,
      targetType: "sticker",
      targetId: id,
      metadata: { ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });

    res.json(updated);
  },
);

// ── POST /platform/stickers/:id/duplicate ────────────────────────────────────

router.post(
  "/platform/stickers/:id/duplicate",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const row = await getPlatformSticker(id, res);
    if (!row) return;

    const newId = genId();
    const [cloned] = await db
      .insert(stickersLibraryTable)
      .values({
        id: newId,
        name: `${row.name} copy`,
        tags: row.tags as string[],
        functionType: row.functionType as StickerFunctionType,
        status: "draft",
        origin: "starter",          // clones always become platform starters
        authoredByStoreId: null,
        borderStyle: row.borderStyle,
        borderWidth: row.borderWidth,
        borderColor: row.borderColor,
        sizeInMm: row.sizeInMm,
        exportTargets: row.exportTargets as { goodnotes: boolean; ink: boolean; cricut: boolean },
        processedImageData: row.processedImageData,
        cutlineSvg: row.cutlineSvg,
      })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "sticker.duplicate",
      targetType: "sticker",
      targetId: newId,
      metadata: { sourceId: id, name: cloned.name },
    });

    res.status(201).json(cloned);
  },
);

// ── GET /platform/stickers/:id/usage ─────────────────────────────────────────

router.get(
  "/platform/stickers/:id/usage",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const [sticker] = await db
      .select({ id: stickersLibraryTable.id })
      .from(stickersLibraryTable)
      .where(and(eq(stickersLibraryTable.id, id), ne(stickersLibraryTable.status, "deleted")));

    if (!sticker) {
      res.status(404).json({ error: "Sticker not found" });
      return;
    }

    const packRows = await db
      .select({
        packId: packStickersTable.packId,
        packName: stickerPacksTable.name,
        packStatus: stickerPacksTable.status,
        position: packStickersTable.position,
      })
      .from(packStickersTable)
      .leftJoin(stickerPacksTable, eq(packStickersTable.packId, stickerPacksTable.id))
      .where(eq(packStickersTable.stickerId, id));

    const packIds = packRows.map((p) => p.packId);
    let editionRefs: { editionId: string; editionName: string; packId: string }[] = [];

    if (packIds.length > 0) {
      const editions = await db
        .select({ id: editionsTable.id, name: editionsTable.name, packs: editionsTable.packs })
        .from(editionsTable)
        .where(ne(editionsTable.status, "deleted"));

      for (const ed of editions) {
        const edPacks = (ed.packs as string[]) ?? [];
        for (const packId of packIds) {
          if (edPacks.includes(packId)) {
            editionRefs.push({ editionId: ed.id, editionName: ed.name, packId });
          }
        }
      }
    }

    res.json({ stickerId: id, packs: packRows, editions: editionRefs });
  },
);

// ── DELETE /platform/stickers/:id ────────────────────────────────────────────

router.delete(
  "/platform/stickers/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const row = await getPlatformSticker(id, res);
    if (!row) return;

    const force = req.query.force === "true";

    const packRefs = await db
      .select({ packId: packStickersTable.packId, packName: stickerPacksTable.name })
      .from(packStickersTable)
      .leftJoin(stickerPacksTable, eq(packStickersTable.packId, stickerPacksTable.id))
      .where(eq(packStickersTable.stickerId, id));

    if (packRefs.length > 0 && !force) {
      res.status(409).json({
        error: `Sticker is used in ${packRefs.length} pack(s)`,
        affectedPacks: packRefs.map((p) => ({ id: p.packId, name: p.packName })),
      });
      return;
    }

    if (packRefs.length > 0) {
      await db.delete(packStickersTable).where(eq(packStickersTable.stickerId, id));
    }
    await db
      .update(stickersLibraryTable)
      .set({ status: "deleted" })
      .where(eq(stickersLibraryTable.id, id));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "sticker.delete",
      targetType: "sticker",
      targetId: id,
      metadata: { name: row.name, force, detachedFromPacks: packRefs.map((p) => p.packId) },
    });

    res.status(204).send();
  },
);

// ── GET /platform/sticker-packs ───────────────────────────────────────────────
// Returns platform-origin packs for the "add to pack" modal.

router.get(
  "/platform/sticker-packs",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: stickerPacksTable.id,
        name: stickerPacksTable.name,
        origin: stickerPacksTable.origin,
        status: stickerPacksTable.status,
      })
      .from(stickerPacksTable)
      .where(and(
        ne(stickerPacksTable.status, "deleted"),
        ne(stickerPacksTable.origin, "owned"),
      ))
      .orderBy(desc(stickerPacksTable.name));

    res.json(rows);
  },
);

export default router;
