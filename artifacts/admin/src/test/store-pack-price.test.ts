import { describe, expect, it } from "vitest";
import { getPackPriceError, parsePackPrice } from "../pages/store/studios/StorePackStudio";

describe("StorePackStudio price validation", () => {
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
});