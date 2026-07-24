/**
 * Daybook Ink — native annotation layer
 *
 * Full-screen canvas editor: pdf.js background + ink canvas overlay.
 * Tools: pen (pressure + Catmull-Rom), highlighter (multiply), eraser (stroke-level delete).
 * Sticker drop: pick emoji glyph → click canvas to place → drag to move.
 * Autosave: 1.5 s debounce after any change. Reload restores strokes.
 * Export: POST /planners/:id/export → flattened PDF uploaded to Drive.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Cloud, Circle, Eraser, Highlighter, Pen,
  Download, ChevronLeft, ChevronRight, Layers, StickerIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tool = "pen" | "highlighter" | "eraser";

interface InkPoint { x: number; y: number; p: number; }

interface InkStroke {
  id: string;
  tool: Tool;
  color: string;
  baseWidth: number;
  points: InkPoint[];
}

interface InkObject {
  id: string;
  kind: "sticker";
  ref: string;   // emoji glyph
  x: number;     // normalized 0..1
  y: number;     // normalized 0..1
  scale: number;
  z: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  "#1B2A4A", // Ink Navy
  "#C87560", // Clay
  "#4A6080", // Slate
  "#000000",
  "#D32F2F", // Red
  "#1565C0", // Blue
  "#2E7D32", // Green
  "#F9A825", // Amber
];

const STICKER_GLYPHS = ["✦", "★", "♥", "✓", "✗", "→", "!", "?", "📅", "📌", "🎯", "💡", "✏️", "🌟", "🔴", "🟡", "🟢", "🔵"];

// ── Canvas helpers ─────────────────────────────────────────────────────────────

// Clamp raw pointer pressure into a stable range.
// pointerdown on many devices fires pressure=1.0 even for a light tap;
// clamping to 0.15–0.85 prevents first-point spikes from blowing up the width.
function clampPressure(raw: number): number {
  return Math.max(0.15, Math.min(0.85, raw));
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  cw: number,
  ch: number,
) {
  if (stroke.points.length === 0) return;

  // Map to canvas pixels with clamped pressure
  const pts = stroke.points.map((p) => ({
    x: p.x * cw,
    y: p.y * ch,
    p: clampPressure(p.p),
  }));

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.tool === "highlighter") {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = "#FFC107";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke.color;
  }

  // Detect single-point taps or near-coincident points (all within 2 canvas px).
  // These must be rendered as a small round dot — NOT as a stroked bezier, which
  // collapses to a degenerate zero-length curve whose round end-caps produce a blob.
  const isCoincident =
    pts.length === 1 ||
    pts.every((pt) => Math.hypot(pt.x - pts[0].x, pt.y - pts[0].y) < 2.0);

  if (isCoincident) {
    if (stroke.tool !== "highlighter") {
      // Small dot: radius = half the base stroke width, minimum 1px
      const r = Math.max(stroke.baseWidth * 0.5, 1);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Catmull-Rom: draw per-segment with pressure-varying width.
  // Width is capped at 2× baseWidth so a pressure spike can't balloon.
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const avgP = (p1.p + p2.p) / 2;
    let lw = stroke.baseWidth * (0.5 + avgP * 1.5);
    lw = Math.min(lw, stroke.baseWidth * 2.0); // pressure spike cap
    if (stroke.tool === "highlighter") lw = stroke.baseWidth * 3.5;
    ctx.lineWidth = lw;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    ctx.stroke(); // STROKE only — never fill the bezier path
  }

  ctx.restore();
}

function redrawInkCanvas(
  canvas: HTMLCanvasElement,
  strokes: InkStroke[],
  activeStroke: InkStroke | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of strokes) drawStroke(ctx, s, canvas.width, canvas.height);
  if (activeStroke) drawStroke(ctx, activeStroke, canvas.width, canvas.height);
}

function strokeBBox(s: InkStroke) {
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function eraserHits(eraserPts: InkPoint[], stroke: InkStroke): boolean {
  const bb = strokeBBox(stroke);
  const pad = 0.015;
  return eraserPts.some(
    (ep) =>
      ep.x >= bb.minX - pad &&
      ep.x <= bb.maxX + pad &&
      ep.y >= bb.minY - pad &&
      ep.y <= bb.maxY + pad,
  );
}

// ── apiFetch ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InkEditor() {
  const { id: plannerId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Navigate back to the planner builder (full path since InkEditor is outside the daybook base router)
  // Navigate back to the standalone Planner Library.
  // InkEditor is rendered outside the daybook WouterRouter, so use the full path.
  const goBack = () => navigate("/daybook/ink");

  // Tool state
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [palmRejection, setPalmRejection] = useState(true);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [placingSticker, setPlacingSticker] = useState<string | null>(null);

  // Page state
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [plannerName, setPlannerName] = useState("Planner");

  // Layer state — wrapped setter keeps objectsRef in sync for stale-closure-safe callbacks
  const [objects, _setObjects] = useState<InkObject[]>([]);
  const objectsRef = useRef<InkObject[]>([]);
  const setObjects = useCallback(
    (val: InkObject[] | ((prev: InkObject[]) => InkObject[])) => {
      const next = typeof val === "function" ? val(objectsRef.current) : val;
      objectsRef.current = next;
      _setObjects(next);
    },
    [],
  );

  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const selectedObjIdRef = useRef<string | null>(null);
  const setSelectedObjIdSync = (id: string | null) => {
    selectedObjIdRef.current = id;
    setSelectedObjId(id);
  };

  // Ink strokes live in a ref (updated on every pointer event, no re-renders)
  const strokesRef = useRef<InkStroke[]>([]);
  const activeStrokeRef = useRef<InkStroke | null>(null);
  const isDrawingRef = useRef(false);

  // ── Undo / redo history (per page, cleared on page change) ───────────────
  type LayerSnapshot = { strokes: InkStroke[]; objects: InkObject[] };
  const undoStackRef = useRef<LayerSnapshot[]>([]);
  const redoStackRef = useRef<LayerSnapshot[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // Pre-drag snapshot used to push a single history entry for a sticker move
  const preDragObjectsRef = useRef<InkObject[] | null>(null);

  // Autosave
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving">("saved");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Canvas refs
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasDimsRef = useRef({ w: 0, h: 0 });

  // pdf.js doc
  const pdfDocRef = useRef<any>(null);
  const [pdfStatus, setPdfStatus] = useState<"loading" | "ready" | "error" | "no-drive">("loading");

  // Dragging sticker
  const stickerDragRef = useRef<{
    id: string; startPx: number; startPy: number; objX: number; objY: number;
  } | null>(null);

  // ── Load planner metadata ─────────────────────────────────────────────────

  useEffect(() => {
    if (!plannerId) return;
    apiFetch<{ id: string; setup: any }>(`/planners/${plannerId}`)
      .then((cfg) => {
        const year = cfg.setup?.startYear ?? "";
        setPlannerName(`Planner ${year}`);
      })
      .catch(() => {});
    apiFetch<{ pageIds: string[] }>(`/planners/${plannerId}/pages`)
      .then((r) => setPageIds(r.pageIds))
      .catch(() => {});
  }, [plannerId]);

  // ── Load PDF with pdf.js ──────────────────────────────────────────────────

  useEffect(() => {
    if (!plannerId) return;
    let cancelled = false;
    setPdfStatus("loading");

    // Load pdf.js from CDN — keeps it out of Vite's dep-optimizer graph.
    const PDFJS_BASE = "https://unpkg.com/pdfjs-dist@6.1.200/build";

    (async () => {
      try {
        // @vite-ignore: intentional external CDN import, not bundled by Vite
        const pdfjsLib = await import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`);
        if (cancelled) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;

        const pdfDoc = await pdfjsLib.getDocument({
          url: `/api/planners/${plannerId}/pdf-proxy`,
          withCredentials: true,
        }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdfDoc;
        setPdfStatus("ready");
      } catch (err: any) {
        if (cancelled) return;
        if (String(err?.message ?? "").includes("404") || String(err).includes("404")) {
          setPdfStatus("no-drive");
        } else {
          setPdfStatus("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [plannerId]);

  // ── Render PDF page to background canvas ─────────────────────────────────

  const renderPdfPage = useCallback(async (pageIdx: number) => {
    const pdfDoc = pdfDocRef.current;
    const bgCanvas = bgCanvasRef.current;
    const stage = stageRef.current;
    if (!pdfDoc || !bgCanvas || !stage) return;

    const pageNum = pageIdx + 1;
    if (pageNum < 1 || pageNum > pdfDoc.numPages) return;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    // Fit to stage, maintaining aspect ratio
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const scaleX = stageW / viewport.width;
    const scaleY = stageH / viewport.height;
    const scale = Math.min(scaleX, scaleY) * (window.devicePixelRatio || 1);

    const scaledW = Math.round(viewport.width * scale);
    const scaledH = Math.round(viewport.height * scale);

    bgCanvas.width = scaledW;
    bgCanvas.height = scaledH;
    bgCanvas.style.width = `${scaledW / (window.devicePixelRatio || 1)}px`;
    bgCanvas.style.height = `${scaledH / (window.devicePixelRatio || 1)}px`;

    // Match ink canvas exactly
    const inkCanvas = inkCanvasRef.current;
    if (inkCanvas) {
      inkCanvas.width = scaledW;
      inkCanvas.height = scaledH;
      inkCanvas.style.width = bgCanvas.style.width;
      inkCanvas.style.height = bgCanvas.style.height;
    }

    canvasDimsRef.current = { w: scaledW, h: scaledH };

    const ctx = bgCanvas.getContext("2d");
    if (!ctx) return;

    const renderViewport = page.getViewport({ scale });
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
  }, []);

  useEffect(() => {
    if (pdfStatus === "ready") renderPdfPage(currentIdx);
  }, [pdfStatus, currentIdx, renderPdfPage]);

  // ── Load layer for current page ───────────────────────────────────────────

  const loadLayer = useCallback(async (pageId: string) => {
    if (!plannerId) return;
    // Clear history whenever we load a new page
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
    try {
      const layer = await apiFetch<{ strokes: InkStroke[]; objects: InkObject[] }>(
        `/planners/${plannerId}/pages/${pageId}/layer`,
      );
      strokesRef.current = layer.strokes ?? [];
      setObjects(layer.objects ?? []);
      setSaveState("saved");
      const inkCanvas = inkCanvasRef.current;
      if (inkCanvas) redrawInkCanvas(inkCanvas, strokesRef.current, null);
    } catch {
      strokesRef.current = [];
      setObjects([]);
    }
  }, [plannerId, setObjects]);

  useEffect(() => {
    const pageId = pageIds[currentIdx];
    if (pageId) loadLayer(pageId);
  }, [pageIds, currentIdx, loadLayer]);

  // ── Autosave ──────────────────────────────────────────────────────────────

  const triggerSave = useCallback(
    (strokes: InkStroke[], objs: InkObject[]) => {
      const pageId = pageIds[currentIdx];
      if (!plannerId || !pageId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSaveState("unsaved");
      debounceRef.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          await apiFetch(`/planners/${plannerId}/pages/${pageId}/layer`, {
            method: "PUT",
            body: JSON.stringify({ strokes, objects: objs }),
          });
          setSaveState("saved");
        } catch {
          setSaveState("unsaved");
        }
      }, 1500);
    },
    [plannerId, pageIds, currentIdx],
  );

  // ── Undo / redo helpers ───────────────────────────────────────────────────

  // Push current state onto undo stack and clear redo — call BEFORE mutating
  const pushHistory = useCallback(
    (strokes: InkStroke[], objs: InkObject[]) => {
      undoStackRef.current = [...undoStackRef.current, { strokes: [...strokes], objects: [...objs] }];
      redoStackRef.current = [];
      setUndoCount(undoStackRef.current.length);
      setRedoCount(0);
    },
    [],
  );

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    // Push current state to redo before restoring
    redoStackRef.current = [
      ...redoStackRef.current,
      { strokes: [...strokesRef.current], objects: [...objectsRef.current] },
    ];
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    strokesRef.current = prev.strokes;
    setObjects(prev.objects);
    const canvas = inkCanvasRef.current;
    if (canvas) redrawInkCanvas(canvas, strokesRef.current, null);
    triggerSave(strokesRef.current, prev.objects);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, [triggerSave, setObjects]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    // Push current state to undo before re-applying
    undoStackRef.current = [
      ...undoStackRef.current,
      { strokes: [...strokesRef.current], objects: [...objectsRef.current] },
    ];
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    strokesRef.current = next.strokes;
    setObjects(next.objects);
    const canvas = inkCanvasRef.current;
    if (canvas) redrawInkCanvas(canvas, strokesRef.current, null);
    triggerSave(strokesRef.current, next.objects);
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, [triggerSave, setObjects]);

  const deleteSelectedSticker = useCallback(() => {
    const id = selectedObjIdRef.current;
    if (!id) return;
    pushHistory(strokesRef.current, objectsRef.current);
    const next = objectsRef.current.filter((o) => o.id !== id);
    setObjects(next);
    setSelectedObjIdSync(null);
    const canvas = inkCanvasRef.current;
    if (canvas) redrawInkCanvas(canvas, strokesRef.current, null);
    triggerSave(strokesRef.current, next);
  }, [pushHistory, triggerSave, setObjects]);

  // ── Pointer drawing handlers ──────────────────────────────────────────────

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (palmRejection && e.pointerType === "touch") return;

      e.currentTarget.setPointerCapture(e.pointerId);
      const canvas = inkCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Sticker placement
      if (placingSticker) {
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const newObj: InkObject = {
          id: crypto.randomUUID(),
          kind: "sticker",
          ref: placingSticker,
          x: nx,
          y: ny,
          scale: 1,
          z: 0,
        };
        pushHistory(strokesRef.current, objectsRef.current);
        const next = [...objectsRef.current, newObj];
        setObjects(next);
        triggerSave(strokesRef.current, next);
        setPlacingSticker(null);
        return;
      }

      const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const pressure = e.pressure > 0 ? e.pressure : 0.5;

      const strokeId = crypto.randomUUID();
      const newStroke: InkStroke = {
        id: strokeId,
        tool,
        color,
        baseWidth: strokeWidth,
        points: [{ x: px / canvas.width, y: py / canvas.height, p: pressure }],
      };

      activeStrokeRef.current = newStroke;
      isDrawingRef.current = true;
    },
    [tool, color, strokeWidth, palmRejection, placingSticker, triggerSave, pushHistory],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !activeStrokeRef.current) return;
      if (palmRejection && e.pointerType === "touch") return;

      const canvas = inkCanvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];

      for (const ev of events) {
        const px = ((ev.clientX - rect.left) / rect.width) * canvas.width;
        const py = ((ev.clientY - rect.top) / rect.height) * canvas.height;
        const pressure = (ev as PointerEvent).pressure > 0 ? (ev as PointerEvent).pressure : 0.5;
        activeStrokeRef.current.points.push({
          x: px / canvas.width,
          y: py / canvas.height,
          p: pressure,
        });
      }

      redrawInkCanvas(canvas, strokesRef.current, activeStrokeRef.current);
    },
    [palmRejection],
  );

  const onPointerUp = useCallback(() => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    isDrawingRef.current = false;

    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;

    // Snapshot before mutating so undo can restore to pre-stroke state
    pushHistory(strokesRef.current, objectsRef.current);

    if (finished.tool === "eraser") {
      // Vector eraser: remove strokes that intersect the eraser path
      const remaining = strokesRef.current.filter(
        (s) => !eraserHits(finished.points, s),
      );
      strokesRef.current = remaining;
    } else {
      strokesRef.current = [...strokesRef.current, finished];
    }

    const canvas = inkCanvasRef.current;
    if (canvas) redrawInkCanvas(canvas, strokesRef.current, null);

    triggerSave(strokesRef.current, objectsRef.current);
  }, [triggerSave, pushHistory]);

  // ── Keyboard: undo / redo / sticker delete ────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Only fires when a sticker is selected and focus isn't in a text field
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (selectedObjIdRef.current && tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          deleteSelectedSticker();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo, deleteSelectedSticker]);

  // ── Sticker drag ──────────────────────────────────────────────────────────

  const onStickerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, objId: string, objX: number, objY: number) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setSelectedObjIdSync(objId);
      // Capture pre-drag state so we push one history entry on drop
      preDragObjectsRef.current = [...objectsRef.current];
      stickerDragRef.current = {
        id: objId,
        startPx: e.clientX,
        startPy: e.clientY,
        objX,
        objY,
      };
    },
    [],
  );

  const onStickerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = stickerDragRef.current;
      if (!drag) return;
      const canvas = inkCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - drag.startPx) / rect.width;
      const dy = (e.clientY - drag.startPy) / rect.height;
      setObjects((prev) =>
        prev.map((o) =>
          o.id === drag.id
            ? { ...o, x: Math.max(0, Math.min(1, drag.objX + dx)), y: Math.max(0, Math.min(1, drag.objY + dy)) }
            : o,
        ),
      );
    },
    [],
  );

  const onStickerPointerUp = useCallback(() => {
    if (stickerDragRef.current) {
      stickerDragRef.current = null;
      // Push pre-drag snapshot so undo restores sticker to where it started
      if (preDragObjectsRef.current !== null) {
        pushHistory(strokesRef.current, preDragObjectsRef.current);
        preDragObjectsRef.current = null;
      }
      triggerSave(strokesRef.current, objectsRef.current);
    }
  }, [triggerSave, pushHistory]);

  // ── Page navigation ───────────────────────────────────────────────────────

  const goToPage = (idx: number) => {
    if (idx < 0 || idx >= pageIds.length) return;
    setCurrentIdx(idx);
    setSelectedObjId(null);
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await apiFetch<{ fileId: string; url: string }>(
        `/planners/${plannerId}/export`,
        { method: "POST" },
      );
      toast({
        title: "Exported to Drive",
        description: "Flattened PDF uploaded. Vector layer stays editable.",
      });
      window.open(result.url, "_blank");
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ── Canvas size on PDF ready ──────────────────────────────────────────────

  const currentPageId = pageIds[currentIdx];
  const canvasStyle = { position: "absolute" as const, top: 0, left: 0 };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "#F7F0E6",
        fontFamily: "'Instrument Sans', sans-serif",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          height: 56,
          background: "#1B2A4A",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          flexShrink: 0,
          color: "#fff",
        }}
      >
        <button
          onClick={goBack}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Back
        </button>

        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.15)" }} />

        <span style={{ fontFamily: "'Spectral', serif", fontWeight: 600, fontSize: 15, flex: 1 }}>
          {plannerName} — Ink
        </span>

        {/* Page nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => goToPage(currentIdx - 1)}
            disabled={currentIdx === 0}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "rgba(255,255,255,0.8)",
              cursor: currentIdx === 0 ? "not-allowed" : "pointer",
              padding: "4px 6px",
              borderRadius: 6,
              opacity: currentIdx === 0 ? 0.3 : 1,
            }}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </button>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", minWidth: 90, textAlign: "center" }}>
            {currentPageId ?? "—"} ({currentIdx + 1}/{pageIds.length || "?"})
          </span>
          <button
            onClick={() => goToPage(currentIdx + 1)}
            disabled={currentIdx >= pageIds.length - 1}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "rgba(255,255,255,0.8)",
              cursor: currentIdx >= pageIds.length - 1 ? "not-allowed" : "pointer",
              padding: "4px 6px",
              borderRadius: 6,
              opacity: currentIdx >= pageIds.length - 1 ? 0.3 : 1,
            }}
          >
            <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Undo / redo */}
        <div style={{ display: "flex", gap: 2 }}>
          {(["undo", "redo"] as const).map((action) => {
            const disabled = action === "undo" ? undoCount === 0 : redoCount === 0;
            return (
              <button
                key={action}
                onClick={action === "undo" ? handleUndo : handleRedo}
                disabled={disabled}
                title={action === "undo" ? "Undo (⌘Z)" : "Redo (⌘⇧Z)"}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: disabled ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.75)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {action === "undo" ? "↩" : "↪"}
              </button>
            );
          })}
        </div>

        {/* Save indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: saveState === "saved" ? "#6ee7b7" : saveState === "saving" ? "#fcd34d" : "#fca5a5",
          }}
        >
          <Cloud style={{ width: 13, height: 13 }} />
          {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Unsaved"}
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            background: "#C87560",
            border: "none",
            color: "#fff",
            cursor: exporting ? "wait" : "pointer",
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: exporting ? 0.7 : 1,
          }}
        >
          <Download style={{ width: 13, height: 13 }} />
          {exporting ? "Exporting…" : "Export to Drive"}
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ── Left Tool Rail (70px) ── */}
        <div
          style={{
            width: 70,
            background: "#FFFDF9",
            borderRight: "1px solid #E7DCCB",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "12px 0",
            gap: 4,
            flexShrink: 0,
            overflowY: "auto",
          }}
        >
          {/* Tools */}
          {(["pen", "highlighter", "eraser"] as Tool[]).map((t) => {
            const Icon = t === "pen" ? Pen : t === "highlighter" ? Highlighter : Eraser;
            const active = tool === t;
            return (
              <button
                key={t}
                onClick={() => { setTool(t); setPlacingSticker(null); }}
                title={t.charAt(0).toUpperCase() + t.slice(1)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  border: "none",
                  background: active ? "#1B2A4A" : "transparent",
                  color: active ? "#fff" : "#4A6080",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s",
                }}
              >
                <Icon style={{ width: 18, height: 18 }} />
              </button>
            );
          })}

          <div style={{ height: 1, width: 44, background: "#E7DCCB", margin: "6px 0" }} />

          {/* Color swatches */}
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: c,
                border: color === c ? "2px solid #C87560" : "2px solid #E7DCCB",
                cursor: "pointer",
                marginBottom: 2,
                flexShrink: 0,
              }}
            />
          ))}

          <div style={{ height: 1, width: 44, background: "#E7DCCB", margin: "6px 0" }} />

          {/* Width slider (vertical) */}
          <div
            style={{ height: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
          >
            <span style={{ fontSize: 9, color: "#9CA3AF" }}>Width</span>
            <input
              type="range"
              min={1}
              max={20}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              style={{
                writingMode: "vertical-lr" as any,
                direction: "rtl" as any,
                height: 60,
                cursor: "pointer",
                accentColor: "#C87560",
              }}
            />
            <span style={{ fontSize: 9, color: "#9CA3AF" }}>{strokeWidth}</span>
          </div>

          <div style={{ height: 1, width: 44, background: "#E7DCCB", margin: "6px 0" }} />

          {/* Palm rejection toggle */}
          <button
            onClick={() => setPalmRejection((v) => !v)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              border: "none",
              background: palmRejection ? "#E7DCCB" : "transparent",
              color: palmRejection ? "#1B2A4A" : "#9CA3AF",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Palm rejection"
          >
            ✋
          </button>

          {/* Sticker toggle */}
          <button
            onClick={() => { setShowStickerPanel((v) => !v); setPlacingSticker(null); }}
            title="Stickers"
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              border: "none",
              background: showStickerPanel ? "#1B2A4A" : "transparent",
              color: showStickerPanel ? "#fff" : "#4A6080",
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✦
          </button>
        </div>

        {/* ── Sticker Panel ── */}
        {showStickerPanel && (
          <div
            style={{
              width: 140,
              background: "#FFFDF9",
              borderRight: "1px solid #E7DCCB",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "#4A6080", margin: 0 }}>Stickers</p>
            <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>
              Click a sticker, then click the canvas to place it.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STICKER_GLYPHS.map((g) => (
                <button
                  key={g}
                  onClick={() => setPlacingSticker(g)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: placingSticker === g ? "2px solid #C87560" : "1px solid #E7DCCB",
                    background: placingSticker === g ? "#FEF0ED" : "transparent",
                    fontSize: 20,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
            {placingSticker && (
              <p style={{ fontSize: 11, color: "#C87560", fontWeight: 500 }}>
                Click the canvas to place {placingSticker}
              </p>
            )}
          </div>
        )}

        {/* ── Canvas Stage ── */}
        <div
          ref={stageRef}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#E5DDD3",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {pdfStatus === "loading" && (
            <div style={{ color: "#4A6080", fontSize: 14 }}>Loading PDF…</div>
          )}
          {pdfStatus === "no-drive" && (
            <div
              style={{
                color: "#4A6080",
                fontSize: 14,
                textAlign: "center",
                padding: 24,
                background: "#FFFDF9",
                borderRadius: 12,
                border: "1px solid #E7DCCB",
              }}
            >
              <p style={{ fontFamily: "'Spectral', serif", fontSize: 18, marginBottom: 8 }}>
                No PDF in Drive
              </p>
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>
                Generate this planner first. Once the PDF is in your Daybook Drive folder, come back to annotate.
              </p>
            </div>
          )}
          {pdfStatus === "error" && (
            <div style={{ color: "#D32F2F", fontSize: 14 }}>
              Couldn't load PDF. Check your Google connection.
            </div>
          )}

          {/* Canvases */}
          <div style={{ position: "relative", display: "inline-block", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
            <canvas ref={bgCanvasRef} style={{ display: "block" }} />
            <canvas
              ref={inkCanvasRef}
              style={{
                ...canvasStyle,
                cursor: placingSticker
                  ? "crosshair"
                  : tool === "eraser"
                  ? "cell"
                  : "crosshair",
                touchAction: "none",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />

            {/* Sticker overlays */}
            {objects.map((obj) => {
              if (obj.kind !== "sticker") return null;
              const canvas = inkCanvasRef.current;
              if (!canvas) return null;
              const cw = canvas.clientWidth || canvas.width;
              const ch = canvas.clientHeight || canvas.height;
              const px = obj.x * cw;
              const py = obj.y * ch;
              const sz = 32 * obj.scale;
              const isSelected = selectedObjId === obj.id;
              return (
                <div
                  key={obj.id}
                  onPointerDown={(e) => onStickerPointerDown(e, obj.id, obj.x, obj.y)}
                  onPointerMove={onStickerPointerMove}
                  onPointerUp={onStickerPointerUp}
                  style={{
                    position: "absolute",
                    left: px - sz / 2,
                    top: py - sz / 2,
                    width: sz,
                    height: sz,
                    fontSize: sz * 0.8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "grab",
                    userSelect: "none",
                    outline: isSelected ? "2px solid #C87560" : "none",
                    borderRadius: 6,
                    touchAction: "none",
                  }}
                >
                  {obj.ref}
                  {/* Floating × delete button — only on selected sticker */}
                  {isSelected && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); deleteSelectedSticker(); }}
                      title="Delete sticker"
                      style={{
                        position: "absolute",
                        top: -10,
                        right: -10,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#C87560",
                        border: "none",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: "18px",
                        textAlign: "center",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        zIndex: 10,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
