import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { generationJobsTable, plannerConfigsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { GeneratePlannerBody, GetGenerationJobParams } from "@workspace/api-zod";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Kick off a generation job (async simulation)
router.post("/generation", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const parsed = GeneratePlannerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [config] = await db
    .select()
    .from(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, parsed.data.configId), eq(plannerConfigsTable.userId, user.id)));
  if (!config) { res.status(404).json({ error: "Planner config not found" }); return; }

  const jobId = uuidv4();
  const [job] = await db
    .insert(generationJobsTable)
    .values({ jobId, userId: user.id, configId: config.id, status: "pending" })
    .returning();

  // Simulate async processing
  setImmediate(async () => {
    try {
      await db.update(generationJobsTable).set({ status: "processing" }).where(eq(generationJobsTable.jobId, jobId));

      // Build deterministic page layout based on config
      const pageCount = estimatePageCount(config);

      await db.update(generationJobsTable).set({
        status: "complete",
        pageCount,
        pdfUrl: `/api/generation/${jobId}/download`,
        configJsonUrl: `/api/generation/${jobId}/config`,
        completedAt: new Date(),
      }).where(eq(generationJobsTable.jobId, jobId));

      // Mark config as generated
      await db.update(plannerConfigsTable).set({ generatedAt: new Date() }).where(eq(plannerConfigsTable.id, config.id));
    } catch (err) {
      logger.error({ err, jobId }, "Generation job failed");
      await db.update(generationJobsTable).set({
        status: "failed",
        errorMessage: String(err),
        completedAt: new Date(),
      }).where(eq(generationJobsTable.jobId, jobId)).catch(() => undefined);
    }
  });

  res.status(202).json({
    jobId: job.jobId,
    userId: job.userId,
    configId: job.configId,
    status: job.status,
    pdfUrl: null,
    configJsonUrl: null,
    driveFileId: null,
    errorMessage: null,
    pageCount: null,
    createdAt: job.createdAt,
    completedAt: null,
  });
});

router.get("/generation/history", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const jobs = await db
    .select()
    .from(generationJobsTable)
    .where(eq(generationJobsTable.userId, user.id))
    .orderBy(generationJobsTable.createdAt);
  res.json(jobs);
});

router.get("/generation/:jobId", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const rawJobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const [job] = await db
    .select()
    .from(generationJobsTable)
    .where(and(eq(generationJobsTable.jobId, rawJobId), eq(generationJobsTable.userId, user.id)));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(job);
});

function estimatePageCount(config: typeof plannerConfigsTable.$inferSelect): number {
  let months = 12;
  if (config.rangeType === "90day") months = 3;
  else if (config.rangeType === "monthly") months = 1;
  else if (config.rangeType === "custom") months = config.monthCount ?? 12;

  // cover + home index + year overview + month dividers + month calendars + weekly + daily + notes sections
  const sectionsCount = (config.notesSections?.length ?? 0) + 1;
  return 3 + months + months + (months * 5) + (months * 30) + sectionsCount;
}

export default router;
