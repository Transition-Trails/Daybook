import { describe, expect, it } from "vitest";
import { calculateSafeAreas, resolveBindingEdge } from "../lib/worldsmith/safe-area-geometry";

describe("production profile safe-area geometry", () => {
  it("mirrors the binding edge without guessing an unspecified page side", () => {
    expect(resolveBindingEdge("mirrored", "recto")).toBe("left");
    expect(resolveBindingEdge("mirrored", "verso")).toBe("right");
    expect(resolveBindingEdge("mirrored", "unspecified")).toBe("unresolved");
  });

  it("uses the larger of the outer margin and binding zone on the binding edge", () => {
    const recto = calculateSafeAreas({
      width: 7,
      height: 9.25,
      bindingType: "disc_bound",
      bleed: 0.125,
      outerSafeMargin: 0.25,
      bindingSafeZone: 0.75,
      bindingEdgeBehavior: "mirrored",
      pageSide: "recto",
    });
    expect(recto.safeContent).toEqual({ x: 0.75, y: 0.25, width: 6, height: 8.75 });
    expect(recto.bindingSafeZone).toEqual({ x: 0, y: 0, width: 0.75, height: 9.25 });
    expect(recto.background.artwork).toEqual(recto.bleedBoundary);
  });

  it("flips the safe-content inset and binding zone for verso", () => {
    const verso = calculateSafeAreas({
      width: 7,
      height: 9.25,
      bindingType: "disc_bound",
      outerSafeMargin: 0.25,
      bindingSafeZone: 0.75,
      bindingEdgeBehavior: "mirrored",
      pageSide: "verso",
    });
    expect(verso.safeContent).toEqual({ x: 0.25, y: 0.25, width: 6, height: 8.75 });
    expect(verso.bindingSafeZone).toEqual({ x: 6.25, y: 0, width: 0.75, height: 9.25 });
  });

  it("does not expose a consumable safe rectangle while a mirrored edge is unresolved", () => {
    const unresolved = calculateSafeAreas({
      width: 7,
      height: 9.25,
      bindingType: "disc_bound",
      outerSafeMargin: 0.25,
      bindingSafeZone: 0.75,
      bindingEdgeBehavior: "mirrored",
      pageSide: "unspecified",
    });
    expect(unresolved.bindingEdge).toBe("unresolved");
    expect(unresolved.safeContent).toBeNull();
    expect(unresolved.bindingSafeZone).toBeNull();
  });

  it("ignores binding geometry for unbound output", () => {
    const unbound = calculateSafeAreas({
      width: 7,
      height: 9.25,
      bindingType: "none",
      outerSafeMargin: 0.25,
      bindingSafeZone: 0.75,
      bindingEdgeBehavior: "mirrored",
      pageSide: "recto",
    });
    expect(unbound.bindingEdge).toBe("none");
    expect(unbound.safeContent).toEqual({ x: 0.25, y: 0.25, width: 6.5, height: 8.75 });
    expect(unbound.bindingSafeZone).toBeNull();
  });
});