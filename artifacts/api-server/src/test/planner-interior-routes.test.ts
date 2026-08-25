import { describe, expect, it } from "vitest";
import { canPinInterior, previewOptionsFromQuery } from "../routes/planner-interiors";

describe("planner interior route primitives", () => {
  it("allows same-store and house-store interiors, but not cross-seller pins", () => {
    expect(canPinInterior("store-alpha", "store-alpha")).toBe(true);
    expect(canPinInterior("store-alpha", "store-house")).toBe(true);
    expect(canPinInterior("store-beta", "store-alpha")).toBe(false);
  });

  it("reads PDF display options from URL query parameters for GET and POST parity", () => {
    expect(previewOptionsFromQuery({
      title: "2027 Planner",
      subtitle: "A calm year",
      year: "2027",
      themeColors: ["#fff", "#1B2A4A"],
    })).toEqual({
      title: "2027 Planner",
      subtitle: "A calm year",
      year: 2027,
      themeColors: ["#fff", "#1B2A4A"],
    });
    expect(previewOptionsFromQuery({ themeColors: "#fff, #C87560", year: "20xx" })).toEqual({
      title: undefined,
      subtitle: undefined,
      year: undefined,
      themeColors: ["#fff", "#C87560"],
    });
    expect(previewOptionsFromQuery({ year: 2028 })).toMatchObject({ year: 2028 });
  });
});