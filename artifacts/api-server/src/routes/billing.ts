/**
 * Billing routes — POST /checkout {plan}, POST /webhooks/stripe
 * Per spec/API-CONTRACT.md
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, plansTable } from "@workspace/db";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { requireAuth } from "../lib/auth-middleware";
import { logger } from "../lib/logger";
import type { User } from "@workspace/db";

const router: IRouter = Router();
const BILLABLE_PLANS = ["yearly", "lifetime"] as const;

type BillablePlan = (typeof BILLABLE_PLANS)[number];
type SuccessfulPaymentSource = "checkout" | "async_checkout" | "invoice";
type StripePayload = {
  id?: string;
  metadata?: Record<string, string>;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string; current_period_end?: number } | null;
  payment_intent?: string | { id?: string } | null;
  payment_status?: "paid" | "unpaid" | "no_payment_required" | string;
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

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, {
    // Keep the existing runtime API pin while allowing the newer SDK's
    // generated types to remain forward-compatible.
    apiVersion: "2025-06-30.basil" as Stripe.LatestApiVersion,
  });
}

function isBillablePlan(value: string | null | undefined): value is BillablePlan {
  return value != null && (BILLABLE_PLANS as readonly string[]).includes(value);
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

  const plan = isBillablePlan(metadata.plan)
    ? metadata.plan
    : (user.plan as BillablePlan | null);
  if (!isBillablePlan(plan)) {
    logger.error({ eventId: event.id, userId: user.id }, "Stripe webhook could not resolve a billable plan");
    throw new Error("Stripe webhook could not resolve a billable plan");
  }

  const subscriptionId = getPayloadSubscriptionId(payload);
  const eventCreatedAt = unixSecondsToDate(event.created);
  if (plan === "yearly") {
    if (!subscriptionId || !eventCreatedAt) {
      logger.error({ eventId: event.id, userId: user.id }, "Stripe webhook is missing yearly subscription correlation");
      throw new Error("Stripe webhook is missing yearly subscription correlation");
    }

  }

  const periodEnd = plan === "yearly"
    ? await resolveSubscriptionPeriodEnd(stripe, payload)
    : null;
  if (plan === "yearly" && !periodEnd) {
    logger.error({ eventId: event.id, userId: user.id }, "Stripe webhook has no subscription period end");
    throw new Error("Stripe webhook has no subscription period end");
  }

  const paymentIntentId = getStripeId(payload.payment_intent);

  // Make the correlation and ordering check part of the UPDATE itself. Two
  // concurrent deliveries can both read a stale user row, but only the update
  // whose predicate still matches the database row may change entitlement.
  // Stripe event timestamps are second-granularity, so equality is not treated
  // as newer: the first accepted delivery for that second wins deterministically.
  const yearlyUpdateGuard = plan === "yearly"
    ? (
      source === "checkout" || source === "async_checkout"
        ? or(
            isNull(usersTable.stripeSubscriptionId),
            and(
              isNull(usersTable.stripeSubscriptionEventCreatedAt),
              eq(usersTable.stripeSubscriptionId, subscriptionId!),
            ),
            lt(usersTable.stripeSubscriptionEventCreatedAt, eventCreatedAt!),
          )
        : or(
            isNull(usersTable.stripeSubscriptionId),
            and(
              eq(usersTable.stripeSubscriptionId, subscriptionId!),
              or(
                isNull(usersTable.stripeSubscriptionEventCreatedAt),
                lt(usersTable.stripeSubscriptionEventCreatedAt, eventCreatedAt!),
              ),
            ),
          )
    )
    : undefined;
  const updateCondition = yearlyUpdateGuard
    ? and(eq(usersTable.id, user.id), yearlyUpdateGuard)
    : eq(usersTable.id, user.id);
  const [updated] = await db
    .update(usersTable)
    .set({
      plan,
      // Yearly lifecycle updates must never write this append-only ownership
      // ledger. Lifetime appends happen inside PostgreSQL so concurrent yearly
      // webhooks cannot overwrite a newly granted permanent entitlement.
      ...(plan === "lifetime"
        ? {
            owned: sql`CASE
              WHEN ${usersTable.owned} @> '["lifetime"]'::jsonb THEN ${usersTable.owned}
              ELSE ${usersTable.owned} || '["lifetime"]'::jsonb
            END`,
          }
        : {}),
      stripeCustomerId: customerId ?? user.stripeCustomerId,
      planStatus: plan === "yearly" ? "active" : "lifetime",
      planCurrentPeriodEnd: periodEnd,
      ...(plan === "yearly"
        ? {
            stripeSubscriptionId: subscriptionId,
            stripeSubscriptionEventCreatedAt: eventCreatedAt,
          }
        : {}),
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
}

async function processNegativeSubscriptionEvent(
  event: Pick<Stripe.Event, "id" | "created">,
  payload: StripePayload,
  planStatus: "inactive" | "payment_failed" | "refunded",
  correlation: {
    subscriptionId?: string;
    paymentIntentId?: string;
  },
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

  const correlationCondition = correlation.subscriptionId
    ? eq(usersTable.stripeSubscriptionId, correlation.subscriptionId)
    : correlation.paymentIntentId
      ? eq(usersTable.stripePaymentIntentId, correlation.paymentIntentId)
      : undefined;
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
      "Stripe lifecycle webhook has no usable active billing correlation; ignoring it",
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
  }
}

// POST /checkout {plan} → Stripe session
router.post("/checkout", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const { plan } = req.body as { plan?: string };

  if (!isBillablePlan(plan)) {
    res.status(400).json({ error: 'plan must be "yearly" or "lifetime"' });
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

  const isYearly = plan === "yearly";
  const amount = isYearly ? planRow.yearlyPrice : planRow.oneTimePrice;
  if (amount == null || amount <= 0) {
    logger.error({ plan, amount }, "Plan has no usable price for this checkout mode");
    res.status(500).json({ error: "Plan is not purchasable — contact support" });
    return;
  }

  try {
    const stripe = getStripe();
    const appUrl = process.env.APP_URL ?? "http://localhost:5000";

    const session = await stripe.checkout.sessions.create({
      mode: isYearly ? "subscription" : "payment",
      customer_email: user.email,
      metadata: { userId: user.id, plan },
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amount * 100),
            product_data: { name: planRow.name },
            ...(isYearly
              ? { recurring: { interval: "year" } }
              : {}),
          },
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

// POST /webhooks/stripe — grants owned ids / sets plan
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
        });
        break;
      case "invoice.payment_failed":
        await processNegativeSubscriptionEvent(event, payload, "payment_failed", {
          subscriptionId: getPayloadSubscriptionId(payload),
        });
        break;
      case "charge.refunded":
        await processNegativeSubscriptionEvent(event, payload, "refunded", {
          paymentIntentId: getStripeId(payload.payment_intent),
        });
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
