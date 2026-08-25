/**
 * Daybook Ink — annotation layer API (v2 / tool-depth)
 *
 * GET  /planners/:id/pages              → ordered page IDs
 * GET  /planners/:id/pdf-proxy          → stream PDF from Drive for pdf.js
 * GET  /planners/:id/pages/:pageId/layer → layer or empty
 * PUT  /planners/:id/pages/:pageId/layer → upsert layer
 * GET  /planners/:id/layers             → all annotated pageIds + updatedAt
 * POST /planners/:id/export             → flatten annotations → upload PDF → return fileId
 *
 * Export supports v2 strokes (variant, shape) and v1 strokes (no new fields).
 * Every rendering decision mirrors InkEditor.tsx / inkHelpers.ts so exports match screen.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  plannerConfigsTable,
  annotationLayersTable,
  storeMembersTable,
  storeFlagsTable,
  storesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { PDFDocument, rgb } from "pdf-lib";
import { requireAuth } from "../lib/auth-middleware";
import { generatePageIds, flattenPageIds } from "../lib/pdf-generator";
import { getOrCreateDaybookFolder, uploadFileToDrive } from "../lib/drive-upload";
import { getValidGoogleToken, GoogleAuthError } from "../lib/google-auth";
import type { User, PlannerSetup, PlannerStyle, PlannerOutput, PlannerDrive } from "@workspace/db";

const router: IRouter = Router();

// ── Types (mirrors inkHelpers.ts — kept local so the server has no frontend dep) ──

type LineVariant = "solid" | "dashed" | "dotted";
type ShapeKind   = "line" | "rect" | "ellipse" | "arrow";

interface InkPoint { x: number; y: number; p: number; }
interface ShapeData { kind: ShapeKind; x1: number; y1: number; x2: number; y2: number; }

interface InkStroke {
  id: string;
  tool: string;          // "pen"|"fineliner"|"fountain"|"marker"|"highlighter"|"eraser" + shape kinds
  color: string;
  baseWidth: number;
  points: InkPoint[];
  variant?: LineVariant; // undefined / "solid" = solid
  shape?: ShapeData;     // defined for shape tools
}

interface InkObject {
  id: string; kind: "sticker"; ref: string;
  x: number; y: number; scale: number; z: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

function clampP(p: number): number { return Math.max(0.15, Math.min(0.85, p)); }

/**
 * Pressure-averaged export width — mirrors inkHelpers.ts avgExportWidth().
 * Different multipliers per pen type match the canvas renderer.
 */
function exportWidth(stroke: InkStroke): number {
  if (stroke.tool === "marker")      return stroke.baseWidth * 2.4;
  if (stroke.tool === "fineliner")   return stroke.baseWidth;
  if (stroke.tool === "highlighter") return stroke.baseWidth * 2.5;
  const pts = stroke.points;
  if (!pts.length) return stroke.baseWidth;
  const avg = pts.reduce((s, p) => s + clampP(p.p), 0) / pts.length;
  let w: number;
  if (stroke.tool === "fountain") {
    w = Math.min(stroke.baseWidth * (0.3 + avg * 2.8), stroke.baseWidth * 3.0);
  } else {
    w = Math.min(stroke.baseWidth * (0.5 + avg * 1.5), stroke.baseWidth * 2.0);
  }
  return w;
}

/** PDF borderDashArray — matches DASH_PDF in inkHelpers.ts. */
function dashArray(variant?: LineVariant): number[] | undefined {
  if (variant === "dashed") return [10, 7];
  if (variant === "dotted") return [2,  6];
  return undefined;
}

/**
 * Build an SVG path string for a shape in the page's SVG coordinate space.
 * The SVG origin is placed at the top-left corner of the page via { x: 0, y: ph }
 * in drawSvgPath, so Y increases downward — matching normalised (0..1) coords × ph.
 */
function shapeToSvgPath(shape: ShapeData, pw: number, ph: number, bw: number): string {
  const x1 = shape.x1 * pw, y1 = shape.y1 * ph;
  const x2 = shape.x2 * pw, y2 = shape.y2 * ph;

  switch (shape.kind) {
    case "line":
      return `M ${x1} ${y1} L ${x2} ${y2}`;

    case "rect": {
      const rx1 = Math.min(x1, x2), ry1 = Math.min(y1, y2);
      const rx2 = Math.max(x1, x2), ry2 = Math.max(y1, y2);
      return `M ${rx1} ${ry1} H ${rx2} V ${ry2} H ${rx1} Z`;
    }

    case "ellipse": {
      // Bezier-circle approximation (kappa = 0.5523)
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      if (rx < 0.5 || ry < 0.5) return "";
      const k = 0.5523;
      return (
        `M ${cx - rx} ${cy} ` +
        `C ${cx - rx} ${cy - k * ry} ${cx - k * rx} ${cy - ry} ${cx} ${cy - ry} ` +
        `C ${cx + k * rx} ${cy - ry} ${cx + rx} ${cy - k * ry} ${cx + rx} ${cy} ` +
        `C ${cx + rx} ${cy + k * ry} ${cx + k * rx} ${cy + ry} ${cx} ${cy + ry} ` +
        `C ${cx - k * rx} ${cy + ry} ${cx - rx} ${cy + k * ry} ${cx - rx} ${cy} Z`
      );
    }

    case "arrow": {
      // In SVG coord space Y is downward, so angle calc is the same as on canvas.
      const dxSvg = x2 - x1, dySvg = y2 - y1;
      const angle = Math.atan2(dySvg, dxSvg);
      const aLen  = Math.max(10, bw * 4);
      const ah1x  = x2 - aLen * Math.cos(angle - Math.PI / 6);
      const ah1y  = y2 - aLen * Math.sin(angle - Math.PI / 6);
      const ah2x  = x2 - aLen * Math.cos(angle + Math.PI / 6);
      const ah2y  = y2 - aLen * Math.sin(angle + Math.PI / 6);
      return `M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${ah1x} ${ah1y} M ${x2} ${y2} L ${ah2x} ${ah2y}`;
    }
  }
}

// ── Ink feature-flag gate ─────────────────────────────────────────────────────

/**
 * Returns true if the user may use Ink.
 *
 * Rules:
 *   · super_admin always has access (testing / dogfooding)
 *   · Any other user must be a member of at least one store that has
 *     inkEnabled = true in store_flags
 *
 * Annotation data is NEVER deleted or altered by this check — toggling the
 * flag only gates the editor and API; existing layers are preserved intact.
 */
async function isInkEnabledForUser(
  userId: string,
  isSuperAdmin: boolean,
): Promise<boolean> {
  if (isSuperAdmin) return true;
  const rows = await db
    .select({ inkEnabled: storeFlagsTable.inkEnabled })
    .from(storeMembersTable)
    .innerJoin(
      storeFlagsTable,
      eq(storeFlagsTable.storeId, storeMembersTable.storeId),
    )
    .where(
      and(
        eq(storeMembersTable.userId, userId),
        eq(storeFlagsTable.inkEnabled, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function requirePlanner(userId: string, plannerId: string) {
  const [config] = await db
    .select().from(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, plannerId), eq(plannerConfigsTable.userId, userId)));
  return config ?? null;
}

// ── GET /ink/enabled ─────────────────────────────────────────────────────────
// Used by the frontend InkGate component to decide whether to render or redirect.
// Accepts optional ?storeSlug=<slug> to check a specific store's flag directly
// (used by the shop-facing /s/:storeSlug/ink/:id route for buyers).

router.get("/ink/enabled", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User & { platformRole?: string };
  const userId = user.id as string;
  const isSuperAdmin = user.platformRole === "super_admin";

  const storeSlug = typeof req.query.storeSlug === "string" ? req.query.storeSlug : null;

  if (storeSlug) {
    // Shop-route context: check the specific store's flag by slug
    const [storeRow] = await db
      .select({ id: storesTable.id })
      .from(storesTable)
      .where(eq(storesTable.slug, storeSlug))
      .limit(1);

    if (!storeRow) { res.json({ enabled: false }); return; }

    const [flags] = await db
      .select({ inkEnabled: storeFlagsTable.inkEnabled })
      .from(storeFlagsTable)
      .where(eq(storeFlagsTable.storeId, storeRow.id));

    res.json({ enabled: isSuperAdmin || (flags?.inkEnabled ?? false) });
    return;
  }

  const enabled = await isInkEnabledForUser(userId, isSuperAdmin);
  res.json({ enabled });
});

// ── GET /planners/:id/pages ───────────────────────────────────────────────────

router.get("/planners/:id/pages", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User & { platformRole?: string };
  if (!(await isInkEnabledForUser(user.id as string, user.platformRole === "super_admin"))) {
    res.status(403).json({ error: "Ink is not enabled. Contact your store admin to enable it in Feature Flags." }); return;
  }
  const config = await requirePlanner(user.id as string, String(req.params.id));
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }
  const sections = (config.style as PlannerStyle).sections ?? [];
  const pageIds = flattenPageIds(generatePageIds({
    setup: config.setup as PlannerSetup, style: config.style as PlannerStyle,
    output: config.output as PlannerOutput, sections,
  }));
  res.json({ pageIds });
});

// ── GET /planners/:id/pdf-proxy ───────────────────────────────────────────────

router.get("/planners/:id/pdf-proxy", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User & { platformRole?: string };
  if (!(await isInkEnabledForUser(user.id as string, user.platformRole === "super_admin"))) {
    res.status(403).json({ error: "Ink is not enabled. Contact your store admin to enable it in Feature Flags." }); return;
  }
  const config = await requirePlanner(user.id as string, String(req.params.id));
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }
  const drive = config.drive as PlannerDrive;
  const fileId = drive?.pdfFileId;
  if (!fileId || fileId.startsWith("pdf-")) {
    res.status(404).json({ error: "PDF not in Drive — generate the planner first" }); return;
  }
  let token: string;
  try { token = await getValidGoogleToken(user.id as string); }
  catch (err) {
    if (err instanceof GoogleAuthError) res.status(401).json({ error: "Google not connected" });
    else res.status(500).json({ error: String(err) });
    return;
  }
  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!driveRes.ok) { res.status(502).json({ error: `Drive fetch failed: ${driveRes.status}` }); return; }
  const buf = Buffer.from(await driveRes.arrayBuffer());
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

// ── GET /planners/:id/pages/:pageId/layer ────────────────────────────────────

router.get("/planners/:id/pages/:pageId/layer", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User & { platformRole?: string };
  if (!(await isInkEnabledForUser(user.id as string, user.platformRole === "super_admin"))) {
    res.status(403).json({ error: "Ink is not enabled. Contact your store admin to enable it in Feature Flags." }); return;
  }
  const plannerId = String(req.params.id), pageId = String(req.params.pageId);
  const config = await requirePlanner(user.id as string, plannerId);
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }
  const [layer] = await db.select().from(annotationLayersTable)
    .where(and(
      eq(annotationLayersTable.plannerId, plannerId),
      eq(annotationLayersTable.pageId, pageId),
      eq(annotationLayersTable.userId, user.id as string),
    ));
  if (!layer) { res.json({ strokes: [], objects: [], updatedAt: null }); return; }
  res.json(layer);
});

// ── PUT /planners/:id/pages/:pageId/layer ────────────────────────────────────

router.put("/planners/:id/pages/:pageId/layer", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User & { platformRole?: string };
  if (!(await isInkEnabledForUser(user.id as string, user.platformRole === "super_admin"))) {
    res.status(403).json({ error: "Ink is not enabled. Contact your store admin to enable it in Feature Flags." }); return;
  }
  const plannerId = String(req.params.id), pageId = String(req.params.pageId);
  const body = req.body as { strokes?: unknown[]; objects?: unknown[] };
  const config = await requirePlanner(user.id as string, plannerId);
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }
  const now = new Date();
  await db.insert(annotationLayersTable)
    .values({
      plannerId, pageId, userId: user.id as string,
      strokes: (body.strokes ?? []) as InkStroke[],
      objects: (body.objects ?? []) as InkObject[],
      updatedAt: now, schemaVersion: 1,
    })
    .onConflictDoUpdate({
      target: [annotationLayersTable.plannerId, annotationLayersTable.pageId, annotationLayersTable.userId],
      set: { strokes: (body.strokes ?? []) as InkStroke[], objects: (body.objects ?? []) as InkObject[], updatedAt: now },
    });
  res.json({ updatedAt: now });
});

// ── GET /planners/:id/layers ──────────────────────────────────────────────────

router.get("/planners/:id/layers", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User & { platformRole?: string };
  if (!(await isInkEnabledForUser(user.id as string, user.platformRole === "super_admin"))) {
    res.status(403).json({ error: "Ink is not enabled. Contact your store admin to enable it in Feature Flags." }); return;
  }
  const plannerId = String(req.params.id);
  const config = await requirePlanner(user.id as string, plannerId);
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }
  const layers = await db.select({ pageId: annotationLayersTable.pageId, updatedAt: annotationLayersTable.updatedAt })
    .from(annotationLayersTable)
    .where(and(eq(annotationLayersTable.plannerId, plannerId), eq(annotationLayersTable.userId, user.id as string)));
  res.json(layers);
});

// ── POST /planners/:id/export ─────────────────────────────────────────────────

router.post("/planners/:id/export", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User & { platformRole?: string };
  if (!(await isInkEnabledForUser(user.id as string, user.platformRole === "super_admin"))) {
    res.status(403).json({ error: "Ink is not enabled. Contact your store admin to enable it in Feature Flags." }); return;
  }
  const plannerId = String(req.params.id);
  const config = await requirePlanner(user.id as string, plannerId);
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }

  const drive = config.drive as PlannerDrive;
  if (!drive?.pdfFileId || drive.pdfFileId.startsWith("pdf-")) {
    res.status(400).json({ error: "No PDF in Drive — generate first" }); return;
  }

  let token: string;
  try { token = await getValidGoogleToken(user.id as string); }
  catch (err) {
    if (err instanceof GoogleAuthError) res.status(401).json({ error: "Google not connected" });
    else res.status(500).json({ error: String(err) });
    return;
  }

  // 1. Fetch original PDF
  const pdfRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${drive.pdfFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!pdfRes.ok) { res.status(502).json({ error: "Drive fetch failed" }); return; }
  const pdfDoc = await PDFDocument.load(await pdfRes.arrayBuffer());

  // 2. Build ordered page ID list
  const sections = (config.style as PlannerStyle).sections ?? [];
  const pageIds  = flattenPageIds(generatePageIds({
    setup: config.setup as PlannerSetup, style: config.style as PlannerStyle,
    output: config.output as PlannerOutput, sections,
  }));

  // 3. Load all annotation layers
  const layers = await db.select().from(annotationLayersTable)
    .where(and(eq(annotationLayersTable.plannerId, plannerId), eq(annotationLayersTable.userId, user.id as string)));

  // 4. Flatten each layer onto its PDF page
  const stickerPngs: Record<string, string> = (req.body as any)?.stickerPngs ?? {};
  const embeddedImages = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();

  for (const layer of layers) {
    const pageIdx = pageIds.indexOf(layer.pageId);
    if (pageIdx < 0 || pageIdx >= pdfDoc.getPageCount()) continue;

    const page = pdfDoc.getPage(pageIdx);
    const { width: pw, height: ph } = page.getSize();

    for (const stroke of (layer.strokes as InkStroke[])) {
      if (!stroke.points && !stroke.shape) continue;

      const { r, g, b } = hexToRgb01(stroke.color);
      const isHL = stroke.tool === "highlighter";
      const bw   = exportWidth(stroke);
      const da   = dashArray(stroke.variant);
      const opacity = isHL ? 0.35 : 1;

      // ── Shape strokes (v2) ────────────────────────────────────────────────
      if (stroke.shape) {
        const d = shapeToSvgPath(stroke.shape, pw, ph, bw);
        if (!d) continue;
        page.drawSvgPath(d, {
          x: 0, y: ph,
          color: undefined,
          borderColor: rgb(r, g, b),
          borderWidth: bw,
          borderDashArray: da,
          opacity,
        });
        continue;
      }

      // ── Freehand strokes ──────────────────────────────────────────────────
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      // Single-point tap / near-coincident → filled circle dot
      const isCoincident =
        pts.length === 1 ||
        pts.every((pt) => Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) < 0.003);

      if (isCoincident) {
        if (!isHL) {
          const dotR = Math.max(stroke.baseWidth * 0.5, 1);
          page.drawEllipse({
            x: pts[0].x * pw, y: (1 - pts[0].y) * ph,  // pdf-lib uses bottom-left origin here
            xScale: dotR, yScale: dotR,
            color: rgb(r, g, b), opacity: 1,
          });
        }
        continue;
      }

      // Build Catmull-Rom SVG path (same as v1 — mirrors canvas renderer)
      let d = `M ${pts[0].x * pw} ${pts[0].y * ph}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const cp1x = (p1.x + (p2.x - p0.x) / 6) * pw;
        const cp1y = (p1.y + (p2.y - p0.y) / 6) * ph;
        const cp2x = (p2.x - (p3.x - p1.x) / 6) * pw;
        const cp2y = (p2.y - (p3.y - p1.y) / 6) * ph;
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x * pw} ${p2.y * ph}`;
      }

      page.drawSvgPath(d, {
        x: 0, y: ph,
        color: undefined,
        borderColor: rgb(r, g, b),
        borderWidth: bw,
        borderDashArray: da,
        opacity,
      });
    }

    // ── Sticker objects ───────────────────────────────────────────────────────
    for (const obj of (layer.objects as InkObject[])) {
      if (obj.kind !== "sticker") continue;
      const dataUrl: string | undefined = stickerPngs[obj.ref];
      if (!dataUrl) continue;
      if (!embeddedImages.has(obj.ref)) {
        try {
          const b64   = dataUrl.replace(/^data:image\/png;base64,/, "");
          const bytes = Buffer.from(b64, "base64");
          embeddedImages.set(obj.ref, await pdfDoc.embedPng(bytes));
        } catch { continue; }
      }
      const img       = embeddedImages.get(obj.ref)!;
      const sizeInPts = 40 * (obj.scale ?? 1);
      page.drawImage(img, {
        x: obj.x * pw - sizeInPts / 2,
        y: (1 - obj.y) * ph - sizeInPts / 2,
        width: sizeInPts, height: sizeInPts,
      });
    }
  }

  // 5. Upload flattened PDF to Drive
  const flatBytes = await pdfDoc.save();
  const folderId  = await getOrCreateDaybookFolder(user.id, token);
  const fileName  = `daybook-ink-${plannerId}-${Date.now()}.pdf`;
  const fileId    = await uploadFileToDrive(token, folderId, fileName, "application/pdf", Buffer.from(flatBytes));

  res.json({ fileId, url: `https://drive.google.com/file/d/${fileId}/view` });
});

export default router;
