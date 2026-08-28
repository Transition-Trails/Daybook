import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Trash2, Copy, Save, AlertTriangle, ChevronLeft, ChevronRight, GripVertical, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { storePlannersApi, widgetsApi, type PlannerWidgetPlacement, type StorePlannerComposition, type StorePlannerConfig, type Widget } from "@/lib/api";
import { getPlannerPageCounts, getPlannerPageDescriptors, type PlannerPageType } from "@workspace/db/planner-pages";

const cleanSvg = (raw: string | null) => {
  if (!raw) return "";
  try {
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (doc.querySelector("parsererror")) return "";
    doc.querySelectorAll("script,foreignObject,iframe,object,embed").forEach((n) => n.remove());
    doc.querySelectorAll("*").forEach((el) => Array.from(el.attributes).forEach((a) => {
      if (a.name.toLowerCase().startsWith("on") || /javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }));
    return doc.documentElement.outerHTML
      .replaceAll("{{slot:accent}}", "var(--color-primary)")
      .replaceAll("{{slot:secondary}}", "var(--color-accent)")
      .replaceAll("{{slot:tertiary}}", "var(--color-muted)")
      .replaceAll("{{slot:ink}}", "var(--color-foreground)")
      .replaceAll("{{slot:paper}}", "var(--color-card)");
  } catch { return ""; }
};

type Props = {
  storeId: string;
  planner: StorePlannerConfig;
  onSaved: (planner: StorePlannerConfig) => void;
};
type Page = { type: string; label: string; index: number; detail: string };
const SAFE_LEFT = 0.1;
const SAFE_TOP = 0.06;
const SAFE_RIGHT = 0.94;
const SAFE_BOTTOM = 0.94;
const MIN_WIDTH = 0.08;
const MIN_HEIGHT = 0.06;
const MAX_PLACEMENTS = 100;
const PALETTE_SLOTS = ["accent", "secondary", "tertiary", "ink", "paper"] as const;

function newPlacementId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `placement-${crypto.randomUUID()}`
    : `placement-${Date.now()}-${Math.round(performance.now())}`;
}

function clampPlacementPosition(value: number, size: number, min: number, max: number) {
  return Math.max(min, Math.min(max - size, value));
}

function pagesFor(planner: StorePlannerConfig): Page[] {
  const meta: Record<PlannerPageType, { label: string; detail: string }> = {
    cover: { label: "Cover", detail: "Opening page" },
    home: { label: "Home", detail: "Navigation hub" },
    year: { label: "Year at a glance", detail: "Overview" },
    "month-divider": { label: "Month divider", detail: "Monthly section" },
    "month-calendar": { label: "Month calendar", detail: "Monthly spread" },
    weekly: { label: "Weekly", detail: "Weekly repeat" },
    daily: { label: "Daily", detail: "Daily repeat" },
    todo: { label: "To-do", detail: "Task hub" },
    notes: { label: "Notes", detail: "Notes hub" },
    "section-divider": { label: "Section", detail: "Section divider" },
    "note-paper": { label: "Note paper", detail: "Reusable notes page" },
  };
  const counts = getPlannerPageCounts(planner.setup, planner.style);
  return getPlannerPageDescriptors(planner.setup, planner.style).map(({ type, index }) => ({
    type,
    index,
    label: type === "section-divider"
      ? planner.style.sections?.[index] || `Section ${index + 1}`
      : counts[type] > 1 ? `${meta[type].label} ${index + 1}` : meta[type].label,
    detail: meta[type].detail,
  }));
}

function generatedPageCount(type: string, planner: StorePlannerConfig): number {
  return getPlannerPageCounts(planner.setup, planner.style)[type as PlannerPageType] ?? 0;
}

export default function CompositionWorkspace({ storeId, planner, onSaved }: Props) {
  const { data: widgets = [], isLoading: widgetsLoading } = useQuery<Widget[]>({ queryKey: ["widgets", storeId], queryFn: () => widgetsApi.list(storeId) });
  const compositionQuery = useQuery<StorePlannerComposition>({ queryKey: ["planner-composition", storeId, planner.id], queryFn: () => storePlannersApi.getComposition(storeId, planner.id) });
  const [composition, setComposition] = useState<StorePlannerComposition>({ version: 1, placements: [] });
  const [initialized, setInitialized] = useState(false);
  useEffect(() => { if (compositionQuery.data && !initialized) { setComposition(compositionQuery.data); setInitialized(true); } }, [compositionQuery.data, initialized]);
  const [pagePos, setPagePos] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "starter" | "owned">("all");
  const [placementFeedback, setPlacementFeedback] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number; resize?: boolean } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const feedbackTimer = useRef<number | null>(null);
  const pages = useMemo(() => pagesFor(planner), [planner]);
  const page = pages[pagePos] ?? pages[0];
  const visibleWidgets = widgets.filter((w) => w.name.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || w.origin === filter));
  const placements = composition.placements.filter((p) =>
    p.pageType === page.type && (
      p.scope === "matching" ||
      (p.scope === "range" && page.index >= (p.rangeStart ?? 0) && page.index <= (p.rangeEnd ?? -1)) ||
      (p.scope === "page" && p.pageIndex === page.index)
    ),
  );
  const selectedPlacement = composition.placements.find((p) => p.id === selected);
  const selectedWidget = widgets.find((w) => w.id === selectedPlacement?.widgetId);
  const selectedPageCount = selectedPlacement ? generatedPageCount(selectedPlacement.pageType, planner) : 1;
  const selectedMaxIndex = Math.max(0, selectedPageCount - 1);
  const save = useMutation({
    mutationFn: () => storePlannersApi.saveComposition(storeId, planner.id, composition),
    onSuccess: async () => {
      await compositionQuery.refetch();
      onSaved(await storePlannersApi.get(storeId, planner.id));
    },
  });
  const saveError = save.error instanceof Error ? save.error.message : null;

  const update = (id: string, patch: Partial<PlannerWidgetPlacement>) =>
    setComposition((c) => ({ ...c, placements: c.placements.map((p) => p.id === id ? { ...p, ...patch } : p) }));
  const showPlacementFeedback = (message: string) => {
    setPlacementFeedback(message);
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      setPlacementFeedback(null);
      feedbackTimer.current = null;
    }, 2200);
  };
  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);
  useEffect(() => {
    if (!selectedPlacement || selectedPlacement.scope !== "range") return;
    const maxIndex = Math.max(0, generatedPageCount(selectedPlacement.pageType, planner) - 1);
    const start = Math.min(maxIndex, Math.max(0, selectedPlacement.rangeStart ?? selectedPlacement.pageIndex));
    const end = Math.min(maxIndex, Math.max(start, selectedPlacement.rangeEnd ?? selectedPlacement.pageIndex));
    if (maxIndex === 0) {
      update(selectedPlacement.id, { scope: "page", rangeStart: undefined, rangeEnd: undefined });
    } else if (start !== selectedPlacement.rangeStart || end !== selectedPlacement.rangeEnd) {
      update(selectedPlacement.id, { rangeStart: start, rangeEnd: end });
    }
  }, [planner, selectedPlacement?.id, selectedPlacement?.scope, selectedPlacement?.pageIndex, selectedPlacement?.rangeStart, selectedPlacement?.rangeEnd]);
  const point = (e: DragEvent | PointerEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const place = (widgetId: string, x: number, y: number) => {
    const widget = widgets.find((item) => item.id === widgetId);
    if (!widget?.svgData?.trim()) {
      showPlacementFeedback("This widget has no renderable artwork yet.");
      return;
    }
    if (composition.placements.length >= MAX_PLACEMENTS) {
      showPlacementFeedback(`A planner can contain at most ${MAX_PLACEMENTS} placements.`);
      return;
    }
    const w = 0.22, h = 0.14;
    const nx = x - w / 2, ny = y - h / 2;
    const valid = nx >= SAFE_LEFT && ny >= SAFE_TOP && nx + w <= SAFE_RIGHT && ny + h <= SAFE_BOTTOM;
    if (!valid) {
      showPlacementFeedback("Drop inside the dashed safe area.");
      return;
    }
    const id = newPlacementId();
    setComposition((c) => ({ ...c, placements: [...c.placements, { id, widgetId, pageType: page.type, pageIndex: page.index, x: nx, y: ny, w, h, scope: "page", settings: { visible: true } }] }));
    setSelected(id);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("widget-id");
    const p = point(e);
    if (!id) {
      showPlacementFeedback("Choose a widget from the library first.");
      return;
    }
    if (p) place(id, p.x, p.y);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const p = point(e); if (!p) return;
    if (dragging.resize) {
      const current = composition.placements.find((item) => item.id === dragging.id);
      if (current) update(dragging.id, {
        w: Math.max(MIN_WIDTH, Math.min(SAFE_RIGHT - current.x, p.x - current.x)),
        h: Math.max(MIN_HEIGHT, Math.min(SAFE_BOTTOM - current.y, p.y - current.y)),
      });
      return;
    }
    const current = composition.placements.find((item) => item.id === dragging.id);
    if (!current) return;
    const x = clampPlacementPosition(p.x - dragging.dx, current.w, SAFE_LEFT, SAFE_RIGHT);
    const y = clampPlacementPosition(p.y - dragging.dy, current.h, SAFE_TOP, SAFE_BOTTOM);
    update(dragging.id, { x, y });
  };
  const remove = () => {
    if (selected) {
      setComposition((c) => ({ ...c, placements: c.placements.filter((p) => p.id !== selected) }));
      setSelected(null);
    }
  };
  const duplicate = () => {
    if (!selectedPlacement) return;
    if (composition.placements.length >= MAX_PLACEMENTS) {
      showPlacementFeedback(`A planner can contain at most ${MAX_PLACEMENTS} placements.`);
      return;
    }
    const copy = {
      ...selectedPlacement,
      id: newPlacementId(),
      x: clampPlacementPosition(selectedPlacement.x + 0.03, selectedPlacement.w, SAFE_LEFT, SAFE_RIGHT),
      y: clampPlacementPosition(selectedPlacement.y + 0.03, selectedPlacement.h, SAFE_TOP, SAFE_BOTTOM),
    };
    setComposition((c) => ({ ...c, placements: [...c.placements, copy] }));
    setSelected(copy.id);
  };

  return <div className="min-h-full bg-background text-foreground">
    <div className="border-b border-border bg-card px-5 py-4 flex items-center justify-between gap-4">
      <div><p className="text-[10px] uppercase tracking-[.2em] text-primary font-semibold">Composition desk</p><h2 className="font-serif text-2xl">Inserts & widgets</h2><p className="text-xs text-muted-foreground mt-1">Place once, repeat with confidence. Coordinates stay production-safe.</p></div>
      <div className="flex items-center gap-3"><span data-testid="status-composition-save" role={save.isError ? "alert" : undefined} className={`text-xs ${save.isError ? "text-destructive" : "text-muted-foreground"}`}>{save.isPending ? "Saving…" : save.isError ? saveError ?? "Save failed — check the placement settings" : save.isSuccess ? "Saved just now" : "Unsaved changes"}</span><Button data-testid="button-save-composition" onClick={() => save.mutate()} disabled={save.isPending} className="bg-foreground text-background hover:bg-foreground/90"><Save className="w-4 h-4 mr-2" /> Save composition</Button></div>
    </div>
    <div className="grid grid-cols-[220px_minmax(420px,1fr)_250px] min-h-[680px] max-2xl:grid-cols-[190px_minmax(420px,1fr)] max-xl:grid-cols-1">
      <aside className="border-r border-border bg-muted/40 p-3 overflow-y-auto max-h-[calc(100vh-190px)] max-xl:max-h-52 max-xl:border-r-0 max-xl:border-b">
        <p className="text-[10px] uppercase tracking-[.18em] font-semibold text-muted-foreground mb-3">Pages / repeats</p>
        <div className="space-y-2 max-xl:grid max-xl:grid-cols-2 max-xl:gap-2 max-xl:space-y-0">{pages.map((p, i) => <button data-testid={`button-page-${p.type}-${i}`} key={`${p.type}-${i}`} onClick={() => setPagePos(i)} className={`w-full text-left rounded-lg border p-2 flex gap-2 transition-colors ${i === pagePos ? "border-primary bg-card" : "border-transparent hover:border-border"}`}><div className={`w-9 h-12 rounded border ${i === pagePos ? "bg-accent border-primary" : "bg-muted border-border"} flex items-end p-1`}><span className="text-[8px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span></div><span className="min-w-0"><b className="text-xs block truncate">{p.label}</b><small className="text-[10px] text-muted-foreground">{p.detail}</small></span></button>)}</div>
      </aside>
      <section className="p-5 min-w-0 flex flex-col items-center">
        <div className="w-full max-w-[730px] flex items-center justify-between mb-4"><div><span className="text-xs uppercase tracking-widest text-muted-foreground">Page {pagePos + 1} / {pages.length}</span><h3 className="font-serif text-xl">{page.label}</h3></div><div className="flex gap-1"><Button data-testid="button-previous-page" variant="outline" size="icon" onClick={() => setPagePos(Math.max(0, pagePos - 1))}><ChevronLeft className="w-4 h-4" /></Button><Button data-testid="button-next-page" variant="outline" size="icon" onClick={() => setPagePos(Math.min(pages.length - 1, pagePos + 1))}><ChevronRight className="w-4 h-4" /></Button></div></div>
       <div ref={canvasRef} onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onPointerMove={onPointerMove} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} className={`relative w-full max-w-[560px] aspect-[.77] rounded-sm border-2 shadow-lg bg-card overflow-hidden ${placementFeedback ? "border-destructive bg-destructive/5" : "border-border"}`}><div className="absolute inset-[6%_10%] border border-dashed border-primary/55 pointer-events-none"><span className="absolute -top-5 left-0 text-[9px] uppercase tracking-widest text-primary">Safe area</span></div><div className="absolute top-0 bottom-0 left-[4%] w-[2.5%] bg-muted border-r border-border pointer-events-none"><span className="absolute top-1/2 -rotate-90 text-[8px] tracking-widest text-muted-foreground">BINDING</span></div>{placementFeedback && <div data-testid="placement-feedback" className="absolute inset-0 z-10 flex items-center justify-center bg-destructive/10"><div className="max-w-[85%] rounded-lg bg-card border border-destructive text-destructive px-4 py-3 text-xs font-semibold flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {placementFeedback}</div></div>}{placements.map((p) => { const w = widgets.find((x) => x.id === p.widgetId); return <div key={p.id} onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); const q = point(e); if (q) setDragging({ id: p.id, dx: q.x - p.x, dy: q.y - p.y }); setSelected(p.id); }} onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setDragging(null); }} className={`absolute cursor-move border rounded-md p-1 ${selected === p.id ? "border-primary ring-2 ring-primary/20" : "border-border"} ${p.settings?.visible === false ? "opacity-35" : ""}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%` }}><div className="w-full h-full" dangerouslySetInnerHTML={{ __html: cleanSvg(w?.svgData ?? null) }} /><span className="absolute -top-4 left-0 text-[9px] bg-foreground text-background px-1 rounded">{p.settings?.label || w?.name}</span>{selected === p.id && <span data-testid="handle-resize-placement" onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDragging({ id: p.id, dx: 0, dy: 0, resize: true }); }} className="absolute -right-1 -bottom-1 w-3 h-3 rounded-sm bg-primary cursor-se-resize" />}</div>; })}</div>
        <p className="text-[11px] text-muted-foreground mt-3">Drag a widget onto the page, or click one in the library to place it. Dashed line is the printable safe margin.</p>
      </section>
      <aside className="border-l border-border bg-card p-4 overflow-y-auto max-h-[calc(100vh-190px)] max-2xl:col-span-2 max-2xl:border-l-0 max-2xl:border-t max-xl:col-span-1 max-xl:max-h-none flex flex-col">
        <div>
          <p className="text-[10px] uppercase tracking-[.18em] font-semibold text-muted-foreground mb-3">Widget library</p><Input data-testid="input-widget-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search widgets…" className="bg-background mb-2" /><div className="flex gap-1 mb-3">{(["all", "starter", "owned"] as const).map((f) => <button data-testid={`button-filter-${f}`} key={f} onClick={() => setFilter(f)} className={`text-[10px] px-2 py-1 rounded-full border ${filter === f ? "bg-foreground text-background" : "border-border text-muted-foreground"}`}>{f}</button>)}</div>
          {widgetsLoading ? <div className="space-y-2"><div className="h-16 animate-pulse bg-muted rounded" /><div className="h-16 animate-pulse bg-muted rounded" /></div> : <div className="space-y-2">{visibleWidgets.map((w) => <button data-testid={`button-place-widget-${w.id}`} draggable={!!w.svgData?.trim()} disabled={!w.svgData?.trim()} onDragStart={(e) => { if (w.svgData?.trim()) e.dataTransfer.setData("widget-id", w.id); }} onClick={() => place(w.id, .5, .5)} key={w.id} className={`w-full text-left rounded-lg border border-border bg-background p-2 flex items-center gap-2 ${w.svgData?.trim() ? "hover:border-primary" : "opacity-50 cursor-not-allowed"}`}><div className="w-11 h-11 shrink-0 rounded bg-muted p-1" dangerouslySetInnerHTML={{ __html: cleanSvg(w.svgData) }} /><span className="min-w-0 flex-1"><b className="text-xs block truncate">{w.name}</b><small className="text-[10px] text-muted-foreground">{w.svgData?.trim() ? (w.sizeVariants.join(" · ") || "Flexible size") : "Artwork unavailable"}</small></span><GripVertical className="w-3 h-3 text-muted-foreground" /></button>)}</div>}
        </div>
        {selectedPlacement && (
          <div className="mt-5 pt-4 border-t border-border space-y-3 max-xl:order-first max-xl:mt-0 max-xl:pt-0 max-xl:pb-4 max-xl:mb-4 max-xl:border-t-0 max-xl:border-b">
            <div className="flex justify-between items-center">
              <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Inspector</p><b className="text-sm">{selectedWidget?.name}</b></div>
              <div className="flex gap-1">
                <Button data-testid="button-duplicate-placement" size="icon" variant="ghost" onClick={duplicate}><Copy className="w-4 h-4" /></Button>
                <Button data-testid="button-remove-placement" size="icon" variant="ghost" onClick={remove}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </div>
            <label className="block text-xs font-medium">
              Label
               <Input data-testid="input-placement-label" maxLength={120} value={selectedPlacement.settings?.label ?? ""} onChange={(e) => update(selectedPlacement.id, { settings: { ...selectedPlacement.settings, label: e.target.value } })} className="mt-1 h-8" />
            </label>
            <label className="block text-xs font-medium">
              Palette slot
               <select data-testid="input-palette-slot" value={selectedPlacement.settings?.paletteSlot ?? ""} onChange={(e) => update(selectedPlacement.id, { settings: { ...selectedPlacement.settings, paletteSlot: e.target.value || undefined } })} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"><option value="">Use widget default</option>{PALETTE_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select>
            </label>
            <div className="flex gap-1">
              {(["page", "matching", ...(selectedPageCount > 1 ? ["range" as const] : [])] as const).map((scope) => (
                <button
                  data-testid={`button-scope-${scope}`}
                  key={scope}
                  onClick={() => update(selectedPlacement.id, {
                    scope,
                    ...(scope === "range" ? {
                      rangeStart: Math.min(selectedMaxIndex, Math.max(0, selectedPlacement.rangeStart ?? selectedPlacement.pageIndex)),
                      rangeEnd: Math.min(selectedMaxIndex, Math.max(
                        selectedPlacement.rangeStart ?? selectedPlacement.pageIndex,
                        selectedPlacement.rangeEnd ?? selectedPlacement.pageIndex,
                      )),
                    } : {}),
                  })}
                  className={`flex-1 text-[10px] py-1.5 rounded border ${selectedPlacement.scope === scope ? "bg-foreground text-background" : "border-border"}`}
                >
                  {scope === "page" ? "This page" : scope === "matching" ? "All matching" : "Range"}
                </button>
              ))}
            </div>
            {selectedPlacement.scope === "range" && (
              <div>
                <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-medium">
                  From
                  <Input type="number" min={0} max={selectedMaxIndex} value={Math.min(selectedMaxIndex, Math.max(0, selectedPlacement.rangeStart ?? selectedPlacement.pageIndex))} onChange={(e) => {
                    const rangeStart = Math.min(selectedMaxIndex, Math.max(0, Number(e.target.value)));
                    update(selectedPlacement.id, {
                      rangeStart,
                      rangeEnd: Math.min(selectedMaxIndex, Math.max(rangeStart, selectedPlacement.rangeEnd ?? rangeStart)),
                    });
                  }} className="mt-1 h-8" />
                </label>
                <label className="text-[10px] font-medium">
                  Through
                  <Input type="number" min={Math.max(0, selectedPlacement.rangeStart ?? 0)} max={selectedMaxIndex} value={Math.min(selectedMaxIndex, Math.max(selectedPlacement.rangeStart ?? 0, selectedPlacement.rangeEnd ?? selectedPlacement.pageIndex))} onChange={(e) => update(selectedPlacement.id, { rangeEnd: Math.min(selectedMaxIndex, Math.max(selectedPlacement.rangeStart ?? 0, Number(e.target.value))) })} className="mt-1 h-8" />
                </label>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Choose generated {selectedPlacement.pageType} pages from 0 through {selectedMaxIndex}.</p>
              </div>
            )}
            <button data-testid="button-toggle-visibility" onClick={() => update(selectedPlacement.id, { settings: { ...selectedPlacement.settings, visible: selectedPlacement.settings?.visible === false } })} className="text-xs flex items-center gap-2 text-muted-foreground">
              {selectedPlacement.settings?.visible === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {selectedPlacement.settings?.visible === false ? "Hidden" : "Visible"}
            </button>
          </div>
        )}
      </aside>
    </div>
  </div>;
}