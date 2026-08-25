import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { dbState, tables } = vi.hoisted(() => ({
  tables: {
    plans: {
      id: "plans.id",
      name: "plans.name",
      description: "plans.description",
      stripePriceId: "plans.stripe_price_id",
    },
  },
  dbState: {
    plans: [
      {
        id: "yearly",
        name: "Yearly",
        description: "Annual access",
        stripePriceId: "price_yearly",
      },
      {
        id: "team",
        name: "Team",
        description: "Shared workspace access",
        stripePriceId: "price_team",
      },
      {
        id: "legacy",
        name: "Legacy",
        description: "Retired",
        stripePriceId: null,
      },
      {
        id: "blank",
        name: "Blank",
        description: "Not sellable",
        stripePriceId: "   ",
      },
    ] as Array<{
      id: string;
      name: string;
      description: string;
      stripePriceId: string | null;
    }>,
  },
}));

vi.mock("@workspace/db", () => {
  type Condition =
    | { kind: "eq"; column: string; value: unknown }
    | { kind: "isNotNull"; column: string }
    | { kind: "and"; conditions: Condition[] };

  const matches = (
    plan: (typeof dbState.plans)[number],
    condition: Condition,
  ): boolean => {
    switch (condition.kind) {
      case "eq":
        return plan.id === condition.value;
      case "isNotNull":
        return plan.stripePriceId !== null;
      case "and":
        return condition.conditions.every(item => matches(plan, item));
    }
  };

  return {
    db: {
      select: () => ({
        from: () => ({
          where: async (condition: Condition) => dbState.plans
            .filter(plan => matches(plan, condition))
            .map(({ id, name, description, stripePriceId }) => ({
              id,
              name,
              description,
              stripePriceId,
            })),
        }),
      }),
    },
    plansTable: tables.plans,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => ({ kind: "eq", column, value }),
  isNotNull: (column: string) => ({ kind: "isNotNull", column }),
  and: (...conditions: Array<Record<string, unknown>>) => ({ kind: "and", conditions }),
}));

import plansRouter from "../routes/plans.js";

const app = express();
app.use(plansRouter);

describe("public plan catalog", () => {
  it("lists every configured Stripe-priced plan without exposing Price IDs", async () => {
    const response = await request(app).get("/plans").expect(200);

    expect(response.body).toEqual([
      { id: "yearly", name: "Yearly", description: "Annual access" },
      { id: "team", name: "Team", description: "Shared workspace access" },
    ]);
    expect(JSON.stringify(response.body)).not.toContain("price_yearly");
    expect(JSON.stringify(response.body)).not.toContain("price_team");
  });

  it("retrieves configured plans and hides rows without a Stripe Price ID", async () => {
    await request(app)
      .get("/plans/team")
      .expect(200)
      .expect({
        id: "team",
        name: "Team",
        description: "Shared workspace access",
      });

    await request(app).get("/plans/legacy").expect(404);
    await request(app).get("/plans/blank").expect(404);
  });
});