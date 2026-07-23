import { Router, type IRouter } from "express";
import { db, plansTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Public read — pricing UI and admin plans page both need this
router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(plansTable);
  res.json(plans);
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const [plan] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.id, req.params.id));
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json(plan);
});

export default router;
