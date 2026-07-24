/**
 * Daybook Ink — pure drawing + geometry helpers (v2 / tool-depth)
 *
 * Shared between InkEditor.tsx (canvas) and ink.ts (PDF flatten).
 * All new fields (variant, shape) are optional — v1 saved layers render correctly.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PenVariant  = "pen" | "fineliner" | "fountain" | "marker";
export type ShapeKind   = "line" | "rect" | "ellipse" | "arrow";
export type Tool        = PenVariant | "highlighter" | "eraser" | ShapeKind | "lasso";
export type LineVariant = "solid" | "dashed" | "dotted";
export type EraserMode  = "stroke" | "area";

export interface InkPoint { x: number; y: number; p: number; }

export interface ShapeData {
  kind: ShapeKind;
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface InkStroke {
  id: string;
  tool: string;
  color: string;
  baseWidth: number;
  points: InkPoint[];
  variant?: LineVariant;
  shape?: ShapeData;
}

export interface InkObject {
  id: string;
  kind: "sticker";
  ref: string;
  x: number; y: number;
  scale: number;
  z: number;
}

// ── Dash patterns ─────────────────────────────────────────────────────────────

export const DASH_CANVAS: Record<LineVariant, number[]> = {
  solid:  [],
  dashed: [10, 7],
  dotted: [2,  6],
};

export const DASH_PDF: Record<LineVariant, number[] | undefined> = {
  solid:  undefined,
  dashed: [10, 7],
  dotted: [2,  6],
};

// ── Pressure helpers ──────────────────────────────────────────────────────────

export function clampPressure(raw: number): number {
  return Math.max(0.15, Math.min(0.85, raw));
}

export function segmentWidth(tool: string, baseWidth: number, pressure: number): number {
  const p = clampPressure(pressure);
  switch (tool) {
    case "fineliner":   return baseWidth;
    case "fountain":    return Math.min(baseWidth * (0.3 + p * 2.8), baseWidth * 3.0);
    case "marker":      return baseWidth * 2.4;
    case "highlighter": return baseWidth * 3.5;
    default:            return Math.min(baseWidth * (0.5 + p * 1.5), baseWidth * 2.0);
  }
}

export function avgExportWidth(stroke: InkStroke): number {
  if (stroke.tool === "marker")      return stroke.baseWidth * 2.4;
  if (stroke.tool === "fineliner")   return stroke.baseWidth;
  if (stroke.tool === "highlighter") return stroke.baseWidth * 2.5;
  const pts = stroke.points;
  if (pts.length === 0) return stroke.baseWidth;
  const avg = pts.reduce((s, p) => s + clampPressure(p.p), 0) / pts.length;
  return Math.min(
    segmentWidth(stroke.tool, stroke.baseWidth, avg),
    stroke.baseWidth * (stroke.tool === "fountain" ? 3.0 : 2.0),
  );
}

// ── Bounding box ──────────────────────────────────────────────────────────────

export function strokeBBox(s: InkStroke) {
  if (s.shape) {
    return {
      minX: Math.min(s.shape.x1, s.shape.x2), maxX: Math.max(s.shape.x1, s.shape.x2),
      minY: Math.min(s.shape.y1, s.shape.y2), maxY: Math.max(s.shape.y1, s.shape.y2),
    };
  }
  if (s.points.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// ── Eraser ────────────────────────────────────────────────────────────────────

export function eraserHitsBBox(eraserPts: InkPoint[], stroke: InkStroke, pad = 0.015): boolean {
  const bb = strokeBBox(stroke);
  return eraserPts.some(
    (ep) => ep.x >= bb.minX - pad && ep.x <= bb.maxX + pad &&
            ep.y >= bb.minY - pad && ep.y <= bb.maxY + pad,
  );
}

export function areaErase(
  strokes: InkStroke[], eraserPts: InkPoint[], eraserRadiusNorm: number,
): InkStroke[] {
  const result: InkStroke[] = [];
  for (const stroke of strokes) {
    if (stroke.shape || stroke.tool === "highlighter") {
      if (!eraserHitsBBox(eraserPts, stroke, eraserRadiusNorm)) result.push(stroke);
      continue;
    }
    const pts = stroke.points;
    if (pts.length === 0) { result.push(stroke); continue; }
    const erased = new Set<number>();
    for (let i = 0; i < pts.length; i++)
      for (const ep of eraserPts)
        if (Math.hypot(pts[i].x - ep.x, pts[i].y - ep.y) < eraserRadiusNorm) { erased.add(i); break; }
    if (erased.size === 0) { result.push(stroke); continue; }
    let seg: InkPoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      if (erased.has(i)) {
        if (seg.length >= 2) result.push({ ...stroke, id: crypto.randomUUID(), points: seg });
        seg = [];
      } else { seg.push(pts[i]); }
    }
    if (seg.length >= 2) result.push({ ...stroke, id: crypto.randomUUID(), points: seg });
  }
  return result;
}

// ── Lasso ─────────────────────────────────────────────────────────────────────

export function pointInPolygon(px: number, py: number, polygon: InkPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y, xj = polygon[j].x, yj = polygon[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function strokeCentroid(s: InkStroke) {
  const bb = strokeBBox(s);
  return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
}

export function selectInLasso(strokes: InkStroke[], lassoPath: InkPoint[]): Set<string> {
  const sel = new Set<string>();
  for (const s of strokes) {
    const c = strokeCentroid(s);
    if (pointInPolygon(c.x, c.y, lassoPath)) sel.add(s.id);
  }
  return sel;
}

export function applyMoveToStroke(s: InkStroke, dx: number, dy: number): InkStroke {
  return {
    ...s,
    points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    shape: s.shape
      ? { ...s.shape, x1: s.shape.x1 + dx, y1: s.shape.y1 + dy, x2: s.shape.x2 + dx, y2: s.shape.y2 + dy }
      : undefined,
  };
}

// ── Shape recognition ─────────────────────────────────────────────────────────

export function recognizeShape(pts: InkPoint[]): ShapeData | null {
  if (pts.length < 6) return null;
  const x1 = pts[0].x, y1 = pts[0].y, xN = pts[pts.length - 1].x, yN = pts[pts.length - 1].y;
  const dx = xN - x1, dy = yN - y1, len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.02) return null;

  // Line: all points within 0.025 of the start→end line
  const maxDev = pts.reduce((m, p) => {
    const t = ((p.x - x1) * dx + (p.y - y1) * dy) / (len * len);
    return Math.max(m, Math.sqrt((p.x - x1 - t * dx) ** 2 + (p.y - y1 - t * dy) ** 2));
  }, 0);
  if (maxDev < 0.025) return { kind: "line", x1, y1, x2: xN, y2: yN };

  // Must be roughly closed for rect/ellipse
  if (Math.sqrt((x1 - xN) ** 2 + (y1 - yN) ** 2) > len * 0.35) return null;

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const bx1 = Math.min(...xs), by1 = Math.min(...ys), bx2 = Math.max(...xs), by2 = Math.max(...ys);
  if (bx2 - bx1 < 0.01 || by2 - by1 < 0.01) return null;

  const bw = bx2 - bx1, bh = by2 - by1;
  const rectScore = pts.filter((p) => {
    const nx = (p.x - bx1) / bw, ny = (p.y - by1) / bh;
    return nx < 0.12 || nx > 0.88 || ny < 0.12 || ny > 0.88;
  }).length / pts.length;

  return rectScore > 0.60
    ? { kind: "rect", x1: bx1, y1: by1, x2: bx2, y2: by2 }
    : { kind: "ellipse", x1: bx1, y1: by1, x2: bx2, y2: by2 };
}

// ── Shift snap ────────────────────────────────────────────────────────────────

export function applyShapeSnap(
  x1: number, y1: number, x2: number, y2: number,
  kind: ShapeKind, cw: number, ch: number,
): { x2: number; y2: number } {
  if (kind === "line" || kind === "arrow") {
    const dxPx = (x2 - x1) * cw, dyPx = (y2 - y1) * ch;
    const angle = Math.round(Math.atan2(dyPx, dxPx) / (Math.PI / 4)) * (Math.PI / 4);
    const dist  = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
    return { x2: x1 + (dist * Math.cos(angle)) / cw, y2: y1 + (dist * Math.sin(angle)) / ch };
  }
  const dxPx = Math.abs(x2 - x1) * cw, dyPx = Math.abs(y2 - y1) * ch;
  const side  = Math.max(dxPx, dyPx);
  return { x2: x1 + Math.sign(x2 - x1) * side / cw, y2: y1 + Math.sign(y2 - y1) * side / ch };
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function applyDash(ctx: CanvasRenderingContext2D, variant?: LineVariant) {
  ctx.setLineDash(DASH_CANVAS[variant ?? "solid"]);
}

export function drawShapeStroke(
  ctx: CanvasRenderingContext2D, stroke: InkStroke,
  cw: number, ch: number, ox = 0, oy = 0,
): void {
  const s = stroke.shape!;
  const x1 = (s.x1 + ox) * cw, y1 = (s.y1 + oy) * ch;
  const x2 = (s.x2 + ox) * cw, y2 = (s.y2 + oy) * ch;
  ctx.save();
  ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.baseWidth;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  applyDash(ctx, stroke.variant);
  ctx.beginPath();
  switch (s.kind) {
    case "line":
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); break;
    case "rect": {
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
      ctx.rect(rx, ry, Math.abs(x2 - x1), Math.abs(y2 - y1)); break;
    }
    case "ellipse": {
      const ecx = (x1 + x2) / 2, ecy = (y1 + y2) / 2;
      const erx = Math.abs(x2 - x1) / 2, ery = Math.abs(y2 - y1) / 2;
      if (erx > 0 && ery > 0) ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2); break;
    }
    case "arrow": {
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      const ang = Math.atan2(y2 - y1, x2 - x1), al = Math.max(10, stroke.baseWidth * 4);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - al * Math.cos(ang - Math.PI / 6), y2 - al * Math.sin(ang - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - al * Math.cos(ang + Math.PI / 6), y2 - al * Math.sin(ang + Math.PI / 6));
      break;
    }
  }
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();
}

export function drawFreehandStroke(
  ctx: CanvasRenderingContext2D, stroke: InkStroke,
  cw: number, ch: number, ox = 0, oy = 0,
): void {
  if (stroke.points.length === 0) return;
  const pts = stroke.points.map((p) => ({ x: (p.x + ox) * cw, y: (p.y + oy) * ch, p: clampPressure(p.p) }));
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const isHL = stroke.tool === "highlighter";
  if (isHL) {
    ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.38; ctx.strokeStyle = stroke.color;
  } else {
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.strokeStyle = stroke.color;
    if (stroke.tool === "marker") ctx.lineCap = "butt";
  }
  applyDash(ctx, isHL ? undefined : stroke.variant);

  const isCoincident = pts.length === 1 || pts.every((pt) => Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) < 2.0);
  if (isCoincident) {
    if (!isHL) {
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, Math.max(stroke.baseWidth * 0.5, 1), 0, Math.PI * 2);
      ctx.fillStyle = stroke.color; ctx.fill();
    }
    ctx.setLineDash([]); ctx.restore(); return;
  }

  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    let lw = segmentWidth(stroke.tool, stroke.baseWidth, (p1.p + p2.p) / 2);
    if (stroke.tool === "fountain") {
      const t = i / Math.max(1, n - 2);
      lw *= 0.25 + 0.75 * Math.min(1, t / 0.08) * Math.min(1, (1 - t) / 0.08);
    }
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y);
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y,
    );
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.restore();
}

export function drawStroke(
  ctx: CanvasRenderingContext2D, stroke: InkStroke,
  cw: number, ch: number, ox = 0, oy = 0,
): void {
  if (stroke.shape) drawShapeStroke(ctx, stroke, cw, ch, ox, oy);
  else              drawFreehandStroke(ctx, stroke, cw, ch, ox, oy);
}

export function redrawInkCanvas(
  canvas: HTMLCanvasElement, strokes: InkStroke[], activeStroke: InkStroke | null,
  selection?: Set<string>, selOffsetX?: number, selOffsetY?: number, lassoPoints?: InkPoint[],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cw = canvas.width, ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  for (const s of strokes) {
    const inSel = selection?.has(s.id) ?? false;
    drawStroke(ctx, s, cw, ch, inSel ? (selOffsetX ?? 0) : 0, inSel ? (selOffsetY ?? 0) : 0);
  }
  if (activeStroke) drawStroke(ctx, activeStroke, cw, ch);

  if (lassoPoints && lassoPoints.length > 1) {
    ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = "#C87560";
    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(lassoPoints[0].x * cw, lassoPoints[0].y * ch);
    for (let i = 1; i < lassoPoints.length; i++) ctx.lineTo(lassoPoints[i].x * cw, lassoPoints[i].y * ch);
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }

  if (selection && selection.size > 0) {
    const sel = strokes.filter((s) => selection.has(s.id));
    if (sel.length > 0) {
      let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
      for (const s of sel) {
        const bb = strokeBBox(s), ox = selOffsetX ?? 0, oy = selOffsetY ?? 0;
        mnX = Math.min(mnX, (bb.minX + ox) * cw); mnY = Math.min(mnY, (bb.minY + oy) * ch);
        mxX = Math.max(mxX, (bb.maxX + ox) * cw); mxY = Math.max(mxY, (bb.maxY + oy) * ch);
      }
      const pad = 7;
      ctx.save(); ctx.setLineDash([5, 3]); ctx.strokeStyle = "#C87560";
      ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
      ctx.strokeRect(mnX - pad, mnY - pad, mxX - mnX + pad * 2, mxY - mnY + pad * 2);
      ctx.setLineDash([]); ctx.restore();
    }
  }
}
