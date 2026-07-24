/**
 * Daybook Ink — annotation editor (v2 / tool-depth)
 *
 * New in v2: pen variants (fineliner/fountain/marker), line styles (solid/dashed/dotted),
 * shape tools (line/rect/ellipse/arrow + Shift-snap), shape-snap assist, lasso select
 * (move/delete/recolor), custom color picker with recent colors, eraser modes
 * (stroke-delete + area-split), right inspector panel.
 *
 * Backward-compat: all v2 stroke fields (variant, shape) are optional.
 * Old saved layers load and render without migration.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, Cloud, Eraser, Highlighter, Pen, Download,
  ChevronLeft, ChevronRight, Minus, Square, Circle, ArrowRight, Lasso,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type Tool, type PenVariant, type ShapeKind, type LineVariant, type EraserMode,
  type InkStroke, type InkObject, type InkPoint, type ShapeData,
  clampPressure, areaErase, eraserHitsBBox, selectInLasso, applyMoveToStroke,
  recognizeShape, applyShapeSnap, drawStroke, redrawInkCanvas,
} from "./inkHelpers";

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAND_COLORS = [
  "#1B2A4A","#C87560","#4A6080","#000000",
  "#D32F2F","#1565C0","#2E7D32","#F9A825",
];

const STICKER_GLYPHS = [
  "✦","★","♥","✓","✗","→","!","?",
  "📅","📌","🎯","💡","✏️","🌟","🔴","🟡","🟢","🔵",
];

const PEN_VARIANTS: PenVariant[] = ["pen","fineliner","fountain","marker"];
const SHAPE_TOOLS: ShapeKind[]   = ["line","rect","ellipse","arrow"];

const DEFAULT_PEN_SETTINGS: Record<string, { width: number; color: string }> = {
  pen:         { width: 3,   color: "#1B2A4A" },
  fineliner:   { width: 1.5, color: "#000000" },
  fountain:    { width: 4,   color: "#1B2A4A" },
  marker:      { width: 9,   color: "#1565C0" },
  highlighter: { width: 14,  color: "#FFC107" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function rasterizeGlyph(glyph: string, size = 128): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.font = `${Math.round(size * 0.8)}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(glyph, size / 2, size / 2);
  return c.toDataURL("image/png");
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init, credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Right Inspector ───────────────────────────────────────────────────────────

function RightInspector({
  tool, lineVariant, setLineVariant, eraserMode, setEraserMode,
  eraserRadius, setEraserRadius, snapShapes, setSnapShapes,
  lassoSelection, onRecolorSelection, onDeleteSelection, currentColor,
}: {
  tool: Tool; lineVariant: LineVariant; setLineVariant: (v: LineVariant) => void;
  eraserMode: EraserMode; setEraserMode: (m: EraserMode) => void;
  eraserRadius: number; setEraserRadius: (r: number) => void;
  snapShapes: boolean; setSnapShapes: (v: boolean) => void;
  lassoSelection: Set<string>; onRecolorSelection: () => void;
  onDeleteSelection: () => void; currentColor: string;
}) {
  const isPen   = PEN_VARIANTS.includes(tool as PenVariant);
  const isShape = SHAPE_TOOLS.includes(tool as ShapeKind);
  const isHL    = tool === "highlighter";
  const isErase = tool === "eraser";
  const isLasso = tool === "lasso";
  const hasSel  = lassoSelection.size > 0;

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "4px 0", fontSize: 11, cursor: "pointer",
    border: "1px solid", borderColor: active ? "#1B2A4A" : "#D1C9BE",
    background: active ? "#1B2A4A" : "transparent",
    color: active ? "#fff" : "#4A6080", borderRadius: 5,
    fontWeight: active ? 600 : 400,
  });
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#9CA3AF",
    letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5,
  };
  const note: React.CSSProperties = { fontSize: 10, color: "#9CA3AF", lineHeight: 1.45, marginTop: 5 };

  return (
    <div style={{
      width: 162, background: "#FFFDF9", borderLeft: "1px solid #E7DCCB",
      padding: "14px 10px", display: "flex", flexDirection: "column", gap: 16,
      overflowY: "auto", flexShrink: 0,
    }}>
      {/* Line style — pen tools + shapes (not highlighter) */}
      {(isPen || isShape) && !isHL && (
        <div>
          <div style={lbl}>Line Style</div>
          <div style={{ display: "flex", gap: 2 }}>
            {(["solid","dashed","dotted"] as LineVariant[]).map((v) => (
              <button key={v} style={seg(lineVariant === v)} onClick={() => setLineVariant(v)}>
                {v === "solid" ? "—" : v === "dashed" ? "- -" : "···"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Shape snap — pen tools only */}
      {isPen && (
        <div>
          <div style={lbl}>Shape Snap</div>
          <button onClick={() => setSnapShapes(!snapShapes)} style={{
            width: "100%", padding: "5px 8px", borderRadius: 6, cursor: "pointer",
            border: `1px solid ${snapShapes ? "#C87560" : "#D1C9BE"}`,
            background: snapShapes ? "#FEF0ED" : "transparent",
            color: snapShapes ? "#C87560" : "#4A6080",
            fontSize: 11, fontWeight: snapShapes ? 600 : 400, textAlign: "left",
          }}>
            {snapShapes ? "✓ Snap ON" : "Snap OFF"}
          </button>
          {snapShapes && <div style={note}>Rough lines, rects &amp; ellipses → clean shapes. Undo once to keep raw.</div>}
        </div>
      )}

      {/* Shape tool hint */}
      {isShape && (
        <div>
          <div style={lbl}>Shape</div>
          <div style={note}>Drag to draw. Hold <strong>Shift</strong> to snap straight or keep aspect ratio.</div>
        </div>
      )}

      {/* Eraser mode */}
      {isErase && (
        <>
          <div>
            <div style={lbl}>Eraser Mode</div>
            <div style={{ display: "flex", gap: 2 }}>
              <button style={seg(eraserMode === "stroke")} onClick={() => setEraserMode("stroke")}>Stroke</button>
              <button style={seg(eraserMode === "area")}   onClick={() => setEraserMode("area")}>Area</button>
            </div>
            <div style={note}>
              {eraserMode === "stroke"
                ? "Touch a stroke to delete it whole."
                : "Brush over ink to erase segments. Splits freehand strokes at the erased region."}
            </div>
          </div>
          {eraserMode === "area" && (
            <div>
              <div style={lbl}>Radius</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="range" min={4} max={40} value={eraserRadius}
                  onChange={(e) => setEraserRadius(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#C87560" }}
                />
                <span style={{ fontSize: 11, minWidth: 22, textAlign: "right" }}>{eraserRadius}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Lasso actions */}
      {isLasso && (
        <div>
          <div style={lbl}>Lasso Select</div>
          {hasSel ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#4A6080" }}>
                {lassoSelection.size} stroke{lassoSelection.size > 1 ? "s" : ""} selected
              </div>
              <button onClick={onRecolorSelection} style={{
                width: "100%", padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                border: "1px solid #D1C9BE", background: currentColor, color: "#fff",
                fontSize: 11, fontWeight: 600,
              }}>
                Recolor to current
              </button>
              <button onClick={onDeleteSelection} style={{
                width: "100%", padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                border: "1px solid #D32F2F", background: "#FEF2F2",
                color: "#D32F2F", fontSize: 11, fontWeight: 600,
              }}>
                Delete
              </button>
              <div style={note}>Drag inside selection to move · Del/⌫ to delete</div>
            </div>
          ) : (
            <div style={note}>Draw a closed loop around strokes to select them. Then move, recolor, or delete.</div>
          )}
        </div>
      )}

      {isHL && <div style={{ ...note, color: "#4A6080" }}>Highlighter blends at 38% opacity on canvas and export.</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InkEditor() {
  const { id: plannerId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const goBack = () => navigate("/daybook/ink");

  // ── All refs (read in callbacks without stale closures) ──────────────────
  const toolRef           = useRef<Tool>("pen");
  const colorRef          = useRef(BRAND_COLORS[0]);
  const strokeWidthRef    = useRef(3);
  const lineVariantRef    = useRef<LineVariant>("solid");
  const eraserModeRef     = useRef<EraserMode>("stroke");
  const eraserRadiusRef   = useRef(14);
  const snapShapesRef     = useRef(false);
  const palmRejRef        = useRef(true);
  const placingStickerRef = useRef<string | null>(null);
  const penSettingsRef    = useRef<Record<string, { width: number; color: string }>>({ ...DEFAULT_PEN_SETTINGS });

  const strokesRef        = useRef<InkStroke[]>([]);
  const activeStrokeRef   = useRef<InkStroke | null>(null);
  const isDrawingRef      = useRef(false);
  const shiftHeldRef      = useRef(false);

  const objectsRef        = useRef<InkObject[]>([]);
  const selectedObjIdRef  = useRef<string | null>(null);
  const preDragObjRef     = useRef<InkObject[] | null>(null);
  const stickerDragRef    = useRef<{ id: string; startPx: number; startPy: number; objX: number; objY: number } | null>(null);

  const lassoPathRef      = useRef<InkPoint[]>([]);
  const lassoSelRef       = useRef<Set<string>>(new Set());
  const lassoDragRef      = useRef<{ startX: number; startY: number; snapshotStrokes: InkStroke[] } | null>(null);
  const selOffXRef        = useRef(0);
  const selOffYRef        = useRef(0);

  type Snapshot = { strokes: InkStroke[]; objects: InkObject[] };
  const undoStackRef  = useRef<Snapshot[]>([]);
  const redoStackRef  = useRef<Snapshot[]>([]);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bgCanvasRef  = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef     = useRef<HTMLDivElement>(null);
  const pdfDocRef    = useRef<any>(null);

  // ── State (UI rendering) ──────────────────────────────────────────────────
  const [tool,         _setTool]         = useState<Tool>("pen");
  const [colorState,   setColorState]    = useState(BRAND_COLORS[0]);
  const [strokeWidth,  setStrokeWidth]   = useState(3);
  const [lineVariant,  setLineVariantSt] = useState<LineVariant>("solid");
  const [eraserMode,   setEraserModeSt]  = useState<EraserMode>("stroke");
  const [eraserRadius, setEraserRadiusSt]= useState(14);
  const [snapShapes,   setSnapShapesSt]  = useState(false);
  const [palmRejection,setPalmRejection] = useState(true);
  const [showStickers, setShowStickers]  = useState(false);
  const [placingSticker, setPlacingSticker] = useState<string | null>(null);
  const [recentColors, setRecentColors]  = useState<string[]>([]);
  const [showPicker,   setShowPicker]    = useState(false);

  const [objects,      _setObjects]      = useState<InkObject[]>([]);
  const [selectedObjId,setSelectedObjId] = useState<string | null>(null);
  const [lassoPath,    setLassoPath]     = useState<InkPoint[]>([]);
  const [lassoSel,     setLassoSel]      = useState<Set<string>>(new Set());
  const [selOffX,      setSelOffX]       = useState(0);
  const [selOffY,      setSelOffY]       = useState(0);

  const [pageIds,      setPageIds]       = useState<string[]>([]);
  const [currentIdx,   setCurrentIdx]    = useState(0);
  const [plannerName,  setPlannerName]   = useState("Planner");
  const [undoCount,    setUndoCount]     = useState(0);
  const [redoCount,    setRedoCount]     = useState(0);
  const [saveState,    setSaveState]     = useState<"saved"|"unsaved"|"saving">("saved");
  const [pdfStatus,    setPdfStatus]     = useState<"loading"|"ready"|"error"|"no-drive">("loading");
  const [exporting,    setExporting]     = useState(false);

  // ── Synced setters ────────────────────────────────────────────────────────
  const setObjects = useCallback((val: InkObject[] | ((p: InkObject[]) => InkObject[])) => {
    const next = typeof val === "function" ? val(objectsRef.current) : val;
    objectsRef.current = next; _setObjects(next);
  }, []);

  const syncSelObj = (id: string | null) => { selectedObjIdRef.current = id; setSelectedObjId(id); };

  const syncLassoSel = (s: Set<string>) => { lassoSelRef.current = s; setLassoSel(new Set(s)); };

  const applyColor = useCallback((c: string) => { colorRef.current = c; setColorState(c); }, []);

  const setLineVariant = (v: LineVariant) => { lineVariantRef.current = v; setLineVariantSt(v); };
  const setEraserMode  = (m: EraserMode) => { eraserModeRef.current = m; setEraserModeSt(m); };
  const setEraserRadius= (r: number) => { eraserRadiusRef.current = r; setEraserRadiusSt(r); };
  const setSnapShapes  = (v: boolean) => { snapShapesRef.current = v; setSnapShapesSt(v); };

  // ── Redraw helper ─────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    redrawInkCanvas(
      canvas, strokesRef.current, activeStrokeRef.current,
      lassoSelRef.current, selOffXRef.current, selOffYRef.current,
      lassoPathRef.current.length > 1 ? lassoPathRef.current : undefined,
    );
  }, []);

  // ── Switch tool (saves/restores per-tool settings) ────────────────────────
  const switchTool = useCallback((t: Tool) => {
    const ct = toolRef.current;
    if (PEN_VARIANTS.includes(ct as PenVariant) || ct === "highlighter") {
      penSettingsRef.current[ct] = { width: strokeWidthRef.current, color: colorRef.current };
    }
    toolRef.current = t; _setTool(t);
    const saved = penSettingsRef.current[t];
    if (saved) {
      strokeWidthRef.current = saved.width; setStrokeWidth(saved.width);
      applyColor(saved.color);
    }
    placingStickerRef.current = null; setPlacingSticker(null);
    lassoPathRef.current = []; setLassoPath([]);
    if (t !== "lasso") syncLassoSel(new Set());
  }, [applyColor]);

  // ── Autosave ──────────────────────────────────────────────────────────────
  const triggerSave = useCallback((strokes: InkStroke[], objs: InkObject[]) => {
    const pageId = pageIds[currentIdx];
    if (!plannerId || !pageId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("unsaved");
    debounceRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await apiFetch(`/planners/${plannerId}/pages/${pageId}/layer`, {
          method: "PUT", body: JSON.stringify({ strokes, objects: objs }),
        });
        setSaveState("saved");
      } catch { setSaveState("unsaved"); }
    }, 1500);
  }, [plannerId, pageIds, currentIdx]);

  // ── History ───────────────────────────────────────────────────────────────
  const pushHistory = useCallback((strokes: InkStroke[], objs: InkObject[]) => {
    undoStackRef.current = [...undoStackRef.current, { strokes: [...strokes], objects: [...objs] }];
    redoStackRef.current = [];
    setUndoCount(undoStackRef.current.length); setRedoCount(0);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    redoStackRef.current = [...redoStackRef.current,
      { strokes: [...strokesRef.current], objects: [...objectsRef.current] }];
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    strokesRef.current = prev.strokes; setObjects(prev.objects);
    syncLassoSel(new Set());
    redraw(); triggerSave(strokesRef.current, prev.objects);
    setUndoCount(undoStackRef.current.length); setRedoCount(redoStackRef.current.length);
  }, [triggerSave, setObjects, redraw]);

  const handleRedo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    undoStackRef.current = [...undoStackRef.current,
      { strokes: [...strokesRef.current], objects: [...objectsRef.current] }];
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    strokesRef.current = next.strokes; setObjects(next.objects);
    syncLassoSel(new Set());
    redraw(); triggerSave(strokesRef.current, next.objects);
    setUndoCount(undoStackRef.current.length); setRedoCount(redoStackRef.current.length);
  }, [triggerSave, setObjects, redraw]);

  // ── Lasso actions ─────────────────────────────────────────────────────────
  const deleteSelection = useCallback(() => {
    const sel = lassoSelRef.current;
    if (!sel.size) return;
    pushHistory(strokesRef.current, objectsRef.current);
    strokesRef.current = strokesRef.current.filter((s) => !sel.has(s.id));
    syncLassoSel(new Set()); lassoPathRef.current = []; setLassoPath([]);
    redraw(); triggerSave(strokesRef.current, objectsRef.current);
  }, [pushHistory, triggerSave, redraw]);

  const recolorSelection = useCallback(() => {
    const sel = lassoSelRef.current;
    if (!sel.size) return;
    pushHistory(strokesRef.current, objectsRef.current);
    strokesRef.current = strokesRef.current.map((s) =>
      sel.has(s.id) ? { ...s, color: colorRef.current } : s,
    );
    redraw(); triggerSave(strokesRef.current, objectsRef.current);
  }, [pushHistory, triggerSave, redraw]);

  // ── Delete selected sticker ───────────────────────────────────────────────
  const deleteSticker = useCallback(() => {
    const id = selectedObjIdRef.current; if (!id) return;
    pushHistory(strokesRef.current, objectsRef.current);
    const next = objectsRef.current.filter((o) => o.id !== id);
    setObjects(next); syncSelObj(null);
    redraw(); triggerSave(strokesRef.current, next);
  }, [pushHistory, triggerSave, setObjects, redraw]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.key === "Shift") { shiftHeldRef.current = true; return; }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (selectedObjIdRef.current) { deleteSticker(); return; }
        if (lassoSelRef.current.size) { deleteSelection(); }
      }
    };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [handleUndo, handleRedo, deleteSticker, deleteSelection]);

  // ── Load planner + pages ──────────────────────────────────────────────────
  useEffect(() => {
    if (!plannerId) return;
    apiFetch<{ setup: any }>(`/planners/${plannerId}`)
      .then((c) => setPlannerName(`Planner ${c.setup?.startYear ?? ""}`)).catch(() => {});
    apiFetch<{ pageIds: string[] }>(`/planners/${plannerId}/pages`)
      .then((r) => setPageIds(r.pageIds)).catch(() => {});
  }, [plannerId]);

  // ── Load pdf.js (CDN, vite-ignore) ────────────────────────────────────────
  useEffect(() => {
    if (!plannerId) return;
    let cancelled = false; setPdfStatus("loading");
    const BASE = "https://unpkg.com/pdfjs-dist@6.1.200/build";
    (async () => {
      try {
        // @vite-ignore
        const pdfjs = await import(/* @vite-ignore */ `${BASE}/pdf.min.mjs`);
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ url: `/api/planners/${plannerId}/pdf-proxy`, withCredentials: true }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc; setPdfStatus("ready");
      } catch (err: any) {
        if (cancelled) return;
        if (String(err?.message ?? err).includes("404")) setPdfStatus("no-drive"); else setPdfStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [plannerId]);

  // ── Render PDF page to background canvas ──────────────────────────────────
  const renderPdfPage = useCallback(async (idx: number) => {
    const doc = pdfDocRef.current, bg = bgCanvasRef.current, stage = stageRef.current;
    if (!doc || !bg || !stage) return;
    const pageNum = idx + 1;
    if (pageNum < 1 || pageNum > doc.numPages) return;
    const page = await doc.getPage(pageNum);
    const vp0  = page.getViewport({ scale: 1 });
    const dpr  = window.devicePixelRatio || 1;
    const scale = Math.min(stage.clientWidth / vp0.width, stage.clientHeight / vp0.height) * dpr;
    const sw = Math.round(vp0.width * scale), sh = Math.round(vp0.height * scale);
    bg.width = sw; bg.height = sh;
    bg.style.width  = `${sw / dpr}px`; bg.style.height = `${sh / dpr}px`;
    const ink = inkCanvasRef.current;
    if (ink) {
      ink.width = sw; ink.height = sh;
      ink.style.width = bg.style.width; ink.style.height = bg.style.height;
    }
    const ctx = bg.getContext("2d");
    if (ctx) await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
  }, []);

  useEffect(() => { if (pdfStatus === "ready") renderPdfPage(currentIdx); }, [pdfStatus, currentIdx, renderPdfPage]);

  // ── Load annotation layer ─────────────────────────────────────────────────
  const loadLayer = useCallback(async (pageId: string) => {
    if (!plannerId) return;
    undoStackRef.current = []; redoStackRef.current = []; setUndoCount(0); setRedoCount(0);
    lassoPathRef.current = []; setLassoPath([]); syncLassoSel(new Set());
    try {
      const layer = await apiFetch<{ strokes: InkStroke[]; objects: InkObject[] }>(
        `/planners/${plannerId}/pages/${pageId}/layer`,
      );
      strokesRef.current = layer.strokes ?? []; setObjects(layer.objects ?? []);
      setSaveState("saved");
      const c = inkCanvasRef.current;
      if (c) redrawInkCanvas(c, strokesRef.current, null);
    } catch { strokesRef.current = []; setObjects([]); }
  }, [plannerId, setObjects]);

  useEffect(() => { const pid = pageIds[currentIdx]; if (pid) loadLayer(pid); }, [pageIds, currentIdx, loadLayer]);

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (palmRejRef.current && e.pointerType === "touch") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const canvas = inkCanvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    const ct = toolRef.current;

    // Sticker placement
    if (placingStickerRef.current) {
      pushHistory(strokesRef.current, objectsRef.current);
      const newObj: InkObject = {
        id: crypto.randomUUID(), kind: "sticker", ref: placingStickerRef.current,
        x: nx, y: ny, scale: 1, z: 0,
      };
      const next = [...objectsRef.current, newObj];
      setObjects(next); triggerSave(strokesRef.current, next);
      placingStickerRef.current = null; setPlacingSticker(null); return;
    }

    // Lasso
    if (ct === "lasso") {
      const sel = lassoSelRef.current;
      if (sel.size > 0) {
        // Check if inside selection bbox → start move
        let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
        for (const s of strokesRef.current.filter((s) => sel.has(s.id))) {
          const bb = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
          if (s.shape) {
            bb.minX = Math.min(s.shape.x1, s.shape.x2); bb.maxX = Math.max(s.shape.x1, s.shape.x2);
            bb.minY = Math.min(s.shape.y1, s.shape.y2); bb.maxY = Math.max(s.shape.y1, s.shape.y2);
          } else if (s.points.length) {
            const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y);
            bb.minX = Math.min(...xs); bb.maxX = Math.max(...xs);
            bb.minY = Math.min(...ys); bb.maxY = Math.max(...ys);
          }
          mnX = Math.min(mnX, bb.minX); mnY = Math.min(mnY, bb.minY);
          mxX = Math.max(mxX, bb.maxX); mxY = Math.max(mxY, bb.maxY);
        }
        const pad = 0.02;
        if (nx >= mnX - pad && nx <= mxX + pad && ny >= mnY - pad && ny <= mxY + pad) {
          lassoDragRef.current = { startX: nx, startY: ny, snapshotStrokes: strokesRef.current.map((s) => ({ ...s })) };
          return;
        }
      }
      // New lasso
      syncLassoSel(new Set()); selOffXRef.current = 0; selOffYRef.current = 0; setSelOffX(0); setSelOffY(0);
      lassoPathRef.current = [{ x: nx, y: ny, p: 0.5 }]; setLassoPath([...lassoPathRef.current]);
      isDrawingRef.current = true; return;
    }

    // Shape tool
    if (SHAPE_TOOLS.includes(ct as ShapeKind)) {
      activeStrokeRef.current = {
        id: crypto.randomUUID(), tool: ct, color: colorRef.current,
        baseWidth: strokeWidthRef.current, points: [], variant: lineVariantRef.current,
        shape: { kind: ct as ShapeKind, x1: nx, y1: ny, x2: nx, y2: ny },
      };
      isDrawingRef.current = true; return;
    }

    // Freehand (pen variants, highlighter, eraser)
    const strokeColor = ct === "highlighter" ? "#FFC107" : colorRef.current;
    activeStrokeRef.current = {
      id: crypto.randomUUID(), tool: ct, color: strokeColor,
      baseWidth: strokeWidthRef.current,
      points: [{ x: nx, y: ny, p: pressure }],
      variant: (ct === "highlighter" || ct === "eraser") ? undefined : lineVariantRef.current,
    };
    isDrawingRef.current = true;
  }, [pushHistory, triggerSave, setObjects]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (palmRejRef.current && e.pointerType === "touch") return;
    const canvas = inkCanvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;

    // Lasso move drag
    if (lassoDragRef.current) {
      const drag = lassoDragRef.current;
      selOffXRef.current = nx - drag.startX; selOffYRef.current = ny - drag.startY;
      setSelOffX(selOffXRef.current); setSelOffY(selOffYRef.current);
      redraw(); return;
    }

    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    const ct = toolRef.current;

    // Lasso path
    if (ct === "lasso") {
      lassoPathRef.current = [...lassoPathRef.current, { x: nx, y: ny, p: 0.5 }];
      setLassoPath([...lassoPathRef.current]); redraw(); return;
    }

    // Shape: update endpoint
    if (SHAPE_TOOLS.includes(ct as ShapeKind) && activeStrokeRef.current.shape) {
      let x2 = nx, y2 = ny;
      if (shiftHeldRef.current) {
        const snapped = applyShapeSnap(
          activeStrokeRef.current.shape.x1, activeStrokeRef.current.shape.y1,
          nx, ny, ct as ShapeKind, canvas.width, canvas.height,
        );
        x2 = snapped.x2; y2 = snapped.y2;
      }
      activeStrokeRef.current = { ...activeStrokeRef.current, shape: { ...activeStrokeRef.current.shape!, x2, y2 } };
      redraw(); return;
    }

    // Freehand: accumulate coalesced points
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      activeStrokeRef.current.points.push({
        x: (ev.clientX - rect.left) / rect.width,
        y: (ev.clientY - rect.top)  / rect.height,
        p: (ev as PointerEvent).pressure > 0 ? (ev as PointerEvent).pressure : 0.5,
      });
    }
    redraw();
  }, [redraw]);

  const onPointerUp = useCallback(() => {
    const ct = toolRef.current;

    // Commit lasso move
    if (lassoDragRef.current) {
      const drag = lassoDragRef.current;
      const dx = selOffXRef.current, dy = selOffYRef.current;
      pushHistory(drag.snapshotStrokes, objectsRef.current);
      strokesRef.current = strokesRef.current.map((s) =>
        lassoSelRef.current.has(s.id) ? applyMoveToStroke(s, dx, dy) : s,
      );
      selOffXRef.current = 0; selOffYRef.current = 0; setSelOffX(0); setSelOffY(0);
      lassoDragRef.current = null;
      redraw(); triggerSave(strokesRef.current, objectsRef.current); return;
    }

    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    isDrawingRef.current = false;
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;

    // Finalize lasso selection
    if (ct === "lasso") {
      if (lassoPathRef.current.length >= 3) {
        syncLassoSel(selectInLasso(strokesRef.current, lassoPathRef.current));
      }
      lassoPathRef.current = []; setLassoPath([]); redraw(); return;
    }

    pushHistory(strokesRef.current, objectsRef.current);

    if (finished.tool === "eraser") {
      if (eraserModeRef.current === "stroke") {
        strokesRef.current = strokesRef.current.filter((s) => !eraserHitsBBox(finished.points, s));
      } else {
        const canvas = inkCanvasRef.current;
        const minDim = canvas ? Math.min(canvas.width, canvas.height) : 1;
        strokesRef.current = areaErase(strokesRef.current, finished.points, eraserRadiusRef.current / minDim);
      }
    } else {
      let toAdd = finished;
      // Shape snap assist: try to recognize freehand as a clean shape
      if (
        snapShapesRef.current && !finished.shape &&
        PEN_VARIANTS.includes(finished.tool as PenVariant) &&
        finished.points.length >= 6
      ) {
        const recog = recognizeShape(finished.points);
        if (recog) toAdd = { ...finished, points: [], shape: recog };
      }
      strokesRef.current = [...strokesRef.current, toAdd];
    }

    redraw(); triggerSave(strokesRef.current, objectsRef.current);
  }, [pushHistory, triggerSave, redraw]);

  // ── Sticker drag ──────────────────────────────────────────────────────────
  const onStickerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, id: string, ox: number, oy: number) => {
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    syncSelObj(id); preDragObjRef.current = [...objectsRef.current];
    stickerDragRef.current = { id, startPx: e.clientX, startPy: e.clientY, objX: ox, objY: oy };
  }, []);

  const onStickerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = stickerDragRef.current; if (!drag) return;
    const canvas = inkCanvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - drag.startPx) / rect.width, dy = (e.clientY - drag.startPy) / rect.height;
    setObjects((prev) => prev.map((o) =>
      o.id === drag.id ? { ...o, x: Math.max(0, Math.min(1, drag.objX + dx)), y: Math.max(0, Math.min(1, drag.objY + dy)) } : o,
    ));
  }, [setObjects]);

  const onStickerUp = useCallback(() => {
    if (!stickerDragRef.current) return;
    stickerDragRef.current = null;
    if (preDragObjRef.current) { pushHistory(strokesRef.current, preDragObjRef.current); preDragObjRef.current = null; }
    triggerSave(strokesRef.current, objectsRef.current);
  }, [pushHistory, triggerSave]);

  // ── Page nav ──────────────────────────────────────────────────────────────
  const goToPage = (idx: number) => {
    if (idx < 0 || idx >= pageIds.length) return;
    setCurrentIdx(idx); syncSelObj(null); syncLassoSel(new Set());
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const stickerPngs: Record<string, string> = {};
      for (const obj of objectsRef.current)
        if (obj.kind === "sticker" && !stickerPngs[obj.ref]) stickerPngs[obj.ref] = rasterizeGlyph(obj.ref);
      const result = await apiFetch<{ fileId: string; url: string }>(`/planners/${plannerId}/export`, {
        method: "POST", body: JSON.stringify({ stickerPngs }),
      });
      toast({ title: "Exported to Drive", description: "Flattened PDF uploaded. Vector layer stays editable." });
      window.open(result.url, "_blank");
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally { setExporting(false); }
  };

  // ── Custom color ──────────────────────────────────────────────────────────
  const handleCustomColor = useCallback((c: string) => {
    applyColor(c);
    setRecentColors((prev) => [c, ...prev.filter((x) => x !== c)].slice(0, 6));
    const ct = toolRef.current;
    if (PEN_VARIANTS.includes(ct as PenVariant) || ct === "highlighter") {
      penSettingsRef.current[ct] = { ...penSettingsRef.current[ct], color: c };
    }
  }, [applyColor]);

  const handleBrandColor = useCallback((c: string) => {
    applyColor(c);
    const ct = toolRef.current;
    if (PEN_VARIANTS.includes(ct as PenVariant) || ct === "highlighter") {
      penSettingsRef.current[ct] = { ...penSettingsRef.current[ct], color: c };
    }
  }, [applyColor]);

  // keep palmRejRef in sync
  useEffect(() => { palmRejRef.current = palmRejection; }, [palmRejection]);
  useEffect(() => { placingStickerRef.current = placingSticker; }, [placingSticker]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const railBtn = (active: boolean): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: 10, border: "none",
    background: active ? "#1B2A4A" : "transparent",
    color: active ? "#fff" : "#4A6080", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.12s", flexShrink: 0,
  });
  const div: React.CSSProperties = { height: 1, width: 44, background: "#E7DCCB", margin: "4px 0", flexShrink: 0 };

  const penMeta: { key: PenVariant; label: string; title: string }[] = [
    { key: "pen",       label: "P",  title: "Pen — pressure-sensitive Catmull-Rom" },
    { key: "fineliner", label: "FL", title: "Fineliner — constant width, no taper" },
    { key: "fountain",  label: "FB", title: "Fountain/Brush — strong pressure curve + end taper" },
    { key: "marker",    label: "MK", title: "Marker — flat chisel, constant width" },
  ];
  const shapeMeta: { key: ShapeKind; Icon: any; title: string }[] = [
    { key: "line",    Icon: Minus,      title: "Line (Shift = snap 45°)" },
    { key: "rect",    Icon: Square,     title: "Rectangle (Shift = square)" },
    { key: "ellipse", Icon: Circle,     title: "Ellipse (Shift = circle)" },
    { key: "arrow",   Icon: ArrowRight, title: "Arrow (Shift = snap 45°)" },
  ];

  const currentPageId = pageIds[currentIdx];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh", width: "100vw",
      position: "fixed", inset: 0, zIndex: 50, background: "#F7F0E6",
      fontFamily: "'Instrument Sans', sans-serif",
    }}>
      {/* Header */}
      <header style={{
        height: 52, background: "#1B2A4A", display: "flex", alignItems: "center",
        padding: "0 14px", gap: 10, flexShrink: 0, color: "#fff",
      }}>
        <button onClick={goBack} style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.6)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
          fontSize: 13, padding: "4px 6px", borderRadius: 6,
        }}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back
        </button>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} />
        <span style={{ fontFamily: "'Spectral', serif", fontWeight: 600, fontSize: 15, flex: 1 }}>
          {plannerName} — Ink
        </span>

        {/* Page nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => goToPage(currentIdx - 1)} disabled={currentIdx === 0} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "rgba(255,255,255,0.8)",
            cursor: currentIdx === 0 ? "not-allowed" : "pointer", padding: "4px 6px",
            borderRadius: 6, opacity: currentIdx === 0 ? 0.3 : 1,
          }}>
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </button>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", minWidth: 90, textAlign: "center" }}>
            {currentPageId ?? "—"} ({currentIdx + 1}/{pageIds.length || "?"})
          </span>
          <button onClick={() => goToPage(currentIdx + 1)} disabled={currentIdx >= pageIds.length - 1} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "rgba(255,255,255,0.8)",
            cursor: currentIdx >= pageIds.length - 1 ? "not-allowed" : "pointer", padding: "4px 6px",
            borderRadius: 6, opacity: currentIdx >= pageIds.length - 1 ? 0.3 : 1,
          }}>
            <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Undo/redo */}
        {([["undo", undoCount, handleUndo, "⌘Z"], ["redo", redoCount, handleRedo, "⌘⇧Z"]] as const).map(
          ([label, count, fn, hint]) => (
            <button key={label} onClick={fn as () => void} disabled={count === 0}
              title={`${label === "undo" ? "Undo" : "Redo"} (${hint})`}
              style={{
                background: "rgba(255,255,255,0.08)", border: "none",
                color: count === 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.75)",
                cursor: count === 0 ? "not-allowed" : "pointer", padding: "4px 8px",
                borderRadius: 6, fontSize: 14, fontWeight: 600,
              }}>
              {label === "undo" ? "↩" : "↪"}
            </button>
          )
        )}

        {/* Save indicator */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4, fontSize: 11,
          color: saveState === "saved" ? "#6ee7b7" : saveState === "saving" ? "#fcd34d" : "#fca5a5",
        }}>
          <Cloud style={{ width: 12, height: 12 }} />
          {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Unsaved"}
        </div>

        <button onClick={handleExport} disabled={exporting} style={{
          background: "#C87560", border: "none", color: "#fff",
          cursor: exporting ? "wait" : "pointer", padding: "6px 12px", borderRadius: 6,
          fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 5,
          opacity: exporting ? 0.7 : 1,
        }}>
          <Download style={{ width: 13, height: 13 }} />
          {exporting ? "Exporting…" : "Export to Drive"}
        </button>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Left rail */}
        <div style={{
          width: 72, background: "#FFFDF9", borderRight: "1px solid #E7DCCB",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "10px 0", gap: 3, flexShrink: 0, overflowY: "auto",
        }}>
          {/* Pen section label */}
          <span style={{ fontSize: 8, color: "#C0B8AE", letterSpacing: "0.08em", marginBottom: 2 }}>PEN</span>

          {penMeta.map(({ key, label, title }) => (
            <button key={key} title={title} onClick={() => switchTool(key)} style={railBtn(tool === key)}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <Pen style={{ width: 13, height: 13 }} />
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.04em" }}>{label}</span>
              </div>
            </button>
          ))}

          <button title="Highlighter" onClick={() => switchTool("highlighter")} style={railBtn(tool === "highlighter")}>
            <Highlighter style={{ width: 17, height: 17 }} />
          </button>

          <div style={div} />
          <span style={{ fontSize: 8, color: "#C0B8AE", letterSpacing: "0.08em" }}>SHAPE</span>

          {shapeMeta.map(({ key, Icon, title }) => (
            <button key={key} title={title} onClick={() => switchTool(key)} style={railBtn(tool === key)}>
              <Icon style={{ width: 17, height: 17 }} />
            </button>
          ))}

          <div style={div} />

          <button title="Lasso Select" onClick={() => switchTool("lasso")} style={railBtn(tool === "lasso")}>
            <Lasso style={{ width: 17, height: 17 }} />
          </button>
          <button title="Eraser" onClick={() => switchTool("eraser")} style={railBtn(tool === "eraser")}>
            <Eraser style={{ width: 17, height: 17 }} />
          </button>

          <div style={div} />

          {/* Brand colors */}
          {BRAND_COLORS.map((c) => (
            <button key={c} onClick={() => handleBrandColor(c)} title={c} style={{
              width: 24, height: 24, borderRadius: "50%", background: c, flexShrink: 0,
              border: colorState === c ? "2.5px solid #C87560" : "2px solid #E7DCCB", cursor: "pointer",
            }} />
          ))}

          {/* Custom color trigger */}
          <div style={{ position: "relative" }}>
            <button
              title="Custom color"
              onClick={() => setShowPicker((v) => !v)}
              style={{
                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
                border: showPicker ? "2.5px solid #C87560" : "2px solid #E7DCCB", cursor: "pointer",
              }}
            />
            {showPicker && (
              <div style={{
                position: "absolute", left: 30, top: -60, zIndex: 200,
                background: "#fff", border: "1px solid #E7DCCB", borderRadius: 10,
                padding: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", width: 168,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", marginBottom: 6, textTransform: "uppercase" }}>
                  Custom Color
                </div>
                <input
                  type="color" defaultValue={colorState}
                  onChange={(e) => applyColor(e.target.value)}
                  onBlur={(e) => handleCustomColor(e.target.value)}
                  style={{ width: "100%", height: 34, border: "none", cursor: "pointer", borderRadius: 4 }}
                />
                <input
                  type="text" value={colorState}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) applyColor(e.target.value); }}
                  onBlur={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) handleCustomColor(e.target.value); }}
                  style={{
                    width: "100%", marginTop: 6, padding: "4px 8px", fontSize: 11,
                    border: "1px solid #E7DCCB", borderRadius: 5, fontFamily: "monospace",
                    boxSizing: "border-box",
                  }}
                />
                {recentColors.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: "#9CA3AF", marginBottom: 4, textTransform: "uppercase" }}>Recent</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {recentColors.map((rc) => (
                        <button key={rc} onClick={() => { handleCustomColor(rc); setShowPicker(false); }}
                          style={{ width: 18, height: 18, borderRadius: "50%", background: rc, border: "1.5px solid #E7DCCB", cursor: "pointer" }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => setShowPicker(false)} style={{
                  marginTop: 8, width: "100%", padding: "4px", fontSize: 11,
                  border: "1px solid #E7DCCB", borderRadius: 5, cursor: "pointer",
                  background: "transparent", color: "#4A6080",
                }}>
                  Done
                </button>
              </div>
            )}
          </div>

          <div style={div} />

          {/* Width slider */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 9, color: "#9CA3AF" }}>Width</span>
            <input
              type="range" min={1} max={24} value={strokeWidth}
              onChange={(e) => {
                const w = Number(e.target.value);
                strokeWidthRef.current = w; setStrokeWidth(w);
                const ct = toolRef.current;
                if (PEN_VARIANTS.includes(ct as PenVariant) || ct === "highlighter") {
                  penSettingsRef.current[ct] = { ...penSettingsRef.current[ct], width: w };
                }
              }}
              style={{ writingMode: "vertical-lr" as any, direction: "rtl" as any, height: 64, cursor: "pointer", accentColor: "#C87560" }}
            />
            <span style={{ fontSize: 9, color: "#9CA3AF" }}>{strokeWidth}</span>
          </div>

          <div style={div} />
          <button onClick={() => setPalmRejection((v) => !v)} title="Palm rejection" style={railBtn(palmRejection)}>✋</button>
          <button onClick={() => { setShowStickers((v) => !v); setPlacingSticker(null); }} title="Stickers" style={railBtn(showStickers)}>✦</button>
        </div>

        {/* Sticker panel */}
        {showStickers && (
          <div style={{
            width: 140, background: "#FFFDF9", borderRight: "1px solid #E7DCCB",
            padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flexShrink: 0,
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#4A6080", margin: 0 }}>Stickers</p>
            <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>Click a sticker, then click the canvas to place it.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {STICKER_GLYPHS.map((g) => (
                <button key={g} onClick={() => setPlacingSticker(g)} style={{
                  width: 34, height: 34, borderRadius: 8, fontSize: 19,
                  border: placingSticker === g ? "2px solid #C87560" : "1px solid #E7DCCB",
                  background: placingSticker === g ? "#FEF0ED" : "transparent",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {g}
                </button>
              ))}
            </div>
            {placingSticker && <p style={{ fontSize: 11, color: "#C87560", fontWeight: 500 }}>Click canvas to place {placingSticker}</p>}
          </div>
        )}

        {/* Canvas stage */}
        <div ref={stageRef} onClick={() => setShowPicker(false)} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          background: "#E5DDD3", position: "relative", overflow: "hidden",
        }}>
          {pdfStatus === "loading" && <div style={{ color: "#4A6080", fontSize: 14 }}>Loading PDF…</div>}
          {pdfStatus === "no-drive" && (
            <div style={{
              color: "#4A6080", fontSize: 14, textAlign: "center", padding: 24,
              background: "#FFFDF9", borderRadius: 12, border: "1px solid #E7DCCB",
            }}>
              <p style={{ fontFamily: "'Spectral', serif", fontSize: 18, marginBottom: 8 }}>No PDF in Drive</p>
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Generate this planner first, then come back to annotate.</p>
            </div>
          )}
          {pdfStatus === "error" && <div style={{ color: "#D32F2F", fontSize: 14 }}>Couldn't load PDF. Check your Google connection.</div>}

          <div style={{ position: "relative", display: "inline-block", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
            <canvas ref={bgCanvasRef} style={{ display: "block" }} />
            <canvas
              ref={inkCanvasRef}
              style={{ position: "absolute", top: 0, left: 0, touchAction: "none",
                cursor: placingSticker ? "crosshair" : tool === "eraser" ? "cell" : "crosshair" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />

            {/* Sticker overlays */}
            {objects.map((obj) => {
              if (obj.kind !== "sticker") return null;
              const c = inkCanvasRef.current; if (!c) return null;
              const cw = c.clientWidth || c.width, ch = c.clientHeight || c.height;
              const px = obj.x * cw, py = obj.y * ch, sz = 32 * obj.scale;
              const isSel = selectedObjId === obj.id;
              return (
                <div key={obj.id}
                  onPointerDown={(e) => onStickerDown(e, obj.id, obj.x, obj.y)}
                  onPointerMove={onStickerMove} onPointerUp={onStickerUp}
                  style={{
                    position: "absolute", left: px - sz / 2, top: py - sz / 2,
                    width: sz, height: sz, fontSize: sz * 0.8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "grab", userSelect: "none", touchAction: "none",
                    outline: isSel ? "2px solid #C87560" : "none", borderRadius: 6,
                  }}
                >
                  {obj.ref}
                  {isSel && (
                    <button onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); deleteSticker(); }}
                      style={{
                        position: "absolute", top: -10, right: -10, width: 18, height: 18,
                        borderRadius: "50%", background: "#C87560", border: "none", color: "#fff",
                        fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", padding: 0, zIndex: 10,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                      }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right inspector */}
        <RightInspector
          tool={tool}
          lineVariant={lineVariant} setLineVariant={setLineVariant}
          eraserMode={eraserMode}   setEraserMode={setEraserMode}
          eraserRadius={eraserRadius} setEraserRadius={setEraserRadius}
          snapShapes={snapShapes}   setSnapShapes={setSnapShapes}
          lassoSelection={lassoSel}
          onRecolorSelection={recolorSelection}
          onDeleteSelection={deleteSelection}
          currentColor={colorState}
        />
      </div>
    </div>
  );
}
