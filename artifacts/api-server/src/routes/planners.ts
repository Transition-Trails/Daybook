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
import { buildPdf, buildPreviewPdf, generatePageIds, validatePageIds } from "../lib/pdf-generator";
import { uploadPlannerPdf, uploadPlannerConfig } from "../lib/drive-upload";
import { getValidGoogleToken, GoogleAuthError } from "../lib/google-auth";
import type { User, PlannerSetup, PlannerStyle, PlannerOutput, Edition, Theme } from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runGeneration(
  config: typeof plannerConfigsTable.$inferSelect,
): Promise<{ pdfFileId: string; configFileId: string; pageCount: number }> {
  // Resolve edition + theme for art/colors.
  // Priority: style.themeId (user's explicit pick) → edition.themes[0] → undefined.
  // Must match the same logic used by POST /planners/preview so preview and
  // full-build always render identical colours for the same config.
  let themeColors: string[] | undefined;
  const styleThemeId = (config.style as PlannerStyle & { themeId?: string }).themeId;

  if (styleThemeId) {
    // User explicitly chose a theme — look it up directly.
    const [theme] = await db
      .select()
      .from(themesTable)
      .where(eq(themesTable.id, styleThemeId));
    if (theme) themeColors = theme.colors as string[];
  } else if (config.editionId) {
    // Fall back to the first theme listed on the edition.
    const [edition] = await db
      .select()
      .from(editionsTable)
      .where(eq(editionsTable.id, config.editionId));
    if (edition) {
      const firstThemeId = (edition.themes as string[])?.[0];
      if (firstThemeId) {
        const [theme] = await db
          .select()
          .from(themesTable)
          .where(eq(themesTable.id, firstThemeId));
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

  // Resolve a valid (possibly refreshed) Google token; fall back gracefully if unavailable.
  let googleAccessToken: string | null = null;
  try {
    googleAccessToken = await getValidGoogleToken(config.userId);
  } catch (err) {
    if (!(err instanceof GoogleAuthError)) throw err;
    // No Google connection or token revoked — Drive upload is skipped below.
  }

  // Upload PDF to Google Drive when the user has a valid token; fall back to a local stub ID
  const pdfFileId =
    (await uploadPlannerPdf(googleAccessToken, config.id as string, buffer)) ??
    `pdf-${config.id}-${Date.now()}`;

  // Upload config JSON to Drive alongside the PDF
  const configFileId =
    (await uploadPlannerConfig(googleAccessToken, config.id as string, {
      setup: config.setup,
      style: config.style,
      output: config.output,
      editionId: config.editionId,
      generatedAt: new Date().toISOString(),
    })) ?? `cfg-${config.id}-${Date.now()}`;

  return { pdfFileId, configFileId, pageCount };
}

// ── POST /planners/preview ────────────────────────────────────────────────────
// Returns a representative ~8-page PDF sample using the same engine as full
// generation. No DB writes, no Drive upload, no Google token required.
// Phase 1: builder is new-planner-only — reexport lives at /planners/:id/reexport
// and is NOT surfaced in any builder UI.

router.post("/planners/preview", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as {
    editionId?: string;
    setup: PlannerSetup;
    style?: PlannerStyle & { themeId?: string };
    output?: PlannerOutput;
  };

  if (!body.setup) { res.status(400).json({ error: "setup is required" }); return; }
  const { weekStart, orientation, startMonth, startYear, monthCount } = body.setup;
  if (!["sun", "mon"].includes(weekStart) || !["landscape", "vertical"].includes(orientation) ||
      startMonth < 0 || startMonth > 11 || !startYear || monthCount < 1) {
    res.status(400).json({ error: "Invalid setup fields" }); return;
  }

  try {
    // Resolve theme colors — prefer explicit themeId in style, then first theme of edition
    let themeColors: string[] | undefined;
    const themeId = body.style?.themeId;
    if (themeId) {
      const [theme] = await db.select().from(themesTable).where(eq(themesTable.id, themeId));
      if (theme) themeColors = theme.colors as string[];
    } else if (body.editionId) {
      const [edition] = await db.select().from(editionsTable).where(eq(editionsTable.id, body.editionId));
      if (edition) {
        const firstThemeId = (edition.themes as string[])?.[0];
        if (firstThemeId) {
          const [theme] = await db.select().from(themesTable).where(eq(themesTable.id, firstThemeId));
          if (theme) themeColors = theme.colors as string[];
        }
      }
    }

    const sections = (body.style as PlannerStyle | undefined)?.sections ?? [];
    const { buffer, pageCount } = await buildPreviewPdf(
      {
        setup: body.setup,
        style: body.style ?? {},
        output: body.output ?? { calMode: "none", eventMins: 60, aiInPdf: false },
        sections,
        editionId: body.editionId,
      },
      themeColors,
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
    res.setHeader("Cache-Control", "no-store, no-cache");
    res.setHeader("X-Preview-Pages", String(pageCount));
    res.send(Buffer.from(buffer));
  } catch (err) {
    req.log.error({ err }, "Preview generation failed");
    res.status(500).json({ error: String(err) });
  }
});

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

    // Generate PDF and upload to Drive if the user has a Google token
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
