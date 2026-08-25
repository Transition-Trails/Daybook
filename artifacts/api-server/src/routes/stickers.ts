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
import sharp from "sharp";
import { db } from "@workspace/db";
import {
  stickersLibraryTable,
  packStickersTable,
  stickerPacksTable,
  stylePresetsTable,
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
  adjustCutlineSvgForShadow,
  edgeFeather,
  addDropShadow,
  UserImageError,
} from "../lib/imageProcessing";
import { callAi, generateImage } from "../lib/ai-proxy";
import { buildProfileGrounding } from "../lib/profile-grounding";
import { renderLabelPng } from "../lib/labelImageGen";
import { storeProfilesTable, storeFlagsTable } from "@workspace/db";
import type { ActorContext } from "../lib/roles";
import { findSameStoreName } from "../lib/store-name-dedup";

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

/** Run the full processing pipeline (bg removal → feather → border → resize → shadow → cutline). */
async function runPipeline(params: {
  imageBase64: string;
  borderStyle?: string;
  borderWidth?: number | null;
  borderColor?: string | null;
  sizeInMm?: number | null;
  exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
  edgeFeatherPx?: number | null;
  shadowStyle?: string | null;
  shadowLiftPx?: number | null;
}): Promise<{ processedImageData: string; cutlineSvg: string | null }> {
  const {
    imageBase64,
    borderStyle = "none",
    borderWidth,
    borderColor,
    sizeInMm,
    exportTargets = { goodnotes: true, ink: true, cricut: false },
    edgeFeatherPx,
    shadowStyle,
    shadowLiftPx,
  } = params;

  // Step 1: background removal
  let processed = await removeBackground(imageBase64);

  // Step 2: edge feather (photo stickers — soften the silhouette edge)
  if (edgeFeatherPx && edgeFeatherPx > 0) {
    processed = await edgeFeather(processed, edgeFeatherPx);
  }

  // Step 3: border + resize
  if (borderStyle !== "none" || sizeInMm) {
    processed = await applyBorderAndSize(
      processed,
      borderStyle,
      borderWidth ?? null,
      borderColor ?? null,
      sizeInMm ?? null,
    );
  }

  // Step 4: trace cutline from the PRE-shadow image
  // (shadow halo must not inflate the cut path)
  let cutlineSvg = exportTargets.cricut
    ? await generateCutlineSvg(processed)
    : null;

  // Step 5: bake drop shadow (expands the canvas — must come AFTER cutline tracing)
  if (shadowStyle && shadowStyle !== "none") {
    processed = await addDropShadow(processed, shadowStyle, shadowLiftPx ?? 4);
    // FIX #41: the shadow expands the PNG canvas by `pad` pixels on every side.
    // Without this adjustment the SVG viewBox is smaller than the exported PNG,
    // causing Cricut Design Space to misalign the cut path relative to the artwork.
    if (cutlineSvg) {
      cutlineSvg = adjustCutlineSvgForShadow(cutlineSvg, shadowStyle, shadowLiftPx ?? 4);
    }
  }

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

    // Size guard — reject before magic-byte decode and the expensive pipeline (5 MB decoded ≈ 6.7 MB base64)
    const b64Payload = imageBase64.replace(/^data:image\/[a-z+]+;base64,/, "");
    const approxBytes = Math.ceil(b64Payload.length * 0.75);
    if (approxBytes > 5 * 1024 * 1024) {
      res.status(400).json({ error: "Image too large — maximum 5 MB per sticker" });
      return;
    }
    {
      const { validateBase64ImageMagicBytes } = await import("../lib/upload-guard.js");
      const magicErr = validateBase64ImageMagicBytes(imageBase64, "imageBase64");
      if (magicErr) { res.status(400).json({ error: magicErr }); return; }
    }

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({ error: "Publishing requires store_owner role" });
      return;
    }
    const status: "draft" | "live" = reqStatus === "live" && canPublish ? "live" : "draft";

    // ── Dedup guard — check before the expensive pipeline ──────────────────
    const dup = await findSameStoreName(stickersLibraryTable, storeId, name);
    if (dup && dup.status === "live") {
      res.status(409).json({
        error: `A live sticker named "${name}" already exists for this store — open it to edit instead.`,
        existingId: dup.id,
      });
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

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
      if (pipelineErr instanceof UserImageError) {
        res.status(400).json({ error: pipelineErr.message });
      } else {
        req.log.error({ err: pipelineErr }, "sticker pipeline failed");
        res.status(500).json({ error: "Image processing failed" });
      }
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
          scope: storeId,
          action: "sticker.edit",
          targetType: "sticker",
          targetId: dup.id,
          metadata: { name, functionType, status, storeId, upserted: true },
        });
        res.json({ ...updated, upserted: true });
      } else {
        // No collision — create a fresh row.
        const id = genId();
        const [row] = await db
          .insert(stickersLibraryTable)
          .values({
            id,
            origin: "owned",
            authoredByStoreId: storeId,
            ...stickerFields,
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
      }
    } catch (err) {
      req.log.error({ err }, "sticker create failed");
      res.status(500).json({ error: "Create failed" });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// STICKER STUDIO — GENERATION ROUTES  (must appear before /:id)
// ═════════════════════════════════════════════════════════════════════════════

// ── Shared AI helpers ─────────────────────────────────────────────────────────

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

async function fetchGrounding(storeId: string): Promise<string> {
  const [profile] = await db
    .select()
    .from(storeProfilesTable)
    .where(eq(storeProfilesTable.storeId, storeId));
  return buildProfileGrounding(profile ?? null);
}

// ── POST /stores/:storeId/stickers/batch ─────────────────────────────────────
// Batch create up to 50 stickers. Per-item errors are logged but do not abort
// the batch — failed items return { status: "failed", reason } without a DB row.

router.post(
  "/stores/:storeId/stickers/batch",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const { items } = req.body as {
      items?: Array<{
        name?: string;
        imageBase64?: string;
        functionType?: string;
        borderStyle?: string;
        borderWidth?: number;
        borderColor?: string;
        sizeInMm?: number;
        shadowStyle?: string;
        shadowLiftPx?: number;
        edgeFeatherPx?: number;
        exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
        sourceType?: string;
        fileNamePattern?: string;
      }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items must be a non-empty array" });
      return;
    }
    if (items.length > 50) {
      res.status(400).json({ error: "Batch limit is 50 items per request" });
      return;
    }

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";

    const results: Array<{ name: string; id?: string; status: "ok" | "failed"; reason?: string }> = [];

    for (const item of items) {
      const name = item.name ?? "";
      if (!name) {
        results.push({ name: "(unnamed)", status: "failed", reason: "name is required" });
        continue;
      }
      if (!item.imageBase64 || !item.imageBase64.startsWith("data:image/")) {
        results.push({ name, status: "failed", reason: "imageBase64 must be a valid image data URL" });
        continue;
      }
      if (!isValidFunctionType(item.functionType)) {
        results.push({ name, status: "failed", reason: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` });
        continue;
      }
      const duplicate = await findSameStoreName(stickersLibraryTable, storeId, name);
      if (duplicate) {
        results.push({
          name,
          id: duplicate.id,
          status: "failed",
          reason: `A non-deleted sticker named "${name}" already exists for this store`,
        });
        continue;
      }

      // Size guard
      const b64 = item.imageBase64.replace(/^data:image\/[a-z+]+;base64,/, "");
      if (Math.ceil(b64.length * 0.75) > 5 * 1024 * 1024) {
        results.push({ name, status: "failed", reason: "Image too large — maximum 5 MB per sticker" });
        continue;
      }

      try {
        const { processedImageData, cutlineSvg } = await runPipeline({
          imageBase64: item.imageBase64,
          borderStyle: item.borderStyle ?? "none",
          borderWidth: item.borderWidth,
          borderColor: item.borderColor,
          sizeInMm: item.sizeInMm,
          exportTargets: item.exportTargets ?? { goodnotes: true, ink: true, cricut: false },
          edgeFeatherPx: item.edgeFeatherPx,
          shadowStyle: item.shadowStyle,
          shadowLiftPx: item.shadowLiftPx,
        });

        const id = genId();
        const [row] = await db
          .insert(stickersLibraryTable)
          .values({
            id,
            name,
            tags: [] as string[],
            functionType: item.functionType as StickerFunctionType,
            status: "draft",
            origin: "owned",
            authoredByStoreId: storeId,
            borderStyle: item.borderStyle ?? "none",
            borderWidth: item.borderWidth ?? null,
            borderColor: item.borderColor ?? null,
            sizeInMm: item.sizeInMm ?? null,
            exportTargets: item.exportTargets ?? { goodnotes: true, ink: true, cricut: false },
            generationType: "upload",
            sourceType: (item.sourceType as string) ?? "photo",
            shadowStyle: item.shadowStyle ?? null,
            shadowLiftPx: item.shadowLiftPx ?? null,
            edgeFeatherPx: item.edgeFeatherPx ?? null,
            fileNamePattern: item.fileNamePattern ?? null,
            processedImageData,
            cutlineSvg,
          })
          .returning();

        results.push({ name, id: row.id, status: "ok" });
      } catch (err) {
        const reason =
          err instanceof UserImageError
            ? err.message
            : "Image processing failed — check the image format and try again";
        results.push({ name, status: "failed", reason });
      }
    }

    const succeeded = results.filter((r) => r.status === "ok");
    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "sticker.batch.create",
      targetType: "sticker",
      metadata: { storeId, total: items.length, succeeded: succeeded.length, failed: items.length - succeeded.length },
    });

    res.status(200).json({ results, succeeded: succeeded.length, failed: items.length - succeeded.length });
  },
);

// ── POST /stores/:storeId/stickers/generate/functional ───────────────────────
// Claude generates a real <path>-based SVG for a functional sticker type.
// The SVG is the sticker — no image pipeline (bg already transparent).

router.post(
  "/stores/:storeId/stickers/generate/functional",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;
    if (!(await assertAiEnabled(storeId, res))) return;

    const { functionType, label, paletteColors, sizeInMm, name } = req.body as {
      functionType?: string;
      label?: string;
      paletteColors?: string[];
      sizeInMm?: number;
      name?: string;
    };

    if (!functionType || !isValidFunctionType(functionType)) {
      res.status(400).json({ error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` });
      return;
    }

    const stickerName = name ?? `${functionType}${label ? ` — ${label}` : ""}`;
    const existing = await findSameStoreName(stickersLibraryTable, storeId, stickerName);
    if (existing) {
      res.status(409).json({
        error: `A non-deleted sticker named "${stickerName}" already exists for this store`,
        existingId: existing.id,
      });
      return;
    }
    const resolvedSize = sizeInMm ?? (functionType === "tab" ? 24 : functionType === "banner" ? 60 : functionType === "date" ? 12 : 20);
    const primaryColor = paletteColors?.[0] ?? "#2D3748";
    const accentColor = paletteColors?.[1] ?? primaryColor;

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = [
      grounding,
      "",
      "## Task — Functional Sticker SVG",
      `Generate a single SVG for a "${functionType}" digital planner sticker${label ? ` with the label "${label}"` : ""}.`,
      `Target size: ${resolvedSize} mm × ${resolvedSize} mm. Primary color: ${primaryColor}. Accent color: ${accentColor}.`,
      "",
      "## SVG rules (STRICT)",
      "- Output ONLY the raw SVG — no markdown, no explanation, no code fences.",
      "- The SVG element must have a viewBox, width, and height in mm (e.g. viewBox='0 0 20 20' width='20mm' height='20mm').",
      "- Use ONLY <path>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <text>, <g> — NEVER <image> or raster fills.",
      "- Background must be transparent (no <rect fill='white'/> backdrop).",
      "- Paths must be closed (Z) where shape is filled.",
      "- Colors should use the palette colors provided.",
      "- Keep the design minimal and clean — it must print crisply at the target mm size.",
    ].join("\n");

    try {
      const result = await callAi(
        [{ role: "user", content: `Generate a ${functionType} sticker SVG${label ? ` with label "${label}"` : ""} in ${primaryColor}.` }],
        "claude",
        systemPrompt,
      );

      // Strip markdown fences if Claude wrapped in them
      const rawSvg = result.content
        .replace(/```(?:svg|xml)?\s*/gi, "")
        .replace(/```/g, "")
        .trim();

      // Validate: must contain an <svg> tag and at least one structural element
      if (!rawSvg.includes("<svg") || !/<(path|rect|circle|ellipse|polygon|polyline|text)/i.test(rawSvg)) {
        res.status(502).json({ error: "Claude returned invalid SVG — retrying may help", raw: rawSvg.slice(0, 500) });
        return;
      }

      // Store as SVG data URL — no raster pipeline needed
      const svgBase64 = Buffer.from(rawSvg).toString("base64");
      const processedImageData = `data:image/svg+xml;base64,${svgBase64}`;

      // Extract the outer <path> for cutline (take the first path element's 'd' attribute)
      const cutlineMatch = rawSvg.match(/<path[^>]*\bd="([^"]+)"/i);
      const cutlineSvg = cutlineMatch
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${resolvedSize} ${resolvedSize}"><path d="${cutlineMatch[1]}" fill="none" stroke="#000000" stroke-width="0.5"/></svg>`
        : null;

      // Persist the sticker
      const id = genId();
      const [row] = await db
        .insert(stickersLibraryTable)
        .values({
          id,
          name: stickerName,
          tags: [functionType],
          functionType: functionType as StickerFunctionType,
          status: "draft",
          origin: "owned",
          authoredByStoreId: storeId,
          borderStyle: "none",
          exportTargets: { goodnotes: true, ink: true, cricut: !!cutlineMatch },
          generationType: "functional-svg",
          sourceType: "generated-svg",
          sizeInMm: resolvedSize,
          setLabel: label ?? null,
          processedImageData,
          cutlineSvg,
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "sticker.generate.functional",
        targetType: "sticker",
        targetId: id,
        metadata: { storeId, functionType, label, model: result.model },
      });

      res.status(201).json({ ...row, model: result.model, provider: result.provider });
    } catch (err) {
      req.log?.error({ err }, "functional SVG generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/stickers/generate/text-set ─────────────────────────
// Renders a full set of text labels (dates 1-31, weekdays, months) as individual
// sticker rows. Uses SVG-based rendering via sharp (no image pipeline needed).

router.post(
  "/stores/:storeId/stickers/generate/text-set",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const {
      setType,
      fontKey = "sans-bold",
      color = "#1A202C",
      sizeInMm,
      exportTargets,
      packId,
    } = req.body as {
      setType?: string;
      fontKey?: string;
      color?: string;
      sizeInMm?: number;
      exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
      packId?: string;
    };

    const VALID_FONT_KEYS = ["sans", "sans-bold", "serif", "serif-bold", "mono", "mono-bold"] as const;
    const resolvedFontKey = VALID_FONT_KEYS.includes(fontKey as typeof VALID_FONT_KEYS[number])
      ? fontKey
      : "sans-bold";

    const VALID_SET_TYPES = [
      "dates-1-31", "dates-padded", "dates-ordinal",
      "weekdays-long", "weekdays-short", "weekdays-initial",
      "months-long", "months-short", "months-numeric",
    ] as const;

    if (!setType || !VALID_SET_TYPES.includes(setType as typeof VALID_SET_TYPES[number])) {
      res.status(400).json({ error: `setType must be one of: ${VALID_SET_TYPES.join(", ")}` });
      return;
    }

    // Derive labels from setType
    function ordinalSuffix(n: number): string {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const WEEKDAYS_INITIAL = ["M", "T", "W", "T", "F", "S", "S"];
    const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const labelsAndTypes: Array<{ label: string; functionType: StickerFunctionType; defaultSizeMm: number }> = [];

    if (setType === "dates-1-31") {
      for (let i = 1; i <= 31; i++) labelsAndTypes.push({ label: String(i), functionType: "date", defaultSizeMm: 12 });
    } else if (setType === "dates-padded") {
      for (let i = 1; i <= 31; i++) labelsAndTypes.push({ label: String(i).padStart(2, "0"), functionType: "date", defaultSizeMm: 12 });
    } else if (setType === "dates-ordinal") {
      for (let i = 1; i <= 31; i++) labelsAndTypes.push({ label: ordinalSuffix(i), functionType: "date", defaultSizeMm: 12 });
    } else if (setType === "weekdays-long") {
      WEEKDAYS_LONG.forEach((l) => labelsAndTypes.push({ label: l, functionType: "tab", defaultSizeMm: 24 }));
    } else if (setType === "weekdays-short") {
      WEEKDAYS_SHORT.forEach((l) => labelsAndTypes.push({ label: l, functionType: "tab", defaultSizeMm: 20 }));
    } else if (setType === "weekdays-initial") {
      WEEKDAYS_INITIAL.forEach((l) => labelsAndTypes.push({ label: l, functionType: "tab", defaultSizeMm: 16 }));
    } else if (setType === "months-long") {
      MONTHS_LONG.forEach((l) => labelsAndTypes.push({ label: l, functionType: "banner", defaultSizeMm: 60 }));
    } else if (setType === "months-short") {
      MONTHS_SHORT.forEach((l) => labelsAndTypes.push({ label: l, functionType: "banner", defaultSizeMm: 40 }));
    } else if (setType === "months-numeric") {
      for (let i = 1; i <= 12; i++) labelsAndTypes.push({ label: String(i).padStart(2, "0"), functionType: "date", defaultSizeMm: 12 });
    }

    // ── Pack ownership guard ─────────────────────────────────────────────────
    // Validate before the loop so we fail fast without creating orphaned stickers.
    if (packId) {
      const [ownedPack] = await db
        .select({ id: stickerPacksTable.id })
        .from(stickerPacksTable)
        .where(and(eq(stickerPacksTable.id, packId), eq(stickerPacksTable.authoredByStoreId, storeId)));
      if (!ownedPack) {
        res.status(404).json({ error: "packId not found or does not belong to this store" });
        return;
      }
    }

    const resolvedExportTargets = exportTargets ?? { goodnotes: true, ink: true, cricut: false };
    const createdIds: string[] = [];

    for (const { label, functionType, defaultSizeMm } of labelsAndTypes) {
      const resolvedSize = sizeInMm ?? defaultSizeMm;
      const name = `${setType} — ${label}`;
      const existing = await findSameStoreName(stickersLibraryTable, storeId, name);
      if (existing) {
        createdIds.push(existing.id);
        if (packId) {
          const [posRow] = await db
            .select({ maxPos: sql<number>`max(${packStickersTable.position})` })
            .from(packStickersTable)
            .where(eq(packStickersTable.packId, packId));
          const nextPos = (posRow?.maxPos ?? -1) + 1 + createdIds.length - 1;
          await db.insert(packStickersTable).values({ packId, stickerId: existing.id, position: nextPos }).onConflictDoNothing();
        }
        continue;
      }

      // Render label using bundled Google Fonts via resvg (same path as Planner Studio)
      const processedImageData = await renderLabelPng({
        label,
        fontKey: resolvedFontKey,
        color,
        sizeInMm: resolvedSize,
        borderStyle: "none",
      });

      const id = genId();
      const [row] = await db
        .insert(stickersLibraryTable)
        .values({
          id,
          name,
          tags: [setType],
          functionType,
          status: "draft",
          origin: "owned",
          authoredByStoreId: storeId,
          borderStyle: "none",
          sizeInMm: resolvedSize,
          exportTargets: resolvedExportTargets,
          generationType: "text-set",
          sourceType: "generated-text",
          setLabel: label,
          fileNamePattern: null,
          processedImageData,
          cutlineSvg: null,
        })
        .returning();

      createdIds.push(row.id);

      // Optionally add to a pack immediately (ownership already verified before loop)
      if (packId) {
        const [posRow] = await db
          .select({ maxPos: sql<number>`max(${packStickersTable.position})` })
          .from(packStickersTable)
          .where(eq(packStickersTable.packId, packId));
        const nextPos = (posRow?.maxPos ?? -1) + 1 + createdIds.length - 1;
        await db.insert(packStickersTable).values({ packId, stickerId: row.id, position: nextPos }).onConflictDoNothing();
      }
    }

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "sticker.generate.text-set",
      targetType: "sticker",
      metadata: { storeId, setType, count: createdIds.length, packId },
    });

    res.status(201).json({ created: createdIds.length, ids: createdIds, setType });
  },
);

// ── POST /stores/:storeId/stickers/generate/illustrative-prompt ───────────────
// Claude writes an image-generation prompt grounded in the store profile.
// No image model is invoked — returns the prompt, reasoning, and optional QA checklist.

router.post(
  "/stores/:storeId/stickers/generate/illustrative-prompt",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;
    if (!(await assertAiEnabled(storeId, res))) return;

    const { brief, referenceImageBase64 } = req.body as {
      brief?: string;
      referenceImageBase64?: string;
    };

    if (!brief) {
      res.status(400).json({ error: "brief is required" });
      return;
    }

    const grounding = await fetchGrounding(storeId);
    const systemPrompt = [
      grounding,
      "",
      "## Task — Illustrative Art Prompt Writer",
      "Write a detailed image-generation prompt for a digital planner sticker.",
      "Respond ONLY with valid JSON — no markdown, no explanation.",
      `{
  "prompt": "Detailed, ready-to-use image generation prompt (2–4 sentences). Include style, subject, colors, mood, and technical specs like 'white background', 'transparent PNG', 'no text'.",
  "reasoning": "Why this prompt fits the brand and concept (1–2 sentences).",
  "qaChecklist": null
}`,
      "qaChecklist: null unless a reference image was provided — then list 3–5 specific things to check that the generated image matches the reference.",
    ].join("\n");

    // Build messages — include reference image if provided (vision call)
    type MessageContent = string | Array<{
      type: "text" | "image";
      text?: string;
      source?: { type: "base64"; media_type: string; data: string };
    }>;

    const messages: Array<{ role: "user" | "assistant"; content: MessageContent }> = [];

    if (referenceImageBase64) {
      const mimeMatch = referenceImageBase64.match(/^data:(image\/[a-z+]+);base64,/);
      const mediaType = (mimeMatch?.[1] ?? "image/png") as string;
      const imageData = referenceImageBase64.replace(/^data:image\/[a-z+]+;base64,/, "");

      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageData },
          },
          {
            type: "text",
            text: `Reference image provided. Brief: ${brief}. Write a prompt to create a sticker in a similar style adapted to the store brand. Include a qaChecklist comparing against this reference.`,
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Brief: ${brief}. Write an image generation prompt for this sticker concept.`,
      });
    }

    try {
      const result = await callAi(
        messages as Array<{ role: "user" | "assistant"; content: string }>,
        "claude",
        systemPrompt,
      );

      // Parse JSON response
      const stripped = result.content
        .replace(/```(?:json)?\s*/gi, "")
        .replace(/```/g, "")
        .trim();
      const objMatch = stripped.match(/\{[\s\S]*\}/);
      let parsed: { prompt: string; reasoning: string; qaChecklist?: string[] | null } | null = null;
      try {
        parsed = objMatch ? JSON.parse(objMatch[0]) : null;
      } catch { /* fall through */ }

      if (!parsed?.prompt) {
        res.status(502).json({ error: "Claude returned malformed response", raw: result.content.slice(0, 500) });
        return;
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "sticker.generate.illustrative-prompt",
        targetType: "sticker",
        metadata: { storeId, hasReference: !!referenceImageBase64, model: result.model },
      });

      res.json({
        prompt: parsed.prompt,
        reasoning: parsed.reasoning,
        qaChecklist: parsed.qaChecklist ?? null,
        model: result.model,
        provider: result.provider,
      });
    } catch (err) {
      req.log?.error({ err }, "illustrative prompt generation failed");
      res.status(502).json({ error: `AI error: ${String(err)}` });
    }
  },
);

// ── POST /stores/:storeId/stickers/generate/illustrative-image ────────────────
// Takes a DALL-E-ready prompt (from the previous illustrative-prompt step or
// written directly) and returns a fully-processed sticker image.
// Calls DALL-E 3, then runs the full pipeline (bg removal → shadow → cutline).
// Does NOT persist — returns processedImageData for the frontend to preview.

router.post(
  "/stores/:storeId/stickers/generate/illustrative-image",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;
    if (!(await assertAiEnabled(storeId, res))) return;

    const { prompt, processingOptions } = req.body as {
      prompt?: string;
      processingOptions?: {
        borderStyle?: string;
        borderColor?: string;
        sizeInMm?: number;
        shadowStyle?: string;
        shadowLiftPx?: number;
      };
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    try {
      // 1. Generate the image with the shared GPT Image contract.
      const generatedImage = await generateImage(prompt.trim(), { quality: "high" });
      const { dataUrl: rawImageDataUrl, ...generationMetadata } = generatedImage;

      // 2. Process through the sticker pipeline (bg removal → border → shadow → cutline)
      const { processedImageData, cutlineSvg } = await runPipeline({
        imageBase64: rawImageDataUrl,
        borderStyle: processingOptions?.borderStyle ?? "none",
        borderColor: processingOptions?.borderColor ?? null,
        sizeInMm: processingOptions?.sizeInMm ?? 50,
        shadowStyle: processingOptions?.shadowStyle ?? "soft",
        shadowLiftPx: processingOptions?.shadowLiftPx ?? 8,
      });

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "sticker.generate.illustrative-image",
        targetType: "sticker",
        metadata: { storeId, promptLength: prompt.length, generation: generationMetadata },
      });

      res.json({ processedImageData, cutlineSvg, prompt: prompt.trim() });
    } catch (err) {
      if (err instanceof UserImageError) {
        res.status(400).json({ error: err.message });
      } else {
        req.log?.error({ err }, "illustrative image generation failed");
        res.status(500).json({ error: "Image generation failed. Please try again." });
      }
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
        if (pipelineErr instanceof UserImageError) {
          res.status(400).json({ error: pipelineErr.message });
        } else {
          req.log.error({ err: pipelineErr }, "sticker pipeline re-run failed");
          res.status(500).json({ error: "Image processing failed" });
        }
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
