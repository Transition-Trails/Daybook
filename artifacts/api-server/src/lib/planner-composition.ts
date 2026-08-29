import type {
  PlannerComposition,
  PlannerSetup,
  PlannerStyle,
  PlannerPageLayout,
  PlannerPageLayoutAssignment,
  PlannerWidgetPlacement,
} from "@workspace/db";
import { getPlannerPageCounts, PLANNER_PAGE_TYPES, type PlannerPageType } from "@workspace/db/planner-pages";

const PAGE_TYPE_SET = new Set<string>(PLANNER_PAGE_TYPES);
const SAFE_INSET = 0.06;
const MIN_SIZE = 0.05;
const MAX_PLACEMENTS = 100;
const MAX_LAYOUTS = 1_000;
const MAX_LAYOUT_SECTIONS = 24;
const GEOMETRY_EPSILON = 1e-9;
export const PLANNER_BINDING_INSET = 0.1;

type PlacementGeometry = Pick<PlannerWidgetPlacement, "x" | "y" | "w" | "h">;

/**
 * Reflows safe-area geometry into a page-side-aware content box. Coordinates
 * remain normalized, but the binding edge receives extra breathing room.
 */
export function containGeometryForBinding(
  geometry: PlacementGeometry,
  bindingEdge: "left" | "right",
): PlacementGeometry {
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

export class InvalidPlannerCompositionError extends Error {
  readonly code = "INVALID_PLANNER_COMPOSITION";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validatePlannerComposition(input: unknown): PlannerComposition {
  if (!input || typeof input !== "object") {
    throw new InvalidPlannerCompositionError("Composition must be an object");
  }
  const composition = input as Partial<PlannerComposition>;
  if (![1, 2].includes(composition.version as number) || !Array.isArray(composition.placements)) {
    throw new InvalidPlannerCompositionError("Only planner composition versions 1 and 2 are supported");
  }
  if (composition.placements.length > MAX_PLACEMENTS) {
    throw new InvalidPlannerCompositionError(`A planner can contain at most ${MAX_PLACEMENTS} widget placements`);
  }

  const ids = new Set<string>();
  const placements = composition.placements.map((raw, index) => {
    const p = raw as PlannerWidgetPlacement;
    if (!p || typeof p !== "object") {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} is invalid`);
    }
    if (typeof p.id !== "string" || !p.id.trim() || ids.has(p.id)) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} needs a unique id`);
    }
    ids.add(p.id);
    if (typeof p.widgetId !== "string" || !p.widgetId.trim()) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} needs a widget`);
    }
    if (!PAGE_TYPE_SET.has(p.pageType) || !Number.isInteger(p.pageIndex) || p.pageIndex < 0) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} has an unsupported page target`);
    }
    if (![p.x, p.y, p.w, p.h].every(finite)) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} coordinates must be numbers`);
    }
    if (
      p.w < MIN_SIZE || p.h < MIN_SIZE ||
      p.x < SAFE_INSET || p.y < SAFE_INSET ||
      p.x + p.w > 1 - SAFE_INSET || p.y + p.h > 1 - SAFE_INSET
    ) {
      throw new InvalidPlannerCompositionError(
        `Placement ${index + 1} must stay inside the page safe margin`,
      );
    }
    if (!["page", "matching", "range"].includes(p.scope)) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} has an unsupported scope`);
    }
    if (p.layoutSectionId !== undefined && (typeof p.layoutSectionId !== "string" || !p.layoutSectionId.trim())) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} has an invalid layout section`);
    }
    if (p.scope === "range") {
      if (
        !Number.isInteger(p.rangeStart) || !Number.isInteger(p.rangeEnd) ||
        (p.rangeStart as number) < 0 || (p.rangeEnd as number) < (p.rangeStart as number)
      ) {
        throw new InvalidPlannerCompositionError(`Placement ${index + 1} needs a valid page range`);
      }
    }
    if (p.settings !== undefined && (!p.settings || typeof p.settings !== "object")) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} settings are invalid`);
    }
    if (p.settings?.label !== undefined && typeof p.settings.label !== "string") {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} label must be text`);
    }
    if (p.settings?.label && p.settings.label.length > 120) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} label is too long`);
    }
    if (p.settings?.paletteSlot !== undefined && !["accent", "secondary", "tertiary", "ink", "paper"].includes(p.settings.paletteSlot)) {
      throw new InvalidPlannerCompositionError(`Placement ${index + 1} has an unsupported palette slot`);
    }
    return {
      ...p,
      id: p.id.trim(),
      widgetId: p.widgetId.trim(),
      settings: p.settings ? {
        visible: p.settings.visible !== false,
        ...(p.settings.label?.trim() ? { label: p.settings.label.trim() } : {}),
        ...(p.settings.paletteSlot ? { paletteSlot: p.settings.paletteSlot } : {}),
      } : undefined,
    };
  });

  const layouts = composition.version === 2
    ? validateLayoutAssignments((composition as PlannerComposition).layouts ?? [])
    : undefined;
  return {
    version: composition.version,
    placements,
    ...(layouts ? { layouts } : {}),
  } as PlannerComposition;
}

function validateLayout(layout: unknown, label: string): PlannerPageLayout {
  if (!layout || typeof layout !== "object") {
    throw new InvalidPlannerCompositionError(`${label} is invalid`);
  }
  const candidate = layout as PlannerPageLayout;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    throw new InvalidPlannerCompositionError(`${label} needs an id`);
  }
  if (typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 80) {
    throw new InvalidPlannerCompositionError(`${label} needs a name up to 80 characters`);
  }
  if (
    !Array.isArray(candidate.sections) ||
    candidate.sections.length < 1 ||
    candidate.sections.length > MAX_LAYOUT_SECTIONS
  ) {
    throw new InvalidPlannerCompositionError(`${label} needs 1 to ${MAX_LAYOUT_SECTIONS} sections`);
  }
  const sectionIds = new Set<string>();
  const sections = candidate.sections.map((section, index) => {
    if (!section || typeof section !== "object") {
      throw new InvalidPlannerCompositionError(`${label} section ${index + 1} is invalid`);
    }
    if (typeof section.id !== "string" || !section.id.trim() || sectionIds.has(section.id)) {
      throw new InvalidPlannerCompositionError(`${label} section ${index + 1} needs a unique id`);
    }
    sectionIds.add(section.id);
    if (![section.x, section.y, section.w, section.h].every(finite)) {
      throw new InvalidPlannerCompositionError(`${label} section ${index + 1} coordinates must be numbers`);
    }
    if (
      section.w < MIN_SIZE || section.h < MIN_SIZE ||
      section.x < SAFE_INSET || section.y < SAFE_INSET ||
      section.x + section.w > 1 - SAFE_INSET + GEOMETRY_EPSILON ||
      section.y + section.h > 1 - SAFE_INSET + GEOMETRY_EPSILON
    ) {
      throw new InvalidPlannerCompositionError(`${label} section ${index + 1} must stay inside the page safe margin`);
    }
    return { ...section, id: section.id.trim() };
  });
  for (let index = 0; index < sections.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < sections.length; otherIndex += 1) {
      const a = sections[index];
      const b = sections[otherIndex];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        throw new InvalidPlannerCompositionError(`${label} sections cannot overlap`);
      }
    }
  }
  const grids = candidate.grids?.map((grid, index) => {
    if (!grid || typeof grid !== "object") {
      throw new InvalidPlannerCompositionError(`${label} grid ${index + 1} is invalid`);
    }
    if (typeof grid.id !== "string" || !grid.id.trim()) {
      throw new InvalidPlannerCompositionError(`${label} grid ${index + 1} needs an id`);
    }
    if (!["left", "right", "page"].includes(grid.side)) {
      throw new InvalidPlannerCompositionError(`${label} grid ${index + 1} has an invalid side`);
    }
    if (
      !Number.isInteger(grid.rows) || grid.rows < 1 || grid.rows > 6 ||
      !Number.isInteger(grid.columns) || grid.columns < 1 || grid.columns > 4
    ) {
      throw new InvalidPlannerCompositionError(`${label} grid ${index + 1} has invalid dimensions`);
    }
    if (![grid.x, grid.y, grid.w, grid.h].every(finite)) {
      throw new InvalidPlannerCompositionError(`${label} grid ${index + 1} coordinates must be numbers`);
    }
    const minX = grid.side === "left" ? SAFE_INSET : grid.side === "right" ? 0.53 : 0.1;
    const maxX = grid.side === "left" ? 0.47 : 1 - SAFE_INSET;
    if (
      grid.w < MIN_SIZE || grid.h < MIN_SIZE ||
      grid.x < minX || grid.y < SAFE_INSET ||
      grid.x + grid.w > maxX + GEOMETRY_EPSILON ||
      grid.y + grid.h > 1 - SAFE_INSET + GEOMETRY_EPSILON
    ) {
      throw new InvalidPlannerCompositionError(`${label} grid ${index + 1} must stay inside its page safe area`);
    }
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
            ![override.w, override.h].every((value) => finite(value) && value >= MIN_SIZE)
          ) {
            throw new InvalidPlannerCompositionError(`${label} grid ${index + 1} has an invalid cell size override`);
          }
          return [cellId, { w: override.w, h: override.h }];
        }))
      : undefined;
    return {
      ...grid,
      id: grid.id.trim(),
      ...(cellOverrides ? { cellOverrides } : {}),
    };
  });
  if (grids?.length) {
    if (grids.length > 2 || new Set(grids.map((grid) => grid.id)).size !== grids.length) {
      throw new InvalidPlannerCompositionError(`${label} grids need unique ids`);
    }
    if (new Set(grids.map((grid) => grid.side)).size !== grids.length) {
      throw new InvalidPlannerCompositionError(`${label} can only contain one grid per page side`);
    }
    if (grids.reduce((total, grid) => total + grid.rows * grid.columns, 0) !== sections.length) {
      throw new InvalidPlannerCompositionError(`${label} grid cells must match its resolved sections`);
    }
  }
  return { id: candidate.id.trim(), name: candidate.name.trim(), sections, ...(grids?.length ? { grids } : {}) };
}

function validateLayoutAssignments(input: unknown): PlannerPageLayoutAssignment[] {
  if (!Array.isArray(input) || input.length > MAX_LAYOUTS) {
    throw new InvalidPlannerCompositionError(`A planner can contain at most ${MAX_LAYOUTS} page layouts`);
  }
  const ids = new Set<string>();
  return input.map((raw, index) => {
    const assignment = raw as PlannerPageLayoutAssignment;
    const label = `Page layout ${index + 1}`;
    if (!assignment || typeof assignment !== "object") {
      throw new InvalidPlannerCompositionError(`${label} is invalid`);
    }
    if (typeof assignment.id !== "string" || !assignment.id.trim() || ids.has(assignment.id)) {
      throw new InvalidPlannerCompositionError(`${label} needs a unique id`);
    }
    ids.add(assignment.id);
    if (
      !PAGE_TYPE_SET.has(assignment.pageType) ||
      !Number.isInteger(assignment.pageIndex) ||
      assignment.pageIndex < 0
    ) {
      throw new InvalidPlannerCompositionError(`${label} has an unsupported page target`);
    }
    if (!["page", "matching", "range"].includes(assignment.scope)) {
      throw new InvalidPlannerCompositionError(`${label} has an unsupported scope`);
    }
    if (
      assignment.scope === "range" &&
      (!Number.isInteger(assignment.rangeStart) ||
        !Number.isInteger(assignment.rangeEnd) ||
        assignment.rangeStart! < 0 ||
        assignment.rangeEnd! < assignment.rangeStart!)
    ) {
      throw new InvalidPlannerCompositionError(`${label} needs a valid page range`);
    }
    if (
      assignment.placementSections !== undefined &&
      (!assignment.placementSections || typeof assignment.placementSections !== "object" || Array.isArray(assignment.placementSections))
    ) {
      throw new InvalidPlannerCompositionError(`${label} placement sections are invalid`);
    }
    const layout = validateLayout(assignment.layout, label);
    const sectionIds = new Set(layout.sections.map((section) => section.id));
    const placementSections = Object.fromEntries(
      Object.entries(assignment.placementSections ?? {}).map(([placementId, sectionId]) => {
        if (!placementId.trim() || typeof sectionId !== "string" || !sectionIds.has(sectionId)) {
          throw new InvalidPlannerCompositionError(`${label} has an invalid placement section`);
        }
        return [placementId.trim(), sectionId];
      }),
    );
    const pagePlacementSections = Object.fromEntries(
      Object.entries(assignment.pagePlacementSections ?? {}).map(([pageKey, bindings]) => {
        if (!/^[a-z-]+:\d+$/.test(pageKey) || !bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
          throw new InvalidPlannerCompositionError(`${label} has invalid page placement sections`);
        }
        const validatedBindings = Object.fromEntries(Object.entries(bindings).map(([placementId, sectionId]) => {
          if (!placementId.trim() || typeof sectionId !== "string" || !sectionIds.has(sectionId)) {
            throw new InvalidPlannerCompositionError(`${label} has an invalid page placement section`);
          }
          return [placementId.trim(), sectionId];
        }));
        return [pageKey, validatedBindings];
      }),
    );
    if (
      assignment.hiddenPlacementIds !== undefined &&
      (!Array.isArray(assignment.hiddenPlacementIds) ||
        assignment.hiddenPlacementIds.some((id) => typeof id !== "string" || !id.trim()))
    ) {
      throw new InvalidPlannerCompositionError(`${label} hidden placements are invalid`);
    }
    const pageHiddenPlacementIds = Object.fromEntries(
      Object.entries(assignment.pageHiddenPlacementIds ?? {}).map(([pageKey, hiddenIds]) => {
        if (
          !/^[a-z-]+:\d+$/.test(pageKey) ||
          !Array.isArray(hiddenIds) ||
          hiddenIds.some((id) => typeof id !== "string" || !id.trim())
        ) {
          throw new InvalidPlannerCompositionError(`${label} has invalid page hidden placements`);
        }
        return [pageKey, [...new Set(hiddenIds.map((id) => id.trim()))]];
      }),
    );
    return {
      ...assignment,
      id: assignment.id.trim(),
      layout,
      ...(Object.keys(placementSections).length ? { placementSections } : {}),
      ...(Object.keys(pagePlacementSections).length ? { pagePlacementSections } : {}),
      ...(assignment.hiddenPlacementIds?.length
        ? { hiddenPlacementIds: [...new Set(assignment.hiddenPlacementIds.map((id) => id.trim()))] }
        : {}),
      ...(Object.keys(pageHiddenPlacementIds).length ? { pageHiddenPlacementIds } : {}),
    };
  });
}

export function placementAppliesToPage(
  placement: PlannerWidgetPlacement,
  pageType: string,
  pageIndex: number,
): boolean {
  if (placement.pageType !== pageType) return false;
  if (placement.scope === "matching") return true;
  if (placement.scope === "range") {
    return pageIndex >= (placement.rangeStart ?? 0) && pageIndex <= (placement.rangeEnd ?? -1);
  }
  return placement.pageIndex === pageIndex;
}

export function layoutAppliesToPage(
  assignment: PlannerPageLayoutAssignment,
  pageType: string,
  pageIndex: number,
): boolean {
  if (assignment.pageType !== pageType) return false;
  if (assignment.scope === "matching") return true;
  if (assignment.scope === "range") {
    return pageIndex >= (assignment.rangeStart ?? 0) && pageIndex <= (assignment.rangeEnd ?? -1);
  }
  return assignment.pageIndex === pageIndex;
}

export function resolveEffectivePageLayout(
  composition: PlannerComposition | undefined,
  pageType: string,
  pageIndex: number,
): PlannerPageLayout | undefined {
  return resolveEffectivePageLayoutAssignment(composition, pageType, pageIndex)?.layout;
}

export function resolveEffectivePageLayoutAssignment(
  composition: PlannerComposition | undefined,
  pageType: string,
  pageIndex: number,
): PlannerPageLayoutAssignment | undefined {
  const assignments = composition?.layouts ?? [];
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    if (layoutAppliesToPage(assignments[index], pageType, pageIndex)) return assignments[index];
  }
  return undefined;
}

export function placementHiddenByLayout(
  placement: PlannerWidgetPlacement,
  composition: PlannerComposition | undefined,
  pageType: string,
  pageIndex: number,
): boolean {
  const assignment = resolveEffectivePageLayoutAssignment(composition, pageType, pageIndex);
  return assignment?.pageHiddenPlacementIds?.[`${pageType}:${pageIndex}`]?.includes(placement.id)
    ?? assignment?.hiddenPlacementIds?.includes(placement.id)
    ?? false;
}

export function resolvePlacementGeometry(
  placement: PlannerWidgetPlacement,
  composition: PlannerComposition | undefined,
  pageType: string,
  pageIndex: number,
): Pick<PlannerWidgetPlacement, "x" | "y" | "w" | "h"> {
  const assignment = resolveEffectivePageLayoutAssignment(composition, pageType, pageIndex);
  if (assignment) {
    const explicitSectionId =
      assignment.pagePlacementSections?.[`${pageType}:${pageIndex}`]?.[placement.id] ??
      assignment.placementSections?.[placement.id];
    const centerX = placement.x + placement.w / 2;
    const centerY = placement.y + placement.h / 2;
    const section = explicitSectionId
      ? assignment.layout.sections.find((candidate) => candidate.id === explicitSectionId)
      : assignment.layout.sections.find((candidate) =>
          centerX >= candidate.x && centerX <= candidate.x + candidate.w &&
          centerY >= candidate.y && centerY <= candidate.y + candidate.h
        );
    if (section) return section;
  }
  return { x: placement.x, y: placement.y, w: placement.w, h: placement.h };
}

export function validateCompositionTargets(
  composition: PlannerComposition,
  setup: PlannerSetup,
  style: PlannerStyle,
): void {
  const counts = getPlannerPageCounts(setup, style);
  for (const placement of composition.placements) {
    const count = counts[placement.pageType as PlannerPageType] ?? 0;
    if (count === 0 || placement.pageIndex >= count) {
      throw new InvalidPlannerCompositionError(
        `Placement "${placement.id}" targets ${placement.pageType} page ${placement.pageIndex}, but this planner generates no page at that index`,
      );
    }
    if (placement.scope === "range" && placement.rangeEnd! >= count) {
      const maxIndex = count - 1;
      throw new InvalidPlannerCompositionError(
        `Placement "${placement.id}" has a ${placement.pageType} range ending at ${placement.rangeEnd}; this planner generates ${count} ${placement.pageType} page${count === 1 ? "" : "s"} indexed 0 through ${maxIndex}. Choose a Through index from ${placement.rangeStart} through ${maxIndex}`,
      );
    }
  }
  for (const assignment of composition.layouts ?? []) {
    const count = counts[assignment.pageType as PlannerPageType] ?? 0;
    if (count === 0 || assignment.pageIndex >= count) {
      throw new InvalidPlannerCompositionError(
        `Page layout "${assignment.id}" targets ${assignment.pageType} page ${assignment.pageIndex}, but this planner generates no page at that index`,
      );
    }
    if (assignment.scope === "range" && assignment.rangeEnd! >= count) {
      throw new InvalidPlannerCompositionError(
        `Page layout "${assignment.id}" has a range beyond the ${count} generated ${assignment.pageType} pages`,
      );
    }
  }
}