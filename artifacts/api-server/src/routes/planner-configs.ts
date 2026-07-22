import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { plannerConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import {
  CreatePlannerConfigBody,
  UpdatePlannerConfigBody,
  GetPlannerConfigParams,
  UpdatePlannerConfigParams,
  DeletePlannerConfigParams,
} from "@workspace/api-zod";
import { usersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/planner-configs", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const configs = await db
    .select()
    .from(plannerConfigsTable)
    .where(eq(plannerConfigsTable.userId, user.id))
    .orderBy(plannerConfigsTable.createdAt);
  res.json(configs);
});

router.post("/planner-configs", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const parsed = CreatePlannerConfigBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [config] = await db
    .insert(plannerConfigsTable)
    .values({ ...parsed.data, userId: user.id })
    .returning();
  res.status(201).json(config);
});

router.get("/planner-configs/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const params = GetPlannerConfigParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [config] = await db
    .select()
    .from(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, params.data.id), eq(plannerConfigsTable.userId, user.id)));
  if (!config) { res.status(404).json({ error: "Config not found" }); return; }
  res.json(config);
});

router.patch("/planner-configs/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const params = UpdatePlannerConfigParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db
    .select()
    .from(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, params.data.id), eq(plannerConfigsTable.userId, user.id)));
  if (!existing) { res.status(404).json({ error: "Config not found" }); return; }

  const parsed = UpdatePlannerConfigBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Setup fields are locked after generation
  const allowedFields = existing.generatedAt ? parsed.data : parsed.data;
  const [config] = await db
    .update(plannerConfigsTable)
    .set(allowedFields)
    .where(eq(plannerConfigsTable.id, params.data.id))
    .returning();
  res.json(config);
});

router.delete("/planner-configs/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const params = DeletePlannerConfigParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [config] = await db
    .delete(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, params.data.id), eq(plannerConfigsTable.userId, user.id)))
    .returning();
  if (!config) { res.status(404).json({ error: "Config not found" }); return; }
  res.sendStatus(204);
});

export default router;
