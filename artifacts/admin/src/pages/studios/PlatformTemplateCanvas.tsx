import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Grid2X2, Plus, Save, Search, Trash2 } from "lucide-react";
import { getPlannerPageCounts, getPlannerPageDescriptors, type PlannerPageType } from "@workspace/db/planner-pages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  platformPlannersApi,
  type PlannerWidgetPlacement,
  type PlatformPlannerConfig,
  type StorePlannerComposition,
  type Widget,
} from "@/lib/api";
import type { PlannerCanvasAiContext } from "@/lib/planner-ai-context";

const SAFE_INSET = 0.06;
const SLOT_GAP = 0.018;
const SLOT_COLUMNS = 2;
const SLOT_ROWS = 4;

export type PlannerGridSlot = {
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function createPlannerGridSlots(): PlannerGridSlot[] {
  const usableWidth = 1 - SAFE_INSET * 2;
  const usableHeight = 1 - SAFE_INSET * 2;
  const width = (usableWidth - SLOT_GAP * (SLOT_COLUMNS - 1)) / SLOT_COLUMNS;
  const height = (usableHeight - SLOT_GAP * (SLOT_ROWS - 1)) / SLOT_ROWS;
  return Array.from({ length: SLOT_COLUMNS * SLOT_ROWS }, (_, index) => {
    const row = Math.floor(index / SLOT_COLUMNS);
    const column = index % SLOT_COLUMNS;
    return {
      index,
      row,
      column,
      x: SAFE_INSET + column * (width + SLOT_GAP),
      y: SAFE_INSET + row * (height + SLOT_GAP),
      w: width,
      h: height,
    };
  });
}

export function placementSlotIndex(placement: PlannerWidgetPlacement, slots = createPlannerGridSlots()): number | null {
  const centerX = placement.x + placement.w / 2;
  const centerY = placement.y + placement.h / 2;
  const match = slots.find((slot) =>
    centerX >= slot.x && centerX <= slot.x + slot.w &&
    centerY >= slot.y && centerY <= slot.y + slot.h
  );
  return match?.index ?? null;
}

function cleanSvg(raw: string | null) {
  if (!raw) return "";
  try {
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (doc.querySelector("parsererror")) return "";
    doc.querySelectorAll("script,foreignObject,iframe,object,embed").forEach((node) => node.remove());
    doc.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        if (attribute.name.toLowerCase().startsWith("on") || /javascript:/i.test(attribute.value)) {
          element.removeAttribute(attribute.name);
        }
      });
    });
    return doc.documentElement.outerHTML
      .replaceAll("{{slot:accent}}", "var(--primary)")
      .replaceAll("{{slot:secondary}}", "var(--accent)")
      .replaceAll("{{slot:tertiary}}", "var(--muted)")
      .replaceAll("{{slot:ink}}", "var(--foreground)")
      .replaceAll("{{slot:paper}}", "var(--card)");
  } catch {
    return "";
  }
}

type PageDescriptor = { type: string; index: number; label: string };

function pagesFor(template: PlatformPlannerConfig): PageDescriptor[] {
  const labels: Record<PlannerPageType, string> = {
    cover: "Cover",
    home: "Home",
    year: "Year overview",
    "month-divider": "Month divider",
    "month-calendar": "Month",
    weekly: "Weekly",
    daily: "Daily",
    todo: "To-do",
    notes: "Notes",
    "section-divider": "Section",
    "note-paper": "Note paper",
  };
  const counts = getPlannerPageCounts(template.setup, template.style);
  return getPlannerPageDescriptors(template.setup, template.style).map(({ type, index }) => ({
    type,
    index,
    label: type === "section-divider"
      ? template.style.sections?.[index] || `Section ${index + 1}`
      : counts[type] > 1 ? `${labels[type]} ${index + 1}` : labels[type],
  }));
}

function newPlacementId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `placement-${crypto.randomUUID()}`
    : `placement-${Date.now()}`;
}

export default function PlatformTemplateCanvas({
  template,
  onUpdated,
  preview,
  settings,
  onAiContextChange,
}: {
  template: PlatformPlannerConfig;
  onUpdated: (template: PlatformPlannerConfig) => void;
  preview: ReactNode;
  settings: ReactNode;
  onAiContextChange?: (context: PlannerCanvasAiContext | null) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pages = useMemo(() => pagesFor(template), [template]);
  const slots = useMemo(() => createPlannerGridSlots(), []);
  const [pagePosition, setPagePosition] = useState(0);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"compose" | "preview">("compose");
  const [activeTab, setActiveTab] = useState<"personalization" | "system">("personalization");
  const [composition, setComposition] = useState<StorePlannerComposition>(
    template.style.composition ?? { version: 1, placements: [] },
  );

  useEffect(() => {
    setComposition(template.style.composition ?? { version: 1, placements: [] });
    setPagePosition(0);
    setSelectedPlacementId(null);
  }, [template.id]);

  const { data: widgets = [], isLoading } = useQuery({
    queryKey: ["platform-widgets"],
    queryFn: platformPlannersApi.widgets,
    staleTime: 0,
  });
  const page = pages[pagePosition] ?? pages[0];
  const pagePlacements = useMemo(
    () => composition.placements.filter((placement) =>
      placement.pageType === page?.type &&
      (
        placement.scope === "matching" ||
        (placement.scope === "range" &&
          page.index >= (placement.rangeStart ?? 0) &&
          page.index <= (placement.rangeEnd ?? -1)) ||
        (placement.scope === "page" && placement.pageIndex === page?.index)
      )
    ),
    [composition.placements, page],
  );
  const occupied = useMemo(() => {
    const next = new Map<number, PlannerWidgetPlacement>();
    for (const placement of pagePlacements) {
      const slotIndex = placementSlotIndex(placement, slots);
      if (slotIndex !== null && !next.has(slotIndex)) next.set(slotIndex, placement);
    }
    return next;
  }, [pagePlacements, slots]);
  const filteredWidgets = widgets.filter((widget) =>
    widget.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  useEffect(() => {
    if (!page) {
      onAiContextChange?.(null);
      return;
    }
    onAiContextChange?.({
      activeTab,
      view,
      page: {
        position: pagePosition,
        total: pages.length,
        type: page.type,
        index: page.index,
        label: page.label,
      },
      slots: {
        total: slots.length,
        available: slots.length - occupied.size,
        occupied: Array.from(occupied.entries()).map(([index, placement]) => ({
          index,
          widgetId: placement.widgetId,
          widgetName: widgets.find((widget) => widget.id === placement.widgetId)?.name ?? "Widget",
        })),
      },
      selectedWidget: selectedWidget
        ? { id: selectedWidget.id, name: selectedWidget.name }
        : null,
    });
  }, [
    activeTab,
    onAiContextChange,
    occupied,
    page,
    pagePosition,
    pages.length,
    selectedWidget,
    slots.length,
    view,
    widgets,
  ]);

  const save = useMutation({
    mutationFn: () => platformPlannersApi.patch(template.id, { style: { composition } }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["platform-planners"] });
      onUpdated(updated);
      toast({ title: "Planner layout saved", description: "The preview and generated planner will use these widget slots." });
    },
    onError: (error: Error) => toast({ title: "Layout could not be saved", description: error.message, variant: "destructive" }),
  });

  const addToSlot = (slot: PlannerGridSlot, widgetId = selectedWidgetId) => {
    if (!page || !widgetId || occupied.has(slot.index)) return;
    const placement: PlannerWidgetPlacement = {
      id: newPlacementId(),
      widgetId,
      pageType: page.type,
      pageIndex: page.index,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      scope: "page",
      settings: { visible: true },
    };
    setComposition((current) => ({ ...current, placements: [...current.placements, placement] }));
    setSelectedPlacementId(placement.id);
  };

  const chooseWidget = (widget: Widget) => {
    setSelectedWidgetId(widget.id);
    const firstFree = slots.find((slot) => !occupied.has(slot.index));
    if (firstFree) addToSlot(firstFree, widget.id);
  };

  const removePlacement = (placementId: string) => {
    setComposition((current) => ({
      ...current,
      placements: current.placements.filter((placement) => placement.id !== placementId),
    }));
    setSelectedPlacementId((current) => current === placementId ? null : current);
  };

  if (!page) return null;
  const freeCount = slots.length - occupied.size;

  return (
    <div className="rounded-2xl border bg-background overflow-hidden" data-testid="platform-template-canvas">
      <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[.18em] font-semibold text-muted-foreground">Template canvas</p>
          <h2 className="font-display text-lg font-semibold">{template.name}</h2>
          <p className="text-xs text-muted-foreground">
            Personalize the planner page, then define the structural visual system and output details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            <Save className="w-4 h-4 mr-2" />{save.isPending ? "Saving…" : "Save layout"}
          </Button>
        </div>
      </div>

      <div className="border-b bg-muted/20 px-5 pt-3">
        <div className="flex gap-1" role="tablist" aria-label="Template canvas sections">
          <button
            role="tab"
            aria-selected={activeTab === "personalization"}
            onClick={() => setActiveTab("personalization")}
            className={`border-b-2 px-3 pb-3 pt-1 text-xs font-semibold transition-colors ${
              activeTab === "personalization"
                ? "border-[#1B2A4A] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="template-tab-personalization"
          >
            Planner personalization
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "system"}
            onClick={() => setActiveTab("system")}
            className={`border-b-2 px-3 pb-3 pt-1 text-xs font-semibold transition-colors ${
              activeTab === "system"
                ? "border-[#1B2A4A] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="template-tab-system"
          >
            Structural visual system &amp; output
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        aria-label="Planner personalization"
        hidden={activeTab !== "personalization"}
      >
        <div className="flex items-center justify-end border-b px-5 py-3">
          <div className="rounded-full bg-muted p-1 flex">
            <button
              onClick={() => setView("compose")}
              className={`px-3 py-1.5 rounded-full text-xs ${view === "compose" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}
            >
              Compose
            </button>
            <button
              onClick={() => setView("preview")}
              className={`px-3 py-1.5 rounded-full text-xs ${view === "preview" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}
            >
              PDF preview
            </button>
          </div>
        </div>
        {view === "preview" ? (
          <div className="h-[720px]">{preview}</div>
        ) : (
          <div className="grid grid-cols-[190px_minmax(420px,1fr)_260px] min-h-[720px] max-xl:grid-cols-[160px_minmax(400px,1fr)] max-lg:grid-cols-1">
          <aside className="border-r bg-muted/20 p-3 overflow-y-auto max-h-[720px] max-lg:max-h-48 max-lg:border-r-0 max-lg:border-b">
            <p className="text-[10px] uppercase tracking-[.18em] font-semibold text-muted-foreground mb-3">Planner pages</p>
            <div className="space-y-1.5">
              {pages.map((candidate, index) => (
                <button
                  key={`${candidate.type}-${candidate.index}`}
                  onClick={() => { setPagePosition(index); setSelectedPlacementId(null); }}
                  className={`w-full rounded-lg border p-2 text-left flex items-center gap-2 ${index === pagePosition ? "border-primary bg-background" : "border-transparent hover:border-border"}`}
                >
                  <span className="w-7 h-9 rounded border bg-background flex items-end justify-center pb-1 text-[8px] text-muted-foreground">{index + 1}</span>
                  <span className="text-xs font-medium truncate">{candidate.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="p-5 bg-muted/10 flex flex-col items-center min-w-0">
            <div className="w-full max-w-[560px] flex items-end justify-between mb-3">
              <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Page {pagePosition + 1} of {pages.length}</p><h3 className="font-display text-lg font-semibold">{page.label}</h3></div>
              <div className="text-right"><p className="text-xs font-semibold">{freeCount} of {slots.length} spaces available</p><p className="text-[10px] text-muted-foreground">Delete a widget to free its space</p></div>
            </div>
            <div className="relative w-full max-w-[560px] aspect-[.77] bg-card border shadow-lg overflow-hidden">
              <div className="absolute left-[3%] top-0 bottom-0 w-[2%] bg-muted border-r" />
              <div className="absolute inset-[6%] grid grid-cols-2 grid-rows-4 gap-[1.8%]" data-testid="widget-slot-grid">
                {slots.map((slot) => {
                  const placement = occupied.get(slot.index);
                  const widget = placement ? widgets.find((candidate) => candidate.id === placement.widgetId) : null;
                  const selected = placement?.id === selectedPlacementId;
                  return placement ? (
                    <button
                      key={slot.index}
                      onClick={() => setSelectedPlacementId(placement.id)}
                      className={`relative min-w-0 min-h-0 border rounded-md bg-background/80 p-2 overflow-hidden group ${selected ? "border-primary ring-2 ring-primary/20" : "border-primary/40"}`}
                      data-testid={`occupied-widget-slot-${slot.index}`}
                    >
                      <div className="w-full h-full pointer-events-none" dangerouslySetInnerHTML={{ __html: cleanSvg(widget?.svgData ?? null) }} />
                      <span className="absolute top-1 left-1 right-8 truncate text-left text-[9px] font-semibold bg-white/90 px-1 rounded">{widget?.name ?? "Widget"}</span>
                      <span
                        role="button"
                        aria-label={`Remove ${widget?.name ?? "widget"}`}
                        onClick={(event) => { event.stopPropagation(); removePlacement(placement.id); }}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white border flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </span>
                    </button>
                  ) : (
                    <button
                      key={slot.index}
                      onClick={() => addToSlot(slot)}
                      disabled={!selectedWidgetId}
                      className="border border-dashed border-primary/30 rounded-md bg-background/40 hover:bg-background/80 disabled:hover:bg-background/40 flex flex-col items-center justify-center gap-1 text-primary disabled:text-muted-foreground"
                      data-testid={`empty-widget-slot-${slot.index}`}
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-[10px] font-medium">{selectedWidgetId ? "Add selected widget" : "Choose a widget"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 w-full max-w-[560px] rounded-lg border bg-background px-3 py-2 flex items-center gap-2 text-xs">
              <Grid2X2 className="w-4 h-4 text-primary" />
              <span><b>Bounded layout:</b> every widget occupies one safe space. The grid cannot grow beyond the printable page.</span>
            </div>
          </section>

          <aside className="border-l p-4 overflow-y-auto max-h-[720px] max-xl:col-span-2 max-xl:border-l-0 max-xl:border-t max-lg:col-span-1">
            <p className="text-[10px] uppercase tracking-[.18em] font-semibold text-muted-foreground">Widget library</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Click a widget to place it in the first available space, or select it and choose an empty space.</p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search widgets…" className="pl-9 h-9" />
            </div>
            {freeCount === 0 && <div className="rounded-lg border bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-3">This page is full. Delete a widget before adding another.</div>}
            {isLoading ? <p className="text-xs text-muted-foreground">Loading widgets…</p> : (
              <div className="space-y-2">
                {filteredWidgets.map((widget) => (
                  <button
                    key={widget.id}
                    disabled={freeCount === 0}
                    onClick={() => chooseWidget(widget)}
                    className={`w-full rounded-lg border p-2 flex items-center gap-2 text-left disabled:opacity-45 ${selectedWidgetId === widget.id ? "border-primary bg-primary/5" : "hover:border-primary"}`}
                  >
                    <div className="w-12 h-12 bg-muted rounded p-1 shrink-0" dangerouslySetInnerHTML={{ __html: cleanSvg(widget.svgData) }} />
                    <span className="min-w-0 flex-1"><b className="text-xs block truncate">{widget.name}</b><small className="text-[10px] text-muted-foreground">{widget.sizeVariants.join(" · ") || "Standard slot"}</small></span>
                    {selectedWidgetId === widget.id && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
                {!filteredWidgets.length && <p className="text-xs text-muted-foreground py-6 text-center">No platform widgets match this search.</p>}
              </div>
            )}
          </aside>
          </div>
        )}
      </div>

      <div
        role="tabpanel"
        aria-label="Structural visual system and output details"
        hidden={activeTab !== "system"}
        className="border-t"
      >
        {settings}
      </div>
    </div>
  );
}