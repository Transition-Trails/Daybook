import type { PlatformStats, ProductRecipe, Store } from "./api";

export type DecisionSignalSeverity = "critical" | "warning" | "info";
export type DecisionSignalKind =
  | "suspended_store"
  | "trial_without_builds"
  | "recipe_engine_gap"
  | "recipe_release_due"
  | "live_listing_link_risk";

export interface DecisionSignal {
  id: string;
  kind: DecisionSignalKind;
  severity: DecisionSignalSeverity;
  title: string;
  description: string;
  category: string;
  href: string;
  occurredAt: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const severityRank: Record<DecisionSignalSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function releaseDate(recipe: ProductRecipe): Date | null {
  if (!recipe.release?.month || !recipe.release?.year) return null;
  return new Date(recipe.release.year, recipe.release.month - 1, 1);
}

export function deriveDecisionSignals(
  stores: Store[],
  recipes: ProductRecipe[],
  stats: PlatformStats,
  now = new Date(),
): DecisionSignal[] {
  const nowMs = now.getTime();
  const signals: DecisionSignal[] = [];

  for (const store of stores) {
    const updatedMs = new Date(store.updatedAt).getTime();
    if (store.status === "suspended" && nowMs - updatedMs >= 48 * HOUR) {
      signals.push({
        id: `suspended:${store.id}`,
        kind: "suspended_store",
        severity: "critical",
        title: `${store.name} has been suspended for more than 48 hours`,
        description: "Review payment recovery or decide whether storefront access should remain blocked.",
        category: "Billing",
        href: `/super/stores/${store.id}/inspect`,
        occurredAt: store.updatedAt,
      });
    }

    const trialEndsAt = stats.trials.endsAtByStore[store.id];
    const trialEndsMs = trialEndsAt ? new Date(trialEndsAt).getTime() : Number.NaN;
    const daysRemaining = trialEndsMs - nowMs;
    if (
      store.status === "trial"
      && Number.isFinite(trialEndsMs)
      && daysRemaining >= 0
      && daysRemaining <= 5 * DAY
      && (stats.planners.completedByStore[store.id] ?? 0) === 0
    ) {
      signals.push({
        id: `trial:${store.id}`,
        kind: "trial_without_builds",
        severity: "warning",
        title: `${store.name}'s trial ends without a planner build`,
        description: `Trial ends ${new Date(trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Decide whether outreach is warranted.`,
        category: "Trial",
        href: `/super/stores/${store.id}/inspect`,
        occurredAt: store.createdAt,
      });
    }
  }

  for (const recipe of recipes) {
    const engineGaps = recipe.claudeBrief?.engineGaps ?? [];
    if (engineGaps.some((gap) => gap.severity === "Blocks release")) {
      signals.push({
        id: `recipe-gap:${recipe.id}`,
        kind: "recipe_engine_gap",
        severity: "critical",
        title: `${recipe.name} has a release-blocking engine gap`,
        description: "Resolve the engine gap before publishing this product recipe.",
        category: "Recipe",
        href: "/super/recipes",
        occurredAt: recipe.updatedAt,
      });
    }

    const scheduled = releaseDate(recipe);
    const untilRelease = scheduled ? scheduled.getTime() - nowMs : Number.NaN;
    if (
      recipe.status === "draft"
      && scheduled
      && untilRelease >= 0
      && untilRelease <= 60 * DAY
    ) {
      signals.push({
        id: `recipe-release:${recipe.id}`,
        kind: "recipe_release_due",
        severity: "warning",
        title: `${recipe.name} is still draft near its release`,
        description: `Scheduled for ${scheduled.toLocaleDateString("en-US", { month: "long", year: "numeric" })}. Review readiness or move the date.`,
        category: "Release",
        href: "/super/recipes",
        occurredAt: recipe.updatedAt,
      });
    }
  }

  for (const listing of stats.linkRiskListings) {
    signals.push({
      id: `link-risk:${listing.plannerId}`,
      kind: "live_listing_link_risk",
      severity: "warning",
      title: `${listing.editionName} promises links on ${listing.deviceLabel}`,
      description: "The live edition targets a device profile that strips or poorly supports external links.",
      category: "Listing",
      href: listing.storeId
        ? `/store/${listing.storeId}/builds`
        : "/super/catalog/global",
      occurredAt: listing.createdAt,
    });
  }

  return signals.sort((a, b) => {
    const severity = severityRank[a.severity] - severityRank[b.severity];
    if (severity !== 0) return severity;
    return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
  });
}

export interface ReleaseRunwayMonth {
  key: string;
  label: string;
  recipes: ProductRecipe[];
}

export function buildRecipeReleaseRunway(
  recipes: ProductRecipe[],
  now = new Date(),
  months = 6,
): ReleaseRunwayMonth[] {
  return Array.from({ length: months }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return {
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      recipes: recipes
        .filter((recipe) => recipe.release?.month === month && recipe.release?.year === year)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}