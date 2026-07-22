/**
 * Billing routes — POST /checkout {plan}, POST /webhooks/stripe
 * Per spec/API-CONTRACT.md
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, plansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { logger } from "../lib/logger";
import type { User } from "@workspace/db";

const router: IRouter = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require("stripe");
  return new Stripe(key, { apiVersion: "2025-06-30.basil" });
}

// POST /checkout {plan} → Stripe session
router.post("/checkout", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const { plan } = req.body as { plan?: string };

  if (!plan || !["yearly", "lifetime"].includes(plan)) {
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

  try {
    const stripe = getStripe();
    const appUrl = process.env.APP_URL ?? "http://localhost:5000";
    const isYearly = plan === "yearly";

    const session = await stripe.checkout.sessions.create({
      mode: isYearly ? "subscription" : "payment",
      customer_email: user.email,
      metadata: { userId: user.id, plan },
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round((planRow.oneTimePrice ?? 0) * 100),
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
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    res.sendStatus(200);
    return;
  }

  try {
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (
      event.type === "checkout.session.completed" ||
      event.type === "invoice.payment_succeeded"
    ) {
      const session = event.data.object as {
        metadata?: Record<string, string>;
        customer?: string;
      };
      const meta = session.metadata ?? {};
      const userId = meta.userId;
      const plan = meta.plan as "yearly" | "lifetime" | undefined;

      if (userId && plan) {
        const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (existing) {
          // Set plan; append plan id to owned
          const owned = [...((existing.owned as string[]) ?? [])];
          if (!owned.includes(plan)) owned.push(plan);

          await db.update(usersTable).set({
            plan,
            owned,
            stripeCustomerId: session.customer as string ?? existing.stripeCustomerId,
          }).where(eq(usersTable.id, userId));
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, "Stripe webhook error");
    res.status(400).json({ error: "Webhook error" });
  }
});

export default router;
