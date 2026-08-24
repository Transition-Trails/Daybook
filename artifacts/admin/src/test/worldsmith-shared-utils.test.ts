import { beforeEach, describe, expect, it } from "vitest";
import { resolveCostEstimate, resolveProductionCostEstimate } from "@/lib/worldsmith/cost-estimate";
import { normalizeNotionId } from "@/lib/worldsmith/notion-id";
import { isRecommendationCode } from "@/lib/worldsmith/recommendations";
import { worldsmithStorage, worldsmithStorageKeys } from "@/lib/worldsmith/storage";

describe("WorldSmith shared admin utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes valid Notion IDs and rejects blank or malformed input", () => {
    expect(normalizeNotionId("https://www.notion.so/name-0123456789abcdef0123456789abcdef")).toBe(
      "01234567-89ab-cdef-0123-456789abcdef",
    );
    expect(normalizeNotionId("")).toBeNull();
    expect(normalizeNotionId("not-a-notion-id")).toBeNull();
  });

  it("classifies only known modernization warnings as recommendations", () => {
    expect(isRecommendationCode("OPTIONAL_PROMPT_MODULE")).toBe(true);
    expect(isRecommendationCode("CANON_CONFLICT")).toBe(false);
    expect(isRecommendationCode(undefined)).toBe(false);
  });

  it("migrates legacy selections and drafts without overwriting canonical values", () => {
    localStorage.setItem("ws:editorial:world", "legacy-world");
    localStorage.setItem("daybook:style-guide-draft:legacy-world", JSON.stringify({ form: { name: "Draft" }, section: 2 }));

    expect(worldsmithStorage.selectedWorld()).toBe("legacy-world");
    expect(localStorage.getItem(worldsmithStorageKeys.selectedWorld)).toBe("legacy-world");
    expect(localStorage.getItem("ws:editorial:world")).toBeNull();

    expect(worldsmithStorage.styleGuideDraft("legacy-world")).toContain("Draft");
    expect(localStorage.getItem(worldsmithStorageKeys.styleGuideDraft("legacy-world"))).toContain("Draft");
    expect(localStorage.getItem("daybook:style-guide-draft:legacy-world")).toBeNull();

    localStorage.setItem(worldsmithStorageKeys.selectedWorld, "canonical-world");
    localStorage.setItem("ws:editorial:world", "older-world");
    expect(worldsmithStorage.selectedWorld()).toBe("canonical-world");
  });

  it("clears canonical and legacy values so old settings cannot return", () => {
    localStorage.setItem(worldsmithStorageKeys.selectedCollection, "canonical-collection");
    localStorage.setItem("ws:editorial:collection", "legacy-collection");
    localStorage.setItem(worldsmithStorageKeys.styleGuideDraft("world-1"), "canonical-draft");
    localStorage.setItem("daybook:style-guide-draft:world-1", "legacy-draft");

    worldsmithStorage.clearSelectedCollection();
    worldsmithStorage.clearStyleGuideDraft("world-1");

    expect(worldsmithStorage.selectedCollection()).toBeNull();
    expect(worldsmithStorage.styleGuideDraft("world-1")).toBeNull();
    expect(localStorage.getItem("ws:editorial:collection")).toBeNull();
    expect(localStorage.getItem("daybook:style-guide-draft:world-1")).toBeNull();
  });

  it("falls back safely when browser storage is blocked", () => {
    const originalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => { throw new DOMException("Storage blocked", "SecurityError"); },
    });

    try {
      expect(worldsmithStorage.selectedWorld()).toBeNull();
      expect(worldsmithStorage.compilerAutoPreview()).toBeNull();
      expect(worldsmithStorage.setDrawerCollapsed(true)).toBe(false);
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalStorage,
      });
    }
  });

  it("shows unavailable cost metadata until explicit pricing provenance exists", () => {
    expect(resolveCostEstimate(null)).toMatchObject({
      providerLabel: "Unavailable",
      totalUsd: null,
    });
    expect(resolveCostEstimate({
      provider: "OpenAI",
      model: "gpt-image",
      lineItems: [{ stage: "Preview", amountUsd: 0.04 }],
    })).toMatchObject({
      providerLabel: "OpenAI",
      modelLabel: "gpt-image",
      totalUsd: 0.04,
    });
  });

  it("surfaces configured final-art estimates and preserves an explicit unavailable state", () => {
    expect(resolveProductionCostEstimate({
      provider: "OpenAI",
      model: "gpt-image-2",
      estimatedCostUsd: 0.19,
    })).toMatchObject({
      providerLabel: "OpenAI",
      modelLabel: "gpt-image-2",
      totalUsd: 0.19,
    });
    expect(resolveProductionCostEstimate({
      provider: "OpenAI",
      model: "gpt-image-2",
      estimatedCostUsd: null,
      estimateNote: "No configured estimate",
    })).toMatchObject({
      providerLabel: "OpenAI",
      totalUsd: null,
      message: "No configured estimate",
    });
  });
});