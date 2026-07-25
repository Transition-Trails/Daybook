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
  palettesTable,
  backgroundsTable,
  themeBackgroundsTable,
  storesTable,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { buildPdf, buildPreviewPdf, generatePageIds, validatePageIds, type BackgroundSpec } from "../lib/pdf-generator";
import { uploadPlannerPdf, uploadPlannerConfig } from "../lib/drive-upload";
import { getValidGoogleToken, GoogleAuthError } from "../lib/google-auth";
import { assertEntitled, EntitlementError, type EntitlementContext } from "../lib/entitlement";
import type { User, PlannerSetup, PlannerStyle, PlannerOutput, Edition, Theme } from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function runGeneration(
  config: typeof plannerConfigsTable.$inferSelect,
): Promise<{ pdfFileId: string; configFileId: string; pageCount: number }> {
  // Resolve colors for generation.
  // Priority 1: explicit paletteId (buyer picked a palette within the theme)
  // Priority 2: theme.colors for the explicit themeId (backward-compat)
  // Priority 3: first theme on the edition → theme.colors
  let themeColors: string[] | undefined;
  const style = config.style as PlannerStyle & { themeId?: string; paletteId?: string; backgroundId?: string };

  if (style.paletteId) {
    const [pal] = await db
      .select()
      .from(palettesTable)
      .where(eq(palettesTable.id, style.paletteId));
    if (pal) themeColors = pal.colors as string[];
  }

  if (!themeColors && style.themeId) {
    const [theme] = await db
      .select()
      .from(themesTable)
      .where(eq(themesTable.id, style.themeId));
    if (theme) themeColors = theme.colors as string[];
  }

  if (!themeColors && config.editionId) {
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

  // Background resolution: priority chain
  //   1. style.backgroundId (explicit buyer selection)
  //   2. theme's first linked background via theme_backgrounds
  //   3. none → render as paper fill (blank page, backward-compat)
  let background: BackgroundSpec | undefined;
  if (style.backgroundId) {
    const [bg] = await db
      .select({ type: backgroundsTable.type, assetRef: backgroundsTable.assetRef })
      .from(backgroundsTable)
      .where(eq(backgroundsTable.id, style.backgroundId));
    if (bg) background = bg;
  }
  if (!background && style.themeId) {
    const [bgRow] = await db
      .select({ type: backgroundsTable.type, assetRef: backgroundsTable.assetRef })
      .from(themeBackgroundsTable)
      .innerJoin(backgroundsTable, eq(themeBackgroundsTable.backgroundId, backgroundsTable.id))
      .where(eq(themeBackgroundsTable.themeId, style.themeId))
      .orderBy(asc(themeBackgroundsTable.position))
      .limit(1);
    if (bgRow) background = bgRow;
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
    undefined,   // use DEFAULT_TEMPLATE
    background,
  );

  // Resolve a valid (possibly refreshed) Google token; fall back gracefully if unavailable.
  let googleAccessToken: string | null = null;
  try {
    googleAccessToken = await getValidGoogleToken(config.userId);
  } catch (err) {
    if (!(err instanceof GoogleAuthError)) throw err;
    // No Google connection or token revoked — Drive upload is skipped below.
  }

  // Upload PDF + config to Google Drive when the user has a valid token.
  // Fall back to local stub IDs on any Drive error (API disabled, quota, mid-flight revocation, etc.)
  // so planner generation never fails solely because of Drive unavailability.
  let pdfFileId: string;
  let configFileId: string;
  try {
    pdfFileId =
      (await uploadPlannerPdf(googleAccessToken, config.id as string, buffer)) ??
      `pdf-${config.id}-${Date.now()}`;
    configFileId =
      (await uploadPlannerConfig(googleAccessToken, config.id as string, {
        setup: config.setup,
        style: config.style,
        output: config.output,
        editionId: config.editionId,
        generatedAt: new Date().toISOString(),
      })) ?? `cfg-${config.id}-${Date.now()}`;
  } catch {
    // Drive unavailable — planner is still saved; Drive IDs will be stub values.
    pdfFileId = `pdf-${config.id}-${Date.now()}`;
    configFileId = `cfg-${config.id}-${Date.now()}`;
  }

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
    // Resolve colors — same priority chain as runGeneration (palette > theme.colors > edition fallback).
    let themeColors: string[] | undefined;
    const previewStyle = body.style as (PlannerStyle & { themeId?: string; paletteId?: string; backgroundId?: string }) | undefined;

    if (previewStyle?.paletteId) {
      const [pal] = await db.select().from(palettesTable).where(eq(palettesTable.id, previewStyle.paletteId));
      if (pal) themeColors = pal.colors as string[];
    }
    if (!themeColors && previewStyle?.themeId) {
      const [theme] = await db.select().from(themesTable).where(eq(themesTable.id, previewStyle.themeId));
      if (theme) themeColors = theme.colors as string[];
    }
    if (!themeColors && body.editionId) {
      const [edition] = await db.select().from(editionsTable).where(eq(editionsTable.id, body.editionId));
      if (edition) {
        const firstThemeId = (edition.themes as string[])?.[0];
        if (firstThemeId) {
          const [theme] = await db.select().from(themesTable).where(eq(themesTable.id, firstThemeId));
          if (theme) themeColors = theme.colors as string[];
        }
      }
    }

    // Background resolution for preview (same chain as runGeneration)
    let previewBackground: BackgroundSpec | undefined;
    if (previewStyle?.backgroundId) {
      const [bg] = await db
        .select({ type: backgroundsTable.type, assetRef: backgroundsTable.assetRef })
        .from(backgroundsTable)
        .where(eq(backgroundsTable.id, previewStyle.backgroundId));
      if (bg) previewBackground = bg;
    }
    if (!previewBackground && previewStyle?.themeId) {
      const [bgRow] = await db
        .select({ type: backgroundsTable.type, assetRef: backgroundsTable.assetRef })
        .from(themeBackgroundsTable)
        .innerJoin(backgroundsTable, eq(themeBackgroundsTable.backgroundId, backgroundsTable.id))
        .where(eq(themeBackgroundsTable.themeId, previewStyle.themeId))
        .orderBy(asc(themeBackgroundsTable.position))
        .limit(1);
      if (bgRow) previewBackground = bgRow;
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
      undefined,          // use DEFAULT_TEMPLATE
      previewBackground,
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
    /** Optional store context — when present, entitlement is enforced for the store. */
    storeContext?: { storeId: string };
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

  // ── Entitlement gate (generation-time only) ──────────────────────────────
  // Only fires when a storeContext is provided (i.e. generation from a storefront).
  // Already-generated planners are NEVER re-checked — this path only runs for NEW ones.
  if (body.storeContext?.storeId) {
    const storeId = body.storeContext.storeId;
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
    if (!store) {
      res.status(400).json({ error: "Unknown storeContext.storeId" });
      return;
    }
    const ctx = {
      storeId,
      subscriptionActive: store.subscriptionActive ?? true,
      isSuperAdmin: false, // storefront generation always uses the store's real subscription state
    };
    try {
      // Check the edition.
      if (body.editionId) {
        const [edition] = await db.select().from(editionsTable).where(eq(editionsTable.id, body.editionId));
        if (edition) {
          assertEntitled(
            edition.id, "edition",
            (edition.origin ?? "licensed") as "starter" | "licensed" | "owned",
            edition.authoredByStoreId ?? null,
            ctx,
          );
        }
      }
      // Check the theme (stored in style.themeId).
      const themeId = (body.style as Record<string, unknown> | undefined)?.themeId as string | undefined;
      if (themeId) {
        const [theme] = await db.select().from(themesTable).where(eq(themesTable.id, themeId));
        if (theme) {
          assertEntitled(
            theme.id, "theme",
            (theme.origin ?? "licensed") as "starter" | "licensed" | "owned",
            theme.authoredByStoreId ?? null,
            ctx,
          );
        }
      }
    } catch (err) {
      if (err instanceof EntitlementError) {
        res.status(403).json({ error: err.message, reason: err.status, itemId: err.itemId, itemType: err.itemType });
        return;
      }
      throw err;
    }
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

// ── GET /planners ─────────────────────────────────────────────────────────────
// Returns all planner configs for the authenticated user, newest first.
router.get("/planners", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const configs = await db
    .select()
    .from(plannerConfigsTable)
    .where(eq(plannerConfigsTable.userId, user.id as string))
    .orderBy(desc(plannerConfigsTable.createdAt));
  res.json(configs);
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
