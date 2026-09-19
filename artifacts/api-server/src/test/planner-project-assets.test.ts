import { describe, expect, it } from "vitest";
import { buildManagedAssetSvg, projectAssetIdFromWidgetId } from "../lib/planner-project-assets";

describe("planner project asset render contract", () => {
  it("accepts only the reserved project asset widget prefix", () => {
    expect(projectAssetIdFromWidgetId("project-asset:asset-1")).toBe("asset-1");
    expect(projectAssetIdFromWidgetId("widget-asset-1")).toBeNull();
    expect(projectAssetIdFromWidgetId("project-asset:")).toBeNull();
  });

  it("creates an in-memory SVG wrapper without changing the persisted asset contract", () => {
    const svg = buildManagedAssetSvg("image/png", new Uint8Array([137, 80, 78, 71]));
    expect(svg).toContain("data:image/png;base64,iVBORw==");
    expect(svg).toContain('preserveAspectRatio="none"');
  });
});