/**
 * Billing routes — POST /checkout {plan}, POST /webhooks/stripe
 * Per spec/API-CONTRACT.md
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, plansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { requireAuth } from "../lib/auth-middleware";
import { logger } from "../lib/logger";
import type { User } from "@workspace/db";

const router: IRouter = Router();
const BILLABLE_PLANS = ["yearly", "lifetime"] as const;

type BillablePlan = (typeof BILLABLE_PLANS)[number];
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
  eventId: string,
  payload: StripePayload,
): Promise<void> {
  const metadata = payload.metadata ?? {};
  const customerId = getStripeId(payload.customer);
  const user = await resolveWebhookUser(metadata.userId, customerId);

  if (!user) {
    logger.error(
      { eventId, customer: customerId, metadataUserId: metadata.userId },
      "Stripe webhook could not resolve a user",
    );
    throw new Error("Stripe webhook could not resolve a user");
  }

  const plan = isBillablePlan(metadata.plan)
    ? metadata.plan
    : (user.plan as BillablePlan | null);
  if (!isBillablePlan(plan)) {
    logger.error({ eventId, userId: user.id }, "Stripe webhook could not resolve a billable plan");
    throw new Error("Stripe webhook could not resolve a billable plan");
  }

  const periodEnd = plan === "yearly"
    ? await resolveSubscriptionPeriodEnd(stripe, payload)
    : null;
  if (plan === "yearly" && !periodEnd) {
    logger.error({ eventId, userId: user.id }, "Stripe webhook has no subscription period end");
    throw new Error("Stripe webhook has no subscription period end");
  }

  // `owned` is a permanent-purchase ledger. Yearly access is intentionally
  // represented only by the active subscription fields below.
  const owned = [...(user.owned ?? [])];
  if (plan === "lifetime" && !owned.includes(plan)) owned.push(plan);
  const subscriptionId = getPayloadSubscriptionId(payload);
  const paymentIntentId = getStripeId(payload.payment_intent);

  await db
    .update(usersTable)
    .set({
      plan,
      owned,
      stripeCustomerId: customerId ?? user.stripeCustomerId,
      planStatus: plan === "yearly" ? "active" : "lifetime",
      planCurrentPeriodEnd: periodEnd,
      ...(plan === "yearly"
        ? { stripeSubscriptionId: subscriptionId ?? user.stripeSubscriptionId }
        : {}),
      ...(paymentIntentId
        ? { stripePaymentIntentId: paymentIntentId }
        : {}),
    })
    .where(eq(usersTable.id, user.id));
}

async function processNegativeSubscriptionEvent(
  eventId: string,
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
      { eventId, customer: customerId },
      "Stripe lifecycle webhook could not resolve a user",
    );
    throw new Error("Stripe lifecycle webhook could not resolve a user");
  }

  const hasSubscriptionMatch = correlation.subscriptionId
    ? user.stripeSubscriptionId === correlation.subscriptionId
    : false;
  const hasPaymentMatch = correlation.paymentIntentId
    ? user.stripePaymentIntentId === correlation.paymentIntentId
    : false;
  if (!hasSubscriptionMatch && !hasPaymentMatch) {
    logger.warn(
      {
        eventId,
        customer: customerId,
        subscriptionId: correlation.subscriptionId,
        paymentIntentId: correlation.paymentIntentId,
        activeSubscriptionId: user.stripeSubscriptionId,
        activePaymentIntentId: user.stripePaymentIntentId,
      },
      "Stripe lifecycle webhook did not match the user's active billing record; ignoring it",
    );
    return;
  }

  await db
    .update(usersTable)
    .set({
      planStatus,
      ...(planStatus === "inactive"
        ? { planCurrentPeriodEnd: unixSecondsToDate(payload.current_period_end) ?? user.planCurrentPeriodEnd }
        : {}),
    })
    .where(eq(usersTable.id, user.id));
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
        await processSuccessfulPayment(stripe, event.id, payload);
        break;
      case "checkout.session.async_payment_succeeded":
      case "invoice.payment_succeeded":
        await processSuccessfulPayment(stripe, event.id, payload);
        break;
      case "customer.subscription.deleted":
        await processNegativeSubscriptionEvent(event.id, payload, "inactive", {
          subscriptionId: payload.id,
        });
        break;
      case "invoice.payment_failed":
        await processNegativeSubscriptionEvent(event.id, payload, "payment_failed", {
          subscriptionId: getPayloadSubscriptionId(payload),
        });
        break;
      case "charge.refunded":
        await processNegativeSubscriptionEvent(event.id, payload, "refunded", {
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
