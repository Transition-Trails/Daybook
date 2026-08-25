import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import {
  db,
  checkoutIntentsTable,
  ordersTable,
  paymentsTable,
  storeCatalogTable,
  storeMembersTable,
  storesTable,
  editionsTable,
  usersTable,
  type User,
} from "@workspace/db";

const stripeMocks = vi.hoisted(() => ({
  retrieveAccount: vi.fn(),
  createSession: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendOrderReceipt: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class Stripe {
    accounts = { retrieve: stripeMocks.retrieveAccount };
    checkout = { sessions: { create: stripeMocks.createSession } };
  },
}));

vi.mock("../lib/email/senders", () => ({
  sendOrderReceipt: emailMocks.sendOrderReceipt,
}));

import checkoutRouter, { processSellerCheckoutPayment } from "../routes/checkout.js";
import ordersRouter, { plannerDriveCredentialOwner } from "../routes/orders.js";
import { createSignedDownloadUrl, verifySignedDownload } from "../lib/order-delivery.js";
import { orderReceipt } from "../lib/email/templates/order.js";

const RUN = Math.random().toString(36).slice(2, 10);
const ids = {
  user: `seller-checkout-user-${RUN}`,
  store: `seller-checkout-store-${RUN}`,
  edition: `seller-checkout-edition-${RUN}`,
  editionTwo: `seller-checkout-edition-two-${RUN}`,
  order: `ord_seller_cs_${RUN}`,
  delayedOrder: `ord_seller_cs_delayed_${RUN}`,
  intent: `ci_seller_${RUN}`,
};

const user: User = {
  id: ids.user,
  provider: "google",
  email: `seller-checkout-${RUN}@example.test`,
  name: "Seller Checkout Owner",
  avatarUrl: null,
  role: "user",
  platformRole: null,
  plan: null,
  planStatus: null,
  planCurrentPeriodEnd: null,
  owned: [],
  aiEnabled: false,
  aiProvider: "claude",
  connections: { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripePaymentIntentId: null,
  stripeSubscriptionEventCreatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeApp(authenticated: boolean) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const mutable = req as any;
    mutable.isAuthenticated = () => authenticated;
    mutable.user = authenticated ? user : undefined;
    mutable.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });
  app.use("/api", checkoutRouter);
  app.use("/api", ordersRouter);
  return app;
}

const authenticatedApp = makeApp(true);
const guestApp = makeApp(false);

describe("seller checkout", () => {
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  const previousSessionSecret = process.env.SESSION_SECRET;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_seller_checkout";
    process.env.SESSION_SECRET = "seller-checkout-test-secret";
    stripeMocks.retrieveAccount.mockResolvedValue({ id: "acct_seller_test", charges_enabled: true });
    stripeMocks.createSession.mockResolvedValue({ id: `cs_${RUN}`, url: "https://checkout.stripe.test/session" });

    await db.insert(usersTable).values(user).onConflictDoNothing();
    await db.insert(storesTable).values({
      id: ids.store,
      name: "Seller Checkout Test Store",
      slug: `seller-checkout-${RUN}`,
      ownerUserId: ids.user,
      plan: "pro",
      status: "active",
      subscriptionActive: true,
      stripeAccountId: "acct_seller_test",
      stripeChargesEnabled: true,
    });
    await db.insert(editionsTable).values({
      id: ids.edition,
      name: "Server Priced Edition",
      priceLow: 12.34,
      digitalPriceCents: 1234,
      status: "live",
      globalAvailable: true,
      origin: "licensed",
    });
    await db.insert(editionsTable).values({
      id: ids.editionTwo,
      name: "Second Server Priced Edition",
      priceLow: 7.89,
      digitalPriceCents: 789,
      status: "live",
      globalAvailable: true,
      origin: "licensed",
    });
    await db.insert(storeCatalogTable).values({ storeId: ids.store, itemType: "edition", itemId: ids.edition });
    await db.insert(storeCatalogTable).values({ storeId: ids.store, itemType: "edition", itemId: ids.editionTwo });
  });

  afterAll(async () => {
    await db.delete(paymentsTable).where(eq(paymentsTable.orderId, ids.order));
    await db.delete(ordersTable).where(eq(ordersTable.id, ids.order));
    await db.delete(paymentsTable).where(eq(paymentsTable.orderId, ids.delayedOrder));
    await db.delete(ordersTable).where(eq(ordersTable.id, ids.delayedOrder));
    await db.delete(checkoutIntentsTable).where(eq(checkoutIntentsTable.storeId, ids.store));
    await db.delete(storeCatalogTable).where(and(eq(storeCatalogTable.storeId, ids.store), eq(storeCatalogTable.itemId, ids.edition)));
    await db.delete(storeCatalogTable).where(and(eq(storeCatalogTable.storeId, ids.store), eq(storeCatalogTable.itemId, ids.editionTwo)));
    await db.delete(storeMembersTable).where(eq(storeMembersTable.storeId, ids.store));
    await db.delete(editionsTable).where(eq(editionsTable.id, ids.edition));
    await db.delete(editionsTable).where(eq(editionsTable.id, ids.editionTwo));
    await db.delete(storesTable).where(eq(storesTable.id, ids.store));
    await db.delete(usersTable).where(eq(usersTable.id, ids.user));
    if (previousStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripeKey;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
  });

  it("lets an authenticated non-member buy at the catalog price on the seller account", async () => {
    const response = await request(authenticatedApp)
      .post(`/api/store/${ids.store}/checkout`)
      .send({
        items: [{ itemType: "edition", itemId: ids.edition, quantity: 2, priceCents: 1, currency: "eur" }],
        totalCents: 2,
      })
      .expect(200);

    expect(response.body.url).toBe("https://checkout.stripe.test/session");
    const [params, requestOptions] = stripeMocks.createSession.mock.calls.at(-1)!;
    expect(params.line_items[0].price_data.unit_amount).toBe(1234);
    expect(params.line_items[0].quantity).toBe(2);
    expect(params.line_items[0].price_data.currency).toBe("usd");
    expect(params.metadata.intentId).toMatch(/^ci_/);
    expect(params.metadata.items).toBeUndefined();
    expect(params.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(params.expires_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 60 * 60);
    expect(requestOptions).toEqual({ stripeAccount: "acct_seller_test" });
  });

  it("creates a Stripe session for a twenty-line cart without putting the cart in metadata", async () => {
    const response = await request(authenticatedApp)
      .post(`/api/store/${ids.store}/checkout`)
      .send({
        items: Array.from({ length: 20 }, () => ({
          itemType: "edition",
          itemId: ids.edition,
          quantity: 1,
        })),
      })
      .expect(200);
    expect(response.body.url).toBe("https://checkout.stripe.test/session");
    const [params] = stripeMocks.createSession.mock.calls.at(-1)!;
    expect(params.line_items).toHaveLength(20);
    expect(params.metadata.items).toBeUndefined();
    const [intent] = await db.select().from(checkoutIntentsTable)
      .where(eq(checkoutIntentsTable.id, params.metadata.intentId)).limit(1);
    expect(intent?.items).toHaveLength(20);
    expect(intent?.amountCents).toBe(20 * 1234);
  });

  it("allows guest checkout but denies a seller whose live Connect account cannot charge", async () => {
    await request(guestApp)
      .post(`/api/store/${ids.store}/checkout`)
      .send({ items: [{ itemType: "edition", itemId: ids.edition, quantity: 1 }] })
      .expect(200);

    stripeMocks.retrieveAccount.mockResolvedValueOnce({ id: "acct_seller_test", charges_enabled: false });
    const response = await request(authenticatedApp)
      .post(`/api/store/${ids.store}/checkout`)
      .send({ items: [{ itemType: "edition", itemId: ids.edition, quantity: 1 }] })
      .expect(409);
    expect(response.body.reason).toBe("stripe-charges-disabled");
    await db.update(storesTable).set({ stripeChargesEnabled: true }).where(eq(storesTable.id, ids.store));
  });

  it("names a lapsed licensed entitlement instead of creating a session", async () => {
    await db.update(storesTable).set({ subscriptionActive: false }).where(eq(storesTable.id, ids.store));
    const response = await request(authenticatedApp)
      .post(`/api/store/${ids.store}/checkout`)
      .send({ items: [{ itemType: "edition", itemId: ids.edition, quantity: 1 }] })
      .expect(403);
    expect(response.body.reason).toBe("gated-license-lapsed");
    await db.update(storesTable).set({ subscriptionActive: true }).where(eq(storesTable.id, ids.store));
  });

  it("refuses catalog types without a concrete secure delivery path", async () => {
    stripeMocks.createSession.mockClear();
    const response = await request(guestApp)
      .post(`/api/store/${ids.store}/checkout`)
      .send({ items: [{ itemType: "theme", itemId: "not-deliverable", quantity: 1 }] })
      .expect(400);
    expect(response.body.error).toContain("Only downloadable planner editions");
    expect(stripeMocks.createSession).not.toHaveBeenCalled();
  });

  it("writes one seller order/payment on replay without changing the buyer subscription", async () => {
    emailMocks.sendOrderReceipt.mockClear();
    const sessionId = `cs_${RUN}`;
    await db.insert(checkoutIntentsTable).values({
      id: ids.intent,
      storeId: ids.store,
      buyerUserId: ids.user,
      items: [{
        itemType: "edition",
        itemId: ids.edition,
        name: "Server Priced Edition",
        priceCents: 1234,
        quantity: 2,
      }, {
        itemType: "edition",
        itemId: ids.editionTwo,
        name: "Second Server Priced Edition",
        priceCents: 789,
        quantity: 1,
      }],
      amountCents: 3257,
      currency: "usd",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const payload = {
      id: sessionId,
      amount_total: 3257,
      currency: "usd",
      customer_details: { email: user.email, name: user.name },
      metadata: {
        commerce: "seller",
        storeId: ids.store,
        userId: ids.user,
        intentId: ids.intent,
      },
    };
    await processSellerCheckoutPayment({ id: `evt_${RUN}_1`, account: "acct_seller_test" }, payload);
    await processSellerCheckoutPayment({ id: `evt_${RUN}_2`, account: "acct_seller_test" }, payload);

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, ids.order)).limit(1);
    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, ids.order));
    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, ids.user)).limit(1);
    expect(order?.downloadLinks).toEqual([]);
    expect(order?.items[0]).toMatchObject({ itemType: "edition", itemId: ids.edition, priceCents: 1234, quantity: 2 });
    expect(order?.items[1]).toMatchObject({ itemType: "edition", itemId: ids.editionTwo, priceCents: 789, quantity: 1 });
    expect(payments).toHaveLength(1);
    expect(buyer?.plan).toBeNull();
    expect(buyer?.planStatus).toBeNull();
    expect(emailMocks.sendOrderReceipt).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendOrderReceipt.mock.calls[0]?.[0].downloadLinks).toHaveLength(2);
  });

  it("refuses a missing intent ID before creating an order", async () => {
    const missingPayload = {
      id: `cs_missing_${RUN}`,
      amount_total: 1234,
      currency: "usd",
      customer_details: { email: user.email },
      metadata: { commerce: "seller", storeId: ids.store, userId: ids.user, intentId: "missing-intent" },
    };
    await expect(processSellerCheckoutPayment(
      { id: `evt_missing_${RUN}`, account: "acct_seller_test" },
      missingPayload,
    )).rejects.toThrow("not found");

  });

  it("fulfills a verified delayed asynchronous payment after its session window closes", async () => {
    const expiredIntent = `ci_delayed_${RUN}`;
    await db.insert(checkoutIntentsTable).values({
      id: expiredIntent,
      storeId: ids.store,
      buyerUserId: ids.user,
      items: [{ itemType: "edition", itemId: ids.edition, name: "Server Priced Edition", priceCents: 1234, quantity: 1 }],
      amountCents: 1234,
      currency: "usd",
      expiresAt: new Date(Date.now() - 1_000),
    });
    const delayedPayload = {
      id: `cs_delayed_${RUN}`,
      amount_total: 1234,
      currency: "usd",
      customer_details: { email: user.email },
      metadata: { commerce: "seller", storeId: ids.store, userId: ids.user, intentId: expiredIntent },
    };
    await expect(processSellerCheckoutPayment(
      { id: `evt_async_${RUN}`, account: "acct_seller_test" },
      delayedPayload,
    )).resolves.toBeUndefined();
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, ids.delayedOrder)).limit(1);
    expect(order?.items).toMatchObject([{ itemType: "edition", itemId: ids.edition, priceCents: 1234 }]);
    await db.delete(paymentsTable).where(eq(paymentsTable.orderId, ids.delayedOrder));
    await db.delete(ordersTable).where(eq(ordersTable.id, ids.delayedOrder));
  });

  it("rejects an expired signed download without exposing receipt ownership", () => {
    const url = new URL(createSignedDownloadUrl(ids.order, 0, 0));
    expect(verifySignedDownload(
      ids.order,
      0,
      url.searchParams.get("expires"),
      url.searchParams.get("signature"),
      48 * 60 * 60 * 1000,
    )).toBe(false);
  });

  it("renders every purchased file in a multi-edition receipt", () => {
    const receipt = orderReceipt({
      storeName: "Seller Checkout Test Store",
      downloads: [
        { name: "Edition One", url: "https://example.test/download/one" },
        { name: "Edition Two", url: "https://example.test/download/two" },
      ],
      recoveryUrl: "https://example.test/api/orders/recovery",
    });
    expect(receipt.html).toContain("https://example.test/download/one");
    expect(receipt.html).toContain("https://example.test/download/two");
    expect(receipt.text).toContain("Edition One: https://example.test/download/one");
    expect(receipt.text).toContain("Edition Two: https://example.test/download/two");
  });

  it("returns the same lost-receipt recovery response for known and unknown addresses", async () => {
    await db.update(ordersTable).set({
      downloadLinks: [{ name: "Old permanent link", url: "https://legacy.example.test/permanent-file.pdf" }],
    }).where(eq(ordersTable.id, ids.order));
    emailMocks.sendOrderReceipt.mockClear();
    const known = await request(guestApp).post("/api/orders/recovery").send({ email: user.email }).expect(202);
    const unknown = await request(guestApp).post("/api/orders/recovery").send({ email: `unknown-${RUN}@example.test` }).expect(202);
    expect(known.body).toEqual(unknown.body);
    const receipt = emailMocks.sendOrderReceipt.mock.calls[0]?.[0];
    expect(receipt.downloadLinks[0].url).not.toContain("legacy.example.test");
    expect(receipt.downloadLinks[0].url).toContain(`/api/orders/${ids.order}/downloads/0`);
  });

  it("serves a browser recovery form for expired-link guidance", async () => {
    const response = await request(guestApp).get("/api/orders/recovery").expect(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain('action="/api/orders/recovery"');
  });

  it("accepts the recovery page's URL-encoded email submission", async () => {
    emailMocks.sendOrderReceipt.mockClear();
    await request(guestApp)
      .post("/api/orders/recovery")
      .type("form")
      .send({ email: user.email })
      .expect(202);
    expect(emailMocks.sendOrderReceipt).toHaveBeenCalledTimes(1);
  });

  it("uses the generating staff member as the Drive credential owner", () => {
    expect(plannerDriveCredentialOwner({ userId: "staff-generated-planner" })).toBe("staff-generated-planner");
  });
});