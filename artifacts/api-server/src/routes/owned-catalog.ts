/**
 * Store-Scoped Owned Catalog Routes
 *
 * Allows store_owner and store_staff to create catalog items with
 * origin='owned' and authoredByStoreId=<store>. These items are
 * exclusively visible to the authoring store (enforced by the
 * entitlement engine) and do NOT appear in the global catalog.
 *
 * POST /stores/:storeId/owned/themes          — staff+ can draft; owner can publish
 * POST /stores/:storeId/owned/sticker-packs   — staff+ can draft; owner can publish
 * POST /stores/:storeId/owned/editions        — staff+ can draft (always draft)
 * GET  /stores/:storeId/owned/attachable      — items available to attach in Edition Studio
 *                                               (store's owned + entitled licensed)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  storesTable,
  storeFlagsTable,
  themesTable,
  stickerPacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
} from "@workspace/db";
import { eq, and, or, ne, inArray } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { filterEntitled, resolveEntitlement, type EntitlementContext, type ItemOrigin } from "../lib/entitlement";

const router: IRouter = Router();

// ── Helper: check aiEnabled for this store ─────────────────────────────────

async function assertAiEnabled(
  storeId: string,
  res: Response,
): Promise<boolean> {
  const [flags] = await db
    .select()
    .from(storeFlagsTable)
    .where(eq(storeFlagsTable.storeId, storeId));
  if (!flags?.aiEnabled) {
    res.status(403).json({ error: "AI studios are not enabled for this store" });
    return false;
  }
  return true;
}

// ── Helper: generate a short owned-item ID ─────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// ── Helper: resolve store subscriptionActive ───────────────────────────────

async function getStoreCtx(storeId: string): Promise<EntitlementContext> {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  return {
    storeId,
    subscriptionActive: store?.subscriptionActive ?? true,
    isSuperAdmin: false,
  };
}

// ── Helper: validate that all submitted attach IDs are entitled for this store ─
// Returns an error string on the first violation, or null if all are valid.

async function validateAttachEntitlement(
  table: typeof themesTable | typeof stickerPacksTable | typeof insertsTable | typeof relatedProductsTable,
  ids: string[],
  type: string,
  ctx: EntitlementContext,
): Promise<string | null> {
  if (!ids.length) return null;

  const rows = await db
    .select({ id: table.id, origin: table.origin, authoredByStoreId: table.authoredByStoreId })
    .from(table)
    .where(inArray(table.id, ids));

  const foundIds = new Set(rows.map((r) => r.id));
  const missing = ids.find((id) => !foundIds.has(id));
  if (missing) return `Unknown ${type} ID: ${missing}`;

  for (const row of rows) {
    const status = resolveEntitlement(
      (row.origin ?? "licensed") as ItemOrigin,
      row.authoredByStoreId ?? null,
      ctx,
    );
    if (status !== "entitled") {
      return `${type} "${row.id}" is not available to your store (${status})`;
    }
  }
  return null;
}

// ── POST /stores/:storeId/owned/themes ────────────────────────────────────

router.post(
  "/stores/:storeId/owned/themes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;

    if (!await assertAiEnabled(storeId, res)) return;

    const { name, description, colors, status: reqStatus } = req.body as {
      name: string;
      description?: string;
      colors: string[];
      status?: "draft" | "live";
    };

    if (!name || !Array.isArray(colors) || colors.length === 0) {
      res.status(400).json({ error: "name and colors are required" });
      return;
    }

    // Only store_owner (or super_admin) may publish; staff always get draft.
    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const status: "draft" | "live" = (reqStatus === "live" && canPublish) ? "live" : "draft";

    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({
        error: "Publishing requires store_owner role. Re-submit without status='live' to save as draft.",
        savedAsDraft: true,
      });
      return;
    }

    try {
      const id = genId("th");
      const [row] = await db
        .insert(themesTable)
        .values({
          id,
          name,
          desc: description ?? `Theme authored by store ${storeId}`,
          colors: colors as string[],
          status,
          globalAvailable: false,
          origin: "owned",
          authoredByStoreId: storeId,
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: status === "live" ? "owned.theme.publish" : "owned.theme.create",
        targetType: "theme",
        targetId: id,
        metadata: { name, status, storeId },
      });

      res.status(201).json(row);
    } catch (err) {
      req.log.error({ err }, "owned theme create failed");
      res.status(500).json({ error: "Create failed" });
    }
  },
);

// ── POST /stores/:storeId/owned/sticker-packs ─────────────────────────────

router.post(
  "/stores/:storeId/owned/sticker-packs",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;

    if (!await assertAiEnabled(storeId, res)) return;

    const { name, tags, price, status: reqStatus } = req.body as {
      name: string;
      tags?: string[];
      price?: number;
      status?: "draft" | "live";
    };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const status: "draft" | "live" = (reqStatus === "live" && canPublish) ? "live" : "draft";

    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({
        error: "Publishing requires store_owner role. Re-submit without status='live' to save as draft.",
        savedAsDraft: true,
      });
      return;
    }

    try {
      const id = genId("pk");
      const [row] = await db
        .insert(stickerPacksTable)
        .values({
          id,
          name,
          tags: (tags ?? []) as string[],
          price: price ?? 0,
          status,
          globalAvailable: false,
          origin: "owned",
          authoredByStoreId: storeId,
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: status === "live" ? "owned.pack.publish" : "owned.pack.create",
        targetType: "pack",
        targetId: id,
        metadata: { name, status, storeId },
      });

      res.status(201).json(row);
    } catch (err) {
      req.log.error({ err }, "owned sticker-pack create failed");
      res.status(500).json({ error: "Create failed" });
    }
  },
);

// ── POST /stores/:storeId/owned/editions ──────────────────────────────────
// Editions created via this route are always draft (editions need review before going live).
// An auto-palette theme is optionally created alongside when palette is provided.

router.post(
  "/stores/:storeId/owned/editions",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;

    if (!await assertAiEnabled(storeId, res)) return;

    const {
      name,
      description,
      sections,
      priceLow,
      priceHigh,
      themeIds,
      packIds,
      insertIds,
      productIds,
      palette,
    } = req.body as {
      name: string;
      description?: string;
      sections?: string[];
      priceLow?: number;
      priceHigh?: number;
      themeIds?: string[];
      packIds?: string[];
      insertIds?: string[];
      productIds?: string[];
      palette?: string[]; // if provided, auto-create a matching draft theme
    };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    // ── Validate attached IDs against store entitlement (server-side) ────────
    // Prevents cross-store reference injection: every submitted ID must be
    // either owned by this store or entitled via subscription.
    const ctx = await getStoreCtx(storeId);
    const attachChecks: [typeof themesTable | typeof stickerPacksTable | typeof insertsTable | typeof relatedProductsTable, string[], string][] = [
      [themesTable,         (themeIds   ?? []), "theme"],
      [stickerPacksTable,   (packIds    ?? []), "sticker-pack"],
      [insertsTable,        (insertIds  ?? []), "insert"],
      [relatedProductsTable,(productIds ?? []), "product"],
    ];
    for (const [table, ids, type] of attachChecks) {
      const err = await validateAttachEntitlement(table, ids, type, ctx);
      if (err) {
        res.status(403).json({ error: err });
        return;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    try {
      // Optionally create a matching draft theme from the palette
      let autoThemeId: string | undefined;
      if (Array.isArray(palette) && palette.length === 6) {
        const thId = genId("th");
        try {
          await db.insert(themesTable).values({
            id: thId,
            name: `${name} — Auto palette`,
            desc: `Auto-generated palette for "${name}"`,
            colors: palette as string[],
            status: "draft",
            globalAvailable: false,
            origin: "owned",
            authoredByStoreId: storeId,
          });
          autoThemeId = thId;

          await writeAudit(db, {
            actorUserId: actor.userId,
            actorRole: actor.effectiveRole,
            scope: storeId,
            action: "owned.theme.create",
            targetType: "theme",
            targetId: thId,
            metadata: { name: `${name} — Auto palette`, auto: true, storeId },
          });
        } catch {
          // non-fatal — edition saves without auto-theme
        }
      }

      const allThemeIds = autoThemeId
        ? [...(themeIds ?? []), autoThemeId]
        : (themeIds ?? []);

      const id = genId("ed");
      const [row] = await db
        .insert(editionsTable)
        .values({
          id,
          name,
          sections: (sections ?? []) as string[],
          priceLow: priceLow ?? 0,
          priceHigh: priceHigh ?? 0,
          themes: allThemeIds as string[],
          packs: (packIds ?? []) as string[],
          inserts: (insertIds ?? []) as string[],
          products: (productIds ?? []) as string[],
          status: "draft",
          globalAvailable: false,
          origin: "owned",
          authoredByStoreId: storeId,
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "owned.edition.create",
        targetType: "edition",
        targetId: id,
        metadata: { name, status: "draft", autoThemeId, storeId },
      });

      res.status(201).json({ ...row, autoThemeId });
    } catch (err) {
      req.log.error({ err }, "owned edition create failed");
      res.status(500).json({ error: "Create failed" });
    }
  },
);

// ── GET /stores/:storeId/owned/attachable ─────────────────────────────────
// Returns catalog items the store can attach to an edition:
//   - All items this store authored (origin='owned', authoredByStoreId=storeId)
//   - Plus entitled items from the global catalog (starter + licensed if subscribed)
// Each item is annotated with origin + entitlementStatus.

router.get(
  "/stores/:storeId/owned/attachable",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const storeId = req.params.storeId as string;

    if (!(await assertAiEnabled(storeId, res))) return;

    const ctx = await getStoreCtx(storeId);

    // Fetch all non-deleted, non-owned-by-another-store items that are either:
    // a) Owned by this store, or
    // b) Globally available (starter/licensed) and live
    const [themes, packs, inserts, products, editions] = await Promise.all([
      db.select().from(themesTable).where(
        and(
          ne(themesTable.status, "deleted"),
          or(
            and(eq(themesTable.origin, "owned"), eq(themesTable.authoredByStoreId, storeId)),
            and(ne(themesTable.origin, "owned"), eq(themesTable.globalAvailable, true), eq(themesTable.status, "live")),
          ),
        ),
      ),
      db.select().from(stickerPacksTable).where(
        and(
          ne(stickerPacksTable.status, "deleted"),
          or(
            and(eq(stickerPacksTable.origin, "owned"), eq(stickerPacksTable.authoredByStoreId, storeId)),
            and(ne(stickerPacksTable.origin, "owned"), eq(stickerPacksTable.globalAvailable, true), eq(stickerPacksTable.status, "live")),
          ),
        ),
      ),
      db.select().from(insertsTable).where(
        and(
          ne(insertsTable.status, "deleted"),
          or(
            and(eq(insertsTable.origin, "owned"), eq(insertsTable.authoredByStoreId, storeId)),
            and(ne(insertsTable.origin, "owned"), eq(insertsTable.globalAvailable, true), eq(insertsTable.status, "live")),
          ),
        ),
      ),
      db.select().from(relatedProductsTable).where(
        and(
          ne(relatedProductsTable.status, "deleted"),
          or(
            and(eq(relatedProductsTable.origin, "owned"), eq(relatedProductsTable.authoredByStoreId, storeId)),
            and(ne(relatedProductsTable.origin, "owned"), eq(relatedProductsTable.globalAvailable, true), eq(relatedProductsTable.status, "live")),
          ),
        ),
      ),
      db.select().from(editionsTable).where(
        and(
          ne(editionsTable.status, "deleted"),
          or(
            and(eq(editionsTable.origin, "owned"), eq(editionsTable.authoredByStoreId, storeId)),
            and(ne(editionsTable.origin, "owned"), eq(editionsTable.globalAvailable, true), eq(editionsTable.status, "live")),
          ),
        ),
      ),
    ]);

    res.json({
      themes:   filterEntitled(themes,   ctx),
      packs:    filterEntitled(packs,    ctx),
      inserts:  filterEntitled(inserts,  ctx),
      products: filterEntitled(products, ctx),
      editions: filterEntitled(editions, ctx),
    });
  },
);

export default router;
