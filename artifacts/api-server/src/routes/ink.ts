/**
 * Daybook Ink — annotation layer API
 *
 * GET  /planners/:id/pages              → ordered page ID list (for nav)
 * GET  /planners/:id/pdf-proxy          → stream PDF from Drive (for pdf.js)
 * GET  /planners/:id/pages/:pageId/layer → layer or empty
 * PUT  /planners/:id/pages/:pageId/layer → upsert; returns updatedAt
 * GET  /planners/:id/layers             → all annotated pageIds + updatedAt
 * POST /planners/:id/export             → flatten strokes, upload new PDF, return fileId
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { plannerConfigsTable, annotationLayersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { PDFDocument, rgb } from "pdf-lib";
import { requireAuth } from "../lib/auth-middleware";
import {
  generatePageIds,
  flattenPageIds,
} from "../lib/pdf-generator";
import {
  getOrCreateDaybookFolder,
  uploadFileToDrive,
} from "../lib/drive-upload";
import { getValidGoogleToken, GoogleAuthError } from "../lib/google-auth";
import type {
  User,
  PlannerSetup,
  PlannerStyle,
  PlannerOutput,
  PlannerDrive,
} from "@workspace/db";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

interface InkPoint { x: number; y: number; p: number; }
interface InkStroke {
  id: string;
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  baseWidth: number;
  points: InkPoint[];
}
interface InkObject {
  id: string;
  kind: "sticker";
  ref: string;
  x: number;
  y: number;
  scale: number;
  z: number;
}

async function requirePlanner(
  userId: string,
  plannerId: string,
): Promise<typeof plannerConfigsTable.$inferSelect | null> {
  const [config] = await db
    .select()
    .from(plannerConfigsTable)
    .where(
      and(
        eq(plannerConfigsTable.id, plannerId),
        eq(plannerConfigsTable.userId, userId),
      ),
    );
  return config ?? null;
}

// ── GET /planners/:id/pages ───────────────────────────────────────────────────

router.get("/planners/:id/pages", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const config = await requirePlanner(user.id as string, String(req.params.id));
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }

  const sections = (config.style as PlannerStyle).sections ?? [];
  const pageIds = flattenPageIds(
    generatePageIds({
      setup: config.setup as PlannerSetup,
      style: config.style as PlannerStyle,
      output: config.output as PlannerOutput,
      sections,
    }),
  );

  res.json({ pageIds });
});

// ── GET /planners/:id/pdf-proxy ───────────────────────────────────────────────

router.get("/planners/:id/pdf-proxy", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const config = await requirePlanner(user.id as string, String(req.params.id));
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }

  const drive = config.drive as PlannerDrive;
  const fileId = drive?.pdfFileId;
  if (!fileId || fileId.startsWith("pdf-")) {
    res.status(404).json({ error: "PDF not in Drive — generate the planner first" });
    return;
  }

  let token: string;
  try {
    token = await getValidGoogleToken(user.id as string);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      res.status(401).json({ error: "Google not connected" });
    } else {
      res.status(500).json({ error: String(err) });
    }
    return;
  }

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!driveRes.ok) {
    res.status(502).json({ error: `Drive fetch failed: ${driveRes.status}` });
    return;
  }

  const buf = Buffer.from(await driveRes.arrayBuffer());
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

// ── GET /planners/:id/pages/:pageId/layer ─────────────────────────────────────

router.get(
  "/planners/:id/pages/:pageId/layer",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.user as User;
    const plannerId = String(req.params.id);
    const pageId = String(req.params.pageId);

    const config = await requirePlanner(user.id as string, plannerId);
    if (!config) { res.status(404).json({ error: "Planner not found" }); return; }

    const [layer] = await db
      .select()
      .from(annotationLayersTable)
      .where(
        and(
          eq(annotationLayersTable.plannerId, plannerId),
          eq(annotationLayersTable.pageId, pageId),
          eq(annotationLayersTable.userId, user.id as string),
        ),
      );

    if (!layer) {
      res.json({ strokes: [], objects: [], updatedAt: null });
      return;
    }
    res.json(layer);
  },
);

// ── PUT /planners/:id/pages/:pageId/layer ─────────────────────────────────────

router.put(
  "/planners/:id/pages/:pageId/layer",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.user as User;
    const plannerId = String(req.params.id);
    const pageId = String(req.params.pageId);
    const body = req.body as { strokes?: unknown[]; objects?: unknown[] };

    const config = await requirePlanner(user.id as string, plannerId);
    if (!config) { res.status(404).json({ error: "Planner not found" }); return; }

    const now = new Date();
    await db
      .insert(annotationLayersTable)
      .values({
        plannerId,
        pageId,
        userId: user.id as string,
        strokes: (body.strokes ?? []) as InkStroke[],
        objects: (body.objects ?? []) as InkObject[],
        updatedAt: now,
        schemaVersion: 1,
      })
      .onConflictDoUpdate({
        target: [
          annotationLayersTable.plannerId,
          annotationLayersTable.pageId,
          annotationLayersTable.userId,
        ],
        set: {
          strokes: (body.strokes ?? []) as InkStroke[],
          objects: (body.objects ?? []) as InkObject[],
          updatedAt: now,
        },
      });

    res.json({ updatedAt: now });
  },
);

// ── GET /planners/:id/layers ──────────────────────────────────────────────────

router.get("/planners/:id/layers", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const plannerId = String(req.params.id);

  const config = await requirePlanner(user.id as string, plannerId);
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }

  const layers = await db
    .select({
      pageId: annotationLayersTable.pageId,
      updatedAt: annotationLayersTable.updatedAt,
    })
    .from(annotationLayersTable)
    .where(
      and(
        eq(annotationLayersTable.plannerId, plannerId),
        eq(annotationLayersTable.userId, user.id as string),
      ),
    );

  res.json(layers);
});

// ── POST /planners/:id/export ─────────────────────────────────────────────────

router.post("/planners/:id/export", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const plannerId = String(req.params.id);

  const config = await requirePlanner(user.id as string, plannerId);
  if (!config) { res.status(404).json({ error: "Planner not found" }); return; }

  const drive = config.drive as PlannerDrive;
  if (!drive?.pdfFileId || drive.pdfFileId.startsWith("pdf-")) {
    res.status(400).json({ error: "No PDF in Drive — generate first" });
    return;
  }

  let token: string;
  try {
    token = await getValidGoogleToken(user.id as string);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      res.status(401).json({ error: "Google not connected" });
    } else {
      res.status(500).json({ error: String(err) });
    }
    return;
  }

  // 1. Fetch original PDF from Drive
  const pdfRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${drive.pdfFileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!pdfRes.ok) {
    res.status(502).json({ error: "Drive fetch failed" });
    return;
  }
  const pdfArrayBuffer = await pdfRes.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfArrayBuffer);

  // 2. Build ordered page ID list
  const sections = (config.style as PlannerStyle).sections ?? [];
  const pageIds = flattenPageIds(
    generatePageIds({
      setup: config.setup as PlannerSetup,
      style: config.style as PlannerStyle,
      output: config.output as PlannerOutput,
      sections,
    }),
  );

  // 3. Load all annotation layers
  const layers = await db
    .select()
    .from(annotationLayersTable)
    .where(
      and(
        eq(annotationLayersTable.plannerId, plannerId),
        eq(annotationLayersTable.userId, user.id as string),
      ),
    );

  // 4. Flatten each layer onto the matching PDF page
  for (const layer of layers) {
    const pageIdx = pageIds.indexOf(layer.pageId);
    if (pageIdx < 0 || pageIdx >= pdfDoc.getPageCount()) continue;

    const page = pdfDoc.getPage(pageIdx);
    const { width: pw, height: ph } = page.getSize();

    // Clamp pressure to the same range used by the canvas renderer.
    const clampP = (p: number) => Math.max(0.15, Math.min(0.85, p));

    // Draw strokes using Catmull-Rom → cubic bezier SVG path.
    // Mirrors the canvas drawStroke() logic so exported PDF matches on-screen ink.
    for (const stroke of (layer.strokes as InkStroke[])) {
      if (!stroke.points || stroke.points.length === 0) continue;
      const pts = stroke.points;
      const { r, g, b } = hexToRgb01(stroke.color);
      const isHighlighter = stroke.tool === "highlighter";

      // Detect single-point taps or near-coincident points (all within 0.003 normalised ≈ 2px).
      // A degenerate zero-length bezier stroked with round caps becomes a blob; draw a dot instead.
      const isCoincident =
        pts.length === 1 ||
        pts.every((pt) =>
          Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) < 0.003,
        );

      if (isCoincident) {
        if (!isHighlighter) {
          // Small filled circle at the tap point — matches canvas dot rendering
          const dotR = Math.max(stroke.baseWidth * 0.5, 1);
          const sx = pts[0].x * pw;
          const sy = (1 - pts[0].y) * ph; // PDF y-up
          page.drawEllipse({
            x: sx,
            y: sy,
            xScale: dotR,
            yScale: dotR,
            color: rgb(r, g, b),
            opacity: 1,
          });
        }
        continue;
      }

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

      // Pressure-averaged borderWidth, same cap as canvas (2× baseWidth)
      const avgPressure =
        pts.reduce((sum, pt) => sum + clampP(pt.p), 0) / pts.length;
      const rawBw = stroke.baseWidth * (0.5 + avgPressure * 1.5);
      const bw = isHighlighter
        ? stroke.baseWidth * 2.5
        : Math.min(rawBw, stroke.baseWidth * 2.0);

      page.drawSvgPath(d, {
        x: 0,
        y: ph,           // SVG origin at page top-left
        color: undefined, // explicit: no fill — stroke only
        borderColor: rgb(r, g, b),
        borderWidth: bw,
        opacity: isHighlighter ? 0.35 : 1,
      });
    }

    // Draw sticker objects as colored marker circles
    for (const obj of (layer.objects as InkObject[])) {
      if (obj.kind !== "sticker") continue;
      const sx = obj.x * pw;
      const sy = (1 - obj.y) * ph; // flip y for PDF coords
      const size = 18 * (obj.scale ?? 1);
      // Use a filled circle as placeholder (sticker images need image embedding)
      page.drawEllipse({
        x: sx,
        y: sy,
        xScale: size,
        yScale: size,
        color: rgb(0.78, 0.46, 0.38), // clay
        opacity: 0.75,
      });
    }
  }

  // 5. Upload flattened PDF to Drive (non-destructive — vector layer stays intact)
  const flatBytes = await pdfDoc.save();
  const folderId = await getOrCreateDaybookFolder(token);
  const fileName = `daybook-ink-${plannerId}-${Date.now()}.pdf`;
  const fileId = await uploadFileToDrive(
    token,
    folderId,
    fileName,
    "application/pdf",
    Buffer.from(flatBytes),
  );

  res.json({
    fileId,
    url: `https://drive.google.com/file/d/${fileId}/view`,
  });
});

export default router;
