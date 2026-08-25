import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbState, loggerState, tables } = vi.hoisted(() => ({
  tables: {
    plans: {
      id: "plans.id",
      stripePriceId: "plans.stripe_price_id",
    },
  },
  dbState: {
    sellablePlans: [] as Array<{ stripePriceId: string | null }>,
    error: null as Error | null,
  },
  loggerState: {
    error: vi.fn(),
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (dbState.error) throw dbState.error;
          return dbState.sellablePlans;
        },
      }),
    }),
  },
  plansTable: tables.plans,
}));

vi.mock("drizzle-orm", () => ({
  isNotNull: (column: string) => ({ kind: "isNotNull", column }),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: loggerState.error,
  },
}));

import { checkBillingConfiguration } from "../lib/billing-config.js";

describe("billing startup configuration", () => {
  beforeEach(() => {
    dbState.sellablePlans = [];
    dbState.error = null;
    loggerState.error.mockReset();
  });

  it("logs an error when no configured Stripe Price ID exists", async () => {
    await checkBillingConfiguration();

    expect(loggerState.error).toHaveBeenCalledWith(
      "Billing configuration missing: no plan has a Stripe Price ID",
    );
  });

  it("stays quiet when a sellable plan exists", async () => {
    dbState.sellablePlans = [{ stripePriceId: "price_yearly" }];

    await checkBillingConfiguration();

    expect(loggerState.error).not.toHaveBeenCalled();
  });

  it("treats whitespace-only Price IDs as missing", async () => {
    dbState.sellablePlans = [{ stripePriceId: "   " }];

    await checkBillingConfiguration();

    expect(loggerState.error).toHaveBeenCalledWith(
      "Billing configuration missing: no plan has a Stripe Price ID",
    );
  });

  it("logs a diagnostic if the non-blocking check cannot query the catalog", async () => {
    dbState.error = new Error("database unavailable");

    await checkBillingConfiguration();

    expect(loggerState.error).toHaveBeenCalledWith(
      { err: dbState.error },
      "Billing startup configuration check failed",
    );
  });
});