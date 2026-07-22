import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { plansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";
import {
  CreatePlanBody,
  UpdatePlanBody,
  GetPlanParams,
  UpdatePlanParams,
  DeletePlanParams,
} from "@workspace/api-zod";
import { toSlug } from "../lib/slug";

const router: IRouter = Router();

router.get("/plans", async (req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.createdAt);
  res.json(plans);
});

router.post("/plans", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const slug = parsed.data.slug ?? toSlug(parsed.data.name);
  const [plan] = await db.insert(plansTable).values({ ...parsed.data, slug, status: "draft" }).returning();
  res.status(201).json(plan);
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const params = GetPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, params.data.id));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(plan);
});

router.patch("/plans/:id", requireStaff, async (req, res): Promise<void> => {
  const params = UpdatePlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [plan] = await db.update(plansTable).set(parsed.data).where(eq(plansTable.id, params.data.id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(plan);
});

router.delete("/plans/:id", requireStaff, async (req, res): Promise<void> => {
  const params = DeletePlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [plan] = await db.delete(plansTable).where(eq(plansTable.id, params.data.id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.sendStatus(204);
});

export default router;
