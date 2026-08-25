import { Router, type IRouter } from "express";
import { db, plansTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { getConfiguredStripePriceId } from "../lib/stripe-price";

const router: IRouter = Router();

// Public read — pricing UI and admin plans page both need this
router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db
    .select({
      id: plansTable.id,
      name: plansTable.name,
      description: plansTable.description,
      stripePriceId: plansTable.stripePriceId,
    })
    .from(plansTable)
    .where(isNotNull(plansTable.stripePriceId));
  res.json(plans
    .filter(plan => getConfiguredStripePriceId(plan.stripePriceId))
    .map(({ stripePriceId: _stripePriceId, ...plan }) => plan));
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const [plan] = await db
    .select({
      id: plansTable.id,
      name: plansTable.name,
      description: plansTable.description,
      stripePriceId: plansTable.stripePriceId,
    })
    .from(plansTable)
    .where(eq(plansTable.id, req.params.id));
  if (!plan || !getConfiguredStripePriceId(plan.stripePriceId)) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const { stripePriceId: _stripePriceId, ...safePlan } = plan;
  res.json(safePlan);
});

export default router;
