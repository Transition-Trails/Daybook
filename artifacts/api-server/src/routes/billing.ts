/**
 * Billing routes — POST /checkout {plan}, POST /webhooks/stripe
 * Per spec/API-CONTRACT.md
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable, paymentsTable, usersTable, plansTable } from "@workspace/db";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import Stripe from "stripe";
import { requireAuth } from "../lib/auth-middleware";
import { requireSuperAdmin } from "../middleware/requireRole";
import { logger } from "../lib/logger";
import type { User } from "@workspace/db";
import { getConfiguredStripePriceId } from "../lib/stripe-price";
import { sendOrderReceipt } from "../lib/email/senders";

const router: IRouter = Router();

type SuccessfulPaymentSource = "checkout" | "async_checkout" | "invoice";
type StripePayload = {
  id?: string;
  metadata?: Record<string, string>;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string; current_period_end?: number } | null;
  payment_intent?: string | { id?: string } | null;
  invoice?: string | { id?: string } | null;
  payment_status?: "paid" | "unpaid" | "no_payment_required" | string;
  amount_total?: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  parent?: {
    subscription_details?: {
      subscription?: string | { id?: string } | null;
    } | null;
  } | null;
  current_period_end?: number;
  lines?: {
    data?: Array<{
      period?: { end?: number | null } | null;
    }>;
  };
};

// GET /billing/users/:userId/payments — complete subscription payment history
// Support access is deliberately super-admin-only and every row is filtered by
// the requested user before it is joined to its order and plan.
router.get(
  "/billing/users/:userId/payments",
  requireSuperAdmin,
  async (req, res): Promise<void> => {
    const userId = req.params.userId as string;

    try {
      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const rows = await db
        .select({
          id: paymentsTable.id,
          orderId: paymentsTable.orderId,
          orderStoreId: ordersTable.storeId,
          orderCreatedAt: ordersTable.createdAt,
          orderTotalCents: ordersTable.totalCents,
          orderCurrency: ordersTable.currency,
          planId: paymentsTable.planId,
          planName: plansTable.name,
          source: paymentsTable.source,
          status: paymentsTable.status,
          amountCents: paymentsTable.amountCents,
          currency: paymentsTable.currency,
          stripePaymentIntentId: paymentsTable.stripePaymentIntentId,
          stripeSubscriptionId: paymentsTable.stripeSubscriptionId,
          stripeInvoiceId: paymentsTable.stripeInvoiceId,
          lifecycleEventId: paymentsTable.lastLifecycleEventId,
          lifecycleEventType: paymentsTable.lastLifecycleEventType,
          lifecycleEventAt: paymentsTable.lastLifecycleEventAt,
          createdAt: paymentsTable.createdAt,
          updatedAt: paymentsTable.updatedAt,
        })
        .from(paymentsTable)
        .innerJoin(ordersTable, eq(ordersTable.id, paymentsTable.orderId))
        .innerJoin(plansTable, eq(plansTable.id, paymentsTable.planId))
        .where(eq(paymentsTable.userId, userId))
        .orderBy(paymentsTable.createdAt);

      res.json({
        payments: rows.map((row) => ({
          id: row.id,
          order: {
            id: row.orderId,
            storeId: row.orderStoreId,
            createdAt: row.orderCreatedAt,
            totalCents: row.orderTotalCents,
            currency: row.orderCurrency,
          },
          plan: { id: row.planId, name: row.planName },
          source: row.source,
          status: row.status,
          amountCents: row.amountCents,
          currency: row.currency,
          stripe: {
            paymentIntentId: row.stripePaymentIntentId,
            subscriptionId: row.stripeSubscriptionId,
            invoiceId: row.stripeInvoiceId,
          },
          lifecycleEvent: {
            id: row.lifecycleEventId,
            type: row.lifecycleEventType,
            at: row.lifecycleEventAt,
          },
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      });
    } catch (err) {
      logger.error({ err, userId }, "Could not load customer payment history");
      res.status(500).json({ error: "Could not load payment history" });
    }
  },
);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, {
    // Keep the existing runtime API pin while allowing the newer SDK's
    // generated types to remain forward-compatible.
    apiVersion: "2025-06-30.basil" as Stripe.LatestApiVersion,
  });
}

function getStripeId(value: string | { id?: string } | null | undefined): string | undefined {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : undefined;
}

function isConfirmedCheckoutPayment(payload: StripePayload): boolean {
  return payload.payment_status === "paid" || payload.payment_status === "no_payment_required";
}

function getPayloadSubscriptionId(payload: StripePayload): string | undefined {
  return getStripeId(payload.subscription)
    ?? getStripeId(payload.parent?.subscription_details?.subscription);
}

function unixSecondsToDate(value: number | null | undefined): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

function invoicePeriodEnd(payload: StripePayload): Date | null {
  return unixSecondsToDate(payload.lines?.data?.[0]?.period?.end);
}

async function resolveSubscriptionPeriodEnd(
  stripe: Stripe,
  payload: StripePayload,
): Promise<Date | null> {
  const directPeriodEnd = unixSecondsToDate(payload.current_period_end);
  if (directPeriodEnd) return directPeriodEnd;

  if (typeof payload.subscription === "object" && payload.subscription) {
    const expandedPeriodEnd = unixSecondsToDate(payload.subscription.current_period_end);
    if (expandedPeriodEnd) return expandedPeriodEnd;
  }

  const subscriptionId = getPayloadSubscriptionId(payload);
  if (!subscriptionId) return invoicePeriodEnd(payload);

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return unixSecondsToDate(
    (subscription as unknown as { current_period_end?: number }).current_period_end,
  );
}

async function resolvePaymentIntentId(
  stripe: Stripe,
  payload: StripePayload,
  source: SuccessfulPaymentSource,
): Promise<string | undefined> {
  const directPaymentIntentId = getStripeId(payload.payment_intent);
  if (directPaymentIntentId || source !== "invoice" || !payload.id) {
    return directPaymentIntentId;
  }

  try {
    const payments = await stripe.invoicePayments.list({
      invoice: payload.id,
      status: "paid",
      payment: { type: "payment_intent" },
      limit: 1,
    });
    return getStripeId(payments.data[0]?.payment.payment_intent);
  } catch (err) {
    logger.warn(
      { err, invoice: payload.id },
      "Could not resolve the invoice payment intent",
    );
    return undefined;
  }
}

async function resolveRefundSubscriptionId(
  stripe: Stripe,
  payload: StripePayload,
): Promise<string | undefined> {
  const directSubscriptionId = getPayloadSubscriptionId(payload);
  if (directSubscriptionId) return directSubscriptionId;

  const invoiceId = getStripeId(payload.invoice);
  if (!invoiceId) return undefined;

  const invoice = await stripe.invoices.retrieve(invoiceId);
  return getPayloadSubscriptionId(invoice as unknown as StripePayload);
}

async function resolveWebhookUser(
  metadataUserId: string | undefined,
  customerId: string | undefined,
) {
  if (metadataUserId) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, metadataUserId));
    return user;
  }

  if (customerId) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.stripeCustomerId, customerId));
    return user;
  }

  return undefined;
}

function getPaymentAmountCents(payload: StripePayload): number | null {
  const amount = payload.amount_total ?? payload.amount_paid;
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}

function getPaymentInvoiceId(payload: StripePayload, source: SuccessfulPaymentSource): string | undefined {
  return source === "invoice" ? payload.id : getStripeId(payload.invoice);
}

function billingOrderId(eventId: string): string {
  return `ord_billing_${eventId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Write the local payment ledger after the entitlement update has been
 * accepted. The lookup makes retries idempotent across checkout and invoice
 * events for the same Stripe payment intent. A failed write is allowed to
 * surface to Stripe as a 500, so a retry can repair an order that was inserted
 * immediately before the payment row.
 */
async function recordSuccessfulPayment(
  event: Pick<Stripe.Event, "id">,
  payload: StripePayload,
  source: SuccessfulPaymentSource,
  user: User,
  plan: string,
  paymentIntentId: string | undefined,
  shouldCreateOrRepair: boolean,
): Promise<void> {
  const invoiceId = getPaymentInvoiceId(payload, source);
  // Subscription checkout often precedes the invoice that carries the durable
  // payment identity. Wait for that invoice instead of creating a second,
  // checkout-event-only order for the same subscription payment.
  if ((source === "checkout" || source === "async_checkout") && !paymentIntentId && !invoiceId) {
    return;
  }
  const identityConditions = [
    paymentIntentId ? eq(paymentsTable.stripePaymentIntentId, paymentIntentId) : undefined,
    invoiceId ? eq(paymentsTable.stripeInvoiceId, invoiceId) : undefined,
    eq(paymentsTable.stripeEventId, event.id),
  ].filter((condition): condition is ReturnType<typeof eq> => Boolean(condition));
  const [existingPayment] = await db
    .select()
    .from(paymentsTable)
    .where(or(...identityConditions));

  if (existingPayment || !shouldCreateOrRepair) return;

  const amountCents = getPaymentAmountCents(payload);
  const currency = typeof payload.currency === "string" && payload.currency.trim()
    ? payload.currency
    : null;
  const orderId = billingOrderId(event.id);
  const [order] = await db
    .insert(ordersTable)
    .values({
      id: orderId,
      // Platform subscription purchases belong to the seeded house store so
      // every order keeps a valid seller foreign key.
      storeId: "store-house",
      buyerUserId: user.id,
      buyerEmail: user.email,
      buyerName: user.name ?? null,
      items: [{ name: `${plan} subscription`, priceCents: amountCents ?? 0 }],
      totalCents: amountCents ?? 0,
      currency: currency ?? "usd",
      downloadLinks: [],
    })
    .onConflictDoNothing()
    .returning();

  if (!order) {
    const [existingOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    if (!existingOrder) {
      throw new Error("Billing payment order could not be created");
    }
  }

  // Stripe remains authoritative even if email delivery is unavailable. The
  // order records both success and a queryable failure so support can retry.
  if (order) {
    const attemptedAt = new Date();
    await db.update(ordersTable).set({
      receiptAttempts: order.receiptAttempts + 1,
      receiptLastAttemptAt: attemptedAt,
      receiptLastError: null,
    }).where(eq(ordersTable.id, order.id));
    try {
      await sendOrderReceipt({
        orderId: order.id,
        storeId: order.storeId,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName ?? undefined,
        items: order.items,
        totalCents: order.totalCents,
        currency: order.currency,
        downloadLinks: order.downloadLinks,
        resendToken: order.resendToken ?? undefined,
      });
      await db.update(ordersTable).set({
        receiptSentAt: attemptedAt,
        receiptLastError: null,
      }).where(eq(ordersTable.id, order.id));
    } catch (err) {
      await db.update(ordersTable).set({
        receiptLastError: err instanceof Error ? err.message : String(err),
      }).where(eq(ordersTable.id, order.id));
      logger.warn({ err, orderId: order.id, eventId: event.id }, "Initial order receipt delivery failed");
    }
  }

  await db
    .insert(paymentsTable)
    .values({
      id: `payment_${event.id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      orderId,
      userId: user.id,
      planId: plan,
      source,
      status: "succeeded",
      stripeEventId: event.id,
      stripePaymentIntentId: paymentIntentId ?? null,
      stripeSubscriptionId: getPayloadSubscriptionId(payload) ?? null,
      stripeInvoiceId: invoiceId ?? null,
      amountCents,
      currency,
    })
    .onConflictDoNothing()
    .returning({ id: paymentsTable.id });
}

async function recordLifecyclePaymentEvent(
  event: Pick<Stripe.Event, "id" | "created">,
  status: "failed" | "refunded" | "cancelled",
  correlation: { paymentIntentId?: string; subscriptionId?: string; invoiceId?: string },
  eventType: string,
): Promise<void> {
  // Prefer the narrowest Stripe identity. A subscription can have many
  // renewal orders, so a refund carrying a payment intent or invoice must not
  // annotate every historical payment for that subscription.
  const narrowConditions = [
    correlation.paymentIntentId
      ? eq(paymentsTable.stripePaymentIntentId, correlation.paymentIntentId)
      : undefined,
    correlation.invoiceId ? eq(paymentsTable.stripeInvoiceId, correlation.invoiceId) : undefined,
  ].filter((condition): condition is ReturnType<typeof eq> => Boolean(condition));

  for (const condition of narrowConditions) {
    const updated = await db
      .update(paymentsTable)
      .set({
        status,
        lastLifecycleEventId: event.id,
        lastLifecycleEventType: eventType,
        lastLifecycleEventAt: unixSecondsToDate(event.created),
      })
      .where(condition)
      .returning({ id: paymentsTable.id });
    if (updated.length) return;
  }

  if (correlation.subscriptionId) {
    logger.warn(
      {
        eventId: event.id,
        eventType,
        status,
        subscriptionId: correlation.subscriptionId,
      },
      "Stripe lifecycle payment event has only a subscription id; leaving ledger rows unchanged",
    );
  }
}

async function processSuccessfulPayment(
  stripe: Stripe,
  event: Pick<Stripe.Event, "id" | "created">,
  payload: StripePayload,
  source: SuccessfulPaymentSource,
): Promise<void> {
  const metadata = payload.metadata ?? {};
  const customerId = getStripeId(payload.customer);
  const user = await resolveWebhookUser(metadata.userId, customerId);

  if (!user) {
    logger.error(
      { eventId: event.id, customer: customerId, metadataUserId: metadata.userId },
      "Stripe webhook could not resolve a user",
    );
    throw new Error("Stripe webhook could not resolve a user");
  }

  const subscriptionId = getPayloadSubscriptionId(payload);
  const plan = typeof metadata.plan === "string" && metadata.plan.trim()
    ? metadata.plan
    : typeof user.plan === "string" && user.plan.trim()
      ? user.plan
      : undefined;
  if (!plan) {
    logger.error({ eventId: event.id, userId: user.id }, "Stripe webhook could not resolve a billable plan");
    throw new Error("Stripe webhook could not resolve a billable plan");
  }

  const eventCreatedAt = unixSecondsToDate(event.created);
  if (!subscriptionId || !eventCreatedAt) {
    logger.error({ eventId: event.id, userId: user.id }, "Stripe webhook is missing yearly subscription correlation");
    throw new Error("Stripe webhook is missing yearly subscription correlation");
  }

  const periodEnd = await resolveSubscriptionPeriodEnd(stripe, payload);
  if (!periodEnd) {
    logger.error({ eventId: event.id, userId: user.id }, "Stripe webhook has no subscription period end");
    throw new Error("Stripe webhook has no subscription period end");
  }

  const paymentIntentId = await resolvePaymentIntentId(stripe, payload, source);
  const retryingAcceptedEvent =
    user.stripeSubscriptionId === subscriptionId
    && user.stripeSubscriptionEventCreatedAt?.getTime() === eventCreatedAt.getTime();

  // Make the correlation and ordering check part of the UPDATE itself. Two
  // concurrent deliveries can both read a stale user row, but only the update
  // whose predicate still matches the database row may change entitlement.
  // Stripe event timestamps are second-granularity, so equality is not treated
  // as newer: the first accepted delivery for that second wins deterministically.
  const updateCondition = and(
    eq(usersTable.id, user.id),
    source === "checkout" || source === "async_checkout"
      ? or(
          isNull(usersTable.stripeSubscriptionId),
          and(
            isNull(usersTable.stripeSubscriptionEventCreatedAt),
            eq(usersTable.stripeSubscriptionId, subscriptionId),
          ),
          lt(usersTable.stripeSubscriptionEventCreatedAt, eventCreatedAt),
        )
      : or(
          isNull(usersTable.stripeSubscriptionId),
          and(
            eq(usersTable.stripeSubscriptionId, subscriptionId),
            or(
              isNull(usersTable.stripeSubscriptionEventCreatedAt),
              lt(usersTable.stripeSubscriptionEventCreatedAt, eventCreatedAt),
            ),
          ),
        ),
  );
  const [updated] = await db
    .update(usersTable)
    .set({
      plan,
      stripeCustomerId: customerId ?? user.stripeCustomerId,
      planStatus: "active",
      planCurrentPeriodEnd: periodEnd,
      stripeSubscriptionId: subscriptionId,
      stripeSubscriptionEventCreatedAt: eventCreatedAt,
      ...(paymentIntentId
        ? { stripePaymentIntentId: paymentIntentId }
        : {}),
    })
    .where(updateCondition)
    .returning({ id: usersTable.id });

  if (!updated) {
    logger.warn(
      {
        eventId: event.id,
        source,
        subscriptionId,
        eventCreatedAt,
      },
      "Stripe successful payment did not atomically advance the active subscription; ignoring it",
    );
  }

  await recordSuccessfulPayment(
    event,
    payload,
    source,
    user,
    plan,
    paymentIntentId,
    Boolean(updated) || retryingAcceptedEvent,
  );
}

async function processNegativeSubscriptionEvent(
  event: Pick<Stripe.Event, "id" | "created">,
  payload: StripePayload,
  planStatus: "inactive" | "payment_failed" | "refunded",
  correlation: {
    subscriptionId?: string;
    paymentIntentId?: string;
    invoiceId?: string;
  },
  eventType: string,
): Promise<void> {
  const customerId = getStripeId(payload.customer);
  const user = await resolveWebhookUser(undefined, customerId);
  if (!user) {
    logger.error(
      { eventId: event.id, customer: customerId },
      "Stripe lifecycle webhook could not resolve a user",
    );
    throw new Error("Stripe lifecycle webhook could not resolve a user");
  }

  const correlationConditions = [
    correlation.subscriptionId
      ? eq(usersTable.stripeSubscriptionId, correlation.subscriptionId)
      : undefined,
    correlation.paymentIntentId
      ? eq(usersTable.stripePaymentIntentId, correlation.paymentIntentId)
      : undefined,
  ].filter((condition): condition is ReturnType<typeof eq> => Boolean(condition));
  const correlationCondition = correlationConditions.length === 0
    ? undefined
    : correlationConditions.length === 1
      ? correlationConditions[0]
      : or(...correlationConditions);

  if (!user.stripeSubscriptionId && !user.stripePaymentIntentId) {
    logger.warn(
      {
        eventId: event.id,
        customer: customerId,
        subscriptionId: correlation.subscriptionId,
        paymentIntentId: correlation.paymentIntentId,
      },
      "Stripe lifecycle event arrived before checkout correlation; retrying",
    );
    throw new Error("Stripe lifecycle event arrived before checkout correlation");
  }

  if (!correlationCondition) {
    logger.warn(
      {
        eventId: event.id,
        customer: customerId,
        subscriptionId: correlation.subscriptionId,
        paymentIntentId: correlation.paymentIntentId,
        activeSubscriptionId: user.stripeSubscriptionId,
        activePaymentIntentId: user.stripePaymentIntentId,
      },
      "Stripe lifecycle event has no usable correlation for the known billing record; ignoring it",
    );
    return;
  }

  const matchesStoredSubscription =
    correlation.subscriptionId !== undefined
    && user.stripeSubscriptionId === correlation.subscriptionId;
  const matchesStoredPaymentIntent =
    correlation.paymentIntentId !== undefined
    && user.stripePaymentIntentId === correlation.paymentIntentId;
  if (!matchesStoredSubscription && !matchesStoredPaymentIntent) {
    logger.warn(
      {
        eventId: event.id,
        customer: customerId,
        subscriptionId: correlation.subscriptionId,
        paymentIntentId: correlation.paymentIntentId,
        activeSubscriptionId: user.stripeSubscriptionId,
        activePaymentIntentId: user.stripePaymentIntentId,
      },
      "Stripe lifecycle event belongs to a different subscription or payment; ignoring it",
    );
    return;
  }

  const eventCreatedAt = unixSecondsToDate(event.created);
  if (!eventCreatedAt) {
    throw new Error("Stripe lifecycle webhook is missing an event timestamp");
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      planStatus,
      stripeSubscriptionEventCreatedAt: eventCreatedAt,
      ...(planStatus === "inactive"
        ? { planCurrentPeriodEnd: unixSecondsToDate(payload.current_period_end) ?? user.planCurrentPeriodEnd }
        : {}),
    })
    .where(and(
      eq(usersTable.id, user.id),
      correlationCondition,
      // Preserve the same first-delivery-wins policy for events that share a
      // Stripe-created second with the latest successful subscription event.
      or(
        isNull(usersTable.stripeSubscriptionEventCreatedAt),
        lt(usersTable.stripeSubscriptionEventCreatedAt, eventCreatedAt),
      ),
    ))
    .returning({ id: usersTable.id });

  if (!updated) {
    logger.warn(
      {
        eventId: event.id,
        subscriptionId: correlation.subscriptionId,
        paymentIntentId: correlation.paymentIntentId,
        eventCreatedAt,
      },
      "Stripe lifecycle webhook did not atomically advance the active billing record; ignoring it",
    );
    return;
  }

  await recordLifecyclePaymentEvent(event, planStatus === "inactive"
    ? "cancelled"
    : planStatus === "payment_failed"
      ? "failed"
      : "refunded", correlation, eventType);
}

// POST /checkout {plan} → Stripe session
router.post("/checkout", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const { plan } = req.body as { plan?: string };

  if (typeof plan !== "string" || !plan.trim()) {
    res.status(400).json({ error: "plan is required" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(501).json({ error: "Stripe not configured — set STRIPE_SECRET_KEY" });
    return;
  }

  const [planRow] = await db.select().from(plansTable).where(eq(plansTable.id, plan));
  if (!planRow) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const priceId = getConfiguredStripePriceId(planRow.stripePriceId);
  if (!priceId) {
    logger.error({ plan }, "Plan has no Stripe price id — not purchasable");
    res.status(500).json({ error: "Plan is not purchasable — contact support" });
    return;
  }

  try {
    const stripe = getStripe();
    const appUrl = process.env.APP_URL ?? "http://localhost:5000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      metadata: { userId: user.id, plan },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/?checkout=success&plan=${plan}`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    logger.error({ err }, "Checkout session creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// POST /webhooks/stripe — advances the yearly subscription lifecycle
router.post("/webhooks/stripe", async (req, res): Promise<void> => {
  const rawSignature = req.headers["stripe-signature"];
  const sig = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    logger.error(
      {
        hasWebhookSecret: Boolean(webhookSecret),
        hasApiKey: Boolean(process.env.STRIPE_SECRET_KEY),
      },
      "Stripe webhook received but billing is not configured — returning 503 so Stripe retries",
    );
    res.status(503).json({ error: "Billing not configured" });
    return;
  }

  let event: Stripe.Event;
  const stripe = getStripe();
  try {
    event = stripe.webhooks.constructEvent(req.body, sig ?? "", webhookSecret);
  } catch (err) {
    logger.warn({ err }, "Stripe signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    const payload = event.data.object as StripePayload;
    switch (event.type) {
      case "checkout.session.completed":
        if (!isConfirmedCheckoutPayment(payload)) {
          logger.warn(
            { eventId: event.id, paymentStatus: payload.payment_status },
            "Checkout completed before payment confirmation; awaiting asynchronous payment success",
          );
          break;
        }
        await processSuccessfulPayment(stripe, event, payload, "checkout");
        break;
      case "checkout.session.async_payment_succeeded":
        await processSuccessfulPayment(stripe, event, payload, "async_checkout");
        break;
      case "invoice.payment_succeeded":
        await processSuccessfulPayment(stripe, event, payload, "invoice");
        break;
      case "customer.subscription.deleted":
        await processNegativeSubscriptionEvent(event, payload, "inactive", {
          subscriptionId: payload.id,
        }, event.type);
        break;
      case "invoice.payment_failed":
        await processNegativeSubscriptionEvent(event, payload, "payment_failed", {
          subscriptionId: getPayloadSubscriptionId(payload),
          invoiceId: payload.id,
        }, event.type);
        break;
      case "charge.refunded":
        // A successful invoice can still activate access if payment-intent
        // enrichment is temporarily unavailable. A refund for that charge must
        // then correlate through the charge's invoice/subscription instead.
        await processNegativeSubscriptionEvent(event, payload, "refunded", {
          subscriptionId: await resolveRefundSubscriptionId(stripe, payload),
          paymentIntentId: getStripeId(payload.payment_intent),
          invoiceId: getStripeId(payload.invoice),
        }, event.type);
        break;
      default:
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err, eventId: event.id }, "Stripe webhook processing failed");
    res.status(500).json({ error: "Processing failed" });
  }
});

export default router;
