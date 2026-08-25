import { describe, expect, it } from "vitest";
import { isPurchasableCatalogItem } from "../lib/catalog-commerce.js";

describe("catalog commerce policy", () => {
  it("requires a supported secure-delivery type and a positive integer-cent price", () => {
    expect(isPurchasableCatalogItem("edition", { digitalPriceCents: 1299 })).toBe(true);
    expect(isPurchasableCatalogItem("edition", { digitalPriceCents: 0 })).toBe(false);
    expect(isPurchasableCatalogItem("edition", { digitalPriceCents: null })).toBe(false);
    expect(isPurchasableCatalogItem("edition", {})).toBe(false);
    expect(isPurchasableCatalogItem("edition", { digitalPriceCents: 12.5 })).toBe(false);
    expect(isPurchasableCatalogItem("theme", { digitalPriceCents: 1299 })).toBe(false);
  });
});