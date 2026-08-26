import { describe, expect, it } from "vitest";
import { isNonNegativeWholeCentAmount } from "../lib/money";

describe("platform sticker-pack price validation", () => {
  it("accepts representative whole-cent amounts despite binary floating point", () => {
    expect(isNonNegativeWholeCentAmount(0)).toBe(true);
    expect(isNonNegativeWholeCentAmount(0.07)).toBe(true);
    expect(isNonNegativeWholeCentAmount(0.29)).toBe(true);
    expect(isNonNegativeWholeCentAmount(19.99)).toBe(true);
  });

  it("rejects negative, non-finite, and fractional-cent amounts", () => {
    expect(isNonNegativeWholeCentAmount(-0.01)).toBe(false);
    expect(isNonNegativeWholeCentAmount(4.991)).toBe(false);
    expect(isNonNegativeWholeCentAmount(Number.NaN)).toBe(false);
    expect(isNonNegativeWholeCentAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});