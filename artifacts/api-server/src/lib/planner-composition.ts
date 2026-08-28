import type {
  PlannerComposition,
  PlannerSetup,
  PlannerStyle,
  PlannerWidgetPlacement,
} from "@workspace/db";
import { getPlannerPageCounts, PLANNER_PAGE_TYPES, type PlannerPageType } from "@workspace/db/planner-pages";

const PAGE_TYPE_SET = new Set<string>(PLANNER_PAGE_TYPES);
const SAFE_INSET = 0.06;
const MIN_SIZE = 0.05;
const MAX_PLACEMENTS = 100;

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
  if (composition.version !== 1 || !Array.isArray(composition.placements)) {
    throw new InvalidPlannerCompositionError("Only planner composition version 1 is supported");
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

  return { version: 1, placements };
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

export function validateCompositionTargets(
  composition: PlannerComposition,
  setup: PlannerSetup,
  style: PlannerStyle,
): void {
  const counts = getPlannerPageCounts(setup, style);
  for (const placement of composition.placements) {
    const count = counts[placement.pageType as PlannerPageType] ?? 0;
    const finalIndex = placement.scope === "range" ? placement.rangeEnd! : placement.pageIndex;
    if (count === 0 || placement.pageIndex >= count || finalIndex >= count) {
      throw new InvalidPlannerCompositionError(
        `Placement "${placement.id}" targets a page that this planner does not contain`,
      );
    }
  }
}