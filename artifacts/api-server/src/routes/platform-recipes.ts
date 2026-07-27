/**
 * Platform-scoped product recipe routes (super_admin only).
 *
 * GET    /platform/recipes           — list all recipes (non-retired by default)
 * POST   /platform/recipes           — create a recipe
 * GET    /platform/recipes/stats     — live count / draft / ships-next-month / renewals
 * GET    /platform/recipes/:id       — get one
 * PATCH  /platform/recipes/:id       — edit fields
 * POST   /platform/recipes/:id/publish — status draft → live
 * POST   /platform/recipes/:id/retire  — status live  → retired
 * DELETE /platform/recipes/:id       — hard-delete draft (soft-retire if live)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { productRecipesTable } from "@workspace/db";
import { eq, sql, and, not } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";

const router = Router();

function newId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// ── GET /platform/recipes/stats ──────────────────────────────────────────────

router.get(
  "/platform/recipes/stats",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db.select().from(productRecipesTable);
    const now = new Date();
    const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
    const nextYear  = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear();

    const live      = rows.filter(r => r.status === "live").length;
    const draft     = rows.filter(r => r.status === "draft").length;
    const shipsNext = rows.filter(r => {
      const rel = r.release as { month?: number; year?: number } | null;
      return r.status === "draft" && rel?.month === nextMonth && rel?.year === nextYear;
    }).length;
    // renewals citing new recipes: live recipes published in the last 30 days (proxy)
    const renewals  = rows.filter(r => {
      return r.status === "live" && r.buildCount > 0 &&
        r.updatedAt && (Date.now() - new Date(r.updatedAt).getTime()) < 30 * 86400_000;
    }).length;

    res.json({ live, draft, shipsNext, renewalsCitingNew: renewals });
  },
);

// ── GET /platform/recipes ────────────────────────────────────────────────────

router.get(
  "/platform/recipes",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const includeRetired = req.query.retired === "1";
    const rows = await db.select().from(productRecipesTable);
    const filtered = includeRetired ? rows : rows.filter(r => r.status !== "retired");
    res.json(filtered);
  },
);

// ── POST /platform/recipes ───────────────────────────────────────────────────

router.post(
  "/platform/recipes",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const body = req.body as {
      name: string;
      category: string;
      decisionCard?: unknown;
      parts?: string[];
      physicalPath?: unknown;
      claudeBrief?: unknown;
      release?: unknown;
      status?: string;
    };

    if (!body.name?.trim() || !body.category?.trim()) {
      res.status(400).json({ error: "name and category are required" });
      return;
    }

    const [recipe] = await db.insert(productRecipesTable).values({
      id:           newId(),
      name:         body.name.trim(),
      category:     body.category.trim(),
      decisionCard: body.decisionCard ?? null,
      parts:        body.parts ?? [],
      physicalPath: body.physicalPath ?? null,
      claudeBrief:  body.claudeBrief ?? null,
      release:      body.release ?? null,
      status:       (body.status === "live" ? "live" : "draft"),
      buildCount:   0,
    }).returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.create",
      targetType:  "product_recipe",
      targetId:    recipe.id,
      metadata:    { name: recipe.name },
    });

    res.status(201).json(recipe);
  },
);

// ── GET /platform/recipes/:id ────────────────────────────────────────────────

router.get(
  "/platform/recipes/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const [recipe] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!recipe) { res.status(404).json({ error: "Recipe not found" }); return; }
    res.json(recipe);
  },
);

// ── PATCH /platform/recipes/:id ──────────────────────────────────────────────

router.patch(
  "/platform/recipes/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }

    const body = req.body as Partial<{
      name: string;
      category: string;
      decisionCard: unknown;
      parts: string[];
      physicalPath: unknown;
      claudeBrief: unknown;
      release: unknown;
    }>;

    const [updated] = await db
      .update(productRecipesTable)
      .set({
        ...(body.name         !== undefined && { name:         body.name }),
        ...(body.category     !== undefined && { category:     body.category }),
        ...(body.decisionCard !== undefined && { decisionCard: body.decisionCard }),
        ...(body.parts        !== undefined && { parts:        body.parts }),
        ...(body.physicalPath !== undefined && { physicalPath: body.physicalPath }),
        ...(body.claudeBrief  !== undefined && { claudeBrief:  body.claudeBrief }),
        ...(body.release      !== undefined && { release:      body.release }),
        updatedAt: new Date(),
      })
      .where(eq(productRecipesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.edit",
      targetType:  "product_recipe",
      targetId:    id,
      metadata:    { name: updated.name },
    });

    res.json(updated);
  },
);

// ── POST /platform/recipes/:id/publish ──────────────────────────────────────

router.post(
  "/platform/recipes/:id/publish",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }
    if (existing.status === "retired") { res.status(409).json({ error: "Cannot publish a retired recipe" }); return; }

    const [updated] = await db
      .update(productRecipesTable)
      .set({ status: "live", updatedAt: new Date() })
      .where(eq(productRecipesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.publish",
      targetType:  "product_recipe",
      targetId:    id,
      metadata:    { name: updated.name },
    });

    res.json(updated);
  },
);

// ── POST /platform/recipes/:id/retire ───────────────────────────────────────

router.post(
  "/platform/recipes/:id/retire",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }

    const [updated] = await db
      .update(productRecipesTable)
      .set({ status: "retired", updatedAt: new Date() })
      .where(eq(productRecipesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.retire",
      targetType:  "product_recipe",
      targetId:    id,
      metadata:    { name: updated.name },
    });

    res.json(updated);
  },
);

// ── DELETE /platform/recipes/:id ─────────────────────────────────────────────

router.delete(
  "/platform/recipes/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }

    // Live recipes get soft-retired; drafts can be hard-deleted
    if (existing.status === "live") {
      await db.update(productRecipesTable)
        .set({ status: "retired", updatedAt: new Date() })
        .where(eq(productRecipesTable.id, id));
      await writeAudit(db, {
        actorUserId: actor.userId, actorRole: "super_admin", scope: "platform",
        action: "recipe.retire", targetType: "product_recipe", targetId: id,
        metadata: { name: existing.name, via: "delete" },
      });
      res.json({ ok: true, status: "retired" });
    } else {
      await db.delete(productRecipesTable).where(eq(productRecipesTable.id, id));
      await writeAudit(db, {
        actorUserId: actor.userId, actorRole: "super_admin", scope: "platform",
        action: "recipe.delete", targetType: "product_recipe", targetId: id,
        metadata: { name: existing.name },
      });
      res.json({ ok: true, status: "deleted" });
    }
  },
);

// ── POST /platform/recipes/:id/increment-build ──────────────────────────────
// Called by generation routes to track build usage per recipe.

router.post(
  "/platform/recipes/:id/increment-build",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    await db
      .update(productRecipesTable)
      .set({ buildCount: sql`${productRecipesTable.buildCount} + 1` })
      .where(eq(productRecipesTable.id, id));
    res.json({ ok: true });
  },
);

export default router;
