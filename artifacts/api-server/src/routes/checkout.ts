/**
 * Seller checkout.
 *
 * The browser submits catalog references and quantities only. Stripe sessions
 * are direct charges on the seller's connected account; prices, currency,
 * ownership, entitlement, and delivery references are resolved here.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  checkoutIntentsTable,
  editionsTable,
  ordersTable,
  paymentsTable,
  storeCatalogTable,
  storesTable,
  usersTable,
  type OrderItem,
} from "@workspace/db";
import { resolveStoreActorOptional } from "../middleware/requireRole";
import { assertEntitled, EntitlementError, type EntitlementContext } from "../lib/entitlement";
import { createSignedDownloadLinks } from "../lib/order-delivery";
import { sendOrderReceipt } from "../lib/email/senders";
import { logger } from "../lib/logger";
import type { User } from "@workspace/db";
import { isPurchasableItemType } from "../lib/catalog-commerce";

const router: IRouter = Router();
const GUEST_WINDOW_MS = 60 * 60 * 1000;
const MAX_GUEST_CHECKOUTS_PER_WINDOW = 10;
const CHECKOUT_INTENT_TTL_MS = 60 * 60 * 1000;
const guestAttempts = new Map<string, { startedAt: number; count: number }>();
// Process-local by design; move this to a shared store before running more
// than one API instance so guest allowances apply consistently.

type RequestedItem = { itemType?: unknown; itemId?: unknown; quantity?: unknown };
type ResolvedItem = OrderItem & { itemType: string; itemId: string; quantity: number };

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2025-06-30.basil" as Stripe.LatestApiVersion });
}

function guestRateLimitKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function allowGuestCheckout(req: Request): boolean {
  const key = guestRateLimitKey(req);
  const now = Date.now();
  const previous = guestAttempts.get(key);
  if (!previous || now - previous.startedAt >= GUEST_WINDOW_MS) {
    guestAttempts.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (previous.count >= MAX_GUEST_CHECKOUTS_PER_WINDOW) return false;
  previous.count += 1;
  return true;
}

async function loadResolvedItem(
  storeId: string,
  requested: { itemType: string; itemId: string; quantity: number },
  ctx: EntitlementContext,
): Promise<ResolvedItem> {
  if (!isPurchasableItemType(requested.itemType)) {
    // Only editions currently resolve to seller-owned generated PDFs. Refuse
    // any catalog reference without a concrete, secure delivery implementation.
    throw new Error("Only downloadable planner editions are available for checkout");
  }
  const [enabled] = await db
    .select({ id: storeCatalogTable.id })
    .from(storeCatalogTable)
    .where(and(
      eq(storeCatalogTable.storeId, storeId),
      eq(storeCatalogTable.itemType, requested.itemType),
      eq(storeCatalogTable.itemId, requested.itemId),
    ))
    .limit(1);
  if (!enabled) {
    throw new Error(`Item "${requested.itemId}" is not available in this store`);
  }

  let name: string | undefined;
  let priceCents: number | null = null;
  let origin: "starter" | "licensed" | "owned" = "licensed";
  let authoredByStoreId: string | null = null;

  if (requested.itemType === "edition") {
    const [row] = await db.select().from(editionsTable).where(and(
      eq(editionsTable.id, requested.itemId),
      eq(editionsTable.status, "live"),
    ));
    if (!row) throw new Error(`Edition "${requested.itemId}" is not available for purchase`);
    name = row.name;
    priceCents = row.digitalPriceCents;
    origin = (row.origin ?? "licensed") as typeof origin;
    authoredByStoreId = row.authoredByStoreId;
  } else {
    throw new Error(`Unsupported checkout item type "${requested.itemType}"`);
  }

  if (!name || priceCents === null) {
    throw new Error(`Item "${requested.itemId}" has no server price`);
  }
  if (priceCents <= 0) {
    throw new Error(`Item "${requested.itemId}" is not available for paid checkout`);
  }
  assertEntitled(requested.itemId, requested.itemType, origin, authoredByStoreId, ctx);
  return {
    itemType: requested.itemType,
    itemId: requested.itemId,
    name,
    priceCents,
    quantity: requested.quantity,
  };
}

function parseRequestedItems(body: unknown): Array<{ itemType: string; itemId: string; quantity: number }> {
  if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) {
    throw new Error("items must be a non-empty array");
  }
  const items = (body as { items: RequestedItem[] }).items;
  if (items.length === 0 || items.length > 20) throw new Error("items must contain 1 to 20 entries");
  return items.map((item) => {
    if (typeof item.itemType !== "string" || !item.itemType.trim()) {
      throw new Error("each item requires itemType");
    }
    if (typeof item.itemId !== "string" || !item.itemId.trim()) {
      throw new Error("each item requires itemId");
    }
    if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity)
      || item.quantity < 1 || item.quantity > 20) {
      throw new Error("quantity must be an integer from 1 to 20");
    }
    return { itemType: item.itemType.trim(), itemId: item.itemId.trim(), quantity: item.quantity };
  });
}

function parseResolvedItems(value: unknown): ResolvedItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new Error("Checkout intent has an invalid item list");
  }
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Checkout intent has invalid items");
    const item = raw as Record<string, unknown>;
    if (
      item.itemType !== "edition"
      || typeof item.itemId !== "string" || !item.itemId
      || typeof item.name !== "string" || !item.name
      || typeof item.priceCents !== "number" || !Number.isInteger(item.priceCents) || item.priceCents <= 0
      || typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20
    ) {
      throw new Error("Checkout intent has invalid items");
    }
    return {
      itemType: item.itemType,
      itemId: item.itemId,
      name: item.name,
      priceCents: item.priceCents,
      quantity: item.quantity,
    };
  });
}

function checkoutSuccessUrl(): string {
  return `${(process.env.APP_URL ?? "http://localhost:5000").replace(/\/+$/, "")}/?checkout=success`;
}

function checkoutCancelUrl(): string {
  return `${(process.env.APP_URL ?? "http://localhost:5000").replace(/\/+$/, "")}/?checkout=cancelled`;
}

router.post(
  "/store/:storeId/checkout",
  resolveStoreActorOptional,
  async (req: Request, res: Response): Promise<void> => {
    const storeId = req.params.storeId as string;
    const authenticated = req.isAuthenticated();
    // A signed-in caller is a buyer, not necessarily a member of the seller's
    // team. Authentication supplies buyer identity only; store authorization
    // applies to seller-management endpoints, not public checkout.
    if (!authenticated && !allowGuestCheckout(req)) {
      res.setHeader("Retry-After", String(Math.ceil(GUEST_WINDOW_MS / 1000)));
      res.status(429).json({ error: "Too many guest checkout attempts; please try again later" });
      return;
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      res.status(501).json({ error: "Seller checkout is not configured" });
      return;
    }

    let requestedItems: Array<{ itemType: string; itemId: string; quantity: number }>;
    try {
      requestedItems = parseRequestedItems(req.body);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid checkout request" });
      return;
    }

    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }
    if (store.status === "suspended") { res.status(410).json({ error: "This store is currently unavailable" }); return; }
    if (!store.stripeAccountId) {
      res.status(409).json({
        error: "This store is not ready to sell",
        reason: "stripe-account-missing",
      });
      return;
    }
    let stripe: Stripe;
    try {
      stripe = getStripe();
      // The persisted flag gives the admin UI a cheap status read, but money
      // movement always verifies the source-of-truth account field live.
      const account = await stripe.accounts.retrieve(store.stripeAccountId);
      if (account.charges_enabled !== true) {
        await db.update(storesTable).set({ stripeChargesEnabled: false })
          .where(eq(storesTable.id, storeId));
        res.status(409).json({
          error: "This store is not ready to sell",
          reason: "stripe-charges-disabled",
        });
        return;
      }
      if (!store.stripeChargesEnabled) {
        await db.update(storesTable).set({ stripeChargesEnabled: true })
          .where(eq(storesTable.id, storeId));
      }
    } catch (err) {
      logger.error({ err, storeId }, "Could not verify seller Stripe readiness");
      res.status(502).json({ error: "Could not verify this store's seller account" });
      return;
    }

    const ctx: EntitlementContext = {
      storeId,
      subscriptionActive: store.subscriptionActive,
      isSuperAdmin: false,
    };
    let resolvedItems: ResolvedItem[];
    try {
      resolvedItems = await Promise.all(requestedItems.map((item) => loadResolvedItem(storeId, item, ctx)));
    } catch (err) {
      if (err instanceof EntitlementError) {
        res.status(403).json({ error: err.message, itemId: err.itemId, itemType: err.itemType, reason: err.status });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : "Could not resolve checkout items" });
      return;
    }

    const intentId = `ci_${crypto.randomUUID().replace(/-/g, "")}`;
    const amountCents = resolvedItems.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    );
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + CHECKOUT_INTENT_TTL_MS);
    const user = authenticated ? req.user as User : undefined;

    try {
      await db.insert(checkoutIntentsTable).values({
        id: intentId,
        storeId,
        buyerUserId: user?.id ?? null,
        items: resolvedItems,
        amountCents,
        currency: "usd",
        createdAt,
        expiresAt,
      });
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: user?.email,
          line_items: resolvedItems.map((item) => ({
            price_data: {
              currency: "usd",
              unit_amount: item.priceCents,
              product_data: { name: item.name },
            },
            quantity: item.quantity,
          })),
          metadata: {
            commerce: "seller",
            storeId,
            ...(user ? { userId: user.id } : {}),
            intentId,
          },
          // A paid session must never outlive the authoritative cart snapshot.
          // Stripe requires this Unix timestamp to be 30 minutes–24 hours away;
          // the one-hour intent TTL satisfies that contract.
          expires_at: Math.floor(expiresAt.getTime() / 1000),
          success_url: checkoutSuccessUrl(),
          cancel_url: checkoutCancelUrl(),
        },
        { stripeAccount: store.stripeAccountId },
      );
      res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
      logger.error({ err, storeId }, "Seller checkout session creation failed");
      res.status(502).json({ error: "Failed to create seller checkout session" });
    }
  },
);

/**
 * Fulfill a connected-account Checkout Session. This deliberately does not
 * call the subscription fulfillment function in billing.ts.
 */
export async function processSellerCheckoutPayment(
  event: Pick<Stripe.Event, "id" | "account">,
  payload: {
    id?: string;
    metadata?: Record<string, string>;
    amount_total?: number | null;
    currency?: string | null;
    payment_status?: string;
    customer_details?: { email?: string | null; name?: string | null } | null;
    customer_email?: string | null;
  },
): Promise<void> {
  const metadata = payload.metadata ?? {};
  const storeId = metadata.storeId;
  const sessionId = payload.id;
  const intentId = metadata.intentId;
  if (!storeId || !sessionId || !intentId) {
    throw new Error("Seller checkout webhook is missing store/session intent metadata");
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store || !store.stripeAccountId) throw new Error("Seller checkout store is missing its connected account");
  if (event.account && event.account !== store.stripeAccountId) {
    throw new Error("Seller checkout webhook account does not match the store");
  }

  const [intent] = await db.select().from(checkoutIntentsTable)
    .where(eq(checkoutIntentsTable.id, intentId)).limit(1);
  if (!intent) throw new Error("Seller checkout intent was not found");
  if (intent.storeId !== storeId) throw new Error("Seller checkout intent belongs to a different store");
  // Intent expiry limits the Checkout Session's payment window (`expires_at` is
  // set when it is created). Do not reject a verified Stripe success event just
  // because its delivery is delayed: async payment methods and webhook retries
  // can legitimately arrive after that window has closed.
  if (metadata.userId && metadata.userId !== intent.buyerUserId) {
    throw new Error("Seller checkout intent buyer does not match the webhook");
  }
  let intentItems: ResolvedItem[];
  try {
    intentItems = parseResolvedItems(intent.items);
  } catch {
    throw new Error("Seller checkout intent has invalid item data");
  }

  const metadataUserId = metadata.userId;
  const [buyer] = metadataUserId
    ? await db.select().from(usersTable).where(eq(usersTable.id, metadataUserId)).limit(1)
    : [];
  const buyerEmail = payload.customer_details?.email ?? payload.customer_email ?? buyer?.email;
  if (!buyerEmail) throw new Error("Seller checkout webhook has no buyer email");

  const orderItems: OrderItem[] = intentItems.map((item) => ({
    itemType: item.itemType,
    itemId: item.itemId,
    name: item.name,
    priceCents: item.priceCents,
    quantity: item.quantity,
  }));
  const orderId = `ord_seller_${sessionId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const amountCents = intent.amountCents;
  const currency = intent.currency;
  if (typeof payload.amount_total === "number" && payload.amount_total !== amountCents) {
    throw new Error("Seller checkout payment amount does not match the checkout intent");
  }
  if (payload.currency && payload.currency.toLowerCase() !== currency.toLowerCase()) {
    throw new Error("Seller checkout payment currency does not match the checkout intent");
  }

  const result = await db.transaction(async (tx) => {
    // Stripe can retry and can emit both completed/async-succeeded events for
    // one Session. A transaction advisory lock makes the session identity the
    // single writer key before any order/payment side effect occurs.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`seller-checkout:${sessionId}`}))`);
    const [existingPayment] = await tx.select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.stripeCheckoutSessionId, sessionId))
      .limit(1);
    if (existingPayment) return { alreadyProcessed: true as const };

    const [createdOrder] = await tx.insert(ordersTable).values({
      id: orderId,
      storeId,
      buyerUserId: buyer?.id ?? null,
      buyerEmail,
      buyerName: payload.customer_details?.name ?? buyer?.name ?? null,
      items: orderItems,
      totalCents: amountCents,
      currency,
      downloadLinks: [],
    }).onConflictDoNothing().returning();
    const persistedOrder = createdOrder ?? (await tx.select().from(ordersTable)
      .where(eq(ordersTable.id, orderId)).limit(1))[0];
    if (!persistedOrder) throw new Error("Seller payment order could not be created");

    const [createdPayment] = await tx.insert(paymentsTable).values({
      id: `payment_${event.id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      orderId,
      userId: buyer?.id ?? null,
      planId: null,
      source: "seller_checkout",
      status: "succeeded",
      stripeEventId: event.id,
      stripeCheckoutSessionId: sessionId,
      stripeConnectedAccountId: store.stripeAccountId,
      amountCents,
      currency,
    }).returning();
    return { alreadyProcessed: false as const, order: persistedOrder, payment: createdPayment };
  });
  if (result.alreadyProcessed) return;
  const persistedOrder = result.order;
  const attemptedAt = new Date();
  await db.update(ordersTable).set({
    receiptAttempts: persistedOrder.receiptAttempts + 1,
    receiptLastAttemptAt: attemptedAt,
    receiptLastError: null,
  }).where(eq(ordersTable.id, persistedOrder.id));
  try {
    await sendOrderReceipt({
      orderId: persistedOrder.id,
      storeId: persistedOrder.storeId,
      buyerEmail: persistedOrder.buyerEmail,
      buyerName: persistedOrder.buyerName ?? undefined,
      items: persistedOrder.items,
      totalCents: persistedOrder.totalCents,
      currency: persistedOrder.currency,
      downloadLinks: createSignedDownloadLinks(persistedOrder.id, persistedOrder.items),
      resendToken: persistedOrder.resendToken ?? undefined,
    });
    await db.update(ordersTable).set({ receiptSentAt: attemptedAt, receiptLastError: null })
      .where(eq(ordersTable.id, persistedOrder.id));
  } catch (err) {
    await db.update(ordersTable).set({
      receiptLastError: err instanceof Error ? err.message : String(err),
    }).where(eq(ordersTable.id, persistedOrder.id));
    logger.warn({ err, orderId: persistedOrder.id, eventId: event.id }, "Seller receipt delivery failed");
  }
}

export { MAX_GUEST_CHECKOUTS_PER_WINDOW };
export default router;