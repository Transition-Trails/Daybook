/**
 * Planner routes — POST /planners, GET /planners/:id, POST /planners/:id/reexport
 * Per spec/API-CONTRACT.md and spec/LINK-SCHEME.md
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  plannerConfigsTable,
  editionsTable,
  themesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { buildPdf, generatePageIds, validatePageIds } from "../lib/pdf-generator";
import type { User, PlannerSetup, PlannerStyle, PlannerOutput, Edition, Theme } from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runGeneration(
  config: typeof plannerConfigsTable.$inferSelect,
): Promise<{ pdfFileId: string; configFileId: string; pageCount: number }> {
  // Resolve edition + theme for art/colors
  let themeColors: string[] | undefined;
  if (config.editionId) {
    const [edition] = await db
      .select()
      .from(editionsTable)
      .where(eq(editionsTable.id, config.editionId));
    if (edition) {
      const themeId = (edition.themes as string[])?.[0];
      if (themeId) {
        const [theme] = await db
          .select()
          .from(themesTable)
          .where(eq(themesTable.id, themeId));
        if (theme) themeColors = theme.colors as string[];
      }
    }
  }

  const sections = (config.style as PlannerStyle).sections ?? [];
  const { buffer, pageCount } = await buildPdf(
    {
      setup: config.setup as PlannerSetup,
      style: config.style as PlannerStyle,
      output: config.output as PlannerOutput,
      sections,
      editionId: config.editionId ?? undefined,
      userId: config.userId,
    },
    themeColors,
  );

  // TODO: upload buffer to Google Drive when credentials are available
  // For now, store as a stub Drive file ID
  const mockPdfFileId = `pdf-${config.id}-${Date.now()}`;
  const mockConfigFileId = `cfg-${config.id}-${Date.now()}`;

  return { pdfFileId: mockPdfFileId, configFileId: mockConfigFileId, pageCount };
}

// ── POST /planners ────────────────────────────────────────────────────────────

router.post("/planners", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const body = req.body as {
    editionId?: string;
    year?: number;
    setup: PlannerSetup;
    style?: PlannerStyle;
    output?: PlannerOutput;
  };

  if (!body.setup) {
    res.status(400).json({ error: "setup is required" });
    return;
  }
  const { weekStart, orientation, startMonth, startYear, monthCount } = body.setup;
  if (
    !["sun", "mon"].includes(weekStart) ||
    !["landscape", "vertical"].includes(orientation) ||
    startMonth < 0 || startMonth > 11 ||
    !startYear ||
    monthCount < 1 || monthCount > 24
  ) {
    res.status(400).json({ error: "Invalid setup fields" });
    return;
  }

  try {
    // Create planner config
    const [config] = await db
      .insert(plannerConfigsTable)
      .values({
        userId: user.id,
        editionId: body.editionId ?? null,
        year: body.year ?? body.setup.startYear,
        setup: body.setup,
        style: body.style ?? {},
        output: body.output ?? { calMode: "none", eventMins: 60, aiInPdf: false },
        drive: { pdfFileId: null, configFileId: null },
      })
      .returning();

    // Generate PDF
    const { pdfFileId, configFileId, pageCount } = await runGeneration(config);

    // Update drive references
    const [updated] = await db
      .update(plannerConfigsTable)
      .set({
        drive: { pdfFileId, configFileId },
        generatedAt: new Date(),
      })
      .where(eq(plannerConfigsTable.id, config.id as string))
      .returning();

    res.status(201).json({
      id: updated.id,
      drive: { pdfFileId, configFileId },
      pageCount,
    });
  } catch (err) {
    req.log.error({ err }, "Planner generation failed");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /planners/:id ─────────────────────────────────────────────────────────

router.get("/planners/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const id = req.params.id as string;
  const [config] = await db
    .select()
    .from(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.userId, user.id as string)));
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }
  res.json(config);
});

// ── POST /planners/:id/reexport ───────────────────────────────────────────────
// Partial style/output update; setup fields are LOCKED

router.post("/planners/:id/reexport", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const id = req.params.id as string;

  const [existing] = await db
    .select()
    .from(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.userId, user.id as string)));
  if (!existing) { res.status(404).json({ error: "Planner not found" }); return; }

  const body = req.body as { style?: PlannerStyle; output?: PlannerOutput };

  // Merge style/output but never touch setup (locked)
  const updatedStyle = { ...(existing.style as PlannerStyle), ...(body.style ?? {}) };
  const updatedOutput = { ...(existing.output as PlannerOutput), ...(body.output ?? {}) };

  try {
    const [updated] = await db
      .update(plannerConfigsTable)
      .set({ style: updatedStyle, output: updatedOutput })
      .where(eq(plannerConfigsTable.id, id as string))
      .returning();

    const { pdfFileId, configFileId, pageCount } = await runGeneration(updated);

    const [final] = await db
      .update(plannerConfigsTable)
      .set({ drive: { pdfFileId, configFileId }, generatedAt: new Date() })
      .where(eq(plannerConfigsTable.id, id as string))
      .returning();

    res.json({ id: final.id, drive: { pdfFileId, configFileId }, pageCount });
  } catch (err) {
    req.log.error({ err }, "Planner reexport failed");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
