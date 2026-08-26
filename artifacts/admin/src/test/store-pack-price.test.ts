import { describe, expect, it } from "vitest";
import { getPackPriceError, parsePackPrice } from "../lib/studio/packPricing";

describe("pack price validation", () => {
  it("accepts positive whole-cent prices and explains invalid publish prices", () => {
    expect(getPackPriceError("4.99")).toBeNull();
    expect(getPackPriceError("")).toBe("Enter a price to publish.");
    expect(getPackPriceError("0")).toBe("Price must be greater than $0.00.");
    expect(getPackPriceError("4.991")).toBe("Price must be in whole cents (for example, 4.99).");
    expect(getPackPriceError("1e3")).toBe("Price must be in whole cents (for example, 4.99).");
    expect(parsePackPrice("4.99")).toBe(4.99);
    expect(parsePackPrice("1e3")).toBeUndefined();
    expect(parsePackPrice("")).toBeUndefined();
  });
  it("keeps deliberate platform free prices distinct from malformed input", () => {
    expect(parsePackPrice("", { allowFree: true })).toBeNull();
    expect(parsePackPrice("0", { allowFree: true })).toBeNull();
    expect(parsePackPrice("4.99", { allowFree: true })).toBe(4.99);
    expect(parsePackPrice("4.991", { allowFree: true })).toBeUndefined();
    expect(parsePackPrice("1e3", { allowFree: true })).toBeUndefined();
    expect(getPackPriceError("4.991", { allowFree: true }))
      .toBe("Price must be in whole cents (for example, 4.99).");
  });
});