import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, userPurchasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { CreateCheckoutSessionBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  // Lazy import to avoid crash if key not set
  const Stripe = require("stripe");
  return new Stripe(key, { apiVersion: "2025-06-30.basil" });
}

router.post("/billing/checkout", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const parsed = CreateCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(501).json({ error: "Stripe not configured" });
    return;
  }

  try {
    const stripe = getStripe();
    const appUrl = process.env.APP_URL ?? "http://localhost:5000";
    const session = await stripe.checkout.sessions.create({
      mode: parsed.data.priceType === "yearly" ? "subscription" : "payment",
      customer_email: user.email,
      metadata: {
        userId: String(user.id),
        priceType: parsed.data.priceType,
        editionId: String(parsed.data.editionId ?? ""),
        planId: String(parsed.data.planId ?? ""),
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round((parsed.data.priceType === "lifetime" ? 149 : parsed.data.priceType === "yearly" ? 99 : 49) * 100),
            product_data: {
              name: `Daybook ${parsed.data.priceType === "lifetime" ? "Lifetime" : parsed.data.priceType === "yearly" ? "Annual" : "One-Time"} Access`,
            },
            ...(parsed.data.priceType === "yearly" ? { recurring: { interval: "year" } } : {}),
          },
          quantity: 1,
        },
      ],
      success_url: parsed.data.successUrl ?? `${appUrl}/?checkout=success`,
      cancel_url: parsed.data.cancelUrl ?? `${appUrl}/?checkout=cancelled`,
    });
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    logger.error({ err }, "Checkout session creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/billing/portal", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(501).json({ error: "Stripe not configured" });
    return;
  }
  if (!user.stripeCustomerId) {
    res.status(400).json({ error: "No billing account found" });
    return;
  }
  try {
    const stripe = getStripe();
    const appUrl = process.env.APP_URL ?? "http://localhost:5000";
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "Billing portal creation failed");
    res.status(500).json({ error: "Failed to create billing portal" });
  }
});

router.post("/billing/webhook", async (req, res): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    res.sendStatus(200);
    return;
  }

  try {
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { metadata?: Record<string, string>; customer?: string };
      const meta = session.metadata ?? {};
      const userId = parseInt(meta.userId ?? "0", 10);
      const priceType = meta.priceType;
      const editionId = meta.editionId ? parseInt(meta.editionId, 10) : null;
      const planId = meta.planId ? parseInt(meta.planId, 10) : null;

      if (session.customer) {
        await db.update(usersTable).set({ stripeCustomerId: session.customer as string }).where(eq(usersTable.id, userId));
      }

      if (editionId) {
        await db.insert(userPurchasesTable).values({
          userId, entityType: "edition", entityId: editionId, priceType, stripeSessionId: String(session),
        });
      }
      if (planId) {
        await db.insert(userPurchasesTable).values({
          userId, entityType: "plan", entityId: planId, priceType, stripeSessionId: String(session),
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, "Webhook error");
    res.status(400).json({ error: "Webhook error" });
  }
});

router.get("/billing/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const purchases = await db.select().from(userPurchasesTable).where(eq(userPurchasesTable.userId, user.id));

  const editionIds = purchases.filter((p) => p.entityType === "edition").map((p) => p.entityId);
  const planIds = purchases.filter((p) => p.entityType === "plan").map((p) => p.entityId);
  const lifetimePurchase = purchases.find((p) => p.priceType === "lifetime");
  const yearlyPurchase = purchases.find((p) => p.priceType === "yearly");

  res.json({
    hasActiveSubscription: purchases.length > 0,
    subscriptionType: lifetimePurchase ? "lifetime" : yearlyPurchase ? "yearly" : purchases.length > 0 ? "one-time" : null,
    currentPeriodEnd: null,
    ownedEditionIds: editionIds,
    ownedPlanIds: planIds,
  });
});

export default router;
