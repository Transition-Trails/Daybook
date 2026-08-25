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
  themeFontsTable,
  fontsTable,
  storesTable,
  plannerInteriorVersionsTable,
  type ThemeFontPairing,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { buildPdf, buildPreviewPdf, generatePageIds, validatePageIds, type BackgroundSpec } from "../lib/pdf-generator";
import { uploadPlannerPdf, uploadPlannerConfig } from "../lib/drive-upload";
import { getValidGoogleToken, GoogleAuthError } from "../lib/google-auth";
import { assertEntitled, EntitlementError, type EntitlementContext } from "../lib/entitlement";
import { buildInteriorPdf } from "../lib/planner-interior-renderer";
import type { User, PlannerSetup, PlannerStyle, PlannerOutput, Edition, Theme } from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function runGeneration(
  config: typeof plannerConfigsTable.$inferSelect,
  hotspotsByTemplate?: Map<string, import("../lib/pdf-generator").UserHotspot[]>,
): Promise<{ pdfFileId: string; configFileId: string; inkFriendlyPdfFileId: string | null; pageCount: number; einkCaveat: string | null; fontSubstitutions: string[]; totalLinkAnnotations?: number }> {
  // Resolve colors for generation.
  // Priority 1: explicit paletteId (buyer picked a palette within the theme)
  // Priority 2: theme.colors for the explicit themeId (backward-compat)
  // Priority 3: first theme on the edition → theme.colors
  let themeColors: string[] | undefined;
  const style = config.style as PlannerStyle & { themeId?: string; paletteId?: string; backgroundId?: string };
  let editionRecord: typeof editionsTable.$inferSelect | undefined;

  if (config.editionId) {
    [editionRecord] = await db
      .select()
      .from(editionsTable)
      .where(eq(editionsTable.id, config.editionId));
  }

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

  if (!themeColors && editionRecord) {
      const firstThemeId = (editionRecord.themes as string[])?.[0];
      if (firstThemeId) {
        const [theme] = await db
          .select()
          .from(themesTable)
          .where(eq(themesTable.id, firstThemeId));
        if (theme) themeColors = theme.colors as string[];
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

  // Font pairing resolution: theme_fonts rows → curatedPairings → ThemeFontPairing.
  // Priority: theme_fonts join (uses the heading/body/accent curatedPairings on each font row)
  //           > theme.fontPairing JSONB (legacy / manually set)
  //           > none (generator falls back to Helvetica)
  let fontPairing: ThemeFontPairing | undefined;
  if (style.themeId) {
    const fontRows = await db
      .select({ familyName: fontsTable.familyName, curatedPairings: fontsTable.curatedPairings })
      .from(themeFontsTable)
      .innerJoin(fontsTable, eq(themeFontsTable.fontId, fontsTable.id))
      .where(eq(themeFontsTable.themeId, style.themeId))
      .orderBy(asc(themeFontsTable.position));
    if (fontRows.length > 0) {
      const merged: ThemeFontPairing = {};
      for (const row of fontRows) {
        for (const p of (row.curatedPairings ?? []) as Array<{ role: string; family: string }>) {
          if (p.role === "heading" && !merged.heading) merged.heading = row.familyName;
          if (p.role === "body"    && !merged.body)    merged.body    = row.familyName;
          if (p.role === "accent"  && !merged.accent)  merged.accent  = row.familyName;
        }
      }
      if (merged.heading || merged.body || merged.accent) fontPairing = merged;
    }
    // Fallback: fontPairing JSONB stored directly on the theme row
    if (!fontPairing) {
      const [themeRow] = await db
        .select({ fontPairing: themesTable.fontPairing })
        .from(themesTable)
        .where(eq(themesTable.id, style.themeId));
      if (themeRow?.fontPairing) fontPairing = themeRow.fontPairing as ThemeFontPairing;
    }
  }

  // Apply per-instance font overrides (style.fonts) on top of theme pairing.
  // Seller/buyer overrides take priority; empty/absent values fall through to theme defaults.
  const styleFonts = (style as PlannerStyle & { fonts?: { heading?: string; subheading?: string; script?: string; accent?: string } | null }).fonts;
  if (styleFonts) {
    fontPairing = { ...fontPairing };
    if (styleFonts.heading)    fontPairing.heading    = styleFonts.heading;
    if (styleFonts.subheading) fontPairing.subheading = styleFonts.subheading;
    if (styleFonts.script)     fontPairing.body       = styleFonts.script;
    if (styleFonts.accent)     fontPairing.accent     = styleFonts.accent;
  }

  const sections = (config.style as PlannerStyle).sections ?? [];
  const output   = config.output as PlannerOutput;
  const inkFriendlyEnabled = !!output.inkFriendly;
  const einkDeviceKey = (output.einkDevice as string | null | undefined) ?? null;
  // When an e-ink device is set, always generate the B&W/device-trim variant.
  const shouldGenerateEinkVariant = inkFriendlyEnabled || !!einkDeviceKey;

  const generatorConfig = {
    setup: config.setup as PlannerSetup,
    style: config.style as PlannerStyle,
    output,
    sections,
    editionId: config.editionId ?? undefined,
    userId: config.userId,
  };

  // diagnosticPage flag — read as a cast so PlannerOutput type stays unchanged.
  // Only honoured when callers (admin scripts, test routes) explicitly set it true.
  const diagnosticEnabled = (output as Record<string, unknown>).diagnosticPage === true;

  // Main build: always colour at standard trim (einkDevice not passed here)
  let interiorVersion: typeof plannerInteriorVersionsTable.$inferSelect | undefined;
  if (editionRecord?.interiorVersionId) {
    [interiorVersion] = await db
      .select()
      .from(plannerInteriorVersionsTable)
      .where(eq(plannerInteriorVersionsTable.id, editionRecord.interiorVersionId));
    if (!interiorVersion) throw new Error(`Pinned planner interior version "${editionRecord.interiorVersionId}" was not found`);
  }
  const generated = interiorVersion
    ? await buildInteriorPdf(interiorVersion.manifest, interiorVersion.assets, {
        themeColors,
        title: editionRecord?.name,
        year: config.year ?? undefined,
      })
    : await buildPdf(
        generatorConfig, themeColors, undefined, background, fontPairing, hotspotsByTemplate,
        /* inkFriendly */ false,
        /* einkDevice  */ undefined,
        /* diagnosticPage */ diagnosticEnabled,
      );
  const { buffer, pageCount, totalLinkAnnotations } = generated;
  const fontSubstitutions = "fontSubstitutions" in generated ? generated.fontSubstitutions : [];

  // B&W / e-ink variant: inkFriendly=true + optional device trim
  // Per spec: "the B&W asset from Part 2 IS the e-ink asset — do not build a second pipeline."
  let inkFriendlyBuffer: Uint8Array | null = null;
  if (shouldGenerateEinkVariant) {
    try {
      const result = interiorVersion
        ? await buildInteriorPdf(interiorVersion.manifest, interiorVersion.assets, {
            themeColors,
            title: editionRecord?.name,
            year: config.year ?? undefined,
            inkFriendly: true,
            einkDevice: einkDeviceKey,
          })
        : await buildPdf(
            generatorConfig, themeColors, undefined, background, fontPairing, hotspotsByTemplate,
            /* inkFriendly */ true,
            /* einkDevice */ einkDeviceKey ?? undefined,
          );
      inkFriendlyBuffer = result.buffer;
      console.log(
        `[pdf-generator] E-ink/ink-friendly variant produced` +
        (einkDeviceKey ? ` [device: ${einkDeviceKey}]` : "") +
        ` (${result.pageCount} pages)`,
      );

      // Run e-ink safety check when a device preset is active.
      if (einkDeviceKey) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { collectEinkViolations } = require("../lib/eink-checker") as typeof import("../lib/eink-checker");
        const originalAccentHex = (themeColors?.[0] ?? "#6366f1").replace(/^#?/, "#");
        const violations = collectEinkViolations({
          originalAccentHex,
          bufferBytes: result.buffer.byteLength,
          deviceKey: einkDeviceKey,
        });
        if (violations.length > 0) {
          // Hard failure — caller handles the EinkSafetyError
          const { EinkSafetyError } = require("../lib/eink-checker") as typeof import("../lib/eink-checker");
          throw new EinkSafetyError(violations);
        }
      }
    } catch (err) {
      if ((err as Error).name === "EinkSafetyError") throw err;  // propagate hard failures
      console.warn("[pdf-generator] Ink-friendly/e-ink generation failed — skipping:", (err as Error).message);
    }
  }

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
  let inkFriendlyPdfFileId: string | null = null;
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
    if (inkFriendlyBuffer) {
      inkFriendlyPdfFileId =
        (await uploadPlannerPdf(googleAccessToken, `${config.id as string}-inkfriendly`, inkFriendlyBuffer)) ??
        `pdf-${config.id}-inkfriendly-${Date.now()}`;
    }
  } catch {
    // Drive unavailable — planner is still saved; Drive IDs will be stub values.
    pdfFileId = `pdf-${config.id}-${Date.now()}`;
    configFileId = `cfg-${config.id}-${Date.now()}`;
    if (inkFriendlyBuffer) {
      inkFriendlyPdfFileId = `pdf-${config.id}-inkfriendly-${Date.now()}`;
    }
  }

  // Kindle Scribe caveat — surface to caller for listing copy
  const { getEinkPreset } = await import("../lib/eink-presets");
  const einkCaveat = getEinkPreset(einkDeviceKey)?.caveat ?? null;

  return { pdfFileId, configFileId, inkFriendlyPdfFileId, pageCount, einkCaveat, fontSubstitutions, totalLinkAnnotations };
}

// ── POST /planners/preview ────────────────────────────────────────────────────
// Returns a representative ~8-page PDF sample using the same engine as full
// generation. No DB writes, no Drive upload, no Google token required.
// Phase 1: builder is new-planner-only — reexport lives at /planners/:id/reexport
// and is NOT surfaced in any builder UI.

router.post("/planners/preview", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as {
    editionId?: string;
    einkDevice?: string | null;
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
    let previewEdition: typeof editionsTable.$inferSelect | undefined;
    if (body.editionId) {
      [previewEdition] = await db.select().from(editionsTable).where(eq(editionsTable.id, body.editionId));
      if (!themeColors && previewEdition) {
        const firstThemeId = (previewEdition.themes as string[])?.[0];
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

    // Font pairing resolution for preview — same chain as runGeneration
    let previewFontPairing: ThemeFontPairing | undefined;
    if (previewStyle?.themeId) {
      const fontRows = await db
        .select({ familyName: fontsTable.familyName, curatedPairings: fontsTable.curatedPairings })
        .from(themeFontsTable)
        .innerJoin(fontsTable, eq(themeFontsTable.fontId, fontsTable.id))
        .where(eq(themeFontsTable.themeId, previewStyle.themeId))
        .orderBy(asc(themeFontsTable.position));
      if (fontRows.length > 0) {
        const merged: ThemeFontPairing = {};
        for (const row of fontRows) {
          for (const p of (row.curatedPairings ?? []) as Array<{ role: string; family: string }>) {
            if (p.role === "heading" && !merged.heading) merged.heading = row.familyName;
            if (p.role === "body"    && !merged.body)    merged.body    = row.familyName;
            if (p.role === "accent"  && !merged.accent)  merged.accent  = row.familyName;
          }
        }
        if (merged.heading || merged.body || merged.accent) previewFontPairing = merged;
      }
      if (!previewFontPairing) {
        const [themeRow] = await db
          .select({ fontPairing: themesTable.fontPairing })
          .from(themesTable)
          .where(eq(themesTable.id, previewStyle.themeId));
        if (themeRow?.fontPairing) previewFontPairing = themeRow.fontPairing as ThemeFontPairing;
      }
    }

    // Apply per-instance font overrides from body.style.fonts
    const previewStyleFonts = (body.style as PlannerStyle & { fonts?: { heading?: string; subheading?: string; script?: string; accent?: string } | null } | undefined)?.fonts;
    if (previewStyleFonts) {
      previewFontPairing = { ...previewFontPairing };
      if (previewStyleFonts.heading)    previewFontPairing.heading    = previewStyleFonts.heading;
      if (previewStyleFonts.subheading) previewFontPairing.subheading = previewStyleFonts.subheading;
      if (previewStyleFonts.script)     previewFontPairing.body       = previewStyleFonts.script;
      if (previewStyleFonts.accent)     previewFontPairing.accent     = previewStyleFonts.accent;
    }

    let buffer: Uint8Array;
    let pageCount: number;
    let pvSubs: string[] = [];
    const previewOutput = (body.output ?? {}) as PlannerOutput;
    const previewEinkDevice = body.einkDevice ?? previewOutput.einkDevice ?? undefined;
    const previewInkFriendly = !!previewOutput.inkFriendly || !!previewEinkDevice;
    if (previewEdition?.interiorVersionId) {
      const [interiorVersion] = await db
        .select()
        .from(plannerInteriorVersionsTable)
        .where(eq(plannerInteriorVersionsTable.id, previewEdition.interiorVersionId));
      if (!interiorVersion) throw new Error(`Pinned planner interior version "${previewEdition.interiorVersionId}" was not found`);
      const authoredPreview = await buildInteriorPdf(interiorVersion.manifest, interiorVersion.assets, {
        themeColors,
        title: previewEdition.name,
        year: body.setup.startYear,
        inkFriendly: previewInkFriendly,
        einkDevice: previewEinkDevice,
      });
      buffer = authoredPreview.buffer;
      pageCount = authoredPreview.pageCount;
    } else {
      const sections = (body.style as PlannerStyle | undefined)?.sections ?? [];
      const legacyPreview = await buildPreviewPdf(
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
        previewFontPairing,
        previewEinkDevice,
      );
      buffer = legacyPreview.buffer;
      pageCount = legacyPreview.pageCount;
      pvSubs = legacyPreview.fontSubstitutions;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
    res.setHeader("Cache-Control", "no-store, no-cache");
    res.setHeader("X-Preview-Pages", String(pageCount));
    if (pvSubs.length > 0) {
      // Comma-separated list of families that fell back to StandardFonts in this preview.
      // The admin UI reads this header to surface an inline warning.
      res.setHeader("X-Font-Substitutions", pvSubs.join(","));
    }
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
