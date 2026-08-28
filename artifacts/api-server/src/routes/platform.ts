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
  plannerConfigsTable,
  editionsTable,
  plansTable,
  paymentsTable,
  stickersLibraryTable,
  packStickersTable,
  stickerPacksTable,
  einkDevicePresetsTable,
  einkEnforcementRulesTable,
  STICKER_FUNCTION_TYPES,
  type StickerFunctionType,
} from "@workspace/db";
import { eq, or, count, desc, and, inArray, ne, ilike, sql, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  requireSuperAdmin,
  resolveStoreActor,
  resolveStoreActorOptional,
  resolveStoreActorOptionalWithStoreHeader,
  resolveStoreActorWithStoreHeader,
} from "../middleware/requireRole";
import { getBundleCoverageGaps } from "../lib/font-warmup";
import { UI_REACHABLE_FAMILIES, _bundledFontPath } from "../lib/pdf-generator";
import { existsSync } from "fs";
import { writeAudit } from "../lib/audit";
import { buildPlatformBillingAnalytics } from "../lib/platform-analytics";
import { isHelpCategory } from "@workspace/api-zod";
import {
  removeBackground,
  applyBorderAndSize,
  generateCutlineSvg,
  STICKER_OUTPUT_DPI,
} from "../lib/imageProcessing";
import {
  cacheEinkPreset,
  cacheEinkRule,
  getEinkPresets,
  refreshEinkCatalog,
  removeCachedEinkPreset,
  type EinkPreset,
} from "../lib/eink-presets";

const router: IRouter = Router();

// ── E-INK PROFILE CATALOG ─────────────────────────────────────────────────────

function serializeEinkPreset(preset: EinkPreset) {
  return {
    key: preset.key,
    name: preset.label,
    pixelWidth: preset.px.w,
    pixelHeight: preset.px.h,
    trimWidth: preset.pts.w,
    trimHeight: preset.pts.h,
    linkSupport: preset.linkSupport,
    linksQuality: preset.linksQuality,
    safeInset: preset.safeInset,
    sellGuidance: preset.sellGuidance,
    caveat: preset.caveat,
  };
}

router.get("/platform/eink", requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  const catalog = await refreshEinkCatalog();
  res.json({ presets: catalog.presets.map(serializeEinkPreset), rules: catalog.rules });
});

router.post("/platform/eink/presets", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const body = req.body as Record<string, unknown>;
  const key = typeof body.key === "string" ? body.key.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sellGuidance = typeof body.sellGuidance === "string" ? body.sellGuidance.trim() : "";
  const linkSupport = body.linkSupport;
  const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!/^[a-z][a-z0-9_]*$/.test(key) || !name || !sellGuidance
    || !numeric(body.pixelWidth) || !numeric(body.pixelHeight)
    || !numeric(body.trimWidth) || !numeric(body.trimHeight)
    || !numeric(body.safeInset) || !["full", "partial", "poor"].includes(String(linkSupport))) {
    res.status(400).json({ error: "key, name, dimensions, safeInset, linkSupport, and sellGuidance are required" });
    return;
  }
  try {
    const [row] = await db.insert(einkDevicePresetsTable).values({
      key,
      name,
      pixelWidth: body.pixelWidth as number,
      pixelHeight: body.pixelHeight as number,
      trimWidth: body.trimWidth as number,
      trimHeight: body.trimHeight as number,
      linkSupport: linkSupport as "full" | "partial" | "poor",
      safeInset: body.safeInset as number,
      sellGuidance,
      caveat: typeof body.caveat === "string" && body.caveat.trim() ? body.caveat.trim() : null,
    }).returning();
    const preset = cacheEinkPreset(row);
    await writeAudit(db, { actorUserId: actor.userId, actorRole: "super_admin", scope: "platform", action: "eink_preset.create", targetType: "eink_device_preset", targetId: key, metadata: { name } });
    res.status(201).json(serializeEinkPreset(preset));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "An e-ink preset with that key already exists" });
      return;
    }
    throw error;
  }
});

router.patch("/platform/eink/presets/:key", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const key = String((req.params as { key: string }).key).toLowerCase();
  const [existing] = await db.select().from(einkDevicePresetsTable).where(eq(einkDevicePresetsTable.key, key));
  if (!existing) { res.status(404).json({ error: "E-ink preset not found" }); return; }
  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof einkDevicePresetsTable.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  const positiveFinite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
  const suppliedInvalidNumber = ["pixelWidth", "pixelHeight", "trimWidth", "trimHeight"]
    .some((field) => Object.prototype.hasOwnProperty.call(body, field) && !positiveFinite(body[field]));
  const suppliedInvalidInset = Object.prototype.hasOwnProperty.call(body, "safeInset")
    && !(typeof body.safeInset === "number" && Number.isFinite(body.safeInset) && body.safeInset >= 0);
  if (suppliedInvalidNumber || suppliedInvalidInset) {
    res.status(400).json({ error: "Dimensions must be positive finite numbers and safeInset must be a non-negative finite number" });
    return;
  }
  if (positiveFinite(body.pixelWidth)) patch.pixelWidth = body.pixelWidth;
  if (positiveFinite(body.pixelHeight)) patch.pixelHeight = body.pixelHeight;
  if (positiveFinite(body.trimWidth)) patch.trimWidth = body.trimWidth;
  if (positiveFinite(body.trimHeight)) patch.trimHeight = body.trimHeight;
  if (["full", "partial", "poor"].includes(String(body.linkSupport))) patch.linkSupport = body.linkSupport as "full" | "partial" | "poor";
  if (typeof body.safeInset === "number" && Number.isFinite(body.safeInset) && body.safeInset >= 0) patch.safeInset = body.safeInset;
  if (typeof body.sellGuidance === "string" && body.sellGuidance.trim()) patch.sellGuidance = body.sellGuidance.trim();
  if (body.caveat === null || (typeof body.caveat === "string" && body.caveat.trim())) patch.caveat = body.caveat === null ? null : (body.caveat as string).trim();
  if (!Object.keys(patch).length) { res.status(400).json({ error: "No valid preset fields supplied" }); return; }
  const [row] = await db.update(einkDevicePresetsTable).set({ ...patch, updatedAt: new Date() }).where(eq(einkDevicePresetsTable.key, key)).returning();
  const preset = cacheEinkPreset(row);
  await writeAudit(db, { actorUserId: actor.userId, actorRole: "super_admin", scope: "platform", action: "eink_preset.edit", targetType: "eink_device_preset", targetId: key, metadata: { name: preset.label } });
  res.json(serializeEinkPreset(preset));
});

router.delete("/platform/eink/presets/:key", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const key = String((req.params as { key: string }).key).toLowerCase();
  const [existing] = await db.select().from(einkDevicePresetsTable).where(eq(einkDevicePresetsTable.key, key));
  if (!existing) { res.status(404).json({ error: "E-ink preset not found" }); return; }
  const [usage] = await db.select({ count: count() }).from(plannerConfigsTable).where(sql`(${plannerConfigsTable.output}->>'einkDevice') = ${key}`);
  if (Number(usage?.count ?? 0) > 0) {
    res.status(409).json({ error: "This preset is used by existing planner exports and cannot be deleted" });
    return;
  }
  await db.delete(einkDevicePresetsTable).where(eq(einkDevicePresetsTable.key, key));
  removeCachedEinkPreset(key);
  await writeAudit(db, { actorUserId: actor.userId, actorRole: "super_admin", scope: "platform", action: "eink_preset.delete", targetType: "eink_device_preset", targetId: key, metadata: { name: existing.name } });
  res.status(204).end();
});

router.patch("/platform/eink/rules/:key", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const key = String((req.params as { key: string }).key);
  const [existing] = await db.select().from(einkEnforcementRulesTable).where(eq(einkEnforcementRulesTable.key, key));
  if (!existing) { res.status(404).json({ error: "E-ink enforcement rule not found" }); return; }
  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof einkEnforcementRulesTable.$inferInsert> = {};
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if (typeof body.description === "string" && body.description.trim()) patch.description = body.description.trim();
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.threshold === null) patch.threshold = null;
  else if (typeof body.threshold === "number" && Number.isFinite(body.threshold) && body.threshold >= 0) patch.threshold = body.threshold;
  if (body.unit === null || typeof body.unit === "string") patch.unit = body.unit as string | null;
  if (!Object.keys(patch).length) { res.status(400).json({ error: "No valid rule fields supplied" }); return; }
  const [row] = await db.update(einkEnforcementRulesTable).set({ ...patch, updatedAt: new Date() }).where(eq(einkEnforcementRulesTable.key, key)).returning();
  const rule = cacheEinkRule(row);
  await writeAudit(db, { actorUserId: actor.userId, actorRole: "super_admin", scope: "platform", action: "eink_rule.edit", targetType: "eink_enforcement_rule", targetId: key, metadata: { enabled: rule.enabled, threshold: rule.threshold } });
  res.json(rule);
});

// ── GET /platform/stats ───────────────────────────────────────────────────────

router.get("/platform/stats", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const includeSeed = req.query.includeSeed === "true";
  const storeVisibility = includeSeed ? undefined : eq(storesTable.isSeed, false);
  const analyticsNow = new Date();
  await refreshEinkCatalog();
  const [storeStatusRows, storeCreatedRows, userCountRow, generationRows, trialRows, plannerRows, billingUsers, billingPayments] = await Promise.all([
    db.select({ status: storesTable.status, cnt: count() }).from(storesTable).where(storeVisibility).groupBy(storesTable.status),
    db.select({
      id: storesTable.id,
      ownerUserId: storesTable.ownerUserId,
      isSeed: storesTable.isSeed,
      createdAt: storesTable.createdAt,
    }).from(storesTable).where(storeVisibility),
    db.select({ cnt: count() }).from(usersTable),
    db
      .select({
        status: generationJobsTable.status,
        storeId: plannerConfigsTable.storeId,
        createdAt: generationJobsTable.createdAt,
      })
      .from(generationJobsTable)
      .leftJoin(plannerConfigsTable, eq(plannerConfigsTable.id, generationJobsTable.plannerId))
      .leftJoin(storesTable, eq(storesTable.id, plannerConfigsTable.storeId))
      .where(includeSeed ? undefined : or(isNull(plannerConfigsTable.storeId), eq(storesTable.isSeed, false))),
    db
      .select({
        storeId: storesTable.id,
        endsAt: usersTable.planCurrentPeriodEnd,
      })
      .from(storesTable)
      .innerJoin(usersTable, eq(usersTable.id, storesTable.ownerUserId))
      .where(and(eq(storesTable.status, "trial"), storeVisibility)),
    db
      .select({
        plannerId: plannerConfigsTable.id,
        storeId: plannerConfigsTable.storeId,
        output: plannerConfigsTable.output,
        createdAt: plannerConfigsTable.createdAt,
        editionName: editionsTable.name,
        editionStatus: editionsTable.status,
        storeName: storesTable.name,
      })
      .from(plannerConfigsTable)
      .innerJoin(editionsTable, eq(editionsTable.id, plannerConfigsTable.editionId))
      .leftJoin(storesTable, eq(storesTable.id, plannerConfigsTable.storeId))
      .where(includeSeed ? undefined : or(isNull(plannerConfigsTable.storeId), eq(storesTable.isSeed, false))),
    db
      .select({
        id: usersTable.id,
        createdAt: usersTable.createdAt,
        plan: usersTable.plan,
        planStatus: usersTable.planStatus,
        planCurrentPeriodEnd: usersTable.planCurrentPeriodEnd,
        stripeSubscriptionId: usersTable.stripeSubscriptionId,
      })
      .from(usersTable),
    db
      .select({
        userId: paymentsTable.userId,
        planId: paymentsTable.planId,
        source: paymentsTable.source,
        status: paymentsTable.status,
        amountCents: paymentsTable.amountCents,
        currency: paymentsTable.currency,
        stripeSubscriptionId: paymentsTable.stripeSubscriptionId,
        createdAt: paymentsTable.createdAt,
      })
      .from(paymentsTable)
      .where(and(
        inArray(paymentsTable.source, ["checkout", "async_checkout", "invoice"]),
        eq(paymentsTable.status, "succeeded"),
      )),
  ]);

  const storesByStatus: Record<string, number> = {};
  let totalStores = 0;
  for (const row of storeStatusRows) {
    storesByStatus[row.status] = Number(row.cnt);
    totalStores += Number(row.cnt);
  }

  const plannersByStore: Record<string, number> = {};
  const completedPlannersByStore: Record<string, number> = {};
  let completedBuilds = 0;
  let failedBuilds = 0;
  for (const row of generationRows) {
    if (row.storeId) plannersByStore[row.storeId] = (plannersByStore[row.storeId] ?? 0) + 1;
    if (row.status === "complete") {
      completedBuilds += 1;
      if (row.storeId) completedPlannersByStore[row.storeId] = (completedPlannersByStore[row.storeId] ?? 0) + 1;
    }
    if (row.status === "failed") failedBuilds += 1;
  }
  const seriesStarts = Array.from({ length: 6 }, (_, index) => {
    const offset = index - 5;
    return new Date(Date.UTC(
      analyticsNow.getUTCFullYear(),
      analyticsNow.getUTCMonth() + offset,
      1,
    ));
  });
  const seriesLabels = seriesStarts.map((date) => date.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  }));
  const bucket = (date: Date): number => seriesStarts.findIndex((start, index) => {
    const end = index === seriesStarts.length - 1
      ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
      : seriesStarts[index + 1];
    return date >= start && date < end;
  });
  const newStores = Array(6).fill(0) as number[];
  const completedBuildSeries = Array(6).fill(0) as number[];
  const failedBuildSeries = Array(6).fill(0) as number[];
  for (const row of storeCreatedRows) {
    const index = bucket(row.createdAt);
    if (index >= 0) newStores[index] += 1;
  }
  for (const row of generationRows) {
    const index = bucket(row.createdAt);
    if (index < 0) continue;
    if (row.status === "complete") completedBuildSeries[index] += 1;
    if (row.status === "failed") failedBuildSeries[index] += 1;
  }
  const trialEndsAtByStore: Record<string, string> = {};
  for (const row of trialRows) {
    if (row.endsAt) trialEndsAtByStore[row.storeId] = row.endsAt.toISOString();
  }
  const poorLinkDevices = new Map(
    getEinkPresets()
      .filter((preset) => preset.linkSupport === "poor")
      .map((preset) => [preset.key, preset.label]),
  );
  const linkRiskListings = plannerRows.flatMap((row) => {
    const output = row.output as { calMode?: string; aiInPdf?: boolean; einkDevice?: string | null } | null;
    const deviceLabel = output?.einkDevice ? poorLinkDevices.get(output.einkDevice.toLowerCase()) : undefined;
    const promisesUriLinks = output?.calMode === "link" || output?.calMode === "overlay" || output?.aiInPdf === true;
    if (row.editionStatus !== "live" || !promisesUriLinks || !deviceLabel) return [];
    return [{
      plannerId: row.plannerId,
      editionName: row.editionName,
      storeId: row.storeId,
      storeName: row.storeName,
      deviceLabel,
      createdAt: row.createdAt.toISOString(),
      ageHours: Math.max(0, Math.floor((analyticsNow.getTime() - row.createdAt.getTime()) / 3_600_000)),
    }];
  });
  const billingAnalytics = buildPlatformBillingAnalytics({
    now: analyticsNow,
    includeSeed,
    stores: storeCreatedRows,
    users: billingUsers,
    payments: billingPayments,
  });

  res.json({
    stores: {
      total: totalStores,
      active: storesByStatus["active"] ?? 0,
      byStatus: storesByStatus,
    },
    users: { total: Number(userCountRow[0]?.cnt ?? 0) },
    planners: {
      total: generationRows.length,
      completed: completedBuilds,
      failed: failedBuilds,
      byStore: plannersByStore,
      completedByStore: completedPlannersByStore,
    },
    activitySeries: {
      labels: seriesLabels,
      newStores,
      completedBuilds: completedBuildSeries,
      failedBuilds: failedBuildSeries,
    },
    trials: { endsAtByStore: trialEndsAtByStore },
    linkRiskListings,
    billingAnalytics,
    mrr: {
      amountUsd: billingAnalytics.mrr.amountUsd,
      note: billingAnalytics.mrr.calculation,
    },
  });
});

// ── GET /platform/font-coverage ──────────────────────────────────────────────
// Super-admin endpoint: reports which UI-reachable font families have bundled
// WOFF files vs which must fall back to a live Google Fonts network call.

router.get("/platform/font-coverage", requireSuperAdmin, (_req: Request, res: Response): void => {
  const gaps = getBundleCoverageGaps();
  const covered: string[] = [];
  const missing: string[] = [];

  for (const family of UI_REACHABLE_FAMILIES) {
    if (existsSync(_bundledFontPath(family, 400))) {
      covered.push(family);
    } else {
      missing.push(family);
    }
  }

  res.json({
    totalFamilies:  covered.length + missing.length,
    coveredCount:   covered.length,
    missingCount:   missing.length,
    covered,
    missing,
    // warmupGaps reflects what the warmup observed at startup (same data, provided
    // for convenience — gaps here means the server was started without the WOFF files).
    warmupGaps: gaps,
    healthy: missing.length === 0,
  });
});

// ── GET /help ─────────────────────────────────────────────────────────────────

router.get("/help", resolveStoreActorOptionalWithStoreHeader, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  const q = req.query as Record<string, string | undefined>;
  const { kind, category, scope: scopeFilter, status: statusFilter } = q;
  if (actor?.impersonation && scopeFilter !== actor.impersonation.storeId) {
    res.status(403).json({ error: "Forbidden: help scope must match the entered store" });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];

  if (scopeFilter && scopeFilter !== "platform") {
    if (!actor?.userId) {
      res.status(403).json({ error: "Forbidden: store membership required for this help scope" });
      return;
    }

    if (!actor.isSuperAdmin) {
      const [membership] = await db
        .select({ storeId: storeMembersTable.storeId })
        .from(storeMembersTable)
        .where(and(
          eq(storeMembersTable.storeId, scopeFilter),
          eq(storeMembersTable.userId, actor.userId),
        ));
      if (!membership) {
        res.status(403).json({ error: "Forbidden: no membership in this help scope" });
        return;
      }
    }

    rows = await db
      .select()
      .from(helpContentTable)
      .where(or(
        eq(helpContentTable.scope, "platform"),
        eq(helpContentTable.scope, scopeFilter),
      ))
      .orderBy(helpContentTable.createdAt);
  } else if (scopeFilter === "platform") {
    const platformCondition = actor?.userId
      ? eq(helpContentTable.scope, "platform")
      : and(eq(helpContentTable.scope, "platform"), eq(helpContentTable.status, "live"));
    rows = await db
      .select()
      .from(helpContentTable)
      .where(platformCondition)
      .orderBy(helpContentTable.createdAt);
  } else if (actor?.isSuperAdmin) {
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
  if (statusFilter) rows = rows.filter((r: { status: string }) => r.status === statusFilter);

  res.json(rows);
});

// ── POST /help ────────────────────────────────────────────────────────────────

router.post("/help", resolveStoreActorWithStoreHeader, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  if (!actor) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { id, title, body, category, kind, scope, status } = req.body as Record<string, string>;
  if (actor.impersonation && scope !== actor.impersonation.storeId) {
    res.status(403).json({ error: "Forbidden: help scope must match the entered store" });
    return;
  }

  if (!id || !title || !body || !category || !scope) {
    res.status(400).json({ error: "id, title, body, category, scope are required" });
    return;
  }
  if (!isHelpCategory(category)) {
    res.status(400).json({ error: "category must be a canonical help category" });
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

router.patch("/help/:id", resolveStoreActorWithStoreHeader, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  if (!actor) { res.status(401).json({ error: "Not authenticated" }); return; }

  const id = req.params.id as string;
  const body = req.body as Record<string, unknown>;
  delete body.id;

  if ("category" in body && !isHelpCategory(body.category)) {
    res.status(400).json({ error: "category must be a canonical help category" });
    return;
  }

  const existingRows = await db.select().from(helpContentTable).where(eq(helpContentTable.id, id));
  const existing = existingRows[0];
  if (!existing) { res.status(404).json({ error: "Help article not found" }); return; }
  if (actor.impersonation && existing.scope !== actor.impersonation.storeId) {
    res.status(403).json({ error: "Forbidden: help article is outside the entered store" });
    return;
  }

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

router.delete("/help/:id", resolveStoreActorWithStoreHeader, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor;
  if (!actor) { res.status(401).json({ error: "Not authenticated" }); return; }

  const id = req.params.id as string;

  const existingRows = await db.select().from(helpContentTable).where(eq(helpContentTable.id, id));
  const existing = existingRows[0];
  if (!existing) { res.status(404).json({ error: "Help article not found" }); return; }
  if (actor.impersonation && existing.scope !== actor.impersonation.storeId) {
    res.status(403).json({ error: "Forbidden: help article is outside the entered store" });
    return;
  }

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
    // Build DB-level filters for super_admin (avoids fetching all rows then JS-filtering)
    const saConditions: SQL<unknown>[] = [];
    if (filterStoreId) saConditions.push(eq(auditLogTable.scope, filterStoreId));
    if (filterAction)  saConditions.push(eq(auditLogTable.action, filterAction));
    const saWhere =
      saConditions.length === 0
        ? undefined
        : saConditions.length === 1
          ? saConditions[0]
          : and(...(saConditions as [SQL<unknown>, ...SQL<unknown>[]]));

    rows = await db
      .select()
      .from(auditLogTable)
      .where(saWhere)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit);
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

// ── GET /platform/stickers ────────────────────────────────────────────────────
// Cross-store read-only sticker list for super_admin.
// Query params: q, origin, functionType, storeId, status, limit, offset

router.get("/platform/stickers", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { q, origin, functionType, storeId, status, limit = "200", offset = "0" } = req.query as Record<string, string>;

  const conditions: SQL[] = [ne(stickersLibraryTable.status, "deleted")];

  if (origin) conditions.push(eq(stickersLibraryTable.origin, origin as "owned" | "licensed" | "starter"));
  if (functionType) conditions.push(eq(stickersLibraryTable.functionType, functionType as any));
  if (storeId) conditions.push(eq(stickersLibraryTable.authoredByStoreId, storeId));
  if (status) conditions.push(eq(stickersLibraryTable.status, status as "draft" | "live"));
  if (q) {
    const pat = `%${q}%`;
    conditions.push(
      or(
        ilike(stickersLibraryTable.name, pat),
        sql`${stickersLibraryTable.tags}::text ilike ${pat}`,
      )!,
    );
  }

  const rows = await db
    .select({
      id: stickersLibraryTable.id,
      name: stickersLibraryTable.name,
      tags: stickersLibraryTable.tags,
      functionType: stickersLibraryTable.functionType,
      status: stickersLibraryTable.status,
      origin: stickersLibraryTable.origin,
      authoredByStoreId: stickersLibraryTable.authoredByStoreId,
      borderStyle: stickersLibraryTable.borderStyle,
      borderWidth: stickersLibraryTable.borderWidth,
      borderWidthMm: stickersLibraryTable.borderWidthMm,
      borderColor: stickersLibraryTable.borderColor,
      sizeInMm: stickersLibraryTable.sizeInMm,
      exportTargets: stickersLibraryTable.exportTargets,
      processedImageData: stickersLibraryTable.processedImageData,
      cutlineSvg: stickersLibraryTable.cutlineSvg,
      setId: stickersLibraryTable.setId,
      createdAt: stickersLibraryTable.createdAt,
      updatedAt: stickersLibraryTable.updatedAt,
    })
    .from(stickersLibraryTable)
    .where(and(...conditions))
    .orderBy(desc(stickersLibraryTable.createdAt))
    .limit(Math.min(parseInt(limit, 10) || 200, 500))
    .offset(parseInt(offset, 10) || 0);

  res.json(rows);
});

// ═════════════════════════════════════════════════════════════════════════════
// PLATFORM STICKER AUTHORING  (super_admin only)
// New stickers: origin='starter', authoredByStoreId=null.
// PATCH/DELETE: any non-deleted sticker (support access for store-owned).
// Bulk routes must appear BEFORE /:id to avoid param capture.
// ═════════════════════════════════════════════════════════════════════════════

function genStickerId(): string {
  return `stk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function isValidStickerFunctionType(v: unknown): v is StickerFunctionType {
  return STICKER_FUNCTION_TYPES.includes(v as StickerFunctionType);
}

async function runStickerPipeline(params: {
  imageBase64: string;
  borderStyle?: string;
  /** Legacy 96-DPI pixel value, preserved for older rows. */
  borderWidth?: number | null;
  borderWidthMm?: number | null;
  borderColor?: string | null;
  sizeInMm?: number | null;
  exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
}): Promise<{ processedImageData: string; cutlineSvg: string | null }> {
  const {
    imageBase64,
    borderStyle = "none",
    borderWidth,
    borderWidthMm,
    borderColor,
    sizeInMm,
    exportTargets = { goodnotes: true, ink: true, cricut: false },
  } = params;

  let processed = await removeBackground(imageBase64);

  if (borderStyle !== "none" || sizeInMm) {
    processed = await applyBorderAndSize(
      processed, borderStyle, borderWidth ?? null, borderColor ?? null, sizeInMm ?? null, borderWidthMm ?? null,
    );
  }

  const cutlineSvg = exportTargets.cricut
    ? await generateCutlineSvg(processed, sizeInMm ? STICKER_OUTPUT_DPI : undefined)
    : null;
  return { processedImageData: processed, cutlineSvg };
}

// ── POST /platform/stickers/bulk/function-type ────────────────────────────────

router.post(
  "/platform/stickers/bulk/function-type",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids, functionType } = req.body as { ids?: unknown; functionType?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids must be a non-empty array" }); return; }
    if (!isValidStickerFunctionType(functionType)) {
      res.status(400).json({ error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` }); return;
    }
    const rows = await db
      .select({ id: stickersLibraryTable.id })
      .from(stickersLibraryTable)
      .where(and(inArray(stickersLibraryTable.id, ids as string[]), ne(stickersLibraryTable.status, "deleted")));
    const valid = rows.map((r) => r.id);
    if (!valid.length) { res.status(400).json({ error: "No valid stickers found" }); return; }
    await db.update(stickersLibraryTable).set({ functionType }).where(inArray(stickersLibraryTable.id, valid));
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
      action: "platform.sticker.bulk.set-function-type", targetType: "sticker",
      metadata: { functionType, count: valid.length },
    });
    res.json({ updated: valid.length, skipped: (ids as string[]).length - valid.length });
  },
);

// ── POST /platform/stickers/bulk/publish ──────────────────────────────────────

router.post(
  "/platform/stickers/bulk/publish",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids, publish } = req.body as { ids?: unknown; publish?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids must be a non-empty array" }); return; }
    if (typeof publish !== "boolean") { res.status(400).json({ error: "publish (boolean) is required" }); return; }
    const rows = await db
      .select({ id: stickersLibraryTable.id })
      .from(stickersLibraryTable)
      .where(and(inArray(stickersLibraryTable.id, ids as string[]), ne(stickersLibraryTable.status, "deleted")));
    const valid = rows.map((r) => r.id);
    if (!valid.length) { res.status(400).json({ error: "No valid stickers found" }); return; }
    await db.update(stickersLibraryTable).set({ status: publish ? "live" : "draft" }).where(inArray(stickersLibraryTable.id, valid));
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
      action: publish ? "platform.sticker.bulk.publish" : "platform.sticker.bulk.unpublish",
      targetType: "sticker", metadata: { count: valid.length },
    });
    res.json({ updated: valid.length, skipped: (ids as string[]).length - valid.length });
  },
);

// ── POST /platform/stickers/bulk/add-to-pack ──────────────────────────────────

router.post(
  "/platform/stickers/bulk/add-to-pack",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids, packId } = req.body as { ids?: unknown; packId?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids must be a non-empty array" }); return; }
    if (typeof packId !== "string" || !packId) { res.status(400).json({ error: "packId is required" }); return; }
    const [pack] = await db
      .select({ id: stickerPacksTable.id })
      .from(stickerPacksTable)
      .where(and(eq(stickerPacksTable.id, packId), ne(stickerPacksTable.status, "deleted")));
    if (!pack) { res.status(404).json({ error: "Pack not found" }); return; }
    const rows = await db
      .select({ id: stickersLibraryTable.id })
      .from(stickersLibraryTable)
      .where(and(inArray(stickersLibraryTable.id, ids as string[]), ne(stickersLibraryTable.status, "deleted")));
    const valid = rows.map((r) => r.id);
    if (!valid.length) { res.status(400).json({ error: "No valid stickers found" }); return; }
    const [posRow] = await db
      .select({ maxPos: sql<number>`max(${packStickersTable.position})` })
      .from(packStickersTable)
      .where(eq(packStickersTable.packId, packId));
    const basePos = (posRow?.maxPos ?? -1) + 1;
    await db.insert(packStickersTable).values(valid.map((stickerId, i) => ({ packId, stickerId, position: basePos + i }))).onConflictDoNothing();
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
      action: "platform.sticker.bulk.add-to-pack", targetType: "pack", targetId: packId,
      metadata: { count: valid.length, skipped: (ids as string[]).length - valid.length },
    });
    res.json({ added: valid.length, skipped: (ids as string[]).length - valid.length });
  },
);

// ── DELETE /platform/stickers/bulk ────────────────────────────────────────────

router.delete(
  "/platform/stickers/bulk",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids must be a non-empty array" }); return; }
    const rows = await db
      .select({ id: stickersLibraryTable.id })
      .from(stickersLibraryTable)
      .where(and(inArray(stickersLibraryTable.id, ids as string[]), ne(stickersLibraryTable.status, "deleted")));
    const valid = rows.map((r) => r.id);
    if (!valid.length) { res.status(400).json({ error: "No valid stickers found" }); return; }
    await db.delete(packStickersTable).where(inArray(packStickersTable.stickerId, valid));
    await db.update(stickersLibraryTable).set({ status: "deleted" }).where(inArray(stickersLibraryTable.id, valid));
    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
      action: "platform.sticker.bulk.delete", targetType: "sticker",
      metadata: { count: valid.length },
    });
    res.json({ deleted: valid.length, skipped: (ids as string[]).length - valid.length });
  },
);

// ── POST /platform/stickers ───────────────────────────────────────────────────

router.post(
  "/platform/stickers",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const {
      name, tags, functionType, imageBase64,
      borderStyle, borderWidth, borderWidthMm, borderColor, sizeInMm, exportTargets,
      status: reqStatus,
    } = req.body as {
      name?: string; tags?: string[]; functionType?: string; imageBase64?: string;
      borderStyle?: string; borderWidth?: number; borderWidthMm?: number; borderColor?: string; sizeInMm?: number;
      exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
      status?: "draft" | "live";
    };

    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    if (!isValidStickerFunctionType(functionType)) {
      res.status(400).json({ error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` }); return;
    }
    if (!imageBase64 || !imageBase64.startsWith("data:image/")) {
      res.status(400).json({ error: "imageBase64 must be a base64-encoded image data URL" }); return;
    }
    {
      const { validateBase64ImageMagicBytes } = await import("../lib/upload-guard.js");
      const magicErr = validateBase64ImageMagicBytes(imageBase64, "imageBase64");
      if (magicErr) { res.status(400).json({ error: magicErr }); return; }
    }

    const status: "draft" | "live" = reqStatus === "live" ? "live" : "draft";
    const resolvedExportTargets = exportTargets ?? { goodnotes: true, ink: true, cricut: false };
    const resolvedBorderStyle = borderStyle ?? "none";

    try {
      const pipeline = await runStickerPipeline({
        imageBase64, borderStyle: resolvedBorderStyle, borderWidth, borderWidthMm, borderColor, sizeInMm,
        exportTargets: resolvedExportTargets,
      });

      const id = genStickerId();
      const [row] = await db
        .insert(stickersLibraryTable)
        .values({
          id, name,
          tags: (tags ?? []) as string[],
          functionType: functionType as StickerFunctionType,
          status,
          origin: "starter",
          authoredByStoreId: null,
          borderStyle: resolvedBorderStyle,
          borderWidth: borderWidth ?? null,
          borderWidthMm: borderWidthMm ?? null,
          borderColor: borderColor ?? null,
          sizeInMm: sizeInMm ?? null,
          exportTargets: resolvedExportTargets,
          processedImageData: pipeline.processedImageData,
          cutlineSvg: pipeline.cutlineSvg,
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
        action: status === "live" ? "platform.sticker.publish" : "platform.sticker.create",
        targetType: "sticker", targetId: id,
        metadata: { name, functionType, status },
      });

      res.status(201).json(row);
    } catch (err) {
      req.log.error({ err }, "platform sticker create failed");
      res.status(500).json({ error: "Create failed" });
    }
  },
);

// ── PATCH /platform/stickers/:id ─────────────────────────────────────────────

router.patch(
  "/platform/stickers/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [row] = await db
      .select()
      .from(stickersLibraryTable)
      .where(and(eq(stickersLibraryTable.id, id), ne(stickersLibraryTable.status, "deleted")));

    if (!row) { res.status(404).json({ error: "Sticker not found" }); return; }

    const {
      name, tags, functionType, imageBase64,
      borderStyle, borderWidth, borderWidthMm, borderColor, sizeInMm, exportTargets, status,
    } = req.body as {
      name?: string; tags?: string[]; functionType?: string; imageBase64?: string;
      borderStyle?: string; borderWidth?: number | null; borderWidthMm?: number | null; borderColor?: string | null;
      sizeInMm?: number | null; exportTargets?: { goodnotes: boolean; ink: boolean; cricut: boolean };
      status?: "draft" | "live";
    };

    if (functionType !== undefined && !isValidStickerFunctionType(functionType)) {
      res.status(400).json({ error: `functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}` }); return;
    }

    type UpdateData = Partial<typeof stickersLibraryTable.$inferInsert>;
    const updateData: UpdateData = {};
    if (name !== undefined)         updateData.name = name;
    if (tags !== undefined)         updateData.tags = tags as string[];
    if (functionType !== undefined) updateData.functionType = functionType as StickerFunctionType;
    if (status !== undefined)       updateData.status = status;
    if (borderStyle !== undefined)  updateData.borderStyle = borderStyle;
    if (borderWidth !== undefined)  updateData.borderWidth = borderWidth;
    if (borderWidthMm !== undefined) updateData.borderWidthMm = borderWidthMm;
    if (borderColor !== undefined)  updateData.borderColor = borderColor;
    if (sizeInMm !== undefined)     updateData.sizeInMm = sizeInMm;
    if (exportTargets !== undefined) updateData.exportTargets = exportTargets;

    const pipelineChanged = [imageBase64, borderStyle, borderWidth, borderWidthMm, borderColor, sizeInMm, exportTargets].some(
      (f) => f !== undefined,
    );

    if (pipelineChanged) {
      const effectiveImage = imageBase64 ?? row.processedImageData ?? "";
      if (!effectiveImage.startsWith("data:image/")) {
        res.status(400).json({ error: "No usable image data for pipeline re-run" }); return;
      }
      try {
        const pipeline = await runStickerPipeline({
          imageBase64: effectiveImage,
          borderStyle: borderStyle ?? row.borderStyle,
          borderWidth: borderWidth ?? row.borderWidth,
          borderWidthMm: borderWidthMm ?? row.borderWidthMm,
          borderColor: borderColor ?? row.borderColor,
          sizeInMm: sizeInMm ?? row.sizeInMm,
          exportTargets: exportTargets ?? (row.exportTargets as { goodnotes: boolean; ink: boolean; cricut: boolean }),
        });
        updateData.processedImageData = pipeline.processedImageData;
        updateData.cutlineSvg = pipeline.cutlineSvg;
      } catch (pipelineErr) {
        req.log.error({ err: pipelineErr }, "platform sticker pipeline re-run failed");
        res.status(500).json({ error: "Image processing failed" }); return;
      }
    }

    if (Object.keys(updateData).length === 0) { res.json(row); return; }

    const [updated] = await db
      .update(stickersLibraryTable)
      .set(updateData)
      .where(eq(stickersLibraryTable.id, id))
      .returning();

    const auditAction =
      row.status !== updated.status
        ? updated.status === "live" ? "platform.sticker.publish" : "platform.sticker.unpublish"
        : "platform.sticker.edit";

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
      action: auditAction, targetType: "sticker", targetId: id,
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

    const [row] = await db
      .select()
      .from(stickersLibraryTable)
      .where(and(eq(stickersLibraryTable.id, id), ne(stickersLibraryTable.status, "deleted")));

    if (!row) { res.status(404).json({ error: "Sticker not found" }); return; }

    const newId = genStickerId();
    const [cloned] = await db
      .insert(stickersLibraryTable)
      .values({
        id: newId,
        name: `${row.name} copy`,
        tags: row.tags as string[],
        functionType: row.functionType as StickerFunctionType,
        status: "draft",
        origin: "starter",      // platform clone always lands as starter
        authoredByStoreId: null,
        borderStyle: row.borderStyle,
        borderWidth: row.borderWidth,
        borderWidthMm: row.borderWidthMm,
        borderColor: row.borderColor,
        sizeInMm: row.sizeInMm,
        exportTargets: row.exportTargets as { goodnotes: boolean; ink: boolean; cricut: boolean },
        processedImageData: row.processedImageData,
        cutlineSvg: row.cutlineSvg,
      })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
      action: "platform.sticker.duplicate", targetType: "sticker", targetId: newId,
      metadata: { sourceId: id, name: cloned.name },
    });

    res.status(201).json(cloned);
  },
);

// ── DELETE /platform/stickers/:id ────────────────────────────────────────────

router.delete(
  "/platform/stickers/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [row] = await db
      .select()
      .from(stickersLibraryTable)
      .where(and(eq(stickersLibraryTable.id, id), ne(stickersLibraryTable.status, "deleted")));

    if (!row) { res.status(404).json({ error: "Sticker not found" }); return; }

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
    await db.update(stickersLibraryTable).set({ status: "deleted" }).where(eq(stickersLibraryTable.id, id));

    await writeAudit(db, {
      actorUserId: actor.userId, actorRole: actor.effectiveRole, scope: "platform",
      action: "platform.sticker.delete", targetType: "sticker", targetId: id,
      metadata: { name: row.name, force, detachedFromPacks: packRefs.map((p) => p.packId) },
    });

    res.status(204).send();
  },
);

export default router;
