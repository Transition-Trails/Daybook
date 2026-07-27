/**
 * Platform-scoped planner template routes (super_admin only).
 * Templates are catalog assets — platform admins create and publish them
 * so stores can adopt them with one click.
 *
 * GET    /platform/planners           — list all templates
 * POST   /platform/planners           — create template
 * GET    /platform/planners/:id       — get one
 * PATCH  /platform/planners/:id       — update (setup locked after generation)
 * POST   /platform/planners/:id/generate — generate PDF
 * POST   /platform/planners/:id/publish  — publish to catalog
 * DELETE /platform/planners/:id       — archive (soft)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  platformPlannerTemplatesTable,
  plannerConfigsTable,
  editionsTable,
  themesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { runGeneration } from "./planners";
import { plannerFileName } from "../lib/planner-filename";
import type { PlannerSetup, PlannerStyle, PlannerOutput } from "@workspace/db";

const LOCKED_SETUP_FIELDS = [
  "datingMode", "weekStart", "orientation", "startMonth", "startYear", "monthCount",
] as const;

const router = Router();

// ── GET /platform/planners ───────────────────────────────────────────────────

router.get(
  "/platform/planners",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const all = await db
      .select()
      .from(platformPlannerTemplatesTable)
      .orderBy(desc(platformPlannerTemplatesTable.createdAt));

    res.json(all.filter(r => r.status !== "archived"));
  },
);

// ── POST /platform/planners ──────────────────────────────────────────────────

router.post(
  "/platform/planners",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;

    const body = req.body as {
      name: string;
      description?: string;
      editionId?: string;
      setup?: Partial<PlannerSetup & { datingMode?: string }>;
      style?: Partial<PlannerStyle>;
      output?: Partial<PlannerOutput>;
    };

    if (!body.name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const defaultSetup: PlannerSetup & { datingMode: string } = {
      weekStart: "mon",
      orientation: "vertical",
      startMonth: 0,
      startYear: new Date().getFullYear() + 1,
      monthCount: 12,
      datingMode: "dated",
      ...body.setup,
    };

    const [template] = await db
      .insert(platformPlannerTemplatesTable)
      .values({
        name: body.name.trim(),
        description: body.description ?? null,
        editionId: body.editionId ?? null,
        setup: defaultSetup,
        style: body.style ?? {},
        output: {
          calMode: "none",
          eventMins: 60,
          aiInPdf: false,
          ...body.output,
        },
        drive: { pdfFileId: null, configFileId: null },
        status: "draft",
      })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "platform.planner_template.create",
      targetType: "platform_planner_template",
      targetId: template.id as string,
      metadata: { name: template.name },
    });

    res.status(201).json(template);
  },
);

// ── GET /platform/planners/:id ───────────────────────────────────────────────

router.get(
  "/platform/planners/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const [template] = await db
      .select()
      .from(platformPlannerTemplatesTable)
      .where(eq(platformPlannerTemplatesTable.id, id));

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.json(template);
  },
);

// ── PATCH /platform/planners/:id ─────────────────────────────────────────────

router.patch(
  "/platform/planners/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(platformPlannerTemplatesTable)
      .where(eq(platformPlannerTemplatesTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const body = req.body as {
      name?: string;
      description?: string;
      setup?: Partial<PlannerSetup & { datingMode?: string }>;
      style?: Partial<PlannerStyle>;
      output?: Partial<PlannerOutput>;
      editionId?: string | null;
    };

    // Setup fields are locked after generation
    if (existing.generatedAt && body.setup) {
      const incoming = body.setup as Record<string, unknown>;
      const locked = LOCKED_SETUP_FIELDS.filter(f => f in incoming);
      if (locked.length > 0) {
        res.status(409).json({
          error: `Setup fields locked after generation: ${locked.join(", ")}`,
          code: "SETUP_LOCKED",
          lockedFields: locked,
        });
        return;
      }
    }

    const updatedStyle  = { ...(existing.style  as PlannerStyle),  ...(body.style  ?? {}) };
    const updatedOutput = { ...(existing.output as PlannerOutput), ...(body.output ?? {}) };
    const existingSetup = existing.setup as PlannerSetup & { datingMode?: string };
    const mergedSetup   = { ...existingSetup, ...(body.setup ?? {}) };

    if ((mergedSetup.datingMode ?? "dated") !== "dated") {
      updatedOutput.calMode = "none";
    }

    const updatePayload: Partial<typeof platformPlannerTemplatesTable.$inferInsert> = {
      style:  updatedStyle,
      output: updatedOutput,
    };
    if (body.setup && !existing.generatedAt) {
      updatePayload.setup = mergedSetup;
    }
    if (body.name !== undefined)   updatePayload.name        = body.name.trim();
    if ("description" in body)     updatePayload.description = body.description ?? null;
    if ("editionId" in body)       updatePayload.editionId   = body.editionId ?? null;

    const [updated] = await db
      .update(platformPlannerTemplatesTable)
      .set(updatePayload)
      .where(eq(platformPlannerTemplatesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "platform.planner_template.update",
      targetType: "platform_planner_template",
      targetId: id,
      metadata: { fields: Object.keys(body) },
    });

    res.json(updated);
  },
);

// ── POST /platform/planners/:id/generate ─────────────────────────────────────

router.post(
  "/platform/planners/:id/generate",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [template] = await db
      .select()
      .from(platformPlannerTemplatesTable)
      .where(eq(platformPlannerTemplatesTable.id, id));

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    if (!template.editionId) {
      res.status(400).json({ error: "An edition must be linked before generating" });
      return;
    }

    try {
      // runGeneration expects a PlannerConfig shape; platform templates are compatible
      const fakeConfig = {
        ...template,
        userId: actor.userId,
        storeId: null,
        year: (template.setup as PlannerSetup).startYear,
        productType: template.productType,
      } as unknown as typeof plannerConfigsTable.$inferSelect;

      const { pdfFileId, configFileId, pageCount } = await runGeneration(fakeConfig);

      // Resolve names for the filename
      let editionName: string | null = null;
      let themeName: string | null = null;
      if (template.editionId) {
        const [ed] = await db
          .select({ name: editionsTable.name })
          .from(editionsTable)
          .where(eq(editionsTable.id, template.editionId));
        editionName = ed?.name ?? null;
      }
      const themeId = (template.style as Record<string, unknown>)?.themeId as string | undefined;
      if (themeId) {
        const [th] = await db
          .select({ name: themesTable.name })
          .from(themesTable)
          .where(eq(themesTable.id, themeId));
        themeName = th?.name ?? null;
      }
      const setup = template.setup as PlannerSetup;
      const fileName = plannerFileName({ setup, editionName, themeName });

      const [updated] = await db
        .update(platformPlannerTemplatesTable)
        .set({ drive: { pdfFileId, configFileId }, generatedAt: new Date() })
        .where(eq(platformPlannerTemplatesTable.id, id))
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: "platform",
        action: "platform.planner_template.generate",
        targetType: "platform_planner_template",
        targetId: id,
        metadata: { pageCount, fileName },
      });

      res.json({ id: updated.id, drive: { pdfFileId, configFileId }, pageCount, fileName });
    } catch (err) {
      req.log.error({ err }, "Platform planner generation failed");
      res.status(500).json({ error: String(err) });
    }
  },
);

// ── POST /platform/planners/:id/publish ──────────────────────────────────────

router.post(
  "/platform/planners/:id/publish",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(platformPlannerTemplatesTable)
      .where(eq(platformPlannerTemplatesTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const [updated] = await db
      .update(platformPlannerTemplatesTable)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(platformPlannerTemplatesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "platform.planner_template.publish",
      targetType: "platform_planner_template",
      targetId: id,
      metadata: { name: existing.name },
    });

    res.json(updated);
  },
);

// ── DELETE /platform/planners/:id ────────────────────────────────────────────

router.delete(
  "/platform/planners/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db
      .select()
      .from(platformPlannerTemplatesTable)
      .where(eq(platformPlannerTemplatesTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    await db
      .update(platformPlannerTemplatesTable)
      .set({ status: "archived" })
      .where(eq(platformPlannerTemplatesTable.id, id));

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "platform.planner_template.archive",
      targetType: "platform_planner_template",
      targetId: id,
      metadata: { name: existing.name },
    });

    res.status(204).send();
  },
);

export default router;
