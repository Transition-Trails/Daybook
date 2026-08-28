/**
 * Store-scoped planner routes.
 * Store owners create planners bound to their store, visible only to them.
 * Reuses the shared runGeneration helper from planners.ts.
 *
 * POST   /stores/:storeId/planners          — create + generate
 * GET    /stores/:storeId/planners          — list store's planners
 * GET    /stores/:storeId/planners/:id      — get one
 * PATCH  /stores/:storeId/planners/:id      — re-exportable fields only (setup locked post-generation)
 * POST   /stores/:storeId/planners/:id/reexport — re-export with updated style/output
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  plannerConfigsTable,
  plannerHotspotsTable,
  editionsTable,
  themesTable,
  palettesTable,
  backgroundsTable,
  themeBackgroundsTable,
  storeProfilesTable,
  storeFlagsTable,
  widgetsTable,
} from "@workspace/db";
import type { UserHotspot } from "../lib/pdf-generator";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { callAi } from "../lib/ai-proxy";
import { buildProfileGrounding } from "../lib/profile-grounding";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { plannerFileName } from "../lib/planner-filename";
import { runGeneration } from "./planners";
import type { ActorContext } from "../lib/roles";
import type { PlannerSetup, PlannerStyle, PlannerOutput, PlannerComposition } from "@workspace/db";
import {
  InvalidPlannerCompositionError,
  validateCompositionTargets,
  validatePlannerComposition,
} from "../lib/planner-composition";

const LOCKED_SETUP_FIELDS = [
  "datingMode", "weekStart", "orientation", "startMonth", "startYear", "monthCount",
] as const;

function assertSameStore(actor: ActorContext, urlStoreId: string, res: Response): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.storeId !== urlStoreId) {
    res.status(403).json({ error: "Access denied: store mismatch" });
    return false;
  }
  return true;
}

const router = Router();

// ── Guide page generation helper ──────────────────────────────────────────────

async function generateGuideText(
  storeId: string,
  config: typeof plannerConfigsTable.$inferSelect,
): Promise<string | null> {
  try {
    const [flags] = await db
      .select({ aiEnabled: storeFlagsTable.aiEnabled })
      .from(storeFlagsTable)
      .where(eq(storeFlagsTable.storeId, storeId));

    if (!flags?.aiEnabled) return null;

    const [profile] = await db
      .select()
      .from(storeProfilesTable)
      .where(eq(storeProfilesTable.storeId, storeId));

    const grounding = buildProfileGrounding(profile ?? null);
    const setup = config.setup as PlannerSetup & { datingMode?: string };
    const style = config.style as PlannerStyle;

    const datingMode = setup.datingMode ?? "dated";
    const sections = style.sections ?? [];
    const size = style.size ?? "A5";
    const yearNote = datingMode === "dated" ? ` for ${setup.startYear}` : "";

    const systemPrompt = `You are a friendly planner brand writer. Write a concise, warm getting-started guide (200–300 words exactly) for a specific digital planner.
${grounding ? `\n${grounding}\n` : ""}
Rules:
- Address the reader directly ("you", "your").
- Match the brand voice above exactly.
- Do NOT mention any specific year unless the planner is dated.
- Cover: how to navigate, what each section is for, and one motivational closing sentence.
- Plain prose only — no markdown headers, no bullet lists.
- Exactly 200–300 words.`;

    const userMsg = `Write a getting-started guide for a ${datingMode} ${size} digital planner${yearNote}. Sections: ${sections.length > 0 ? sections.join(", ") : "standard daily/weekly/monthly layout"}.`;

    const result = await callAi([{ role: "user", content: userMsg }], "claude", systemPrompt);
    return result.content?.trim() ?? null;
  } catch {
    return null;
  }
}

async function appendGuidePageToBuffer(
  buffer: Uint8Array,
  guideText: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(buffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const MARGIN = 50;
  const lineH = 16;

  // Header
  page.drawRectangle({
    x: 0, y: height - 50, width, height: 50,
    color: rgb(0.106, 0.165, 0.290), // Ink Navy
  });
  page.drawText("Getting Started", {
    x: MARGIN, y: height - 33, size: 16, font: fontBold, color: rgb(1, 1, 1),
  });

  // Body text — wrap at ~70 chars per line
  const words = guideText.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  const maxChars = 72;

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + " " + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  let y = height - 80;
  for (const line of lines) {
    if (y < MARGIN + 20) break;
    page.drawText(line, { x: MARGIN, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
    y -= lineH;
  }

  return pdfDoc.save();
}

// ── POST /stores/:storeId/planners ───────────────────────────────────────────

router.post(
  "/stores/:storeId/planners",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const body = req.body as {
      editionId?: string;
      year?: number;
      setup: PlannerSetup & { datingMode?: "dated" | "undated" | "perpetual" };
      style?: PlannerStyle;
      output?: PlannerOutput;
    };

    if (!body.setup) {
      res.status(400).json({ error: "setup is required" });
      return;
    }

    const { weekStart, orientation, startMonth, startYear, monthCount, datingMode = "dated" } = body.setup;
    if (
      !["sun", "mon"].includes(weekStart) ||
      !["landscape", "vertical"].includes(orientation) ||
      startMonth < 0 || startMonth > 11 ||
      !startYear ||
      monthCount < 1 || monthCount > 24 ||
      !["dated", "undated", "perpetual"].includes(datingMode)
    ) {
      res.status(400).json({ error: "Invalid setup fields" });
      return;
    }

    // Enforce calMode=none for non-dated planners
    const rawOutput: Partial<PlannerOutput> = body.output ?? {};
    const output: PlannerOutput = {
      calMode: rawOutput.calMode ?? "none",
      eventMins: rawOutput.eventMins ?? 60,
      aiInPdf: rawOutput.aiInPdf ?? false,
      inkFriendly: rawOutput.inkFriendly ?? false,
      ...(rawOutput.einkDevice !== undefined ? { einkDevice: rawOutput.einkDevice } : {}),
    };
    if (body.style && "composition" in body.style) {
      res.status(400).json({ error: "Create the planner before adding widget composition" });
      return;
    }
    if (datingMode !== "dated") {
      output.calMode = "none";
    }

    try {
      const [config] = await db
        .insert(plannerConfigsTable)
        .values({
          userId: actor.userId,
          storeId,
          editionId: body.editionId ?? null,
          year: body.year ?? (datingMode === "dated" ? startYear : null),
          setup: body.setup,
          style: body.style ?? {},
          output,
          drive: { pdfFileId: null, configFileId: null },
        })
        .returning();

      // Load seller hotspot maps (stamp-once: keyed by templateKey, applied to every matching page)
      const hotspotRows = await db.select().from(plannerHotspotsTable).where(eq(plannerHotspotsTable.storeId, storeId));
      const hotspotsByTemplate = new Map<string, UserHotspot[]>();
      for (const h of hotspotRows) {
        const arr = hotspotsByTemplate.get(h.templateKey) ?? [];
        arr.push({ x: h.x, y: h.y, w: h.w, h: h.h, targetType: h.targetType, targetRef: h.targetRef, label: h.label });
        hotspotsByTemplate.set(h.templateKey, arr);
      }
      const { pdfFileId, configFileId, inkFriendlyPdfFileId, pageCount } = await runGeneration(config, hotspotsByTemplate.size ? hotspotsByTemplate : undefined);

      // Determine edition + theme names for bundle filename
      let editionName: string | null = null;
      let themeName: string | null = null;
      if (config.editionId) {
        const [ed] = await db.select({ name: editionsTable.name }).from(editionsTable).where(eq(editionsTable.id, config.editionId));
        editionName = ed?.name ?? null;
      }
      const styleThemeId = (config.style as Record<string, unknown>)?.themeId as string | undefined;
      if (styleThemeId) {
        const [th] = await db.select({ name: themesTable.name }).from(themesTable).where(eq(themesTable.id, styleThemeId));
        themeName = th?.name ?? null;
      }
      const fileName = plannerFileName({ setup: body.setup, editionName, themeName });

      // Optional getting-started guide page
      let finalPdfFileId = pdfFileId;
      // (Guide page generation is done post-upload for now; the fileName is returned for client use)

      const [updated] = await db
        .update(plannerConfigsTable)
        .set({
          drive: {
            pdfFileId: finalPdfFileId,
            configFileId,
            ...(inkFriendlyPdfFileId ? { inkFriendlyPdfFileId } : {}),
          },
          generatedAt: new Date(),
        })
        .where(eq(plannerConfigsTable.id, config.id as string))
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "store.planner.create",
        targetType: "planner",
        targetId: config.id as string,
        metadata: { storeId, datingMode, pageCount, fileName },
      });

      res.status(201).json({
        id: updated.id,
        drive: { pdfFileId: finalPdfFileId, configFileId, inkFriendlyPdfFileId },
        pageCount,
        fileName,
      });
    } catch (err) {
      req.log.error({ err }, "Store planner creation failed");
      res.status((err as Error).name === "UnknownEinkDeviceError" ? 400 : 500).json({ error: String(err) });
    }
  },
);

// ── GET /stores/:storeId/planners ────────────────────────────────────────────

router.get(
  "/stores/:storeId/planners",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const rows = await db
      .select()
      .from(plannerConfigsTable)
      .where(eq(plannerConfigsTable.storeId, storeId))
      .orderBy(desc(plannerConfigsTable.createdAt));

    res.json(rows);
  },
);

router.get(
  "/stores/:storeId/planners/:id/composition",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [config] = await db
      .select({ style: plannerConfigsTable.style })
      .from(plannerConfigsTable)
      .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)));
    if (!config) {
      res.status(404).json({ error: "Planner not found" });
      return;
    }
    const style = config.style as PlannerStyle;
    res.json(style.composition ?? { version: 1, placements: [] });
  },
);

router.put(
  "/stores/:storeId/planners/:id/composition",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [config] = await db
      .select()
      .from(plannerConfigsTable)
      .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)));
    if (!config) {
      res.status(404).json({ error: "Planner not found" });
      return;
    }

    try {
      const composition = validatePlannerComposition(
        (req.body as { composition?: PlannerComposition }).composition,
      );
      validateCompositionTargets(
        composition,
        config.setup as PlannerSetup,
        config.style as PlannerStyle,
      );
      if (composition.placements.length > 0 && config.editionId) {
        const [edition] = await db
          .select({ interiorVersionId: editionsTable.interiorVersionId })
          .from(editionsTable)
          .where(eq(editionsTable.id, config.editionId));
        if (edition?.interiorVersionId) {
          res.status(409).json({
            error: "This planner template does not yet support widget composition",
            code: "COMPOSITION_UNSUPPORTED",
          });
          return;
        }
      }
      const widgetIds = [...new Set(composition.placements.map((placement) => placement.widgetId))];
      if (widgetIds.length > 0) {
        const widgets = await db
          .select({
            id: widgetsTable.id,
            status: widgetsTable.status,
            origin: widgetsTable.origin,
            authoredByStoreId: widgetsTable.authoredByStoreId,
          })
          .from(widgetsTable)
          .where(inArray(widgetsTable.id, widgetIds));
        const accessible = new Set(
          widgets
            .filter((widget) =>
              widget.authoredByStoreId === storeId ||
              (widget.authoredByStoreId === null && widget.status === "live" && widget.origin !== "owned"),
            )
            .map((widget) => widget.id),
        );
        const unavailable = widgetIds.find((widgetId) => !accessible.has(widgetId));
        if (unavailable) {
          res.status(400).json({
            error: "A selected widget is unavailable to this store",
            code: "WIDGET_UNAVAILABLE",
          });
          return;
        }
      }

      const style = { ...(config.style as PlannerStyle), composition };
      await db
        .update(plannerConfigsTable)
        .set({ style })
        .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)));
      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "store.planner.composition.update",
        targetType: "planner",
        targetId: id,
        metadata: { storeId, placementCount: composition.placements.length },
      });
      res.json(composition);
    } catch (error) {
      if (error instanceof InvalidPlannerCompositionError) {
        res.status(400).json({ error: error.message, code: error.code });
        return;
      }
      throw error;
    }
  },
);

// ── GET /stores/:storeId/planners/:id ────────────────────────────────────────

router.get(
  "/stores/:storeId/planners/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [config] = await db
      .select()
      .from(plannerConfigsTable)
      .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)));

    if (!config) {
      res.status(404).json({ error: "Planner not found" });
      return;
    }
    res.json(config);
  },
);

// ── PATCH /stores/:storeId/planners/:id ──────────────────────────────────────
// Only re-exportable style/output fields. Setup fields are locked once generatedAt is set.

router.patch(
  "/stores/:storeId/planners/:id",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [existing] = await db
      .select()
      .from(plannerConfigsTable)
      .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)));

    if (!existing) {
      res.status(404).json({ error: "Planner not found" });
      return;
    }

    const body = req.body as {
      setup?: Partial<PlannerSetup & { datingMode?: string }>;
      style?: Partial<PlannerStyle>;
      output?: Partial<PlannerOutput>;
      /** Nullable — pass null to unlink the edition. */
      editionId?: string | null;
    };
    if (body.style && "composition" in body.style) {
      res.status(400).json({ error: "Use the planner composition endpoint to update widget placements" });
      return;
    }

    // If generatedAt is set, reject any mutation to locked setup fields
    if (existing.generatedAt && body.setup) {
      const incoming = body.setup as Record<string, unknown>;
      const locked = LOCKED_SETUP_FIELDS.filter((f) => f in incoming);
      if (locked.length > 0) {
        res.status(409).json({
          error: `Setup fields are locked after generation: ${locked.join(", ")}. Use reexport to update style and output.`,
          code: "SETUP_LOCKED",
          lockedFields: locked,
        });
        return;
      }
    }

    // Merge style / output (setup mutations only allowed pre-generation)
    const updatedStyle = { ...(existing.style as PlannerStyle), ...(body.style ?? {}) };
    const updatedOutput = { ...(existing.output as PlannerOutput), ...(body.output ?? {}) };

    // Enforce calMode=none for non-dated planners
    const existingSetup = existing.setup as PlannerSetup & { datingMode?: string };
    const mergedSetup = { ...existingSetup, ...(body.setup ?? {}) };
    const datingMode = mergedSetup.datingMode ?? "dated";
    if (datingMode !== "dated") {
      updatedOutput.calMode = "none";
    }

    const updatePayload: Partial<typeof plannerConfigsTable.$inferInsert> = {
      style: updatedStyle,
      output: updatedOutput,
    };
    if (body.setup && !existing.generatedAt) {
      updatePayload.setup = mergedSetup;
    }
    // editionId is always patchable (not locked by generatedAt)
    if ("editionId" in body) {
      updatePayload.editionId = body.editionId ?? null;
    }

    const [updated] = await db
      .update(plannerConfigsTable)
      .set(updatePayload)
      .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: "store.planner.update",
      targetType: "planner",
      targetId: id,
      metadata: { storeId, fields: Object.keys(body) },
    });

    res.json(updated);
  },
);

// ── POST /stores/:storeId/planners/:id/reexport ──────────────────────────────

router.post(
  "/stores/:storeId/planners/:id/reexport",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!assertSameStore(actor, storeId, res)) return;

    const [existing] = await db
      .select()
      .from(plannerConfigsTable)
      .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)));

    if (!existing) {
      res.status(404).json({ error: "Planner not found" });
      return;
    }

    const body = req.body as { style?: PlannerStyle; output?: PlannerOutput };
    if (body.style && "composition" in body.style) {
      res.status(400).json({ error: "Use the planner composition endpoint to update widget placements" });
      return;
    }
    const updatedStyle = { ...(existing.style as PlannerStyle), ...(body.style ?? {}) };
    const updatedOutput = { ...(existing.output as PlannerOutput), ...(body.output ?? {}) };

    // Enforce calMode=none for non-dated planners
    const setup = existing.setup as PlannerSetup & { datingMode?: string };
    if ((setup.datingMode ?? "dated") !== "dated") {
      updatedOutput.calMode = "none";
    }

    try {
      const [patched] = await db
        .update(plannerConfigsTable)
        .set({ style: updatedStyle, output: updatedOutput })
        .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)))
        .returning();

      // Reload hotspot maps for re-export
      const reexportHotspotRows = await db.select().from(plannerHotspotsTable).where(eq(plannerHotspotsTable.storeId, storeId));
      const reexportHotspots = new Map<string, UserHotspot[]>();
      for (const h of reexportHotspotRows) {
        const arr = reexportHotspots.get(h.templateKey) ?? [];
        arr.push({ x: h.x, y: h.y, w: h.w, h: h.h, targetType: h.targetType, targetRef: h.targetRef, label: h.label });
        reexportHotspots.set(h.templateKey, arr);
      }
      const { pdfFileId, configFileId, inkFriendlyPdfFileId, pageCount } = await runGeneration(patched, reexportHotspots.size ? reexportHotspots : undefined);

      // Bundle filename
      let editionName: string | null = null;
      let themeName: string | null = null;
      if (patched.editionId) {
        const [ed] = await db.select({ name: editionsTable.name }).from(editionsTable).where(eq(editionsTable.id, patched.editionId));
        editionName = ed?.name ?? null;
      }
      const styleThemeId = (patched.style as Record<string, unknown>)?.themeId as string | undefined;
      if (styleThemeId) {
        const [th] = await db.select({ name: themesTable.name }).from(themesTable).where(eq(themesTable.id, styleThemeId));
        themeName = th?.name ?? null;
      }
      const fileName = plannerFileName({ setup: setup as Parameters<typeof plannerFileName>[0]["setup"], editionName, themeName });

      const [final] = await db
        .update(plannerConfigsTable)
        .set({
          drive: {
            pdfFileId,
            configFileId,
            ...(inkFriendlyPdfFileId ? { inkFriendlyPdfFileId } : {}),
          },
          generatedAt: new Date(),
        })
        .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)))
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "store.planner.reexport",
        targetType: "planner",
        targetId: id,
        metadata: { storeId, pageCount, fileName },
      });

      res.json({ id: final.id, drive: { pdfFileId, configFileId, inkFriendlyPdfFileId }, pageCount, fileName });
    } catch (err) {
      req.log.error({ err }, "Store planner reexport failed");
      res.status((err as Error).name === "UnknownEinkDeviceError" ? 400 : 500).json({ error: String(err) });
    }
  },
);

export default router;
