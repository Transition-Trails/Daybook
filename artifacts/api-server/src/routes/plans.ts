import { Router, type IRouter } from "express";
import { db, plansTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

// Public read — pricing UI and admin plans page both need this
router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db
    .select({
      id: plansTable.id,
      name: plansTable.name,
      description: plansTable.description,
    })
    .from(plansTable)
    .where(eq(plansTable.id, "yearly"));
  res.json(plans);
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const [plan] = await db
    .select({
      id: plansTable.id,
      name: plansTable.name,
      description: plansTable.description,
    })
    .from(plansTable)
    .where(and(eq(plansTable.id, req.params.id), eq(plansTable.id, "yearly")));
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json(plan);
});

export default router;
