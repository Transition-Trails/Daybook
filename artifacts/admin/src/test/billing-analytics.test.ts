import { describe, expect, it } from "vitest";
import { billingTrendValues, formatPercent } from "@/lib/dashboard-insights";
import type { PlatformStats } from "@/lib/api";

const stats = {
  billingAnalytics: {
    asOf: "2026-08-27T12:00:00.000Z",
    currency: "USD" as const,
    period: {
      timezone: "UTC" as const,
      months: 6,
      start: "2026-03-01T00:00:00.000Z",
      end: "2026-09-01T00:00:00.000Z",
    },
    mrr: { amountUsd: 100, activeSubscriptions: 1, calculation: "ledger" },
    revenueSeries: [
      { label: "Mar", start: "2026-03-01T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z", amountCents: 1200, amountUsd: 12, paymentCount: 1 },
      { label: "Apr", start: "2026-04-01T00:00:00.000Z", end: "2026-05-01T00:00:00.000Z", amountCents: 2400, amountUsd: 24, paymentCount: 1 },
    ],
    trialConversion: {
      cohortWindowDays: 30,
      definition: "definition",
      series: [
        { label: "Mar", start: "2026-03-01T00:00:00.000Z", end: "2026-04-01T00:00:00.000Z", eligibleUsers: 2, convertedUsers: 1, conversionRatePercent: 50, isMature: true },
        { label: "Apr", start: "2026-04-01T00:00:00.000Z", end: "2026-05-01T00:00:00.000Z", eligibleUsers: 0, convertedUsers: 0, conversionRatePercent: null, isMature: false },
      ],
      latestMatured: null,
      previousMatured: null,
    },
  },
} as PlatformStats;

describe("dashboard billing analytics presentation", () => {
  it("keeps UTC series values aligned and does not turn immature cohorts into zeroes", () => {
    expect(billingTrendValues(stats)).toEqual({
      revenue: [12, 24],
      conversion: [50, null],
    });
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(50)).toBe("50%");
  });
});