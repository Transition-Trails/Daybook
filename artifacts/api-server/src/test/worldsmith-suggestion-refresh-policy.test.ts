import { describe, expect, it } from "vitest";
import { canForceSuggestionRefresh } from "../lib/worldsmith/suggestion-refresh-policy";

describe("WorldSmith suggestion refresh policy", () => {
  it("allows an explicit forced refresh for super admins", () => {
    expect(canForceSuggestionRefresh(true, true)).toBe(true);
  });

  it("keeps the daily cache for every non-super-admin role", () => {
    expect(canForceSuggestionRefresh(true, false)).toBe(false);
    expect(canForceSuggestionRefresh(true, undefined)).toBe(false);
  });

  it("does not regenerate on an ordinary super-admin page load", () => {
    expect(canForceSuggestionRefresh(false, true)).toBe(false);
    expect(canForceSuggestionRefresh(undefined, true)).toBe(false);
  });
});