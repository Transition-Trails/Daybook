import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bookmark, Check, FileUp, GripVertical, Grid2X2, LayoutTemplate, Plus, Save, Search, Trash2, X } from "lucide-react";
import { getPlannerPageCounts, getPlannerPageDescriptors, type PlannerPageType } from "@workspace/db/planner-pages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  platformPlannersApi,
  type PlannerPageLayout,
  type PlannerPageLayoutAssignment,
  type PlannerPageOrderItem,
  type PlannerWidgetPlacement,
  type PlatformPlannerConfig,
  type StorePlannerComposition,
  type Widget,
} from "@/lib/api";
import type { PlannerCanvasAiContext } from "@/lib/planner-ai-context";
import {
  LEGACY_PLANNER_LAYOUT,
  STARTER_PLANNER_LAYOUTS,
  STARTER_WIDGET_COUNTS,
  buildMatchingLayoutPlacementDefaults,
  buildPageLayoutPlacementState,
  containPlannerGeometryForBinding,
  createEditablePlannerGridLayout,
  placementSectionIndex,
  resolvePlannerPageLayout,
  resolvePlannerPageLayoutAssignment,
  updatePlannerGrid,
  validatePlannerPageLayout,
} from "@/lib/planner-page-layouts";

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

function pageKey(page: Pick<PageDescriptor, "type" | "index">) {
  return `${page.type}:${page.index}`;
}

export function reorderPlannerPages<T>(pages: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= pages.length ||
    toIndex >= pages.length
  ) return pages;
  const next = [...pages];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

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
  layoutOrientation,
}: {
  template: PlatformPlannerConfig;
  onUpdated: (template: PlatformPlannerConfig) => void;
  preview: ReactNode;
  settings: ReactNode;
  onAiContextChange?: (context: PlannerCanvasAiContext | null) => void;
  /** Live Build settings value; may be newer than the last saved template. */
  layoutOrientation?: "vertical" | "landscape";
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pages, setPages] = useState<PageDescriptor[]>(() => pagesFor(template));
  const [pagePosition, setPagePosition] = useState(0);
  const [draggedPageKey, setDraggedPageKey] = useState<string | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [selectedGridId, setSelectedGridId] = useState<string | null>(null);
  const [draftGridLayout, setDraftGridLayout] = useState<PlannerPageLayout | null>(null);
  const [gridResize, setGridResize] = useState<{
    gridId: string;
    axis: "width" | "height" | "both";
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"compose" | "preview">("compose");
  const [activeTab, setActiveTab] = useState<"personalization" | "system">("personalization");
  const [layoutSelectorOpen, setLayoutSelectorOpen] = useState(false);
  const [layoutSource, setLayoutSource] = useState<"file" | "starter" | "saved">("starter");
  const [starterWidgetCount, setStarterWidgetCount] = useState(8);
  const [selectedLayout, setSelectedLayout] = useState<PlannerPageLayout>(LEGACY_PLANNER_LAYOUT);
  const [layoutTarget, setLayoutTarget] = useState<"page" | "selected" | "range" | "matching">("page");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [selectedPageKeys, setSelectedPageKeys] = useState<Set<string>>(new Set());
  const [savedLayouts, setSavedLayouts] = useState<PlannerPageLayout[]>(() => {
    try {
      const raw = localStorage.getItem("daybook:planner-page-layouts");
      return raw ? (JSON.parse(raw) as unknown[]).map(validatePlannerPageLayout) : [];
    } catch {
      return [];
    }
  });
  const [saveLayoutName, setSaveLayoutName] = useState("");
  const [importError, setImportError] = useState("");
  const [composition, setComposition] = useState<StorePlannerComposition>(
    template.style.composition ?? { version: 1, placements: [] },
  );
  const pageStructureKey = JSON.stringify({
    setup: template.setup,
    sections: template.style.sections ?? [],
    notePaper: template.style.notePaper ?? null,
  });

  useEffect(() => {
    setComposition(template.style.composition ?? { version: 1, placements: [] });
    setPages(pagesFor(template));
    setPagePosition(0);
    setDraggedPageKey(null);
    setSelectedPlacementId(null);
    setSelectedPageKeys(new Set());
  }, [template.id]);

  useEffect(() => {
    localStorage.setItem("daybook:planner-page-layouts", JSON.stringify(savedLayouts));
  }, [savedLayouts]);

  useEffect(() => {
    setPages((current) => pagesFor({
      ...template,
      style: {
        ...template.style,
        pageOrder: current.map(({ type, index }) => ({ type, index })),
      },
    }));
    setPagePosition((current) => Math.min(current, Math.max(0, pagesFor(template).length - 1)));
  }, [pageStructureKey]);

  const { data: widgets = [], isLoading } = useQuery({
    queryKey: ["platform-widgets"],
    queryFn: platformPlannersApi.widgets,
    staleTime: 0,
  });
  const page = pages[pagePosition] ?? pages[0];
  const isTwoPageSpread = (layoutOrientation ?? template.setup.orientation) === "landscape";
  const resolvedLayout = page
    ? resolvePlannerPageLayout(composition, page.type, page.index)
    : LEGACY_PLANNER_LAYOUT;
  const baseLayout = resolvedLayout.grids?.length || resolvedLayout.id !== LEGACY_PLANNER_LAYOUT.id
    ? resolvedLayout
    : createEditablePlannerGridLayout(
        `editable-${isTwoPageSpread ? "spread" : "page"}`,
        isTwoPageSpread ? "Left and right page grids" : "Page grid",
        isTwoPageSpread,
      );
  const activeLayout = draftGridLayout ?? baseLayout;
  const activeLayoutAssignment = page
    ? resolvePlannerPageLayoutAssignment(composition, page.type, page.index)
    : undefined;
  const slots = useMemo(
    () => activeLayout.sections.map((section, index) => ({
      ...section,
      index,
      row: index,
      column: 0,
    })),
    [activeLayout],
  );
  const pagePlacements = useMemo(
    () => composition.placements.filter((placement) =>
      placement.pageType === page?.type &&
      !(
        activeLayoutAssignment?.pageHiddenPlacementIds?.[`${page?.type}:${page?.index}`]?.includes(placement.id) ??
        activeLayoutAssignment?.hiddenPlacementIds?.includes(placement.id) ??
        false
      ) &&
      (
        placement.scope === "matching" ||
        (placement.scope === "range" &&
          page.index >= (placement.rangeStart ?? 0) &&
          page.index <= (placement.rangeEnd ?? -1)) ||
        (placement.scope === "page" && placement.pageIndex === page?.index)
      )
    ),
    [activeLayoutAssignment, composition.placements, page],
  );
  const occupied = useMemo(() => {
    const next = new Map<number, PlannerWidgetPlacement>();
    for (const placement of pagePlacements) {
      const assignedSectionId =
        activeLayoutAssignment?.pagePlacementSections?.[`${page.type}:${page.index}`]?.[placement.id] ??
        activeLayoutAssignment?.placementSections?.[placement.id];
      const sectionIndex = assignedSectionId
        ? activeLayout.sections.findIndex((section) => section.id === assignedSectionId)
        : -1;
      const slotIndex = sectionIndex >= 0 ? sectionIndex : placementSlotIndex(placement, slots);
      if (slotIndex !== null && !next.has(slotIndex)) next.set(slotIndex, placement);
    }
    return next;
  }, [activeLayout.sections, activeLayoutAssignment, pagePlacements, slots]);
  const filteredWidgets = widgets.filter((widget) =>
    widget.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId) ?? null;
  const selectedGrid = activeLayout.grids?.find((grid) => grid.id === selectedGridId)
    ?? activeLayout.grids?.[0]
    ?? null;
  const starterLayouts = STARTER_PLANNER_LAYOUTS.filter((layout) => layout.sections.length === starterWidgetCount);
  const chooseStarterWidgetCount = (count: number) => {
    const next = STARTER_PLANNER_LAYOUTS.find((layout) => layout.sections.length === count);
    if (!next) return;
    setStarterWidgetCount(count);
    setSelectedLayout(next);
  };
  const moveStarterWidgetCount = (direction: -1 | 1) => {
    const currentIndex = STARTER_WIDGET_COUNTS.findIndex((count) => count === starterWidgetCount);
    const nextIndex = Math.max(0, Math.min(STARTER_WIDGET_COUNTS.length - 1, currentIndex + direction));
    chooseStarterWidgetCount(STARTER_WIDGET_COUNTS[nextIndex]);
  };

  useEffect(() => {
    setDraftGridLayout(null);
    setGridResize(null);
    setSelectedGridId(null);
  }, [pagePosition, isTwoPageSpread]);

  const persistGridLayout = (nextLayout: PlannerPageLayout, removedSectionIds = new Set<string>()) => {
    if (!page) return;
    const affectedPlacementIds = new Set<string>();
    const bindings: Record<string, string> = {};
    for (const [slotIndex, placement] of occupied) {
      const sectionId = slots[slotIndex]?.id;
      if (!sectionId) continue;
      if (removedSectionIds.has(sectionId)) affectedPlacementIds.add(placement.id);
      else if (nextLayout.sections.some((section) => section.id === sectionId)) bindings[placement.id] = sectionId;
    }
    if (
      affectedPlacementIds.size &&
      !window.confirm(
        `${affectedPlacementIds.size} occupied widget space${affectedPlacementIds.size === 1 ? "" : "s"} will be removed. Continue?`,
      )
    ) return;
    const key = pageKey(page);
    const assignment: PlannerPageLayoutAssignment = {
      id: `${newPlacementId().replace("placement-", "layout-")}-grid`,
      pageType: page.type,
      pageIndex: page.index,
      scope: "page",
      layout: structuredClone(nextLayout),
      ...(Object.keys(bindings).length ? { pagePlacementSections: { [key]: bindings } } : {}),
    };
    setComposition((current) => ({
      version: 2,
      placements: current.placements.filter((placement) => !affectedPlacementIds.has(placement.id)),
      layouts: [
        ...(current.layouts ?? []).filter((existing) =>
          !(existing.scope === "page" && existing.pageType === page.type && existing.pageIndex === page.index)
        ),
        assignment,
      ],
    }));
    if (selectedPlacementId && affectedPlacementIds.has(selectedPlacementId)) setSelectedPlacementId(null);
    setDraftGridLayout(null);
  };

  const changeGridCount = (axis: "rows" | "columns", delta: number) => {
    if (!selectedGrid) return;
    const nextLayout = updatePlannerGrid(activeLayout, selectedGrid.id, {
      [axis]: selectedGrid[axis] + delta,
    });
    if (nextLayout === activeLayout) return;
    const nextIds = new Set(nextLayout.sections.map((section) => section.id));
    const removed = new Set(activeLayout.sections.filter((section) => !nextIds.has(section.id)).map((section) => section.id));
    persistGridLayout(nextLayout, removed);
  };

  const beginGridResize = (
    event: PointerEvent<HTMLElement>,
    gridId: string,
    axis: "width" | "height" | "both",
  ) => {
    const grid = activeLayout.grids?.find((candidate) => candidate.id === gridId);
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!grid || !bounds) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedGridId(gridId);
    setDraftGridLayout(activeLayout);
    setGridResize({
      gridId,
      axis,
      startX: event.clientX / bounds.width,
      startY: event.clientY / bounds.height,
      startW: grid.w,
      startH: grid.h,
    });
  };

  const resizeGrid = (event: PointerEvent<HTMLDivElement>) => {
    if (!gridResize || !draftGridLayout) return;
    const bounds = canvasRef.current?.getBoundingClientRect();
    const grid = draftGridLayout.grids?.find((candidate) => candidate.id === gridResize.gridId);
    if (!bounds || !grid) return;
    const dx = event.clientX / bounds.width - gridResize.startX;
    const dy = event.clientY / bounds.height - gridResize.startY;
    const maxRight = grid.side === "left" ? 0.47 : 0.94;
    const maxBottom = 0.94;
    const patch = {
      ...(gridResize.axis !== "height" ? { w: Math.max(0.12, Math.min(maxRight - grid.x, gridResize.startW + dx)) } : {}),
      ...(gridResize.axis !== "width" ? { h: Math.max(0.12, Math.min(maxBottom - grid.y, gridResize.startH + dy)) } : {}),
    };
    setDraftGridLayout(updatePlannerGrid(draftGridLayout, grid.id, patch));
  };

  const finishGridResize = () => {
    if (gridResize && draftGridLayout) persistGridLayout(draftGridLayout);
    setGridResize(null);
  };

  const movePage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const selectedPageKey = page ? pageKey(page) : null;
    setPages((current) => {
      const next = reorderPlannerPages(current, fromIndex, toIndex);
      if (selectedPageKey) {
        const nextPosition = next.findIndex((candidate) => pageKey(candidate) === selectedPageKey);
        if (nextPosition >= 0) setPagePosition(nextPosition);
      }
      return next;
    });
  };

  const openLayoutSelector = () => {
    setSelectedLayout(activeLayout);
    setRangeStart(page.index);
    setRangeEnd(page.index);
    setImportError("");
    setLayoutSelectorOpen(true);
  };

  const targetPages = () => {
    if (layoutTarget === "matching") return pages.filter((candidate) => candidate.type === page.type);
    if (layoutTarget === "range") {
      return pages.filter((candidate) =>
        candidate.type === page.type && candidate.index >= rangeStart && candidate.index <= rangeEnd
      );
    }
    if (layoutTarget === "selected") {
      return pages.filter((candidate) => selectedPageKeys.has(pageKey(candidate)));
    }
    return [page];
  };

  const applyLayout = () => {
    if (layoutTarget === "range" && rangeStart > rangeEnd) {
      toast({ title: "Choose a valid range", description: "The Through page must come after the From page.", variant: "destructive" });
      return;
    }
    const targets = targetPages();
    if (!targets.length) {
      toast({ title: "Choose at least one page", description: "Select pages in the page rail before applying this layout.", variant: "destructive" });
      return;
    }
    const placementState = buildPageLayoutPlacementState(composition.placements, targets, selectedLayout);
    const hiddenIds = [...new Set(Object.values(placementState.pageHiddenPlacementIds).flat())];
    const superseded = (composition.layouts ?? []).filter((existing) =>
      targets.some((target) =>
        existing.pageType === target.type &&
        (
          existing.scope === "matching" ||
          (existing.scope === "range" && target.index >= (existing.rangeStart ?? 0) && target.index <= (existing.rangeEnd ?? -1)) ||
          (existing.scope === "page" && existing.pageIndex === target.index)
        )
      )
    );
    if (
      (hiddenIds.length > 0 || superseded.length > 0) &&
      !window.confirm(
        `${superseded.length ? `This replaces an existing layout on ${targets.length} page${targets.length === 1 ? "" : "s"}. ` : ""}${hiddenIds.length ? `${hiddenIds.length} widget placement${hiddenIds.length === 1 ? "" : "s"} will not fit without overlapping and will be hidden only on the affected pages. ` : ""}Apply this layout?`,
      )
    ) return;

    const assignment = (
      target: PageDescriptor,
      scope: PlannerPageLayoutAssignment["scope"],
      suffix = "",
    ): PlannerPageLayoutAssignment => {
      const matchingDefaults = scope === "matching"
        ? buildMatchingLayoutPlacementDefaults(composition.placements, target.type, selectedLayout)
        : { placementSections: {}, hiddenPlacementIds: [] };
      return {
        id: `${newPlacementId().replace("placement-", "layout-")}${suffix}`,
        layout: structuredClone(selectedLayout),
        pageType: target.type,
        pageIndex: target.index,
        scope,
        ...(scope === "range" ? { rangeStart, rangeEnd } : {}),
        ...(Object.keys(placementState.pagePlacementSections).length
          ? { pagePlacementSections: placementState.pagePlacementSections }
          : {}),
        ...(Object.keys(placementState.pageHiddenPlacementIds).length
          ? { pageHiddenPlacementIds: placementState.pageHiddenPlacementIds }
          : {}),
        ...(Object.keys(matchingDefaults.placementSections).length
          ? { placementSections: matchingDefaults.placementSections }
          : {}),
        ...(matchingDefaults.hiddenPlacementIds.length
          ? { hiddenPlacementIds: matchingDefaults.hiddenPlacementIds }
          : {}),
      };
    };
    let assignments: PlannerPageLayoutAssignment[];
    if (layoutTarget === "matching") {
      assignments = [assignment(page, "matching")];
    } else if (layoutTarget === "range") {
      assignments = [assignment(page, "range")];
    } else {
      assignments = targets.map((target, index) => assignment(target, "page", `-${index}`));
    }
    const targetKeys = new Set(targets.map(pageKey));
    setComposition((current) => ({
      version: 2,
      placements: current.placements,
      layouts: [
        ...(current.layouts ?? []).filter((existing) => {
          const existingTargets = pages.filter((candidate) =>
            existing.pageType === candidate.type &&
            (
              existing.scope === "matching" ||
              (existing.scope === "range" && candidate.index >= (existing.rangeStart ?? 0) && candidate.index <= (existing.rangeEnd ?? -1)) ||
              (existing.scope === "page" && existing.pageIndex === candidate.index)
            )
          );
          return !existingTargets.length || !existingTargets.every((candidate) => targetKeys.has(pageKey(candidate)));
        }),
        ...assignments,
      ],
    }));
    setLayoutSelectorOpen(false);
    toast({
      title: "Page layout applied",
      description: `${selectedLayout.name} created ${selectedLayout.sections.length} bounded section${selectedLayout.sections.length === 1 ? "" : "s"} on ${targets.length} page${targets.length === 1 ? "" : "s"}.`,
    });
  };

  const importLayout = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const layout = validatePlannerPageLayout(parsed);
      setSelectedLayout({ ...layout, id: `file-${Date.now()}` });
      setSaveLayoutName(layout.name);
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The layout file could not be read.");
    }
  };

  const saveSelectedLayout = () => {
    const name = saveLayoutName.trim();
    if (!name) return;
    const saved = validatePlannerPageLayout({
      ...selectedLayout,
      id: `saved-${Date.now()}`,
      name,
    });
    setSavedLayouts((current) => [...current, saved]);
    setSelectedLayout(saved);
    setLayoutSource("saved");
    setSaveLayoutName("");
  };

  const dropPageAt = (toIndex: number) => {
    if (!draggedPageKey) return;
    const fromIndex = pages.findIndex((candidate) => pageKey(candidate) === draggedPageKey);
    movePage(fromIndex, toIndex);
    setDraggedPageKey(null);
  };

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
      layout: {
        id: activeLayout.id,
        name: activeLayout.name,
        sections: activeLayout.sections.length,
      },
      selectedWidget: selectedWidget
        ? { id: selectedWidget.id, name: selectedWidget.name }
        : null,
    });
  }, [
    activeTab,
    activeLayout,
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
    mutationFn: () => platformPlannersApi.patch(template.id, {
      style: {
        composition,
        pageOrder: pages.map(({ type, index }): PlannerPageOrderItem => ({ type, index })),
      },
    }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["platform-planners"] });
      onUpdated(updated);
      toast({ title: "Planner layout saved", description: "The preview and generated planner will use this page order and these widget slots." });
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
  const canvasWidthClass = isTwoPageSpread ? "max-w-[900px]" : "max-w-[560px]";
  const pageNoun = isTwoPageSpread ? "Spread" : "Page";

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openLayoutSelector} data-testid="open-page-layout-selector">
              <LayoutTemplate className="mr-2 h-4 w-4" />
              Page layout
            </Button>
            <span className="text-xs text-muted-foreground">
              {activeLayout.name} · {activeLayout.sections.length} section{activeLayout.sections.length === 1 ? "" : "s"}
            </span>
          </div>
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
            <p className="text-[10px] leading-4 text-muted-foreground mb-3">Drag pages into order, or use the arrow buttons. Save the layout when you’re done.</p>
            <div className="space-y-1.5">
              {pages.map((candidate, index) => {
                const candidateKey = pageKey(candidate);
                const isDragging = draggedPageKey === candidateKey;
                return (
                <div
                  key={`${candidate.type}-${candidate.index}`}
                  draggable
                  onDragStart={(event) => {
                    setDraggedPageKey(candidateKey);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", candidateKey);
                  }}
                  onDragEnd={() => setDraggedPageKey(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropPageAt(index);
                  }}
                  className={`group w-full rounded-lg border p-1 flex items-center gap-1 transition ${index === pagePosition ? "border-primary bg-background" : "border-transparent hover:border-border"} ${isDragging ? "opacity-40 border-dashed" : ""}`}
                  data-testid={`planner-page-row-${candidateKey}`}
                >
                  <GripVertical className="w-3.5 h-3.5 shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => { setPagePosition(index); setSelectedPlacementId(null); }}
                    className="min-w-0 flex-1 p-1 text-left flex items-center gap-2"
                    aria-current={index === pagePosition ? "page" : undefined}
                  >
                    <span className="w-7 h-9 shrink-0 rounded border bg-background flex items-end justify-center pb-1 text-[8px] text-muted-foreground">{index + 1}</span>
                    <span className="text-xs font-medium truncate">{candidate.label}</span>
                  </button>
                  <input
                    type="checkbox"
                    checked={selectedPageKeys.has(candidateKey)}
                    onChange={(event) => {
                      setSelectedPageKeys((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(candidateKey);
                        else next.delete(candidateKey);
                        return next;
                      });
                    }}
                    aria-label={`Select ${candidate.label} for layout changes`}
                    className="h-3.5 w-3.5 shrink-0 accent-primary"
                  />
                  <span className="flex flex-col opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => movePage(index, index - 1)}
                      disabled={index === 0}
                      aria-label={`Move ${candidate.label} up`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePage(index, index + 1)}
                      disabled={index === pages.length - 1}
                      aria-label={`Move ${candidate.label} down`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </span>
                </div>
              )})}
            </div>
          </aside>

          <section className="p-5 bg-muted/10 flex flex-col items-center min-w-0">
            <div className={`w-full ${canvasWidthClass} flex items-end justify-between mb-3`}>
              <div><p className="text-[10px] uppercase tracking-widest text-muted-foreground">{pageNoun} {pagePosition + 1} of {pages.length}</p><h3 className="font-display text-lg font-semibold">{page.label}</h3></div>
              <div className="text-right"><p className="text-xs font-semibold">{freeCount} of {slots.length} spaces available</p><p className="text-[10px] text-muted-foreground">Delete a widget to free its space</p></div>
            </div>
            {selectedGrid && (
              <div className={`w-full ${canvasWidthClass} mb-3 rounded-lg border bg-background p-2 flex flex-wrap items-center gap-2`} data-testid="planner-grid-controls">
                <span className="mr-auto px-1 text-xs font-semibold">
                  {selectedGrid.side === "left" ? "Left page" : selectedGrid.side === "right" ? "Right page" : "Page"} grid
                  <span className="ml-1 font-normal text-muted-foreground">{selectedGrid.rows} × {selectedGrid.columns}</span>
                </span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => changeGridCount("rows", -1)} disabled={selectedGrid.rows <= 1}>
                  − Row
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => changeGridCount("rows", 1)} disabled={activeLayout.sections.length + selectedGrid.columns > 24}>
                  + Row
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => changeGridCount("columns", -1)} disabled={selectedGrid.columns <= 1}>
                  − Column
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => changeGridCount("columns", 1)} disabled={activeLayout.sections.length + selectedGrid.rows > 24}>
                  + Column
                </Button>
              </div>
            )}
            <div
              ref={canvasRef}
              className={`relative w-full ${canvasWidthClass} bg-card border shadow-lg overflow-hidden`}
              style={{ aspectRatio: isTwoPageSpread ? "1.54 / 1" : ".77 / 1" }}
              data-planner-layout={isTwoPageSpread ? "two-page" : "vertical"}
              onPointerMove={resizeGrid}
              onPointerUp={finishGridResize}
              onPointerCancel={finishGridResize}
            >
              {isTwoPageSpread ? (
                <>
                  <div className="absolute inset-y-0 left-0 w-1/2 border-r bg-card" />
                  <div className="absolute inset-y-0 right-0 w-1/2 bg-card" />
                  <div className="absolute inset-[6%_54%_6%_6%] z-20 rounded-sm border border-dashed border-primary/30 pointer-events-none" aria-hidden="true" />
                  <div className="absolute inset-[6%_6%_6%_54%] z-20 rounded-sm border border-dashed border-primary/30 pointer-events-none" aria-hidden="true" />
                  <div className="absolute inset-y-0 left-1/2 z-30 w-[6%] -translate-x-1/2 border-x bg-gradient-to-r from-muted via-background to-muted shadow-md pointer-events-none" data-testid="planner-spread-gutter" />
                  <span className="absolute left-[7%] top-[2.5%] text-[8px] font-bold uppercase tracking-[.16em] text-muted-foreground">Left page</span>
                  <span className="absolute left-[54%] top-[2.5%] text-[8px] font-bold uppercase tracking-[.16em] text-muted-foreground">Right page</span>
                </>
              ) : (
                <div className="absolute left-[3%] top-0 bottom-0 w-[2%] bg-muted border-r" />
              )}
              <div className="absolute inset-0" data-testid="widget-slot-grid" data-layout-id={activeLayout.id}>
                {slots.map((slot) => {
                  const placement = occupied.get(slot.index);
                  const widget = placement ? widgets.find((candidate) => candidate.id === placement.widgetId) : null;
                  const selected = placement?.id === selectedPlacementId;
                  const safeSlot = isTwoPageSpread
                    ? slot
                    : containPlannerGeometryForBinding(slot, pagePosition % 2 === 0 ? "left" : "right");
                  const slotStyle = {
                    left: `${safeSlot.x * 100}%`,
                    top: `${safeSlot.y * 100}%`,
                    width: `${safeSlot.w * 100}%`,
                    height: `${safeSlot.h * 100}%`,
                  };
                  return placement ? (
                    <button
                      key={slot.index}
                      onClick={() => setSelectedPlacementId(placement.id)}
                      style={slotStyle}
                      className={`absolute min-w-0 min-h-0 border rounded-md bg-background/80 p-2 overflow-hidden group ${selected ? "border-primary ring-2 ring-primary/20" : "border-primary/40"}`}
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
                      style={slotStyle}
                      className="absolute border border-dashed border-primary/30 rounded-md bg-background/40 hover:bg-background/80 disabled:hover:bg-background/40 flex flex-col items-center justify-center gap-1 text-primary disabled:text-muted-foreground"
                      data-testid={`empty-widget-slot-${slot.index}`}
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-[10px] font-medium">{selectedWidgetId ? "Add selected widget" : "Choose a widget"}</span>
                    </button>
                  );
                })}
              </div>
              {activeLayout.grids?.map((grid) => {
                const selected = grid.id === selectedGrid?.id;
                return (
                  <div
                    key={grid.id}
                    className={`absolute z-40 rounded-md border-2 pointer-events-none ${selected ? "border-primary" : "border-transparent hover:border-primary/40"}`}
                    style={{ left: `${grid.x * 100}%`, top: `${grid.y * 100}%`, width: `${grid.w * 100}%`, height: `${grid.h * 100}%` }}
                    data-testid={`editable-grid-${grid.side}`}
                  >
                    <button
                      type="button"
                      aria-label={`Select ${grid.side} grid`}
                      className="absolute left-1 top-1 rounded border bg-background/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide pointer-events-auto shadow-sm"
                      onClick={() => setSelectedGridId(grid.id)}
                    >
                      Edit {grid.side}
                    </button>
                    {selected && (
                      <>
                        <button
                          type="button"
                          aria-label="Resize grid width"
                          className="absolute z-10 right-[-6px] top-1/2 h-8 w-3 -translate-y-1/2 rounded-full border-2 border-primary bg-background pointer-events-auto cursor-ew-resize"
                          onPointerDown={(event) => beginGridResize(event, grid.id, "width")}
                        />
                        <button
                          type="button"
                          aria-label="Resize grid height"
                          className="absolute z-10 bottom-[-6px] left-1/2 h-3 w-8 -translate-x-1/2 rounded-full border-2 border-primary bg-background pointer-events-auto cursor-ns-resize"
                          onPointerDown={(event) => beginGridResize(event, grid.id, "height")}
                        />
                        <button
                          type="button"
                          aria-label="Resize grid"
                          className="absolute z-20 bottom-[-7px] right-[-7px] h-4 w-4 rounded-sm border-2 border-primary bg-background pointer-events-auto cursor-nwse-resize"
                          onPointerDown={(event) => beginGridResize(event, grid.id, "both")}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 w-full ${canvasWidthClass} rounded-lg border bg-background px-3 py-2 flex items-center gap-2 text-xs`}>
              <Grid2X2 className="w-4 h-4 text-primary" />
              <span><b>{activeLayout.name}:</b> every widget occupies one of {activeLayout.sections.length} safe sections. The layout cannot grow beyond the printable page.</span>
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

      {layoutSelectorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="page-layout-title"
          data-testid="page-layout-selector"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h3 id="page-layout-title" className="font-display text-lg font-semibold">Choose a page layout</h3>
                <p className="text-xs text-muted-foreground">Choose the sections first, then decide which pages receive them.</p>
              </div>
              <button type="button" onClick={() => setLayoutSelectorOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close page layout selector">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex gap-2 border-b px-5 py-3" role="tablist" aria-label="Layout sources">
              {([
                ["file", FileUp, "From File"],
                ["starter", LayoutTemplate, "Starter"],
                ["saved", Bookmark, "Saved"],
              ] as const).map(([source, Icon, label]) => (
                <button
                  key={source}
                  type="button"
                  role="tab"
                  aria-selected={layoutSource === source}
                  onClick={() => setLayoutSource(source)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${layoutSource === source ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}
                >
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {layoutSource === "file" && (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <FileUp className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-semibold">Import a layout definition</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    Upload JSON containing a name and 1–24 normalized sections. Files are validated against the printable safe area.
                  </p>
                  <label className="mt-4 inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                    Choose JSON file
                    <input type="file" accept=".json,application/json" className="sr-only" onChange={(event) => importLayout(event.target.files?.[0])} />
                  </label>
                  {importError && <p className="mt-3 text-xs font-medium text-destructive">{importError}</p>}
                  {selectedLayout.id.startsWith("file-") && (
                    <p className="mt-3 text-xs font-semibold text-primary">
                      Ready: {selectedLayout.name} · {selectedLayout.sections.length} sections
                    </p>
                  )}
                </div>
              )}

              {layoutSource === "starter" && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Number of widgets</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Choose a count, then select an arrangement.</p>
                    </div>
                    <div className="flex items-center rounded-lg border bg-background p-1" aria-label="Number of widgets">
                      <button
                        type="button"
                        onClick={() => moveStarterWidgetCount(-1)}
                        disabled={starterWidgetCount === STARTER_WIDGET_COUNTS[0]}
                        className="h-7 w-7 rounded text-sm hover:bg-muted disabled:opacity-30"
                        aria-label="Fewer widgets"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-xs font-semibold">{starterWidgetCount}</span>
                      <button
                        type="button"
                        onClick={() => moveStarterWidgetCount(1)}
                        disabled={starterWidgetCount === STARTER_WIDGET_COUNTS[STARTER_WIDGET_COUNTS.length - 1]}
                        className="h-7 w-7 rounded text-sm hover:bg-muted disabled:opacity-30"
                        aria-label="More widgets"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-1" aria-label="Available widget counts">
                    {STARTER_WIDGET_COUNTS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => chooseStarterWidgetCount(count)}
                        className={`h-7 min-w-7 rounded-md px-2 text-[10px] font-semibold ${
                          starterWidgetCount === count
                            ? "bg-primary text-primary-foreground"
                            : "border bg-background text-muted-foreground hover:border-primary hover:text-foreground"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {starterLayouts.map((layout) => (
                      <button
                        key={layout.id}
                        type="button"
                        onClick={() => {
                          setSelectedLayout(layout);
                          setStarterWidgetCount(layout.sections.length);
                        }}
                        className={`rounded-xl border p-2 text-left transition ${selectedLayout.id === layout.id ? "border-primary ring-2 ring-primary/20" : "hover:border-primary"}`}
                        aria-label={`Choose ${layout.name}, ${layout.sections.length} sections`}
                      >
                        <span className="relative block aspect-[.77/1] w-full rounded border bg-card">
                          {layout.sections.map((section) => (
                            <span
                              key={section.id}
                              className="absolute rounded-[2px] border border-primary/50 bg-primary/10"
                              style={{
                                left: `${section.x * 100}%`,
                                top: `${section.y * 100}%`,
                                width: `${section.w * 100}%`,
                                height: `${section.h * 100}%`,
                              }}
                            />
                          ))}
                        </span>
                        <span className="mt-2 block truncate text-[10px] font-semibold">{layout.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {layoutSource === "saved" && (
                <div className="space-y-3">
                  {!savedLayouts.length && (
                    <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                      No saved layouts yet. Choose a Starter or import a file, then save it below.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {savedLayouts.map((layout) => (
                      <div key={layout.id} className={`rounded-xl border p-2 ${selectedLayout.id === layout.id ? "border-primary ring-2 ring-primary/20" : ""}`}>
                        <button type="button" onClick={() => setSelectedLayout(layout)} className="w-full text-left">
                          <span className="text-xs font-semibold">{layout.name}</span>
                          <span className="block text-[10px] text-muted-foreground">{layout.sections.length} sections</span>
                        </button>
                        <div className="mt-2 flex gap-1">
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const name = window.prompt("Rename saved layout", layout.name)?.trim();
                              if (name) setSavedLayouts((current) => current.map((item) => item.id === layout.id ? { ...item, name } : item));
                            }}
                          >
                            Rename
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            className="text-[10px] text-destructive"
                            onClick={() => setSavedLayouts((current) => current.filter((item) => item.id !== layout.id))}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold" htmlFor="layout-target">Apply to</label>
                  <select
                    id="layout-target"
                    value={layoutTarget}
                    onChange={(event) => setLayoutTarget(event.target.value as typeof layoutTarget)}
                    className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-xs"
                  >
                    <option value="page">Current page</option>
                    <option value="selected">Selected pages ({selectedPageKeys.size})</option>
                    <option value="range">A range of {page.type} pages</option>
                    <option value="matching">All {page.type} pages</option>
                  </select>
                  {layoutTarget === "range" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input type="number" min={0} value={rangeStart} onChange={(event) => setRangeStart(Number(event.target.value))} aria-label="Layout range start" className="h-9" />
                      <span className="text-xs text-muted-foreground">through</span>
                      <Input type="number" min={rangeStart} value={rangeEnd} onChange={(event) => setRangeEnd(Number(event.target.value))} aria-label="Layout range end" className="h-9" />
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {targetPages().length} page{targetPages().length === 1 ? "" : "s"} will receive this layout.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold" htmlFor="save-layout-name">Save for reuse</label>
                  <div className="mt-2 flex gap-2">
                    <Input id="save-layout-name" value={saveLayoutName} onChange={(event) => setSaveLayoutName(event.target.value)} placeholder={selectedLayout.name} className="h-9" />
                    <Button type="button" variant="outline" size="sm" onClick={saveSelectedLayout} disabled={!saveLayoutName.trim()}>Save</Button>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">Saved layouts are available when editing other platform planner templates on this device.</p>
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t px-5 py-4">
              <p className="text-xs text-muted-foreground">
                {selectedLayout.name} · {selectedLayout.sections.length} bounded section{selectedLayout.sections.length === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setLayoutSelectorOpen(false)}>Cancel</Button>
                <Button type="button" onClick={applyLayout}>Apply layout</Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}