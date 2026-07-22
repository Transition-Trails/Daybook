import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  themesTable,
  stickerPacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
  plansTable,
  usersTable,
  generationJobsTable,
} from "@workspace/db";
import { eq, count, and, sql } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";
import { TrendResearchBody } from "@workspace/api-zod";
import { aiTrendResearch } from "../lib/ai-proxy";

const router: IRouter = Router();

router.get("/admin/stats", requireStaff, async (req, res): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countByStatus = async (table: any) => {
    const rows = await db
      .select({ status: table.status, cnt: count() })
      .from(table)
      .groupBy(table.status);
    const live = rows.find((r) => r.status === "live")?.cnt ?? 0;
    const draft = rows.find((r) => r.status === "draft")?.cnt ?? 0;
    return { total: Number(live) + Number(draft), live: Number(live), draft: Number(draft) };
  };

  const [themes, stickerPacks, inserts, products, editions, plans] =
    await Promise.all([
      countByStatus(themesTable),
      countByStatus(stickerPacksTable),
      countByStatus(insertsTable),
      countByStatus(relatedProductsTable),
      countByStatus(editionsTable),
      countByStatus(plansTable),
    ]);

  const userRows = await db
    .select({ role: usersTable.role, cnt: count() })
    .from(usersTable)
    .groupBy(usersTable.role);
  const totalUsers = userRows.reduce((s, r) => s + Number(r.cnt), 0);
  const staffCount = Number(userRows.find((r) => r.role === "staff")?.cnt ?? 0);
  const ownerCount = Number(userRows.find((r) => r.role === "owner")?.cnt ?? 0);

  const genRows = await db
    .select({ status: generationJobsTable.status, cnt: count() })
    .from(generationJobsTable)
    .groupBy(generationJobsTable.status);
  const totalGen = genRows.reduce((s, r) => s + Number(r.cnt), 0);
  const completeGen = Number(genRows.find((r) => r.status === "complete")?.cnt ?? 0);
  const failedGen = Number(genRows.find((r) => r.status === "failed")?.cnt ?? 0);

  // This month
  const thisMonthRows = await db
    .select({ cnt: count() })
    .from(generationJobsTable)
    .where(
      sql`date_trunc('month', ${generationJobsTable.createdAt}) = date_trunc('month', now())`,
    );
  const thisMonthGen = Number(thisMonthRows[0]?.cnt ?? 0);

  res.json({
    themes,
    stickerPacks,
    inserts,
    products,
    editions,
    plans,
    users: { total: totalUsers, staff: staffCount, owner: ownerCount },
    generations: {
      total: totalGen,
      thisMonth: thisMonthGen,
      complete: completeGen,
      failed: failedGen,
    },
  });
});

router.post(
  "/admin/trend-research",
  requireStaff,
  async (req, res): Promise<void> => {
    const parsed = TrendResearchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const result = await aiTrendResearch(
        parsed.data.query,
        parsed.data.audience,
        parsed.data.season,
      );
      res.json(result);
    } catch (err) {
      req.log.error({ err }, "Trend research failed");
      res.status(502).json({ error: "AI provider error" });
    }
  },
);

export default router;
