/**
 * Store-Scoped Sticker Library Routes
 *
 * Auth model: same as owned-catalog.ts
 *   - starter / licensed stickers → read-only to stores; only super_admin can mutate
 *   - owned stickers → authoring store + super_admin can mutate; staff draft-only
 *
 * Route list
 * ──────────
 * POST   /stores/:storeId/stickers/bulk/function-type  bulk set functionType
 * POST   /stores/:storeId/stickers/bulk/add-to-pack    bulk add to a pack
 * POST   /stores/:storeId/stickers/bulk/publish        bulk publish/unpublish (owner)
 * DELETE /stores/:storeId/stickers/bulk                bulk soft-delete (owner)
 *
 * GET    /stores/:storeId/stickers                     list + search/filter
 * POST   /stores/:storeId/stickers                     create (runs pipeline)
 *
 * GET    /stores/:storeId/stickers/:id                 get one
 * PATCH  /stores/:storeId/stickers/:id                 edit (re-runs pipeline)
 * POST   /stores/:storeId/stickers/:id/duplicate       clone as draft
 * GET    /stores/:storeId/stickers/:id/usage           which packs reference it
 * DELETE /stores/:storeId/stickers/:id                 soft-delete with pack guard
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
  or,
  ne,
  inArray,
  notInArray,
  desc,
  ilike,
  sql,
} from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import {
  removeBackground,
  applyBorderAndSize,
  generateCutlineSvg,
} from "../lib/imageProcessing";
import type { ActorContext } from "../lib/roles";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return `stk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** Reject cross-store access. Super_admin bypasses. */
function assertSameStore(
  actor: ActorContext,
  urlStoreId: string,
  res: Response,
): boolean {
  if (actor.platformRole === "super_admin") return true;
  if (actor.storeId !== urlStoreId) {
    res.status(403).json({ error: "Forbidden: cross-store access denied" });
    return false;
  }
  return true;
}

function isValidFunctionType(v: unknown): v is StickerFunctionType {
  return STICKER_FUNCTION_TYPES.includes(v as StickerFunctionType);
}

/** Fetch a single owned sticker, enforcing origin=owned and store ownership. */
async function getOwnedSticker(
  id: string,
  storeId: string,
  isSuperAdmin: boolean,
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
  if (row.origin !== "owned") {
    res.status(403).json({ error: "Only owned stickers can be mutated here" });
    return null;
  }
  if (!isSuperAdmin && row.authoredByStoreId !== storeId) {
    res.status(403).json({ error: "This sticker belongs to another store" });
    return null;
  }
  return row;
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

  // Step 1: background removal
  let processed = await removeBackground(imageBase64);

  // Step 2: border + resize
  if (borderStyle !== "none" || sizeInMm) {
    processed = await applyBorderAndSize(
      processed,
      borderStyle,
      borderWidth ?? null,
      borderColor ?? null,
      sizeInMm ?? null,
    );
  }

  // Step 3: Cricut cut-path (only when requested)
  const cutlineSvg = exportTargets.cricut
    ? await generateCutlineSvg(processed)
    : null;

  return { processedImageData: processed, cutlineSvg };
}

// ── Ownership guard for bulk operations ───────────────────────────────────────

async function resolveOwnedIds(
  ids: string[],
  storeId: string,
  isSuperAdmin: boolean,
): Promise<{ valid: string[]; invalidCount: number }> {
  if (!ids.length) return { valid: [], invalidCount: 0 };
  const rows = await db
    .select({ id: stickersLibraryTable.id, origin: stickersLibraryTable.origin, authoredByStoreId: stickersLibraryTable.authoredByStoreId })
    .from(stickersLibraryTable)
    .where(inArray(stickersLibraryTable.id, ids));

  const valid = rows
    .filter(
      (r) =>
        r.origin === "owned" &&
        (isSuperAdmin || r.authoredByStoreId === storeId),
    )
    .map((r) => r.id);

  return { valid, invalidCount: ids.length - valid.length };
}

// ═════════════════════════════════════════════════════════════════════════════
// BULK ROUTES  (must appear before /:id)
// ═════════════════════════════════════════════════════════════════════════════

// ── POST /stores/:storeId/stickers/bulk/function-type ────────────────────────

router.post(
  "/stores/:storeId/stickers/bulk/function-type",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const { ids, functionType } = req.body as {
      ids?: unknown;
      functionType?: unknown;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }
    if (!isValidFunctionType(functionType)) {
      res.status(400).json({
        error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}`,
      });
      return;
    }

    const { valid, invalidCount } = await resolveOwnedIds(
      ids as string[],
      storeId,
      actor.isSuperAdmin,
    );
    if (!valid.length) {
      res.status(403).json({ error: "No eligible owned stickers in the selection" });
      return;
    }

    await db
      .update(stickersLibraryTable)
      .set({ functionType })
      .where(inArray(stickersLibraryTable.id, valid));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "sticker.bulk.set-function-type",
      targetType: "sticker",
      metadata: { functionType, count: valid.length, skipped: invalidCount, storeId },
    });

    res.json({ updated: valid.length, skipped: invalidCount });
  },
);

// ── POST /stores/:storeId/stickers/bulk/add-to-pack ──────────────────────────

router.post(
  "/stores/:storeId/stickers/bulk/add-to-pack",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const { ids, packId } = req.body as { ids?: unknown; packId?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }
    if (typeof packId !== "string" || !packId) {
      res.status(400).json({ error: "packId is required" });
      return;
    }

    // Verify the pack is accessible to this store
    const [pack] = await db
      .select({ id: stickerPacksTable.id, authoredByStoreId: stickerPacksTable.authoredByStoreId, origin: stickerPacksTable.origin })
      .from(stickerPacksTable)
      .where(and(eq(stickerPacksTable.id, packId), ne(stickerPacksTable.status, "deleted")));

    if (!pack) {
      res.status(404).json({ error: "Pack not found" });
      return;
    }
    if (!actor.isSuperAdmin && pack.origin === "owned" && pack.authoredByStoreId !== storeId) {
      res.status(403).json({ error: "Pack belongs to another store" });
      return;
    }

    const { valid, invalidCount } = await resolveOwnedIds(
      ids as string[],
      storeId,
      actor.isSuperAdmin,
    );
    if (!valid.length) {
      res.status(403).json({ error: "No eligible owned stickers in the selection" });
      return;
    }

    // Determine max position
    const [posRow] = await db
      .select({ maxPos: sql<number>`max(${packStickersTable.position})` })
      .from(packStickersTable)
      .where(eq(packStickersTable.packId, packId));
    const basePos = (posRow?.maxPos ?? -1) + 1;

    // Insert — ignore duplicates via on-conflict do nothing
    const values = valid.map((stickerId, i) => ({
      packId,
      stickerId,
      position: basePos + i,
    }));

    await db.insert(packStickersTable).values(values).onConflictDoNothing();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "sticker.bulk.add-to-pack",
      targetType: "pack",
      targetId: packId,
      metadata: { count: valid.length, skipped: invalidCount, storeId },
    });

    res.json({ added: valid.length, skipped: invalidCount });
  },
);

// ── POST /stores/:storeId/stickers/bulk/publish ───────────────────────────────

router.post(
  "/stores/:storeId/stickers/bulk/publish",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const { ids, publish } = req.body as { ids?: unknown; publish?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }
    if (typeof publish !== "boolean") {
      res.status(400).json({ error: "publish (boolean) is required" });
      return;
    }

    const { valid, invalidCount } = await resolveOwnedIds(
      ids as string[],
      storeId,
      actor.isSuperAdmin,
    );

    // Staff can only operate on draft items
    let eligible = valid;
    if (!canPublish) {
      const rows = await db
        .select({ id: stickersLibraryTable.id, status: stickersLibraryTable.status })
        .from(stickersLibraryTable)
        .where(inArray(stickersLibraryTable.id, valid));
      eligible = rows.filter((r) => r.status === "draft").map((r) => r.id);
      if (eligible.length === 0) {
        res.status(403).json({ error: "Staff can only operate on draft items" });
        return;
      }
    }

    if (!canPublish && publish) {
      res.status(403).json({ error: "Publishing requires store_owner role" });
      return;
    }

    const newStatus = publish ? "live" : "draft";
    await db
      .update(stickersLibraryTable)
      .set({ status: newStatus })
      .where(inArray(stickersLibraryTable.id, eligible));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: publish ? "sticker.bulk.publish" : "sticker.bulk.unpublish",
      targetType: "sticker",
      metadata: { count: eligible.length, skipped: ids.length - eligible.length, storeId },
    });

    res.json({ updated: eligible.length, skipped: (ids as string[]).length - eligible.length });
  },
);

// ── DELETE /stores/:storeId/stickers/bulk ─────────────────────────────────────

router.delete(
  "/stores/:storeId/stickers/bulk",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const canDelete = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (!canDelete) {
      res.status(403).json({ error: "Deleting stickers requires store_owner role" });
      return;
    }

    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }

    const { valid, invalidCount } = await resolveOwnedIds(
      ids as string[],
      storeId,
      actor.isSuperAdmin,
    );
    if (!valid.length) {
      res.status(403).json({ error: "No eligible owned stickers in the selection" });
      return;
    }

    // Detach from all packs first
    await db
      .delete(packStickersTable)
      .where(inArray(packStickersTable.stickerId, valid));

    // Soft-delete
    await db
      .update(stickersLibraryTable)
      .set({ status: "deleted" })
      .where(inArray(stickersLibraryTable.id, valid));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "sticker.bulk.delete",
      targetType: "sticker",
      metadata: { count: valid.length, skipped: invalidCount, storeId },
    });

    res.json({ deleted: valid.length, skipped: invalidCount });
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// COLLECTION ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /stores/:storeId/stickers ────────────────────────────────────────────

router.get(
  "/stores/:storeId/stickers",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const { q, functionType, scope } = req.query as {
      q?: string;
      functionType?: string;
      scope?: string;
    };

    // Show: owned stickers for this store + platform starter stickers (read-only)
    const scopeFilter = or(
      and(eq(stickersLibraryTable.origin, "owned"), eq(stickersLibraryTable.authoredByStoreId, storeId)),
      eq(stickersLibraryTable.origin, "starter"),
    )!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [scopeFilter, ne(stickersLibraryTable.status, "deleted")];

    if (q) {
      conditions.push(ilike(stickersLibraryTable.name, `%${q}%`));
    }

    if (functionType && isValidFunctionType(functionType)) {
      conditions.push(eq(stickersLibraryTable.functionType, functionType));
    }

    let rows = await db
      .select()
      .from(stickersLibraryTable)
      .where(and(...conditions))
      .orderBy(desc(stickersLibraryTable.createdAt));

    // Scope filter: needs pack membership info
    if (scope === "in-pack" || scope === "unassigned") {
      const packMemberships = await db
        .select({ stickerId: packStickersTable.stickerId })
        .from(packStickersTable)
        .where(
          inArray(
            packStickersTable.stickerId,
            rows.map((r) => r.id),
          ),
        );
      const inPackSet = new Set(packMemberships.map((m) => m.stickerId));

      if (scope === "in-pack") {
        rows = rows.filter((r) => inPackSet.has(r.id));
      } else {
        rows = rows.filter((r) => !inPackSet.has(r.id));
      }
    }

    // Tag search: if q looks like a tag, filter by tag content too
    let finalRows = rows;
    if (q) {
      // Include rows where q appears in any tag (case-insensitive)
      const qLower = q.toLowerCase();
      // Union: rows already matched by name + rows matching by tag
      const tagMatches = await db
        .select()
        .from(stickersLibraryTable)
        .where(
          and(
            scopeFilter,
            ne(stickersLibraryTable.status, "deleted"),
            sql`${stickersLibraryTable.tags}::text ilike ${"%" + qLower + "%"}`,
          ),
        );

      const existingIds = new Set(rows.map((r) => r.id));
      for (const r of tagMatches) {
        if (!existingIds.has(r.id)) {
          finalRows = [...finalRows, r];
          existingIds.add(r.id);
        }
      }
    }

    // Attach pack count to each sticker
    const allIds = finalRows.map((r) => r.id);
    let packCountMap: Record<string, number> = {};
    if (allIds.length) {
      const counts = await db
        .select({
          stickerId: packStickersTable.stickerId,
          count: sql<number>`count(*)::int`,
        })
        .from(packStickersTable)
        .where(inArray(packStickersTable.stickerId, allIds))
        .groupBy(packStickersTable.stickerId);
      packCountMap = Object.fromEntries(counts.map((c) => [c.stickerId, c.count]));
    }

    const result = finalRows.map((r) => ({
      ...r,
      packCount: packCountMap[r.id] ?? 0,
    }));

    res.json(result);
  },
);

// ── POST /stores/:storeId/stickers ───────────────────────────────────────────

router.post(
  "/stores/:storeId/stickers",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

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
      res.status(400).json({
        error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}`,
      });
      return;
    }
    if (!imageBase64 || !imageBase64.startsWith("data:image/")) {
      res.status(400).json({
        error: "imageBase64 must be a base64-encoded image data URL (data:image/...)",
      });
      return;
    }

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({ error: "Publishing requires store_owner role" });
      return;
    }
    const status: "draft" | "live" = reqStatus === "live" && canPublish ? "live" : "draft";

    const resolvedExportTargets = exportTargets ?? { goodnotes: true, ink: true, cricut: false };
    const resolvedBorderStyle = (borderStyle as string) ?? "none";

    let processedImageData: string | undefined;
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
      req.log.error({ err: pipelineErr }, "sticker pipeline failed");
      res.status(500).json({ error: "Image processing failed" });
      return;
    }

    try {
      const id = genId();
      const [row] = await db
        .insert(stickersLibraryTable)
        .values({
          id,
          name,
          tags: (tags ?? []) as string[],
          functionType: functionType as StickerFunctionType,
          status,
          origin: "owned",
          authoredByStoreId: storeId,
          borderStyle: resolvedBorderStyle,
          borderWidth: borderWidth ?? null,
          borderColor: borderColor ?? null,
          sizeInMm: sizeInMm ?? null,
          exportTargets: resolvedExportTargets,
          processedImageData,
          cutlineSvg,
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: status === "live" ? "sticker.publish" : "sticker.create",
        targetType: "sticker",
        targetId: id,
        metadata: { name, functionType, status, storeId },
      });

      res.status(201).json(row);
    } catch (err) {
      req.log.error({ err }, "sticker create failed");
      res.status(500).json({ error: "Create failed" });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// ITEM ROUTES  (/:id must come after bulk routes)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /stores/:storeId/stickers/:id ────────────────────────────────────────

router.get(
  "/stores/:storeId/stickers/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [row] = await db
      .select()
      .from(stickersLibraryTable)
      .where(
        and(
          eq(stickersLibraryTable.id, id),
          eq(stickersLibraryTable.origin, "owned"),
          eq(stickersLibraryTable.authoredByStoreId, storeId),
          ne(stickersLibraryTable.status, "deleted"),
        ),
      );

    if (!row) {
      res.status(404).json({ error: "Sticker not found" });
      return;
    }

    // Pack membership
    const packs = await db
      .select({ packId: packStickersTable.packId, position: packStickersTable.position })
      .from(packStickersTable)
      .where(eq(packStickersTable.stickerId, id));

    res.json({ ...row, packs });
  },
);

// ── PATCH /stores/:storeId/stickers/:id ──────────────────────────────────────

router.patch(
  "/stores/:storeId/stickers/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedSticker(id, storeId, actor.isSuperAdmin, res);
    if (!row) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const isStaff = !canPublish;

    if (isStaff && row.status !== "draft") {
      res.status(403).json({ error: "Staff can only edit draft stickers" });
      return;
    }

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

    if (status !== undefined && isStaff) {
      res.status(403).json({ error: "Publishing/unpublishing requires store_owner role" });
      return;
    }
    if (functionType !== undefined && !isValidFunctionType(functionType)) {
      res.status(400).json({
        error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}`,
      });
      return;
    }

    // Re-run pipeline if image or pipeline fields change
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
        req.log.error({ err: pipelineErr }, "sticker pipeline re-run failed");
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
      scope: storeId,
      action: auditAction,
      targetType: "sticker",
      targetId: id,
      metadata: { storeId, ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });

    res.json(updated);
  },
);

// ── POST /stores/:storeId/stickers/:id/duplicate ─────────────────────────────

router.post(
  "/stores/:storeId/stickers/:id/duplicate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedSticker(id, storeId, actor.isSuperAdmin, res);
    if (!row) return;

    const newId = genId();
    const [cloned] = await db
      .insert(stickersLibraryTable)
      .values({
        id: newId,
        name: `${row.name} copy`,
        tags: row.tags as string[],
        functionType: row.functionType as StickerFunctionType,
        status: "draft", // always draft
        origin: "owned",
        authoredByStoreId: storeId,
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
      scope: storeId,
      action: "sticker.duplicate",
      targetType: "sticker",
      targetId: newId,
      metadata: { sourceId: id, name: cloned.name, storeId },
    });

    res.status(201).json(cloned);
  },
);

// ── GET /stores/:storeId/stickers/:id/usage ───────────────────────────────────

router.get(
  "/stores/:storeId/stickers/:id/usage",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    // Confirm sticker exists and is accessible
    const [sticker] = await db
      .select({ id: stickersLibraryTable.id })
      .from(stickersLibraryTable)
      .where(
        and(
          eq(stickersLibraryTable.id, id),
          actor.isSuperAdmin
            ? sql`1=1`
            : eq(stickersLibraryTable.authoredByStoreId, storeId),
          ne(stickersLibraryTable.status, "deleted"),
        ),
      );

    if (!sticker) {
      res.status(404).json({ error: "Sticker not found" });
      return;
    }

    // Packs containing this sticker
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

    // Editions that reference those packs
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

    res.json({
      stickerId: id,
      packs: packRows,
      editions: editionRefs,
    });
  },
);

// ── DELETE /stores/:storeId/stickers/:id ─────────────────────────────────────

router.delete(
  "/stores/:storeId/stickers/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const canDelete = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (!canDelete) {
      res.status(403).json({ error: "Deleting stickers requires store_owner role" });
      return;
    }

    const row = await getOwnedSticker(id, storeId, actor.isSuperAdmin, res);
    if (!row) return;

    const force = req.query.force === "true";

    // Check pack references
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

    // Detach from all packs, then soft-delete
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
      scope: storeId,
      action: "sticker.delete",
      targetType: "sticker",
      targetId: id,
      metadata: {
        storeId,
        name: row.name,
        force,
        detachedFromPacks: packRefs.map((p) => p.packId),
      },
    });

    res.status(204).send();
  },
);

export default router;
