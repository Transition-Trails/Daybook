import { describe, expect, it } from "vitest";
import { buildPlatformBillingAnalytics } from "../lib/platform-analytics.js";

const NOW = new Date("2026-08-27T12:00:00.000Z");

function user(id: string, createdAt: string, overrides: Partial<{
  planStatus: string | null;
  planCurrentPeriodEnd: Date | null;
  stripeSubscriptionId: string | null;
}> = {}) {
  return {
    id,
    createdAt: new Date(createdAt),
    planStatus: overrides.planStatus ?? "active",
    plan: "yearly",
    planCurrentPeriodEnd: overrides.planCurrentPeriodEnd ?? new Date("2027-01-01T00:00:00.000Z"),
    stripeSubscriptionId: overrides.stripeSubscriptionId ?? `sub_${id}`,
  };
}

function payment(userId: string, subscriptionId: string, createdAt: string, amountCents: number) {
  return {
    userId,
    planId: "yearly",
    source: "invoice",
    status: "succeeded",
    amountCents,
    currency: "usd",
    stripeSubscriptionId: subscriptionId,
    createdAt: new Date(createdAt),
  };
}

describe("platform billing analytics", () => {
  it("normalizes active ledger payments to MRR and excludes seed owners by default", () => {
    const analytics = buildPlatformBillingAnalytics({
      now: NOW,
      stores: [
        { ownerUserId: "customer", isSeed: false, createdAt: new Date("2026-03-01T00:00:00.000Z") },
        { ownerUserId: "fixture", isSeed: true, createdAt: new Date("2026-03-01T00:00:00.000Z") },
      ],
      users: [
        user("customer", "2026-03-01T00:00:00.000Z"),
        user("fixture", "2026-03-01T00:00:00.000Z", { stripeSubscriptionId: "sub_fixture" }),
      ],
      payments: [
        payment("customer", "sub_customer", "2026-04-01T00:00:00.000Z", 12_000),
        payment("fixture", "sub_fixture", "2026-04-01T00:00:00.000Z", 24_000),
      ],
    });

    expect(analytics.mrr).toMatchObject({
      amountUsd: 10,
      activeSubscriptions: 1,
    });
    expect(analytics.revenueSeries.find((period) => period.label === "Apr")).toMatchObject({
      amountUsd: 120,
      paymentCount: 1,
    });
    expect(analytics.trialConversion.series.every((period) => period.convertedUsers === 0)).toBe(true);
  });

  it("uses UTC half-open month boundaries and an inclusive 30-day conversion window", () => {
    const analytics = buildPlatformBillingAnalytics({
      now: NOW,
      stores: [
        { ownerUserId: "boundary", isSeed: false, createdAt: new Date("2026-03-01T00:00:00.000Z") },
        { ownerUserId: "late", isSeed: false, createdAt: new Date("2026-04-01T00:00:00.000Z") },
        { ownerUserId: "outside", isSeed: false, createdAt: new Date("2026-02-01T00:00:00.000Z") },
      ],
      users: [
        user("boundary", "2026-03-01T00:00:00.000Z", { stripeSubscriptionId: "sub_boundary" }),
        user("late", "2026-04-01T00:00:00.000Z", { stripeSubscriptionId: "sub_late" }),
        user("outside", "2026-02-01T00:00:00.000Z", { stripeSubscriptionId: "sub_outside" }),
      ],
      payments: [
        payment("boundary", "sub_boundary", "2026-03-31T00:00:00.000Z", 1_200),
        payment("late", "sub_late", "2026-05-01T00:00:00.001Z", 1_200),
        payment("outside", "sub_outside", "2026-02-28T23:59:59.999Z", 9_999),
      ],
    });

    expect(analytics.period.start).toBe("2026-03-01T00:00:00.000Z");
    expect(analytics.period.end).toBe("2026-09-01T00:00:00.000Z");
    expect(analytics.revenueSeries[0]).toMatchObject({
      start: "2026-03-01T00:00:00.000Z",
      amountCents: 1_200,
    });
    expect(analytics.trialConversion.series[0]).toMatchObject({
      eligibleUsers: 1,
      convertedUsers: 1,
      conversionRatePercent: 100,
    });
    expect(analytics.trialConversion.series[1]).toMatchObject({
      eligibleUsers: 1,
      convertedUsers: 0,
      conversionRatePercent: 0,
    });
  });

  it("includes seed owners only when explicitly requested", () => {
    const base = {
      now: NOW,
      stores: [{ ownerUserId: "fixture", isSeed: true, createdAt: new Date("2026-03-01T00:00:00.000Z") }],
      users: [user("fixture", "2026-03-01T00:00:00.000Z", { stripeSubscriptionId: "sub_fixture" })],
      payments: [payment("fixture", "sub_fixture", "2026-04-01T00:00:00.000Z", 24_000)],
    };

    expect(buildPlatformBillingAnalytics(base).mrr.amountUsd).toBe(0);
    expect(buildPlatformBillingAnalytics({ ...base, includeSeed: true }).mrr.amountUsd).toBe(20);
  });

  it("does not treat a partially matured calendar month as a scored cohort", () => {
    const analytics = buildPlatformBillingAnalytics({
      now: NOW,
      stores: [
        { ownerUserId: "july-early", isSeed: false, createdAt: new Date("2026-07-01T00:00:00.000Z") },
        { ownerUserId: "july-late", isSeed: false, createdAt: new Date("2026-07-31T23:59:59.999Z") },
      ],
      users: [
        user("july-early", "2026-07-01T00:00:00.000Z"),
        user("july-late", "2026-07-31T23:59:59.999Z"),
      ],
      payments: [
        payment("july-early", "sub_july-early", "2026-07-15T00:00:00.000Z", 1_200),
      ],
    });
    const july = analytics.trialConversion.series.find((period) => period.label === "Jul");

    expect(july).toMatchObject({
      eligibleUsers: 2,
      convertedUsers: 1,
      conversionRatePercent: null,
      isMature: false,
    });
    expect(analytics.trialConversion.latestMatured?.label).not.toBe("Jul");
  });

  it("excludes non-yearly subscriptions from MRR rather than assuming their interval", () => {
    const monthlyUser = {
      ...user("monthly", "2026-03-01T00:00:00.000Z", { stripeSubscriptionId: "sub_monthly" }),
      plan: "monthly",
    };
    const monthlyPayment = {
      ...payment("monthly", "sub_monthly", "2026-08-01T00:00:00.000Z", 2_000),
      planId: "monthly",
    };
    const analytics = buildPlatformBillingAnalytics({
      now: NOW,
      stores: [{ ownerUserId: "monthly", isSeed: false, createdAt: new Date("2026-03-01T00:00:00.000Z") }],
      users: [monthlyUser],
      payments: [monthlyPayment],
    });

    expect(analytics.mrr).toMatchObject({ amountUsd: 0, activeSubscriptions: 0 });
    expect(analytics.revenueSeries.at(-1)).toMatchObject({ amountUsd: 20, paymentCount: 1 });
  });
});