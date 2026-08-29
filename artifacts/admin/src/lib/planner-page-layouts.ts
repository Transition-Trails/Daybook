import type {
  PlannerLayoutSection,
  PlannerPageLayout,
  PlannerPageGrid,
  PlannerPageLayoutAssignment,
  PlannerWidgetPlacement,
  StorePlannerComposition,
} from "@/lib/api";

export const PLANNER_SAFE_INSET = 0.06;
export const PLANNER_BINDING_INSET = 0.1;
export const PLANNER_SPREAD_INNER_INSET = PLANNER_BINDING_INSET / 2;
export const PLANNER_SLOT_GAP = 0.018;
const GEOMETRY_EPSILON = 1e-9;
export const MAX_PLANNER_GRID_ROWS = 6;
export const MAX_PLANNER_GRID_COLUMNS = 4;

export function containPlannerGeometryForBinding(
  geometry: Pick<PlannerLayoutSection, "x" | "y" | "w" | "h">,
  bindingEdge: "left" | "right",
) {
  if (bindingEdge === "left") {
    const shift = Math.max(0, PLANNER_BINDING_INSET - geometry.x);
    return {
      x: geometry.x + shift,
      y: geometry.y,
      w: Math.max(0, geometry.w - shift),
      h: geometry.h,
    };
  }
  const overflow = Math.max(0, geometry.x + geometry.w - (1 - PLANNER_BINDING_INSET));
  return {
    x: geometry.x,
    y: geometry.y,
    w: Math.max(0, geometry.w - overflow),
    h: geometry.h,
  };
}

function gridSections(grid: PlannerPageGrid): PlannerLayoutSection[] {
  const width = (grid.w - PLANNER_SLOT_GAP * (grid.columns - 1)) / grid.columns;
  const height = (grid.h - PLANNER_SLOT_GAP * (grid.rows - 1)) / grid.rows;
  const stable = (value: number) => Math.floor(value * 1_000_000) / 1_000_000;
  return Array.from({ length: grid.rows * grid.columns }, (_, index) => {
    const row = Math.floor(index / grid.columns);
    const column = index % grid.columns;
    const section = {
      id: `${grid.id}-r${row + 1}-c${column + 1}`,
      x: stable(grid.x + column * (width + PLANNER_SLOT_GAP)),
      y: stable(grid.y + row * (height + PLANNER_SLOT_GAP)),
      w: stable(width),
      h: stable(height),
    };
    const override = grid.cellOverrides?.[section.id];
    return override ? { ...section, ...override } : section;
  });
}

export function createEditablePlannerGridLayout(
  id: string,
  name: string,
  spread: boolean,
  rows = 4,
  columns = 2,
): PlannerPageLayout {
  const grids: PlannerPageGrid[] = spread
    ? [
        {
          id: `${id}-left-grid`,
          side: "left",
          rows,
          columns,
          x: PLANNER_SAFE_INSET,
          y: PLANNER_SAFE_INSET,
          w: 0.5 - PLANNER_SPREAD_INNER_INSET - PLANNER_SAFE_INSET,
          h: 0.88,
        },
        {
          id: `${id}-right-grid`,
          side: "right",
          rows,
          columns,
          x: 0.5 + PLANNER_SPREAD_INNER_INSET,
          y: PLANNER_SAFE_INSET,
          w: 0.94 - (0.5 + PLANNER_SPREAD_INNER_INSET),
          h: 0.88,
        },
      ]
    : [{ id: `${id}-page-grid`, side: "page", rows, columns, x: 0.1, y: 0.06, w: 0.84, h: 0.88 }];
  return { id, name, grids, sections: grids.flatMap(gridSections) };
}

export function expandPlannerLayoutForSpread(layout: PlannerPageLayout): PlannerPageLayout {
  if (layout.grids?.length) return layout;
  const xColumns = new Set(layout.sections.map((section) => Math.round(section.x * 1_000_000)));
  const yRows = new Set(layout.sections.map((section) => Math.round(section.y * 1_000_000)));
  const columns = Math.max(1, Math.min(MAX_PLANNER_GRID_COLUMNS, xColumns.size));
  const rows = Math.max(1, Math.min(MAX_PLANNER_GRID_ROWS, yRows.size));
  if (columns * rows !== layout.sections.length) return layout;
  return createEditablePlannerGridLayout(layout.id, layout.name, true, rows, columns);
}

export function updatePlannerGrid(
  layout: PlannerPageLayout,
  gridId: string,
  patch: Partial<Pick<PlannerPageGrid, "rows" | "columns" | "x" | "y" | "w" | "h">>,
): PlannerPageLayout {
  if (!layout.grids?.length) return layout;
  const grids = layout.grids.map((grid) => {
    if (grid.id !== gridId) return grid;
    const minX = grid.side === "left"
      ? PLANNER_SAFE_INSET
      : grid.side === "right"
        ? 0.5 + PLANNER_SPREAD_INNER_INSET
        : 0.1;
    const maxX = grid.side === "left" ? 0.5 - PLANNER_SPREAD_INNER_INSET : 0.94;
    const x = Math.max(minX, Math.min(maxX - 0.12, patch.x ?? grid.x));
    const y = Math.max(PLANNER_SAFE_INSET, Math.min(0.82, patch.y ?? grid.y));
    return {
      ...grid,
      ...patch,
      rows: Math.max(1, Math.min(MAX_PLANNER_GRID_ROWS, patch.rows ?? grid.rows)),
      columns: Math.max(1, Math.min(MAX_PLANNER_GRID_COLUMNS, patch.columns ?? grid.columns)),
      x,
      y,
      w: Math.max(0.12, Math.min(maxX - x, patch.w ?? grid.w)),
      h: Math.max(0.12, Math.min(1 - PLANNER_SAFE_INSET - y, patch.h ?? grid.h)),
      ...(grid.cellOverrides ? { cellOverrides: undefined } : {}),
    };
  });
  if (grids.reduce((total, grid) => total + grid.rows * grid.columns, 0) > 24) return layout;
  return { ...layout, grids, sections: grids.flatMap(gridSections) };
}

export function updatePlannerCell(
  layout: PlannerPageLayout,
  cellId: string,
  patch: Pick<PlannerLayoutSection, "w" | "h">,
): PlannerPageLayout {
  if (!layout.grids?.length) return layout;
  const grid = layout.grids.find((candidate) =>
    layout.sections.some((section) => section.id === cellId && section.id.startsWith(`${candidate.id}-r`))
  );
  const current = layout.sections.find((section) => section.id === cellId);
  if (!grid || !current) return layout;

  const gridRight = grid.x + grid.w;
  const gridBottom = grid.y + grid.h;
  const peers = layout.sections.filter((section) =>
    section.id !== cellId && section.id.startsWith(`${grid.id}-r`)
  );
  const horizontalPeers = peers.filter((section) =>
    current.y < section.y + section.h && current.y + current.h > section.y && section.x > current.x
  );
  const verticalPeers = peers.filter((section) =>
    current.x < section.x + section.w && current.x + current.w > section.x && section.y > current.y
  );
  const maxRight = Math.min(
    gridRight,
    ...horizontalPeers.map((section) => section.x - PLANNER_SLOT_GAP),
  );
  const maxBottom = Math.min(
    gridBottom,
    ...verticalPeers.map((section) => section.y - PLANNER_SLOT_GAP),
  );
  const w = Math.max(0.05, Math.min(maxRight - current.x, patch.w));
  const h = Math.max(0.05, Math.min(maxBottom - current.y, patch.h));
  const grids = layout.grids.map((candidate) => candidate.id !== grid.id
    ? candidate
    : {
        ...candidate,
        cellOverrides: {
          ...(candidate.cellOverrides ?? {}),
          [cellId]: { w, h },
        },
      });
  return { ...layout, grids, sections: grids.flatMap(gridSections) };
}

function gridLayout(id: string, name: string, columns: number, rows: number): PlannerPageLayout {
  const usableWidth = 1 - PLANNER_SAFE_INSET * 2;
  const usableHeight = 1 - PLANNER_SAFE_INSET * 2;
  const width = (usableWidth - PLANNER_SLOT_GAP * (columns - 1)) / columns;
  const height = (usableHeight - PLANNER_SLOT_GAP * (rows - 1)) / rows;
  const stable = (value: number) => Math.floor(value * 1_000_000) / 1_000_000;
  return {
    id,
    name,
    sections: Array.from({ length: columns * rows }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      return {
        id: `section-${index + 1}`,
        x: stable(PLANNER_SAFE_INSET + column * (width + PLANNER_SLOT_GAP)),
        y: stable(PLANNER_SAFE_INSET + row * (height + PLANNER_SLOT_GAP)),
        w: stable(width),
        h: stable(height),
      };
    }),
  };
}

function customLayout(
  id: string,
  name: string,
  sections: Array<Omit<PlannerLayoutSection, "id">>,
): PlannerPageLayout {
  return {
    id,
    name,
    sections: sections.map((section, index) => ({ ...section, id: `section-${index + 1}` })),
  };
}

export const LEGACY_PLANNER_LAYOUT = gridLayout("legacy-eight", "Eight spaces", 2, 4);

function countLayout(id: string, name: string, count: number, columns: number) {
  const rows = Math.ceil(count / columns);
  const layout = gridLayout(id, name, columns, rows);
  return {
    ...layout,
    sections: layout.sections.slice(0, count),
  };
}

function featureLayout(id: string, name: string, count: number) {
  if (count < 3) return countLayout(id, name, count, count);
  const smallCount = count - 1;
  const columns = Math.ceil(Math.sqrt(smallCount));
  const rows = Math.ceil(smallCount / columns);
  const featureHeight = 0.32;
  const lowerY = PLANNER_SAFE_INSET + featureHeight + PLANNER_SLOT_GAP;
  const lowerHeight = 1 - PLANNER_SAFE_INSET - lowerY;
  const width = (1 - PLANNER_SAFE_INSET * 2 - PLANNER_SLOT_GAP * (columns - 1)) / columns;
  const height = (lowerHeight - PLANNER_SLOT_GAP * (rows - 1)) / rows;
  const stable = (value: number) => Math.floor(value * 1_000_000) / 1_000_000;
  return {
    id,
    name,
    sections: [
      { id: "section-1", x: PLANNER_SAFE_INSET, y: PLANNER_SAFE_INSET, w: 1 - PLANNER_SAFE_INSET * 2, h: featureHeight },
      ...Array.from({ length: smallCount }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return {
          id: `section-${index + 2}`,
          x: stable(PLANNER_SAFE_INSET + column * (width + PLANNER_SLOT_GAP)),
          y: stable(lowerY + row * (height + PLANNER_SLOT_GAP)),
          w: stable(width),
          h: stable(height),
        };
      }),
    ],
  };
}

/** Starter catalog mirrors the supplied Planify-style widget-count groups. 10 is intentionally absent. */
export const STARTER_WIDGET_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12] as const;

export const STARTER_PLANNER_LAYOUTS: PlannerPageLayout[] = STARTER_WIDGET_COUNTS.flatMap((count) => {
  const layouts = [
    countLayout(`starter-${count}-grid`, `${count} widget${count === 1 ? "" : "s"} · grid`, count, count <= 4 ? 2 : 3),
  ];
  if (count > 1) {
    layouts.push(countLayout(`starter-${count}-wide`, `${count} widgets · wide`, count, Math.min(count, 4)));
  }
  if (count >= 3 && count <= 9) {
    layouts.push(featureLayout(`starter-${count}-feature`, `${count} widgets · feature`, count));
  }
  return layouts;
});

function overlaps(a: PlannerLayoutSection, b: PlannerLayoutSection) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function validatePlannerPageLayout(input: unknown): PlannerPageLayout {
  if (!input || typeof input !== "object") throw new Error("Layout file must contain an object.");
  const candidate = input as Partial<PlannerPageLayout>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name || name.length > 80) throw new Error("Layout needs a name up to 80 characters.");
  if (!Array.isArray(candidate.sections) || candidate.sections.length < 1 || candidate.sections.length > 24) {
    throw new Error("Layout needs between 1 and 24 sections.");
  }
  const ids = new Set<string>();
  const sections = candidate.sections.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Section ${index + 1} is invalid.`);
    const section = raw as PlannerLayoutSection;
    const id = typeof section.id === "string" && section.id.trim() ? section.id.trim() : `section-${index + 1}`;
    if (ids.has(id)) throw new Error(`Section ${index + 1} has a duplicate id.`);
    ids.add(id);
    if (![section.x, section.y, section.w, section.h].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Section ${index + 1} coordinates must be numbers.`);
    }
    if (
      section.w < 0.05 || section.h < 0.05 ||
      section.x < PLANNER_SAFE_INSET || section.y < PLANNER_SAFE_INSET ||
      section.x + section.w > 1 - PLANNER_SAFE_INSET + GEOMETRY_EPSILON ||
      section.y + section.h > 1 - PLANNER_SAFE_INSET + GEOMETRY_EPSILON
    ) {
      throw new Error(`Section ${index + 1} must stay inside the printable safe area.`);
    }
    return { id, x: section.x, y: section.y, w: section.w, h: section.h };
  });
  for (let index = 0; index < sections.length; index += 1) {
    for (let other = index + 1; other < sections.length; other += 1) {
      if (overlaps(sections[index], sections[other])) throw new Error("Layout sections cannot overlap.");
    }
  }
  const id = typeof candidate.id === "string" && candidate.id.trim()
    ? candidate.id.trim()
    : `imported-${Date.now()}`;
  const grids = candidate.grids?.map((grid, index) => {
    if (!grid || typeof grid !== "object") throw new Error(`Grid ${index + 1} is invalid.`);
    if (
      typeof grid.id !== "string" || !grid.id.trim() ||
      !["left", "right", "page"].includes(grid.side) ||
      !Number.isInteger(grid.rows) || grid.rows < 1 || grid.rows > MAX_PLANNER_GRID_ROWS ||
      !Number.isInteger(grid.columns) || grid.columns < 1 || grid.columns > MAX_PLANNER_GRID_COLUMNS ||
      ![grid.x, grid.y, grid.w, grid.h].every((value) => typeof value === "number" && Number.isFinite(value))
    ) throw new Error(`Grid ${index + 1} is invalid.`);
    const validCellIds = new Set(
      Array.from({ length: grid.rows * grid.columns }, (_, cellIndex) => {
        const row = Math.floor(cellIndex / grid.columns) + 1;
        const column = cellIndex % grid.columns + 1;
        return `${grid.id}-r${row}-c${column}`;
      }),
    );
    const cellOverrides = grid.cellOverrides
      ? Object.fromEntries(Object.entries(grid.cellOverrides).map(([cellId, override]) => {
          if (
            !validCellIds.has(cellId) ||
            !override || typeof override !== "object" ||
            ![override.w, override.h].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0.05)
          ) throw new Error(`Grid ${index + 1} has an invalid cell size override.`);
          return [cellId, { w: override.w, h: override.h }];
        }))
      : undefined;
    return { ...grid, id: grid.id.trim(), ...(cellOverrides ? { cellOverrides } : {}) };
  });
  if (grids?.length) {
    if (
      grids.length > 2 ||
      new Set(grids.map((grid) => grid.id)).size !== grids.length ||
      new Set(grids.map((grid) => grid.side)).size !== grids.length ||
      grids.reduce((total, grid) => total + grid.rows * grid.columns, 0) !== sections.length
    ) throw new Error("Editable grids must have unique page sides and match the resolved sections.");
  }
  return { id, name, sections, ...(grids?.length ? { grids } : {}) };
}

export function assignmentAppliesToPage(
  assignment: PlannerPageLayoutAssignment,
  pageType: string,
  pageIndex: number,
) {
  if (assignment.pageType !== pageType) return false;
  if (assignment.scope === "matching") return true;
  if (assignment.scope === "range") {
    return pageIndex >= (assignment.rangeStart ?? 0) && pageIndex <= (assignment.rangeEnd ?? -1);
  }
  return assignment.pageIndex === pageIndex;
}

export function resolvePlannerPageLayout(
  composition: StorePlannerComposition,
  pageType: string,
  pageIndex: number,
): PlannerPageLayout {
  return resolvePlannerPageLayoutAssignment(composition, pageType, pageIndex)?.layout ?? LEGACY_PLANNER_LAYOUT;
}

export function resolvePlannerPageLayoutAssignment(
  composition: StorePlannerComposition,
  pageType: string,
  pageIndex: number,
): PlannerPageLayoutAssignment | undefined {
  const layouts = composition.layouts ?? [];
  for (let index = layouts.length - 1; index >= 0; index -= 1) {
    if (assignmentAppliesToPage(layouts[index], pageType, pageIndex)) return layouts[index];
  }
  return undefined;
}

export function placementSectionIndex(
  placement: { x: number; y: number; w: number; h: number },
  sections: PlannerLayoutSection[],
): number | null {
  const centerX = placement.x + placement.w / 2;
  const centerY = placement.y + placement.h / 2;
  const match = sections.find((section) =>
    centerX >= section.x && centerX <= section.x + section.w &&
    centerY >= section.y && centerY <= section.y + section.h
  );
  return match ? sections.indexOf(match) : null;
}

type LayoutTargetPage = { type: string; index: number };

function placementApplies(
  placement: PlannerWidgetPlacement,
  page: LayoutTargetPage,
) {
  if (placement.pageType !== page.type) return false;
  if (placement.scope === "matching") return true;
  if (placement.scope === "range") {
    return page.index >= (placement.rangeStart ?? 0) && page.index <= (placement.rangeEnd ?? -1);
  }
  return placement.pageIndex === page.index;
}

export function buildPageLayoutPlacementState(
  placements: PlannerWidgetPlacement[],
  targets: LayoutTargetPage[],
  layout: PlannerPageLayout,
) {
  const pagePlacementSections: Record<string, Record<string, string>> = {};
  const pageHiddenPlacementIds: Record<string, string[]> = {};
  for (const target of targets) {
    const key = `${target.type}:${target.index}`;
    const occupiedSections = new Set<string>();
    const bindings: Record<string, string> = {};
    const hidden: string[] = [];
    for (const placement of placements) {
      if (!placementApplies(placement, target)) continue;
      const sectionIndex = placementSectionIndex(placement, layout.sections);
      const sectionId = sectionIndex === null ? null : layout.sections[sectionIndex].id;
      if (!sectionId || occupiedSections.has(sectionId)) {
        hidden.push(placement.id);
        continue;
      }
      occupiedSections.add(sectionId);
      bindings[placement.id] = sectionId;
    }
    if (Object.keys(bindings).length) pagePlacementSections[key] = bindings;
    if (hidden.length) pageHiddenPlacementIds[key] = hidden;
  }
  return { pagePlacementSections, pageHiddenPlacementIds };
}

export function buildMatchingLayoutPlacementDefaults(
  placements: PlannerWidgetPlacement[],
  pageType: string,
  layout: PlannerPageLayout,
) {
  const matchingPlacements = placements.filter((placement) =>
    placement.pageType === pageType && placement.scope === "matching"
  );
  const key = `${pageType}:0`;
  const state = buildPageLayoutPlacementState(matchingPlacements, [{ type: pageType, index: 0 }], layout);
  return {
    placementSections: state.pagePlacementSections[key] ?? {},
    hiddenPlacementIds: state.pageHiddenPlacementIds[key] ?? [],
  };
}