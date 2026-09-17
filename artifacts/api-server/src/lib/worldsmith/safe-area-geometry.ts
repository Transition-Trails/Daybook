/**
 * Pure production geometry. Coordinates are measured from the finished trim's
 * top-left corner; bleed is deliberately outside trim and is not part of the
 * critical-content rectangle.
 */
export type PageSide = "recto" | "verso" | "unspecified";
export type BindingEdge = "left" | "right" | "none" | "unresolved";
export type Rect = { x: number; y: number; width: number; height: number };

export type SafeAreaInput = {
  width: number;
  height: number;
  bindingType?: "none" | "disc_bound";
  bleed?: number | null;
  outerSafeMargin?: number | null;
  bindingSafeZone?: number | null;
  bindingEdgeBehavior?: "none" | "left" | "right" | "mirrored";
  pageSide?: PageSide;
};

export type SafeAreas = {
  bleedBoundary: Rect;
  trim: Rect;
  safeContent: Rect | null;
  bindingSafeZone: Rect | null;
  bindingEdge: BindingEdge;
  background: { artwork: Rect };
};

export function resolveBindingEdge(
  behavior: SafeAreaInput["bindingEdgeBehavior"] = "none",
  side: PageSide = "unspecified",
): BindingEdge {
  if (behavior === "left" || behavior === "right") return behavior;
  if (behavior !== "mirrored") return "none";
  if (side === "recto") return "left";
  if (side === "verso") return "right";
  return "unresolved";
}

export function calculateSafeAreas(input: SafeAreaInput): SafeAreas {
  const bleed = Math.max(0, input.bleed ?? 0);
  const margin = Math.max(0, input.outerSafeMargin ?? 0);
  const binding = Math.max(0, input.bindingSafeZone ?? 0);
  const trim = { x: 0, y: 0, width: input.width, height: input.height };
  const edge = input.bindingType === "none"
    ? "none"
    : resolveBindingEdge(input.bindingEdgeBehavior, input.pageSide);
  const leftInset = edge === "left" ? Math.max(margin, binding) : margin;
  const rightInset = edge === "right" ? Math.max(margin, binding) : margin;
  const safeContent: Rect | null = edge === "unresolved" ? null : {
    x: leftInset,
    y: margin,
    width: Math.max(0, input.width - leftInset - rightInset),
    height: Math.max(0, input.height - margin * 2),
  };
  const bindingSafeZone: Rect | null = edge === "left"
    ? { x: 0, y: 0, width: binding, height: input.height }
    : edge === "right"
      ? { x: input.width - binding, y: 0, width: binding, height: input.height }
      : null;
  return {
    bleedBoundary: { x: -bleed, y: -bleed, width: input.width + bleed * 2, height: input.height + bleed * 2 },
    trim,
    safeContent,
    bindingSafeZone,
    bindingEdge: edge,
    // Background artwork is allowed through every boundary, including binding.
    background: { artwork: { x: -bleed, y: -bleed, width: input.width + bleed * 2, height: input.height + bleed * 2 } },
  };
}