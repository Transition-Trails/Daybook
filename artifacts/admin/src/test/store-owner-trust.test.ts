import { describe, expect, it } from "vitest";
import { isValidHex } from "../lib/ai";
import { getOwnerEntitlementCopy } from "../pages/store/Dashboard";
import { getThemeSaveBlocker } from "../pages/store/studios/StoreThemeStudio";

describe("store owner trust safeguards", () => {
  it("keeps the owner licence explanation truthful when a licence is inactive", () => {
    expect(getOwnerEntitlementCopy(true)).toMatchObject({
      status: "active",
      summary: expect.stringContaining("new planner generations"),
    });
    expect(getOwnerEntitlementCopy(false)).toMatchObject({
      status: "inactive",
      summary: expect.stringContaining("gated"),
    });
  });

  it("matches the server colour grammar and explains invalid palette saves", () => {
    expect(isValidHex("#abc")).toBe(true);
    expect(isValidHex("#AABBCC")).toBe(true);
    expect(isValidHex("none")).toBe(true);
    expect(isValidHex("#12345")).toBe(false);

    expect(getThemeSaveBlocker("Autumn", ["#abc", "#AABBCC", "#111", "#222", "#333", "#xyz"]))
      .toBe("Fix Paper before saving. Use #RGB, #RRGGBB, or none.");
    expect(getThemeSaveBlocker("Autumn", ["#abc", "#AABBCC", "#111", "#222", "#333", "#444"]))
      .toBeNull();
  });
});