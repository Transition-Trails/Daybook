import { describe, expect, it } from "vitest";
import { hexToRgba, parseHexColor } from "../lib/color";

describe("shared colour parser", () => {
  it("normalizes shorthand and full hexadecimal colours", () => {
    expect(parseHexColor("#fff")).toBe("#FFFFFF");
    expect(parseHexColor("#1a2B3c")).toBe("#1A2B3C");
    expect(hexToRgba("#abc")).toEqual({ r: 170, g: 187, b: 204, alpha: 1 });
  });

  it("allows none for paint callers but rejects malformed colours", () => {
    expect(parseHexColor("none")).toBe("none");
    expect(() => parseHexColor("orange")).toThrow("Unsupported colour");
    expect(() => hexToRgba("none")).toThrow("cannot be converted");
  });
});