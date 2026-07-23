/**
 * Platform-wide routes
 *
 * GET  /platform/stats  — KPIs for super_admin
 * GET  /help            — scoped help content (all authenticated)
 * POST /help            — create help content
 * PATCH /help/:id       — update help content
 * DELETE /help/:id      — delete help content
 * GET  /audit           — audit log (super_admin: all; store_owner: own store)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  storesTable,
  storeMembersTable,
  helpContentTable,
  auditLogTable,
  usersTable,
  generationJobsTable,
  plansTable,
} from "@workspace/db";
import { eq, or, count, desc, and, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  requireSuperAdmin,
  resolveStoreActor,
  resolveStoreActorOptional,
} from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

// ── GET /platform/stats ───────────────────────────────────────────────────────

router.get("/platform/stats", requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [storeStatusRows, userCountRow, genCountRow, proStoreRows] = await Promise.all([
    db.select({ status: storesTable.status, cnt: count() }).from(storesTable).groupBy(storesTable.status),
    db.select({ cnt: count() }).from(usersTable),
    db.select({ cnt: count() }).from(generationJobsTable),
    db.select({ cnt: count() }).from(storesTable).where(and(eq(storesTable.plan, "pro"), eq(storesTable.status, "active"))),
  ]);

  const storesByStatus: Record<string, number> = {};
  let totalStores = 0;
  for (const row of storeStatusRows) {
    storesByStatus[row.status] = Number(row.cnt);
    totalStores += Number(row.cnt);
  }

  res.json({
    stores: {
      total: totalStores,
      active: storesByStatus["active"] ?? 0,
      byStatus: storesByStatus,
    },
    users: { total: Number(userCountRow[0]?.cnt ?? 0) },
    planners: { total: Number(genCountRow[0]?.cnt ?? 0) },
    mrr: {
      amountUsd: Number(proStoreRows[0]?.cnt ?? 0) * 49,
      note: "placeholder — connect Stripe for live data",
    },
  });
});

// ── GET /help ─────────────────────────────────────────────────────────────────

router.get("/help", resolveStoreActorOptional, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  const q = req.query as Record<string, string | undefined>;
  const { kind, category, scope: scopeFilter, status: statusFilter } = q;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];

  if (actor?.isSuperAdmin) {
    rows = await db.select().from(helpContentTable).orderBy(helpContentTable.createdAt);
  } else if (actor?.userId) {
    // Authenticated user: platform-scoped + scopes for stores they belong to
    const memberships = await db
      .select({ storeId: storeMembersTable.storeId })
      .from(storeMembersTable)
      .where(eq(storeMembersTable.userId, actor.userId));
    const storeIds = memberships.map(m => m.storeId);

    const conditions: SQL<unknown>[] = [eq(helpContentTable.scope, "platform")];
    if (storeIds.length > 0) {
      conditions.push(inArray(helpContentTable.scope, storeIds));
    }

    rows = await db
      .select()
      .from(helpContentTable)
      .where(conditions.length === 1 ? conditions[0] : or(...(conditions as [SQL<unknown>, ...SQL<unknown>[]])))
      .orderBy(helpContentTable.createdAt);
  } else {
    // Unauthenticated: platform live only
    rows = await db
      .select()
      .from(helpContentTable)
      .where(and(eq(helpContentTable.scope, "platform"), eq(helpContentTable.status, "live")))
      .orderBy(helpContentTable.createdAt);
  }

  if (kind) rows = rows.filter((r: { kind: string }) => r.kind === kind);
  if (category) rows = rows.filter((r: { category: string }) => r.category === category);
  if (scopeFilter) rows = rows.filter((r: { scope: string }) => r.scope === scopeFilter);
  if (statusFilter) rows = rows.filter((r: { status: string }) => r.status === statusFilter);

  res.json(rows);
});

// ── POST /help ────────────────────────────────────────────────────────────────

router.post("/help", resolveStoreActor, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  if (!actor) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { id, title, body, category, kind, scope, status } = req.body as Record<string, string>;

  if (!id || !title || !body || !category || !scope) {
    res.status(400).json({ error: "id, title, body, category, scope are required" });
    return;
  }

  if (!actor.isSuperAdmin) {
    if (scope === "platform") {
      res.status(403).json({ error: "Forbidden: only super_admin can create platform-scoped help" });
      return;
    }
    const rows = await db
      .select()
      .from(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, scope), eq(storeMembersTable.userId, actor.userId)));
    const membership = rows[0];
    if (!membership || (membership.role !== "store_owner" && membership.role !== "store_staff")) {
      res.status(403).json({ error: "Forbidden: store_staff or store_owner required for this scope" });
      return;
    }
  }

  try {
    const [article] = await db
      .insert(helpContentTable)
      .values({ id, title, body, category, kind: kind ?? "article", scope, status: status ?? "draft", createdBy: actor.userId })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: scope === "platform" ? "platform" : scope,
      action: "help.create",
      targetType: "help",
      targetId: id,
    });

    res.status(201).json(article);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      res.status(409).json({ error: "Help article with that id already exists" });
    } else {
      req.log.error({ err }, "help create failed");
      res.status(500).json({ error: "Create failed" });
    }
  }
});

// ── PATCH /help/:id ───────────────────────────────────────────────────────────

router.patch("/help/:id", resolveStoreActor, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  if (!actor) { res.status(401).json({ error: "Not authenticated" }); return; }

  const id = req.params.id as string;
  const body = req.body as Record<string, unknown>;
  delete body.id;

  const existingRows = await db.select().from(helpContentTable).where(eq(helpContentTable.id, id));
  const existing = existingRows[0];
  if (!existing) { res.status(404).json({ error: "Help article not found" }); return; }

  if (!actor.isSuperAdmin) {
    if (existing.scope === "platform") {
      res.status(403).json({ error: "Forbidden: only super_admin can edit platform-scoped help" });
      return;
    }
    const rows = await db
      .select()
      .from(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, existing.scope), eq(storeMembersTable.userId, actor.userId)));
    const membership = rows[0];
    if (!membership || (membership.role !== "store_owner" && membership.role !== "store_staff")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const [updated] = await db
    .update(helpContentTable)
    .set(body)
    .where(eq(helpContentTable.id, id))
    .returning();

  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: existing.scope === "platform" ? "platform" : existing.scope,
    action: "help.update",
    targetType: "help",
    targetId: id,
  });

  res.json(updated);
});

// ── DELETE /help/:id ──────────────────────────────────────────────────────────

router.delete("/help/:id", resolveStoreActor, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  if (!actor) { res.status(401).json({ error: "Not authenticated" }); return; }

  const id = req.params.id as string;

  const existingRows = await db.select().from(helpContentTable).where(eq(helpContentTable.id, id));
  const existing = existingRows[0];
  if (!existing) { res.status(404).json({ error: "Help article not found" }); return; }

  if (!actor.isSuperAdmin) {
    if (existing.scope === "platform") {
      res.status(403).json({ error: "Forbidden: only super_admin can delete platform-scoped help" });
      return;
    }
    const rows = await db
      .select()
      .from(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, existing.scope), eq(storeMembersTable.userId, actor.userId)));
    const membership = rows[0];
    if (!membership || (membership.role !== "store_owner" && membership.role !== "store_staff")) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  await db.delete(helpContentTable).where(eq(helpContentTable.id, id));

  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: existing.scope === "platform" ? "platform" : existing.scope,
    action: "help.delete",
    targetType: "help",
    targetId: id,
  });

  res.sendStatus(204);
});

// ── GET /audit ────────────────────────────────────────────────────────────────

router.get("/audit", resolveStoreActor, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  if (!actor) { res.status(401).json({ error: "Not authenticated" }); return; }

  const q = req.query as Record<string, string | undefined>;
  const filterStoreId = q.storeId;
  const filterAction  = q.action;
  const limit = Math.min(parseInt(q.limit ?? "100", 10), 500);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];

  if (actor.isSuperAdmin) {
    rows = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit);
    if (filterStoreId) rows = rows.filter((r: { scope: string }) => r.scope === filterStoreId);
    if (filterAction)  rows = rows.filter((r: { action: string }) => r.action === filterAction);
  } else {
    // store_owner: only their own stores
    const membership = await db
      .select({ storeId: storeMembersTable.storeId })
      .from(storeMembersTable)
      .where(and(eq(storeMembersTable.userId, actor.userId), eq(storeMembersTable.role, "store_owner")));

    if (!membership.length) {
      res.status(403).json({ error: "Forbidden: store_owner or super_admin required" });
      return;
    }

    const ownedIds = membership.map(m => m.storeId);
    const scopeIds = filterStoreId && ownedIds.includes(filterStoreId) ? [filterStoreId] : ownedIds;

    rows = await db
      .select()
      .from(auditLogTable)
      .where(inArray(auditLogTable.scope, scopeIds))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit);

    if (filterAction) rows = rows.filter((r: { action: string }) => r.action === filterAction);
  }

  res.json(rows);
});

export default router;
