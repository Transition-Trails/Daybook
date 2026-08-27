/**
 * Multi-tenant store routes
 *
 * /stores                              — list (super_admin) / create (super_admin)
 * /stores/:storeId                     — get / patch
 * /stores/:storeId/members             — list / assign / revoke store-scoped roles
 * /stores/:storeId/catalog             — list / enable / disable globally-available items
 * /stores/:storeId/flags               — get (store_owner+) / put (super_admin only)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import {
  storesTable,
  storeMembersTable,
  storeCatalogTable,
  storeFlagsTable,
  themesTable,
  stickerPacksTable,
  insertsTable,
  editionsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, count, inArray, sql } from "drizzle-orm";
import {
  requireSuperAdmin,
  requireStoreAccess,
  resolveStoreActor,
} from "../middleware/requireRole";
import { assertStoreScope } from "../lib/auth-middleware";
import { writeAudit } from "../lib/audit";
import { annotateWithEntitlement, type EntitlementContext } from "../lib/entitlement";
import { isPurchasableCatalogItem } from "../lib/catalog-commerce";

const router: IRouter = Router();
const OWNER_EDITABLE = ["name", "domain", "defaultMode"] as const;
type OwnerEditableField = (typeof OWNER_EDITABLE)[number];

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2025-06-30.basil" as Stripe.LatestApiVersion });
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:5000").replace(/\/+$/, "");
}

// ── Catalog table registry ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CATALOG_TABLES: Record<string, { table: any; label: string }> = {
  theme:   { table: themesTable,          label: "Theme" },
  pack:    { table: stickerPacksTable,    label: "StickerPack" },
  insert:  { table: insertsTable,         label: "Insert" },
  product: { table: editionsTable,        label: "Edition" },
  edition: { table: editionsTable,        label: "Edition" },
};

// ── GET /stores ───────────────────────────────────────────────────────────────

router.get("/stores", requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  const stores = await db
    .select({ store: storesTable, memberCount: count(storeMembersTable.id) })
    .from(storesTable)
    .leftJoin(storeMembersTable, eq(storeMembersTable.storeId, storesTable.id))
    .groupBy(storesTable.id)
    .orderBy(storesTable.createdAt);

  res.json(stores.map(r => ({ ...r.store, memberCount: Number(r.memberCount) })));
});

// ── POST /stores ──────────────────────────────────────────────────────────────

router.post("/stores", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const body = req.body as Record<string, string>;
  const { id, name, slug, domain, ownerUserId, plan, status } = body;

  if (!id || !name || !slug || !ownerUserId) {
    res.status(400).json({ error: "id, name, slug, ownerUserId are required" });
    return;
  }

  try {
    const [store] = await db
      .insert(storesTable)
      .values({ id, name, slug, domain, ownerUserId, plan: plan ?? "starter", status: status ?? "trial" })
      .returning();

    // Auto-create flags row + auto-enroll the ownerUserId as store_owner
    await Promise.all([
      db.insert(storeFlagsTable).values({ storeId: id }).onConflictDoNothing(),
      db.insert(storeMembersTable).values({ storeId: id, userId: ownerUserId, role: "store_owner" }).onConflictDoNothing(),
    ]);

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "store.create",
      targetType: "store",
      targetId: id,
      metadata: { name, slug },
    });

    res.status(201).json(store);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      res.status(409).json({ error: "A store with that id or slug already exists" });
    } else {
      req.log.error({ err }, "store create failed");
      res.status(500).json({ error: "Create failed" });
    }
  }
});

// ── GET /stores/:storeId ──────────────────────────────────────────────────────

router.get("/stores/:storeId", resolveStoreActor, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const storeId = req.params.storeId as string;

  if (!assertStoreScope(actor, storeId, res)) return;
  if (!actor.isSuperAdmin && actor.storeRole !== "store_owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const [[flags], members] = await Promise.all([
    db.select().from(storeFlagsTable).where(eq(storeFlagsTable.storeId, storeId)),
    db.select().from(storeMembersTable).where(eq(storeMembersTable.storeId, storeId)),
  ]);

  res.json({ ...store, flags: flags ?? null, memberCount: members.length });
});

// ── PATCH /stores/:storeId ────────────────────────────────────────────────────

router.patch("/stores/:storeId", resolveStoreActor, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const storeId = req.params.storeId as string;
  const body = req.body as Record<string, unknown>;

  if (!assertStoreScope(actor, storeId, res)) return;
  if (!actor.isSuperAdmin && actor.storeRole !== "store_owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let patch: Record<string, unknown>;
  if (actor.isSuperAdmin) {
    patch = { ...body };
    delete patch.id;
    // Connect identity and readiness must come from Stripe's API only. A
    // general store PATCH must never make an arbitrary account sellable.
    delete patch.stripeAccountId;
    delete patch.stripeChargesEnabled;
  } else {
    const unknownFields = Object.keys(body).filter(
      (key) => !OWNER_EDITABLE.includes(key as OwnerEditableField),
    );
    if (unknownFields.length > 0) {
      res.status(400).json({
        error: `Only ${OWNER_EDITABLE.join(", ")} may be updated by a store owner`,
        fields: unknownFields,
      });
      return;
    }
    patch = Object.fromEntries(
      OWNER_EDITABLE
        .filter((field) => field in body)
        .map((field) => [field, body[field]]),
    );
  }

  const [updated] = await db
    .update(storesTable)
    .set(patch)
    .where(eq(storesTable.id, storeId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Store not found" }); return; }

  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: actor.isSuperAdmin ? "platform" : storeId,
    action: "store.update",
    targetType: "store",
    targetId: storeId,
    metadata: patch,
  });

  res.json(updated);
});

// ── Stripe Connect seller onboarding ─────────────────────────────────────────
// Readiness is refreshed from Stripe rather than inferred from account ID
// presence. Only the store owner or a platform super-admin may initiate it.
router.get(
  "/stores/:storeId/stripe/status",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertStoreScope(actor, storeId, res)) return;
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(501).json({ error: "Stripe is not configured" });
      return;
    }
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    if (!store.stripeAccountId) {
      res.json({ stripeAccountId: null, chargesEnabled: false, readyToSell: false });
      return;
    }
    try {
      const account = await getStripe().accounts.retrieve(store.stripeAccountId);
      const chargesEnabled = account.charges_enabled === true;
      const [updated] = await db.update(storesTable)
        .set({ stripeChargesEnabled: chargesEnabled })
        .where(eq(storesTable.id, storeId))
        .returning();
      res.json({
        stripeAccountId: updated?.stripeAccountId ?? store.stripeAccountId,
        chargesEnabled,
        readyToSell: chargesEnabled,
        detailsSubmitted: account.details_submitted === true,
      });
    } catch (err) {
      req.log.error({ err, storeId }, "Stripe Connect status lookup failed");
      res.status(502).json({ error: "Could not refresh Stripe seller status" });
    }
  },
);

router.post(
  "/stores/:storeId/stripe/onboarding",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertStoreScope(actor, storeId, res)) return;
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(501).json({ error: "Stripe is not configured" });
      return;
    }
    try {
      const stripe = getStripe();
      const connected = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`stripe-connect:${storeId}`}))`);
        const [lockedStore] = await tx.select().from(storesTable)
          .where(eq(storesTable.id, storeId)).limit(1);
        if (!lockedStore) throw new Error("Store not found");
        if (lockedStore.stripeAccountId) {
          return {
            accountId: lockedStore.stripeAccountId,
            chargesEnabled: lockedStore.stripeChargesEnabled,
          };
        }
        const [owner] = await tx.select({ email: usersTable.email })
          .from(usersTable).where(eq(usersTable.id, lockedStore.ownerUserId)).limit(1);
        const account = await stripe.accounts.create({
          type: "express",
          email: owner?.email,
          metadata: { storeId },
        });
        await tx.update(storesTable).set({
          stripeAccountId: account.id,
          stripeChargesEnabled: account.charges_enabled === true,
        }).where(eq(storesTable.id, storeId));
        return { accountId: account.id, chargesEnabled: account.charges_enabled === true };
      });
      const link = await stripe.accountLinks.create({
        account: connected.accountId,
        refresh_url: `${appUrl()}/store/${encodeURIComponent(storeId)}/settings/payments?refresh=1`,
        return_url: `${appUrl()}/store/${encodeURIComponent(storeId)}/settings/payments?complete=1`,
        type: "account_onboarding",
      });
      res.json({
        stripeAccountId: connected.accountId,
        chargesEnabled: connected.chargesEnabled,
        readyToSell: connected.chargesEnabled,
        url: link.url,
        expiresAt: link.expires_at,
      });
    } catch (err) {
      req.log.error({ err, storeId }, "Stripe Connect onboarding link creation failed");
      res.status(502).json({ error: "Could not start Stripe seller onboarding" });
    }
  },
);

// ── GET /stores/:storeId/members ──────────────────────────────────────────────
// Only store owners (and super-admins) may view the member list.

router.get(
  "/stores/:storeId/members",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertStoreScope(actor, storeId, res)) return;
    const members = await db
      .select()
      .from(storeMembersTable)
      .where(eq(storeMembersTable.storeId, storeId))
      .orderBy(storeMembersTable.createdAt);
    res.json(members);
  },
);

// ── POST /stores/:storeId/members ─────────────────────────────────────────────

router.post(
  "/stores/:storeId/members",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    const { userId, role } = req.body as { userId: string; role: string };

    if (!assertStoreScope(actor, storeId, res)) return;
    if (!userId || !role) {
      res.status(400).json({ error: "userId and role are required" });
      return;
    }
    if (!["store_owner", "store_staff", "support", "customer"].includes(role)) {
      res.status(400).json({ error: "Invalid role. Must be store_owner | store_staff | support | customer" });
      return;
    }
    if (!actor.isSuperAdmin && role === "store_owner") {
      res.status(403).json({ error: "Forbidden: only super_admin can assign store_owner role" });
      return;
    }

    try {
      const [member] = await db
        .insert(storeMembersTable)
        .values({ storeId, userId, role })
        .onConflictDoUpdate({
          target: [storeMembersTable.storeId, storeMembersTable.userId],
          set: { role },
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "member.assign",
        targetType: "user",
        targetId: userId,
        metadata: { role },
      });

      res.status(201).json(member);
    } catch (err) {
      req.log.error({ err }, "member assign failed");
      res.status(500).json({ error: "Assign failed" });
    }
  },
);

// ── DELETE /stores/:storeId/members/:userId ───────────────────────────────────

router.delete(
  "/stores/:storeId/members/:userId",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    const userId = req.params.userId as string;

    if (!assertStoreScope(actor, storeId, res)) return;
    const deleted = await db
      .delete(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, storeId), eq(storeMembersTable.userId, userId)))
      .returning();

    if (!deleted.length) { res.status(404).json({ error: "Member not found" }); return; }

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "member.revoke",
      targetType: "user",
      targetId: userId,
    });

    res.sendStatus(204);
  },
);

// ── GET /stores/:storeId/catalog ──────────────────────────────────────────────
// Returns the store's enabled items enriched with origin + entitlementStatus.

router.get(
  "/stores/:storeId/catalog",
  requireStoreAccess("support"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;

    if (!assertStoreScope(actor, storeId, res)) return;
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }

    const rows = await db
      .select()
      .from(storeCatalogTable)
      .where(eq(storeCatalogTable.storeId, storeId))
      .orderBy(storeCatalogTable.itemType, storeCatalogTable.itemId);

    // Group enabled item IDs by type so we can fetch their origin in batch.
    const byType: Record<string, string[]> = {};
    for (const r of rows) {
      (byType[r.itemType] ??= []).push(r.itemId);
    }

    // Fetch origin for each type where the store has enabled items.
    const originMaps: Record<string, Record<string, {
      origin: string;
      authoredByStoreId: string | null;
      digitalPriceCents?: number | null;
    }>> = {};
    const fetchBatch = [
      { type: "theme",   table: themesTable },
      { type: "pack",    table: stickerPacksTable },
      { type: "insert",  table: insertsTable },
      { type: "edition", table: editionsTable },
    ];
    await Promise.all(
      fetchBatch.map(async ({ type, table }) => {
        const ids = byType[type];
        if (!ids?.length) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const catalogRows = await db.select().from(table as any).where(inArray((table as any).id, ids));
        originMaps[type] = Object.fromEntries(
          catalogRows.map((r: any) => [r.id, {
            origin: r.origin ?? "licensed",
            authoredByStoreId: r.authoredByStoreId ?? null,
            digitalPriceCents: r.digitalPriceCents ?? null,
          }]),
        );
      }),
    );

    const ctx: EntitlementContext = {
      storeId,
      subscriptionActive: store.subscriptionActive ?? true,
      isSuperAdmin: actor.isSuperAdmin,
    };

    const enriched = rows.map((row) => {
      const meta = originMaps[row.itemType]?.[row.itemId];
      const origin = (meta?.origin ?? "licensed") as "starter" | "licensed" | "owned";
      const authoredByStoreId = meta?.authoredByStoreId ?? null;
      const [annotated] = annotateWithEntitlement([{ origin, authoredByStoreId }], ctx);
      return {
        ...row,
        origin: annotated.origin,
        entitlementStatus: annotated.entitlementStatus,
        purchasable: isPurchasableCatalogItem(row.itemType, meta),
      };
    });

    res.json(enriched);
  },
);

// ── POST /stores/:storeId/catalog ─────────────────────────────────────────────

router.post(
  "/stores/:storeId/catalog",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    const { itemType, itemId } = req.body as { itemType: string; itemId: string };

    if (!assertStoreScope(actor, storeId, res)) return;
    if (!itemType || !itemId) {
      res.status(400).json({ error: "itemType and itemId are required" });
      return;
    }

    const catalogEntry = CATALOG_TABLES[itemType];
    if (!catalogEntry) {
      res.status(400).json({ error: `Unknown itemType. Must be: ${Object.keys(CATALOG_TABLES).join(" | ")}` });
      return;
    }

    // Non-super_admin: verify item exists and is globally available
    if (!actor.isSuperAdmin) {
      const rows = await db.select().from(catalogEntry.table).where(eq(catalogEntry.table.id, itemId));
      const item = rows[0];
      if (!item) {
        res.status(404).json({ error: `${catalogEntry.label} not found` });
        return;
      }
      if (!item.globalAvailable) {
        res.status(403).json({ error: "This item is not available for store enablement" });
        return;
      }
    }

    try {
      const [row] = await db
        .insert(storeCatalogTable)
        .values({ storeId, itemType, itemId })
        .onConflictDoNothing()
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "catalog.enable",
        targetType: itemType,
        targetId: itemId,
      });

      res.status(201).json(row ?? { storeId, itemType, itemId });
    } catch (err) {
      req.log.error({ err }, "catalog enable failed");
      res.status(500).json({ error: "Enable failed" });
    }
  },
);

// ── DELETE /stores/:storeId/catalog/:itemType/:itemId ─────────────────────────

router.delete(
  "/stores/:storeId/catalog/:itemType/:itemId",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    const itemType = req.params.itemType as string;
    const itemId = req.params.itemId as string;

    if (!assertStoreScope(actor, storeId, res)) return;
    const deleted = await db
      .delete(storeCatalogTable)
      .where(
        and(
          eq(storeCatalogTable.storeId, storeId),
          eq(storeCatalogTable.itemType, itemType),
          eq(storeCatalogTable.itemId, itemId),
        ),
      )
      .returning();

    if (!deleted.length) { res.status(404).json({ error: "Catalog entry not found" }); return; }

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "catalog.disable",
      targetType: itemType,
      targetId: itemId,
    });

    res.sendStatus(204);
  },
);

// ── PATCH /stores/:storeId/entitlement ───────────────────────────────────────
// Super-admin only. Sets subscriptionActive and/or defaultMode.
// This is the manual gate lever; Stripe will call this path automatically later.

router.patch(
  "/stores/:storeId/entitlement",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    const { subscriptionActive, defaultMode } = req.body as {
      subscriptionActive?: boolean;
      defaultMode?: "curated" | "independent";
    };

    if (!assertStoreScope(actor, storeId, res)) return;
    if (subscriptionActive === undefined && defaultMode === undefined) {
      res.status(400).json({ error: "Provide subscriptionActive and/or defaultMode" });
      return;
    }
    if (defaultMode !== undefined && !["curated", "independent"].includes(defaultMode)) {
      res.status(400).json({ error: "defaultMode must be 'curated' or 'independent'" });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (subscriptionActive !== undefined) patch.subscriptionActive = subscriptionActive;
    if (defaultMode !== undefined) patch.defaultMode = defaultMode;

    const [updated] = await db
      .update(storesTable)
      .set(patch)
      .where(eq(storesTable.id, storeId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Store not found" }); return; }

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "store.entitlement.update",
      targetType: "store",
      targetId: storeId,
      metadata: patch,
    });

    res.json({
      id: updated.id,
      subscriptionActive: updated.subscriptionActive,
      defaultMode: updated.defaultMode,
    });
  },
);

// ── PUT /stores/flags/bulk ────────────────────────────────────────────────────

router.put(
  "/stores/flags/bulk",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (changes.length === 0 || changes.length > 100) {
      res.status(400).json({ error: "changes must contain between 1 and 100 store updates" });
      return;
    }

    const allowed = ["aiEnabled", "customDomain", "editionsCap", "storageQuota", "inkEnabled", "worldsmithEnabled"] as const;
    const updated = await db.transaction(async (tx) => {
      const rows = [];
      for (const change of changes) {
        if (!change || typeof change.storeId !== "string" || !change.flags || typeof change.flags !== "object") {
          throw new Error("Each change requires storeId and flags");
        }
        const patch = Object.fromEntries(
          allowed
            .filter((key) => change.flags[key] !== undefined)
            .map((key) => [key, change.flags[key]]),
        ) as Partial<typeof storeFlagsTable.$inferInsert>;
        if (Object.keys(patch).length === 0) continue;
        const [flags] = await tx
          .insert(storeFlagsTable)
          .values({ storeId: change.storeId, ...patch })
          .onConflictDoUpdate({ target: storeFlagsTable.storeId, set: patch })
          .returning();
        rows.push(flags);
        await writeAudit(tx, {
          actorUserId: actor.userId,
          actorRole: actor.effectiveRole,
          scope: "platform",
          action: "flags.update",
          targetType: "store",
          targetId: change.storeId,
          metadata: patch as Record<string, unknown>,
        });
      }
      return rows;
    });
    res.json(updated);
  },
);

// ── GET /stores/:storeId/flags ────────────────────────────────────────────────

router.get(
  "/stores/:storeId/flags",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    if (!assertStoreScope(actor, storeId, res)) return;
    const rows = await db.select().from(storeFlagsTable).where(eq(storeFlagsTable.storeId, storeId));
    res.json(rows[0] ?? { storeId, aiEnabled: false, customDomain: false, editionsCap: 5, storageQuota: 1024, inkEnabled: false, worldsmithEnabled: false });
  },
);

// ── PUT /stores/:storeId/flags ────────────────────────────────────────────────

router.put(
  "/stores/:storeId/flags",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = req.params.storeId as string;
    const { aiEnabled, customDomain, editionsCap, storageQuota, inkEnabled, worldsmithEnabled } = req.body as {
      aiEnabled?: boolean;
      customDomain?: boolean;
      editionsCap?: number;
      storageQuota?: number;
      inkEnabled?: boolean;
      worldsmithEnabled?: boolean;
    };

    if (!assertStoreScope(actor, storeId, res)) return;
    const patch: Partial<typeof storeFlagsTable.$inferInsert> = {};
    if (aiEnabled !== undefined) patch.aiEnabled = aiEnabled;
    if (customDomain !== undefined) patch.customDomain = customDomain;
    if (editionsCap !== undefined) patch.editionsCap = editionsCap;
    if (storageQuota !== undefined) patch.storageQuota = storageQuota;
    if (inkEnabled !== undefined) patch.inkEnabled = inkEnabled;
    if (worldsmithEnabled !== undefined) patch.worldsmithEnabled = worldsmithEnabled;

    const [flags] = await db
      .insert(storeFlagsTable)
      .values({ storeId, ...patch })
      .onConflictDoUpdate({ target: storeFlagsTable.storeId, set: patch })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "flags.update",
      targetType: "store",
      targetId: storeId,
      metadata: patch as Record<string, unknown>,
    });

    res.json(flags);
  },
);

export default router;
