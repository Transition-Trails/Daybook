/**
 * Store-Scoped Owned Catalog Routes
 *
 * POST   /stores/:storeId/owned/themes          — staff+ draft; owner can publish
 * POST   /stores/:storeId/owned/sticker-packs
 * POST   /stores/:storeId/owned/editions        — always draft
 * GET    /stores/:storeId/owned/attachable      — items available to attach in Edition Studio
 * GET    /stores/:storeId/owned                 — list non-deleted owned items by type
 * PATCH  /stores/:storeId/owned/themes/:id      — edit; staff draft-only; owner any
 * PATCH  /stores/:storeId/owned/sticker-packs/:id
 * PATCH  /stores/:storeId/owned/inserts/:id
 * PATCH  /stores/:storeId/owned/editions/:id
 * DELETE /stores/:storeId/owned/themes/:id      — owner soft-delete; orphan guard
 * DELETE /stores/:storeId/owned/sticker-packs/:id
 * DELETE /stores/:storeId/owned/inserts/:id
 * DELETE /stores/:storeId/owned/editions/:id
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  storesTable,
  storeFlagsTable,
  themesTable,
  palettesTable,
  backgroundsTable,
  themePalettesTable,
  themeBackgroundsTable,
  stickerPacksTable,
  themePacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
} from "@workspace/db";
import { eq, and, or, ne, inArray, desc, asc } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import {
  filterEntitled,
  resolveEntitlement,
  type EntitlementContext,
  type ItemOrigin,
} from "../lib/entitlement";

const router: IRouter = Router();

// ── Helper: check aiEnabled for this store ─────────────────────────────────

async function assertAiEnabled(storeId: string, res: Response): Promise<boolean> {
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
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, storeId));
  return {
    storeId,
    subscriptionActive: store?.subscriptionActive ?? true,
    isSuperAdmin: false,
  };
}

// ── Helper: validate that all submitted attach IDs are entitled ────────────

async function validateAttachEntitlement(
  table:
    | typeof themesTable
    | typeof stickerPacksTable
    | typeof insertsTable
    | typeof relatedProductsTable,
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

// ── Helper: cross-store guard (middleware may resolve storeId from header) ──

function assertSameStore(actor: import("../lib/roles").ActorContext, urlStoreId: string, res: Response): boolean {
  // Only platform super_admins bypass store scoping.
  // Store owners also have isSuperAdmin=true via roles.ts (role==="owner"), so we
  // must use platformRole directly to distinguish platform staff from store owners.
  if (actor.platformRole === "super_admin") return true;
  if (actor.storeId !== urlStoreId) {
    res.status(403).json({ error: "Forbidden: cross-store access denied" });
    return false;
  }
  return true;
}

// ── Helper: assert item is owned by this store ─────────────────────────────

async function getOwnedItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  id: string,
  storeId: string,
  res: Response,
  isSuperAdmin: boolean,
): Promise<Record<string, unknown> | null> {
  const rows = await db.select().from(table).where(eq(table.id, id));
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || row.status === "deleted") {
    res.status(404).json({ error: "Item not found" });
    return null;
  }
  if (row.origin !== "owned") {
    res.status(403).json({ error: "Only owned items can be managed here" });
    return null;
  }
  if (!isSuperAdmin && row.authoredByStoreId !== storeId) {
    res.status(403).json({ error: "This item belongs to another store" });
    return null;
  }
  return row;
}

// ── Helper: find editions referencing an item in a given attachment field ───

async function findOrphanEditions(
  storeId: string,
  field: "themes" | "packs" | "inserts" | "products",
  itemId: string,
): Promise<{ id: string; name: string }[]> {
  const editions = await db
    .select()
    .from(editionsTable)
    .where(and(eq(editionsTable.authoredByStoreId, storeId), ne(editionsTable.status, "deleted")));
  return editions
    .filter((ed) => (ed[field] as string[]).includes(itemId))
    .map((ed) => ({ id: ed.id, name: ed.name }));
}

// ── POST /stores/:storeId/owned/themes ────────────────────────────────────

router.post(
  "/stores/:storeId/owned/themes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;
    if (!(await assertAiEnabled(storeId, res))) return;

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

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({
        error: "Publishing requires store_owner role. Re-submit without status='live' to save as draft.",
        savedAsDraft: true,
      });
      return;
    }
    const status: "draft" | "live" = reqStatus === "live" && canPublish ? "live" : "draft";

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
    if (!assertSameStore(actor, storeId, res)) return;
    if (!(await assertAiEnabled(storeId, res))) return;

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
    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({
        error: "Publishing requires store_owner role. Re-submit without status='live' to save as draft.",
        savedAsDraft: true,
      });
      return;
    }
    const status: "draft" | "live" = reqStatus === "live" && canPublish ? "live" : "draft";

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

router.post(
  "/stores/:storeId/owned/editions",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;
    if (!(await assertAiEnabled(storeId, res))) return;

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
      palette?: string[];
    };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const ctx = await getStoreCtx(storeId);
    const attachChecks: [
      typeof themesTable | typeof stickerPacksTable | typeof insertsTable | typeof relatedProductsTable,
      string[],
      string,
    ][] = [
      [themesTable, themeIds ?? [], "theme"],
      [stickerPacksTable, packIds ?? [], "sticker-pack"],
      [insertsTable, insertIds ?? [], "insert"],
      [relatedProductsTable, productIds ?? [], "product"],
    ];
    for (const [table, ids, type] of attachChecks) {
      const err = await validateAttachEntitlement(table, ids, type, ctx);
      if (err) { res.status(403).json({ error: err }); return; }
    }

    try {
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
          // non-fatal
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

router.get(
  "/stores/:storeId/owned/attachable",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;
    if (!(await assertAiEnabled(storeId, res))) return;

    const ctx = await getStoreCtx(storeId);

    const [themes, packs, inserts, products, editions] = await Promise.all([
      db.select().from(themesTable).where(
        and(ne(themesTable.status, "deleted"), or(
          and(eq(themesTable.origin, "owned"), eq(themesTable.authoredByStoreId, storeId)),
          and(ne(themesTable.origin, "owned"), eq(themesTable.globalAvailable, true), eq(themesTable.status, "live")),
        )),
      ),
      db.select().from(stickerPacksTable).where(
        and(ne(stickerPacksTable.status, "deleted"), or(
          and(eq(stickerPacksTable.origin, "owned"), eq(stickerPacksTable.authoredByStoreId, storeId)),
          and(ne(stickerPacksTable.origin, "owned"), eq(stickerPacksTable.globalAvailable, true), eq(stickerPacksTable.status, "live")),
        )),
      ),
      db.select().from(insertsTable).where(
        and(ne(insertsTable.status, "deleted"), or(
          and(eq(insertsTable.origin, "owned"), eq(insertsTable.authoredByStoreId, storeId)),
          and(ne(insertsTable.origin, "owned"), eq(insertsTable.globalAvailable, true), eq(insertsTable.status, "live")),
        )),
      ),
      db.select().from(relatedProductsTable).where(
        and(ne(relatedProductsTable.status, "deleted"), or(
          and(eq(relatedProductsTable.origin, "owned"), eq(relatedProductsTable.authoredByStoreId, storeId)),
          and(ne(relatedProductsTable.origin, "owned"), eq(relatedProductsTable.globalAvailable, true), eq(relatedProductsTable.status, "live")),
        )),
      ),
      db.select().from(editionsTable).where(
        and(ne(editionsTable.status, "deleted"), or(
          and(eq(editionsTable.origin, "owned"), eq(editionsTable.authoredByStoreId, storeId)),
          and(ne(editionsTable.origin, "owned"), eq(editionsTable.globalAvailable, true), eq(editionsTable.status, "live")),
        )),
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

// ── GET /stores/:storeId/owned ─────────────────────────────────────────────

router.get(
  "/stores/:storeId/owned",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;

    const [themes, packs, inserts, editions] = await Promise.all([
      db.select().from(themesTable)
        .where(and(eq(themesTable.origin, "owned"), eq(themesTable.authoredByStoreId, storeId), ne(themesTable.status, "deleted")))
        .orderBy(desc(themesTable.createdAt)),
      db.select().from(stickerPacksTable)
        .where(and(eq(stickerPacksTable.origin, "owned"), eq(stickerPacksTable.authoredByStoreId, storeId), ne(stickerPacksTable.status, "deleted")))
        .orderBy(desc(stickerPacksTable.createdAt)),
      db.select().from(insertsTable)
        .where(and(eq(insertsTable.origin, "owned"), eq(insertsTable.authoredByStoreId, storeId), ne(insertsTable.status, "deleted")))
        .orderBy(desc(insertsTable.createdAt)),
      db.select().from(editionsTable)
        .where(and(eq(editionsTable.origin, "owned"), eq(editionsTable.authoredByStoreId, storeId), ne(editionsTable.status, "deleted")))
        .orderBy(desc(editionsTable.createdAt)),
    ]);

    res.json({ themes, packs, inserts, editions });
  },
);

// ── PATCH /stores/:storeId/owned/themes/:id ───────────────────────────────

router.patch(
  "/stores/:storeId/owned/themes/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedItem(themesTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const isStaff = !canPublish;

    if (isStaff && row.status !== "draft") {
      res.status(403).json({ error: "Staff can only edit draft items" });
      return;
    }

    const { name, description, colors, status } = req.body as {
      name?: string;
      description?: string;
      colors?: string[];
      status?: "draft" | "live";
    };

    if (status !== undefined && isStaff) {
      res.status(403).json({ error: "Publishing/unpublishing requires store_owner role" });
      return;
    }
    if (colors !== undefined && (!Array.isArray(colors) || colors.length === 0)) {
      res.status(400).json({ error: "colors must be a non-empty array" });
      return;
    }

    const updateData: Partial<typeof themesTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.desc = description;
    if (colors !== undefined) updateData.colors = colors as string[];
    if (status !== undefined) updateData.status = status;
    if (Object.keys(updateData).length === 0) { res.json(row); return; }

    const [updated] = await db.update(themesTable).set(updateData).where(eq(themesTable.id, id)).returning();

    const prevStatus = row.status as string;
    const auditAction =
      prevStatus !== updated.status
        ? updated.status === "live" ? "owned.theme.publish" : "owned.theme.unpublish"
        : "owned.theme.edit";
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: "theme", targetId: id,
      metadata: { storeId, ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });

    res.json(updated);
  },
);

// ── PATCH /stores/:storeId/owned/sticker-packs/:id ────────────────────────

router.patch(
  "/stores/:storeId/owned/sticker-packs/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedItem(stickerPacksTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const isStaff = !canPublish;
    if (isStaff && row.status !== "draft") {
      res.status(403).json({ error: "Staff can only edit draft items" }); return;
    }

    const { name, tags, price, status } = req.body as {
      name?: string; tags?: string[]; price?: number; status?: "draft" | "live";
    };
    if (status !== undefined && isStaff) {
      res.status(403).json({ error: "Publishing/unpublishing requires store_owner role" }); return;
    }

    const updateData: Partial<typeof stickerPacksTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (tags !== undefined) updateData.tags = tags as string[];
    if (price !== undefined) updateData.price = price;
    if (status !== undefined) updateData.status = status;
    if (Object.keys(updateData).length === 0) { res.json(row); return; }

    const [updated] = await db.update(stickerPacksTable).set(updateData).where(eq(stickerPacksTable.id, id)).returning();

    const prevStatus = row.status as string;
    const auditAction =
      prevStatus !== updated.status
        ? updated.status === "live" ? "owned.pack.publish" : "owned.pack.unpublish"
        : "owned.pack.edit";
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: "pack", targetId: id,
      metadata: { storeId, ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });

    res.json(updated);
  },
);

// ── PATCH /stores/:storeId/owned/inserts/:id ──────────────────────────────

router.patch(
  "/stores/:storeId/owned/inserts/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedItem(insertsTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const isStaff = !canPublish;
    if (isStaff && row.status !== "draft") {
      res.status(403).json({ error: "Staff can only edit draft items" }); return;
    }

    const { name, status } = req.body as { name?: string; status?: "draft" | "live" };
    if (status !== undefined && isStaff) {
      res.status(403).json({ error: "Publishing/unpublishing requires store_owner role" }); return;
    }

    const updateData: Partial<typeof insertsTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (Object.keys(updateData).length === 0) { res.json(row); return; }

    const [updated] = await db.update(insertsTable).set(updateData).where(eq(insertsTable.id, id)).returning();

    const prevStatus = row.status as string;
    const auditAction =
      prevStatus !== updated.status
        ? updated.status === "live" ? "owned.insert.publish" : "owned.insert.unpublish"
        : "owned.insert.edit";
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: "insert", targetId: id,
      metadata: { storeId, ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });

    res.json(updated);
  },
);

// ── PATCH /stores/:storeId/owned/editions/:id ─────────────────────────────

router.patch(
  "/stores/:storeId/owned/editions/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedItem(editionsTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    const isStaff = !canPublish;
    if (isStaff && row.status !== "draft") {
      res.status(403).json({ error: "Staff can only edit draft items" }); return;
    }

    const { name, sections, priceLow, priceHigh, themeIds, packIds, insertIds, productIds, status } =
      req.body as {
        name?: string;
        sections?: string[];
        priceLow?: number;
        priceHigh?: number;
        themeIds?: string[];
        packIds?: string[];
        insertIds?: string[];
        productIds?: string[];
        status?: "draft" | "live";
      };

    if (status !== undefined && isStaff) {
      res.status(403).json({ error: "Publishing/unpublishing requires store_owner role" }); return;
    }

    // Re-validate attach entitlements when attachment arrays change
    const hasAttachChange = themeIds?.length || packIds?.length || insertIds?.length || productIds?.length;
    if (hasAttachChange) {
      const ctx = await getStoreCtx(storeId);
      const attachChecks: [
        typeof themesTable | typeof stickerPacksTable | typeof insertsTable | typeof relatedProductsTable,
        string[],
        string,
      ][] = [
        [themesTable, themeIds ?? [], "theme"],
        [stickerPacksTable, packIds ?? [], "sticker-pack"],
        [insertsTable, insertIds ?? [], "insert"],
        [relatedProductsTable, productIds ?? [], "product"],
      ];
      for (const [table, ids, type] of attachChecks) {
        if (!ids.length) continue;
        const err = await validateAttachEntitlement(table, ids, type, ctx);
        if (err) { res.status(403).json({ error: err }); return; }
      }
    }

    const updateData: Partial<typeof editionsTable.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (sections !== undefined) updateData.sections = sections as string[];
    if (priceLow !== undefined) updateData.priceLow = priceLow;
    if (priceHigh !== undefined) updateData.priceHigh = priceHigh;
    if (themeIds !== undefined) updateData.themes = themeIds as string[];
    if (packIds !== undefined) updateData.packs = packIds as string[];
    if (insertIds !== undefined) updateData.inserts = insertIds as string[];
    if (productIds !== undefined) updateData.products = productIds as string[];
    if (status !== undefined) updateData.status = status;
    if (Object.keys(updateData).length === 0) { res.json(row); return; }

    const [updated] = await db.update(editionsTable).set(updateData).where(eq(editionsTable.id, id)).returning();

    const prevStatus = row.status as string;
    const auditAction =
      prevStatus !== updated.status
        ? updated.status === "live" ? "owned.edition.publish" : "owned.edition.unpublish"
        : "owned.edition.edit";
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: "edition", targetId: id,
      metadata: { storeId, ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });

    res.json(updated);
  },
);

// ── DELETE helpers ─────────────────────────────────────────────────────────

async function handleOwnedDelete(
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  orphanField: "themes" | "packs" | "inserts" | "products" | null,
  auditAction: string,
  auditTargetType: string,
): Promise<void> {
  const actor = req.actor!;
  const { storeId, id } = req.params as { storeId: string; id: string };
  if (!assertSameStore(actor, storeId, res)) return;

  const canDelete = actor.isSuperAdmin || actor.storeRole === "store_owner";
  if (!canDelete) {
    res.status(403).json({ error: "Deleting owned items requires store_owner role" });
    return;
  }

  const row = await getOwnedItem(table, id, storeId, res, actor.isSuperAdmin);
  if (!row) return;

  const force = req.query.force === "true";

  if (orphanField) {
    const affected = await findOrphanEditions(storeId, orphanField, id);
    if (affected.length > 0 && !force) {
      res.status(409).json({ error: `Item is attached to ${affected.length} edition(s)`, affectedEditions: affected });
      return;
    }
    // Detach from editions before deleting
    for (const ed of affected) {
      const [edRow] = await db.select().from(editionsTable).where(eq(editionsTable.id, ed.id));
      if (edRow) {
        await db
          .update(editionsTable)
          .set({ [orphanField]: (edRow[orphanField] as string[]).filter((x) => x !== id) })
          .where(eq(editionsTable.id, ed.id));
      }
    }
    await db.update(table).set({ status: "deleted" }).where(eq(table.id, id));
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: auditTargetType, targetId: id,
      metadata: { storeId, name: row.name, force, detachedFrom: affected.map((e) => e.id) },
    });
  } else {
    await db.update(table).set({ status: "deleted" }).where(eq(table.id, id));
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: auditTargetType, targetId: id,
      metadata: { storeId, name: row.name },
    });
  }

  res.status(204).send();
}

router.delete(
  "/stores/:storeId/owned/themes/:id",
  requireStoreAccess("store_staff"),
  (req, res) => handleOwnedDelete(req, res, themesTable, "themes", "owned.theme.delete", "theme"),
);

router.delete(
  "/stores/:storeId/owned/sticker-packs/:id",
  requireStoreAccess("store_staff"),
  (req, res) => handleOwnedDelete(req, res, stickerPacksTable, "packs", "owned.pack.delete", "pack"),
);

router.delete(
  "/stores/:storeId/owned/inserts/:id",
  requireStoreAccess("store_staff"),
  (req, res) => handleOwnedDelete(req, res, insertsTable, "inserts", "owned.insert.delete", "insert"),
);

router.delete(
  "/stores/:storeId/owned/editions/:id",
  requireStoreAccess("store_staff"),
  (req, res) => handleOwnedDelete(req, res, editionsTable, null, "owned.edition.delete", "edition"),
);

// ═══════════════════════════════════════════════════════════════════════════
// PALETTE CRUD (store-scoped owned palettes)
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /stores/:storeId/owned/palettes ───────────────────────────────────

router.get(
  "/stores/:storeId/owned/palettes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;

    const rows = await db
      .select()
      .from(palettesTable)
      .where(and(
        eq(palettesTable.origin, "owned"),
        eq(palettesTable.authoredByStoreId, storeId),
        ne(palettesTable.status, "deleted"),
      ))
      .orderBy(desc(palettesTable.createdAt));
    res.json(rows);
  },
);

// ── POST /stores/:storeId/owned/palettes ──────────────────────────────────

router.post(
  "/stores/:storeId/owned/palettes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;

    const { name, colors, status: reqStatus } = req.body as {
      name: string;
      colors: string[];
      status?: "draft" | "live";
    };

    if (!name || !Array.isArray(colors) || colors.length === 0) {
      res.status(400).json({ error: "name and colors (non-empty array) are required" });
      return;
    }

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({ error: "Publishing requires store_owner role", savedAsDraft: true });
      return;
    }
    const status: "draft" | "live" = reqStatus === "live" && canPublish ? "live" : "draft";

    const id = genId("pal");
    const [row] = await db
      .insert(palettesTable)
      .values({ id, name, colors: colors as string[], status, origin: "owned", globalAvailable: false, authoredByStoreId: storeId })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: status === "live" ? "owned.palette.publish" : "owned.palette.create",
      targetType: "palette", targetId: id,
      metadata: { name, status, storeId },
    });

    res.status(201).json(row);
  },
);

// ── PATCH /stores/:storeId/owned/palettes/:id ─────────────────────────────

router.patch(
  "/stores/:storeId/owned/palettes/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedItem(palettesTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (!canPublish && row.status !== "draft") {
      res.status(403).json({ error: "Staff can only edit draft items" }); return;
    }

    const { name, colors, status } = req.body as { name?: string; colors?: string[]; status?: "draft" | "live" };
    if (status !== undefined && !canPublish) {
      res.status(403).json({ error: "Publishing/unpublishing requires store_owner role" }); return;
    }
    if (colors !== undefined && (!Array.isArray(colors) || colors.length === 0)) {
      res.status(400).json({ error: "colors must be a non-empty array" }); return;
    }

    const upd: Partial<typeof palettesTable.$inferInsert> = {};
    if (name !== undefined) upd.name = name;
    if (colors !== undefined) upd.colors = colors as string[];
    if (status !== undefined) upd.status = status;
    if (!Object.keys(upd).length) { res.json(row); return; }

    const [updated] = await db.update(palettesTable).set(upd).where(eq(palettesTable.id, id)).returning();

    const prevStatus = row.status as string;
    const auditAction = prevStatus !== updated.status
      ? updated.status === "live" ? "owned.palette.publish" : "owned.palette.unpublish"
      : "owned.palette.edit";
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: "palette", targetId: id,
      metadata: { storeId, ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });
    res.json(updated);
  },
);

// ── DELETE /stores/:storeId/owned/palettes/:id ────────────────────────────

router.delete(
  "/stores/:storeId/owned/palettes/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    if (!(actor.isSuperAdmin || actor.storeRole === "store_owner")) {
      res.status(403).json({ error: "Deleting owned items requires store_owner role" }); return;
    }
    const row = await getOwnedItem(palettesTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    // Detach from all themes then soft-delete
    await db.delete(themePalettesTable).where(eq(themePalettesTable.paletteId, id));
    await db.update(palettesTable).set({ status: "deleted" }).where(eq(palettesTable.id, id));
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: "owned.palette.delete", targetType: "palette", targetId: id,
      metadata: { storeId, name: row.name },
    });
    res.status(204).send();
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND CRUD (store-scoped owned backgrounds)
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  "/stores/:storeId/owned/backgrounds",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;

    const rows = await db
      .select()
      .from(backgroundsTable)
      .where(and(
        eq(backgroundsTable.origin, "owned"),
        eq(backgroundsTable.authoredByStoreId, storeId),
        ne(backgroundsTable.status, "deleted"),
      ))
      .orderBy(desc(backgroundsTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/stores/:storeId/owned/backgrounds",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertSameStore(actor, storeId, res)) return;

    const { name, type = "color", assetRef, status: reqStatus } = req.body as {
      name: string;
      type?: "color" | "texture" | "image";
      assetRef?: string;
      status?: "draft" | "live";
    };

    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    if (!["color", "texture", "image"].includes(type)) {
      res.status(400).json({ error: "type must be color, texture, or image" }); return;
    }

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (reqStatus === "live" && !canPublish) {
      res.status(403).json({ error: "Publishing requires store_owner role", savedAsDraft: true }); return;
    }
    const status: "draft" | "live" = reqStatus === "live" && canPublish ? "live" : "draft";

    const id = genId("bg");
    const [row] = await db
      .insert(backgroundsTable)
      .values({ id, name, type, assetRef: assetRef ?? null, status, origin: "owned", globalAvailable: false, authoredByStoreId: storeId })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: "owned.background.create", targetType: "background", targetId: id,
      metadata: { name, type, status, storeId },
    });
    res.status(201).json(row);
  },
);

router.patch(
  "/stores/:storeId/owned/backgrounds/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const row = await getOwnedItem(backgroundsTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    const canPublish = actor.isSuperAdmin || actor.storeRole === "store_owner";
    if (!canPublish && row.status !== "draft") {
      res.status(403).json({ error: "Staff can only edit draft items" }); return;
    }

    const { name, type, assetRef, status } = req.body as {
      name?: string; type?: "color" | "texture" | "image"; assetRef?: string | null; status?: "draft" | "live";
    };
    if (status !== undefined && !canPublish) {
      res.status(403).json({ error: "Publishing/unpublishing requires store_owner role" }); return;
    }

    const upd: Partial<typeof backgroundsTable.$inferInsert> = {};
    if (name !== undefined) upd.name = name;
    if (type !== undefined) upd.type = type;
    if (assetRef !== undefined) upd.assetRef = assetRef;
    if (status !== undefined) upd.status = status;
    if (!Object.keys(upd).length) { res.json(row); return; }

    const [updated] = await db.update(backgroundsTable).set(upd).where(eq(backgroundsTable.id, id)).returning();

    const prevStatus = row.status as string;
    const auditAction = prevStatus !== updated.status
      ? updated.status === "live" ? "owned.background.publish" : "owned.background.unpublish"
      : "owned.background.edit";
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: auditAction, targetType: "background", targetId: id,
      metadata: { storeId, ...(name !== undefined && { name }), ...(status !== undefined && { status }) },
    });
    res.json(updated);
  },
);

router.delete(
  "/stores/:storeId/owned/backgrounds/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    if (!(actor.isSuperAdmin || actor.storeRole === "store_owner")) {
      res.status(403).json({ error: "Deleting owned items requires store_owner role" }); return;
    }
    const row = await getOwnedItem(backgroundsTable, id, storeId, res, actor.isSuperAdmin);
    if (!row) return;

    await db.delete(themeBackgroundsTable).where(eq(themeBackgroundsTable.backgroundId, id));
    await db.update(backgroundsTable).set({ status: "deleted" }).where(eq(backgroundsTable.id, id));
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: "owned.background.delete", targetType: "background", targetId: id,
      metadata: { storeId, name: row.name },
    });
    res.status(204).send();
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// THEME BUNDLE JOIN MANAGEMENT (palettes / backgrounds / packs per theme)
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /stores/:storeId/owned/themes/:id/palettes ────────────────────────

router.get(
  "/stores/:storeId/owned/themes/:id/palettes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const theme = await getOwnedItem(themesTable, id, storeId, res, actor.isSuperAdmin);
    if (!theme) return;

    const rows = await db
      .select({ palette: palettesTable })
      .from(themePalettesTable)
      .innerJoin(palettesTable, eq(themePalettesTable.paletteId, palettesTable.id))
      .where(eq(themePalettesTable.themeId, id))
      .orderBy(asc(themePalettesTable.position));

    res.json(rows.map(r => r.palette));
  },
);

// ── PUT /stores/:storeId/owned/themes/:id/palettes ────────────────────────
// Replaces the full palette list for a theme (position = array index).

router.put(
  "/stores/:storeId/owned/themes/:id/palettes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const theme = await getOwnedItem(themesTable, id, storeId, res, actor.isSuperAdmin);
    if (!theme) return;

    const { paletteIds } = req.body as { paletteIds: string[] };
    if (!Array.isArray(paletteIds)) { res.status(400).json({ error: "paletteIds must be an array" }); return; }

    // Validate all palette IDs exist and are accessible
    if (paletteIds.length > 0) {
      const found = await db.select({ id: palettesTable.id })
        .from(palettesTable)
        .where(and(inArray(palettesTable.id, paletteIds), ne(palettesTable.status, "deleted")));
      const foundSet = new Set(found.map(r => r.id));
      const missing = paletteIds.find(pid => !foundSet.has(pid));
      if (missing) { res.status(400).json({ error: `Unknown palette ID: ${missing}` }); return; }
    }

    // Replace: delete existing, insert new
    await db.delete(themePalettesTable).where(eq(themePalettesTable.themeId, id));
    if (paletteIds.length > 0) {
      await db.insert(themePalettesTable).values(
        paletteIds.map((pid, pos) => ({ themeId: id, paletteId: pid, position: pos })),
      );
    }

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: "owned.theme.palettes.set", targetType: "theme", targetId: id,
      metadata: { storeId, paletteIds },
    });

    res.json({ count: paletteIds.length });
  },
);

// ── GET /stores/:storeId/owned/themes/:id/backgrounds ────────────────────

router.get(
  "/stores/:storeId/owned/themes/:id/backgrounds",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const theme = await getOwnedItem(themesTable, id, storeId, res, actor.isSuperAdmin);
    if (!theme) return;

    const rows = await db
      .select({ background: backgroundsTable })
      .from(themeBackgroundsTable)
      .innerJoin(backgroundsTable, eq(themeBackgroundsTable.backgroundId, backgroundsTable.id))
      .where(eq(themeBackgroundsTable.themeId, id))
      .orderBy(asc(themeBackgroundsTable.position));

    res.json(rows.map(r => r.background));
  },
);

// ── PUT /stores/:storeId/owned/themes/:id/backgrounds ────────────────────

router.put(
  "/stores/:storeId/owned/themes/:id/backgrounds",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const theme = await getOwnedItem(themesTable, id, storeId, res, actor.isSuperAdmin);
    if (!theme) return;

    const { backgroundIds } = req.body as { backgroundIds: string[] };
    if (!Array.isArray(backgroundIds)) { res.status(400).json({ error: "backgroundIds must be an array" }); return; }

    if (backgroundIds.length > 0) {
      const found = await db.select({ id: backgroundsTable.id })
        .from(backgroundsTable)
        .where(and(inArray(backgroundsTable.id, backgroundIds), ne(backgroundsTable.status, "deleted")));
      const foundSet = new Set(found.map(r => r.id));
      const missing = backgroundIds.find(bid => !foundSet.has(bid));
      if (missing) { res.status(400).json({ error: `Unknown background ID: ${missing}` }); return; }
    }

    await db.delete(themeBackgroundsTable).where(eq(themeBackgroundsTable.themeId, id));
    if (backgroundIds.length > 0) {
      await db.insert(themeBackgroundsTable).values(
        backgroundIds.map((bid, pos) => ({ themeId: id, backgroundId: bid, position: pos })),
      );
    }

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: "owned.theme.backgrounds.set", targetType: "theme", targetId: id,
      metadata: { storeId, backgroundIds },
    });

    res.json({ count: backgroundIds.length });
  },
);

// ── PUT /stores/:storeId/owned/themes/:id/packs ───────────────────────────

router.put(
  "/stores/:storeId/owned/themes/:id/packs",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const theme = await getOwnedItem(themesTable, id, storeId, res, actor.isSuperAdmin);
    if (!theme) return;

    const { packIds } = req.body as { packIds: string[] };
    if (!Array.isArray(packIds)) { res.status(400).json({ error: "packIds must be an array" }); return; }

    if (packIds.length > 0) {
      const found = await db.select({ id: stickerPacksTable.id })
        .from(stickerPacksTable)
        .where(and(inArray(stickerPacksTable.id, packIds), ne(stickerPacksTable.status, "deleted")));
      const foundSet = new Set(found.map(r => r.id));
      const missing = packIds.find(pid => !foundSet.has(pid));
      if (missing) { res.status(400).json({ error: `Unknown pack ID: ${missing}` }); return; }
    }

    await db.delete(themePacksTable).where(eq(themePacksTable.themeId, id));
    if (packIds.length > 0) {
      await db.insert(themePacksTable).values(
        packIds.map((pid, pos) => ({ themeId: id, packId: pid, position: pos })),
      );
    }

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: storeId,
      action: "owned.theme.packs.set", targetType: "theme", targetId: id,
      metadata: { storeId, packIds },
    });

    res.json({ count: packIds.length });
  },
);

export default router;
