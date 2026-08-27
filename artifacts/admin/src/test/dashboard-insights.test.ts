import { describe, expect, it } from "vitest";
import {
  buildRecipeReleaseRunway,
  deriveDecisionSignals,
} from "@/lib/dashboard-insights";
import type { PlatformStats, ProductRecipe, Store } from "@/lib/api";

const NOW = new Date("2026-08-27T12:00:00.000Z");

function store(overrides: Partial<Store>): Store {
  return {
    id: "store-a",
    name: "Store A",
    slug: "store-a",
    domain: null,
    ownerUserId: "owner-a",
    plan: "starter",
    status: "active",
    isSeed: false,
    defaultMode: "curated",
    subscriptionActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-08-27T10:00:00.000Z",
    ...overrides,
  };
}

function recipe(overrides: Partial<ProductRecipe>): ProductRecipe {
  return {
    id: "recipe-a",
    name: "Recipe A",
    category: "Planner Studio",
    decisionCard: null,
    parts: [],
    physicalPath: null,
    claudeBrief: null,
    release: null,
    status: "draft",
    buildCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function stats(overrides: Partial<PlatformStats> = {}): PlatformStats {
  return {
    stores: { total: 0, active: 0, byStatus: {} },
    users: { total: 0 },
    planners: { total: 0, completed: 0, failed: 0, byStore: {}, completedByStore: {} },
    activitySeries: {
      labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
      newStores: [0, 0, 0, 0, 0, 0],
      completedBuilds: [0, 0, 0, 0, 0, 0],
      failedBuilds: [0, 0, 0, 0, 0, 0],
    },
    trials: { endsAtByStore: {} },
    linkRiskListings: [],
    mrr: { amountUsd: 0, note: "not used by dashboard" },
    ...overrides,
  };
}

describe("dashboard decision signals", () => {
  it("covers operational thresholds and orders severity before age", () => {
    const stores = [
      store({
        id: "suspended",
        name: "Suspended",
        status: "suspended",
        updatedAt: "2026-08-24T00:00:00.000Z",
      }),
      store({ id: "trial", name: "Trial", status: "trial" }),
    ];
    const recipes = [
      recipe({
        id: "blocked",
        name: "Blocked recipe",
        claudeBrief: {
          asks: [],
          generates: "",
          engineGaps: [{ severity: "Blocks release" }],
        },
      }),
      recipe({
        id: "due",
        name: "Due recipe",
        release: { month: 9, year: 2026, planTiers: ["pro"] },
      }),
    ];
    const result = deriveDecisionSignals(stores, recipes, stats({
      planners: { total: 0, completed: 0, failed: 0, byStore: { trial: 0 }, completedByStore: {} },
      trials: { endsAtByStore: { trial: "2026-08-30T12:00:00.000Z" } },
      linkRiskListings: [{
        plannerId: "planner-a",
        editionName: "Linked planner",
        storeId: "trial",
        deviceLabel: "Kindle Scribe",
        createdAt: "2026-08-10T00:00:00.000Z",
      }],
    }), NOW);

    expect(result.map((signal) => signal.kind)).toEqual([
      "recipe_engine_gap",
      "suspended_store",
      "trial_without_builds",
      "live_listing_link_risk",
      "recipe_release_due",
    ]);
  });

  it("does not flag a recent suspension or a trial with a build", () => {
    const result = deriveDecisionSignals([
      store({ id: "recent", status: "suspended", updatedAt: "2026-08-26T12:01:00.000Z" }),
      store({ id: "built", status: "trial" }),
    ], [], stats({
      planners: { total: 1, completed: 1, failed: 0, byStore: { built: 1 }, completedByStore: { built: 1 } },
      trials: { endsAtByStore: { built: "2026-08-29T12:00:00.000Z" } },
    }), NOW);

    expect(result).toEqual([]);
  });

  it("still flags a trial when its only planner attempt failed", () => {
    const result = deriveDecisionSignals([
      store({ id: "failed-only", status: "trial" }),
    ], [], stats({
      planners: {
        total: 1,
        completed: 0,
        failed: 1,
        byStore: { "failed-only": 1 },
        completedByStore: {},
      },
      trials: { endsAtByStore: { "failed-only": "2026-08-29T12:00:00.000Z" } },
    }), NOW);

    expect(result.map((signal) => signal.kind)).toEqual(["trial_without_builds"]);
  });
});

describe("recipe release runway", () => {
  it("returns every upcoming month and leaves unscheduled months visible", () => {
    const runway = buildRecipeReleaseRunway([
      recipe({
        name: "September recipe",
        release: { month: 9, year: 2026, planTiers: [] },
      }),
    ], NOW, 4);

    expect(runway.map((month) => month.key)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(runway.map((month) => month.recipes.length)).toEqual([0, 1, 0, 0]);
  });
});