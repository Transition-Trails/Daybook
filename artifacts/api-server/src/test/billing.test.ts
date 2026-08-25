import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import type { User } from "@workspace/db";
import { hasUserPlanEntitlement } from "../lib/entitlement.js";

const { dbState, stripeState, loggerState, tables } = vi.hoisted(() => {
  const tables = {
    users: { id: "users.id", stripeCustomerId: "users.stripe_customer_id" },
    plans: { id: "plans.id" },
  };

  return {
    tables,
    dbState: {
      users: [] as Array<Partial<User>>,
      plans: {
        yearly: { id: "yearly", name: "Yearly", oneTimePrice: 49, yearlyPrice: 15 },
        lifetime: { id: "lifetime", name: "Lifetime", oneTimePrice: 149, yearlyPrice: null },
      } as Record<string, { id: string; name: string; oneTimePrice: number | null; yearlyPrice: number | null }>,
      updates: [] as Array<{ patch: Record<string, unknown>; condition: { column: string; value: string } }>,
      selectError: null as Error | null,
    },
    stripeState: {
      event: null as Record<string, unknown> | null,
      signatureError: null as Error | null,
      sessionCalls: [] as Array<Record<string, unknown>>,
      subscription: { current_period_end: 1_900_000_000 },
    },
    loggerState: {
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock("@workspace/db", () => {
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async (condition: { column: string; value: string }) => {
          if (dbState.selectError) throw dbState.selectError;
          if (table === tables.plans) {
            const plan = dbState.plans[condition.value];
            return plan ? [plan] : [];
          }

          if (condition.column === tables.users.id) {
            return dbState.users.filter(user => user.id === condition.value);
          }
          return dbState.users.filter(user => user.stripeCustomerId === condition.value);
        },
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (condition: { column: string; value: string }) => {
          dbState.updates.push({ patch, condition });
          return Promise.resolve();
        },
      }),
    }),
  };

  return {
    db,
    usersTable: tables.users,
    plansTable: tables.plans,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: string) => ({ column, value }),
}));

vi.mock("../lib/auth-middleware.js", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: loggerState.error,
    warn: loggerState.warn,
  },
}));

vi.mock("stripe", () => {
  function StripeMock() {
    return {
      checkout: {
        sessions: {
          create: async (payload: Record<string, unknown>) => {
            stripeState.sessionCalls.push(payload);
            return { id: `cs_${stripeState.sessionCalls.length}`, url: "https://checkout.test/session" };
          },
        },
      },
      webhooks: {
        constructEvent: () => {
          if (stripeState.signatureError) throw stripeState.signatureError;
          return stripeState.event;
        },
      },
      subscriptions: {
        retrieve: async () => stripeState.subscription,
      },
    };
  }

  return { default: StripeMock };
});

import billingRouter from "../routes/billing.js";

const testUser = {
  id: "user-checkout",
  email: "checkout@example.com",
} as User;

function makeApp() {
  const app = express();
  app.use("/webhooks/stripe", express.raw({ type: "application/json" }));
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = testUser;
    next();
  });
  app.use(billingRouter);
  return app;
}

const app = makeApp();
const savedEnv = {
  stripeSecret: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};

function successEvent(type: string, payload: Record<string, unknown>) {
  stripeState.event = { id: "evt_123", type, data: { object: payload } };
}

function knownUser(overrides: Partial<User> = {}): Partial<User> {
  return {
    id: "user-renewal",
    email: "renewal@example.com",
    plan: "yearly",
    owned: [],
    stripeCustomerId: "cus_known",
    planStatus: "active",
    planCurrentPeriodEnd: new Date("2028-01-01T00:00:00.000Z"),
    stripeSubscriptionId: "sub_active",
    stripePaymentIntentId: "pi_active",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_billing";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_billing";
  dbState.users = [];
  dbState.plans = {
    yearly: { id: "yearly", name: "Yearly", oneTimePrice: 49, yearlyPrice: 15 },
    lifetime: { id: "lifetime", name: "Lifetime", oneTimePrice: 149, yearlyPrice: null },
  };
  dbState.updates = [];
  dbState.selectError = null;
  stripeState.event = null;
  stripeState.signatureError = null;
  stripeState.sessionCalls = [];
  stripeState.subscription = { current_period_end: 1_900_000_000 };
  loggerState.error.mockReset();
  loggerState.warn.mockReset();
});

afterEach(() => {
  if (savedEnv.stripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedEnv.stripeSecret;
  if (savedEnv.webhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = savedEnv.webhookSecret;
});

describe("Daybook billing checkout", () => {
  it("uses the recurring yearly price and the lifetime one-time price", async () => {
    await request(app).post("/checkout").send({ plan: "yearly" }).expect(200);
    await request(app).post("/checkout").send({ plan: "lifetime" }).expect(200);

    const yearly = stripeState.sessionCalls[0].line_items as Array<{ price_data: { unit_amount: number } }>;
    const lifetime = stripeState.sessionCalls[1].line_items as Array<{ price_data: { unit_amount: number } }>;
    expect(yearly[0].price_data.unit_amount).toBe(1500);
    expect(lifetime[0].price_data.unit_amount).toBe(14900);
  });

  it("refuses a checkout session when the requested mode has no usable price", async () => {
    dbState.plans.yearly = { ...dbState.plans.yearly, yearlyPrice: null };

    const response = await request(app).post("/checkout").send({ plan: "yearly" });

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("not purchasable");
    expect(stripeState.sessionCalls).toHaveLength(0);
    expect(loggerState.error).toHaveBeenCalledWith(
      { plan: "yearly", amount: null },
      expect.stringContaining("no usable price"),
    );
  });
});

describe("Stripe webhooks", () => {
  it("returns 503 when billing configuration is missing so Stripe retries", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const response = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "sig")
      .set("content-type", "application/json")
      .send("{}");

    expect(response.status).toBe(503);
    expect(loggerState.error).toHaveBeenCalledWith(
      { hasWebhookSecret: false, hasApiKey: true },
      expect.stringContaining("returning 503"),
    );
  });

  it("returns 400 for a bad signature without attempting processing", async () => {
    stripeState.signatureError = new Error("bad signature");

    const response = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "bad")
      .set("content-type", "application/json")
      .send("{}");

    expect(response.status).toBe(400);
    expect(loggerState.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Stripe signature verification failed",
    );
    expect(dbState.updates).toHaveLength(0);
  });

  it("returns 500 when event processing fails after signature verification", async () => {
    successEvent("checkout.session.completed", {
      metadata: { userId: "user-renewal", plan: "yearly" },
      customer: "cus_known",
      subscription: { current_period_end: 1_900_000_000 },
      payment_status: "paid",
    });
    dbState.selectError = new Error("database down");

    const response = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}");

    expect(response.status).toBe(500);
    expect(loggerState.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_123", err: expect.any(Error) }),
      "Stripe webhook processing failed",
    );
  });

  it("resolves a metadata-free renewal through the Stripe customer and records expiry", async () => {
    dbState.users = [knownUser({ stripeSubscriptionId: null })];
    successEvent("invoice.payment_succeeded", {
      metadata: {},
      customer: "cus_known",
      parent: { subscription_details: { subscription: "sub_active" } },
      lines: { data: [{ period: { end: 1_900_000_000 } }] },
    });

    const response = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}");

    expect(response.status).toBe(200);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].patch).toMatchObject({
      plan: "yearly",
      planStatus: "active",
      stripeCustomerId: "cus_known",
      planCurrentPeriodEnd: new Date("2030-03-17T17:46:40.000Z"),
      stripeSubscriptionId: "sub_active",
    });
    expect(dbState.updates[0].patch.owned).toEqual([]);
  });

  it("returns 500 instead of silently dropping a payment for an unknown customer", async () => {
    successEvent("invoice.payment_succeeded", {
      metadata: {},
      customer: "cus_unknown",
      lines: { data: [{ period: { end: 1_900_000_000 } }] },
    });

    const response = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}");

    expect(response.status).toBe(500);
    expect(loggerState.error).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_123", customer: "cus_unknown" }),
      "Stripe webhook could not resolve a user",
    );
  });

  it("waits for asynchronous checkout payment confirmation before granting access", async () => {
    dbState.users = [knownUser()];
    const payload = {
      metadata: { userId: "user-renewal", plan: "yearly" },
      customer: "cus_known",
      subscription: { id: "sub_active", current_period_end: 1_900_000_000 },
      payment_intent: "pi_active",
      payment_status: "unpaid",
    };
    successEvent("checkout.session.completed", payload);

    await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}")
      .expect(200);
    expect(dbState.updates).toHaveLength(0);

    successEvent("checkout.session.async_payment_succeeded", payload);
    await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}")
      .expect(200);

    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].patch).toMatchObject({
      planStatus: "active",
      stripeSubscriptionId: "sub_active",
      stripePaymentIntentId: "pi_active",
    });
  });

  it("grants a confirmed lifetime checkout without making annual access permanent", async () => {
    dbState.users = [knownUser({ plan: null, owned: [], stripeSubscriptionId: null })];
    successEvent("checkout.session.completed", {
      metadata: { userId: "user-renewal", plan: "lifetime" },
      customer: "cus_known",
      payment_intent: "pi_lifetime",
      payment_status: "paid",
    });

    await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}")
      .expect(200);

    expect(dbState.updates[0].patch).toMatchObject({
      plan: "lifetime",
      owned: ["lifetime"],
      planStatus: "lifetime",
      stripePaymentIntentId: "pi_lifetime",
    });
  });

  it.each([
    ["customer.subscription.deleted", "inactive", { id: "sub_active" }],
    ["invoice.payment_failed", "payment_failed", { parent: { subscription_details: { subscription: "sub_active" } } }],
    ["charge.refunded", "refunded", { payment_intent: "pi_active" }],
  ])("records %s without removing lifetime ownership", async (type, expectedStatus, correlation) => {
    dbState.users = [knownUser({ plan: "lifetime", owned: ["lifetime"] })];
    successEvent(type, { customer: "cus_known", current_period_end: 1_900_000_000, ...correlation });

    const response = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}");

    expect(response.status).toBe(200);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].patch).toMatchObject({ planStatus: expectedStatus });
    expect(dbState.updates[0].patch).not.toHaveProperty("owned");
  });

  it("ignores an old subscription deletion after a customer has a new active subscription", async () => {
    dbState.users = [knownUser({ stripeSubscriptionId: "sub_current" })];
    successEvent("customer.subscription.deleted", {
      id: "sub_old",
      customer: "cus_known",
    });

    await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set("content-type", "application/json")
      .send("{}")
      .expect(200);

    expect(dbState.updates).toHaveLength(0);
    expect(loggerState.warn).toHaveBeenCalledWith(
      expect.objectContaining({ activeSubscriptionId: "sub_current", subscriptionId: "sub_old" }),
      expect.stringContaining("did not match"),
    );
  });
});

describe("buyer plan entitlement", () => {
  it("keeps lifetime access while requiring an active, unexpired yearly plan", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");

    expect(hasUserPlanEntitlement({
      owned: ["lifetime"],
      plan: "lifetime",
      planStatus: "refunded",
      planCurrentPeriodEnd: null,
    }, now)).toBe(true);
    expect(hasUserPlanEntitlement({
      owned: [],
      plan: "yearly",
      planStatus: "active",
      planCurrentPeriodEnd: new Date("2030-01-02T00:00:00.000Z"),
    }, now)).toBe(true);
    expect(hasUserPlanEntitlement({
      owned: [],
      plan: "yearly",
      planStatus: "active",
      planCurrentPeriodEnd: new Date("2029-12-31T00:00:00.000Z"),
    }, now)).toBe(false);
    expect(hasUserPlanEntitlement({
      owned: [],
      plan: "yearly",
      planStatus: "payment_failed",
      planCurrentPeriodEnd: new Date("2030-01-02T00:00:00.000Z"),
    }, now)).toBe(false);
  });
});