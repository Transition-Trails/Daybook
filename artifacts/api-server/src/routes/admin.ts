/**
 * Admin routes — /admin/stats
 * Trend research moved to /ai/complete (use system prompt for trend analysis)
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  themesTable,
  stickerPacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
  usersTable,
  generationJobsTable,
} from "@workspace/db";
import { count, sql } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";

const router: IRouter = Router();

router.get("/admin/stats", requireStaff, async (req, res): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function countByStatus(table: any) {
    const rows = await db
      .select({ status: table.status, cnt: count() })
      .from(table)
      .groupBy(table.status);
    const live = Number(rows.find((r: { status: string }) => r.status === "live")?.cnt ?? 0);
    const draft = Number(rows.find((r: { status: string }) => r.status === "draft")?.cnt ?? 0);
    return { total: live + draft, live, draft };
  }

  const [themes, packs, inserts, products, editions] = await Promise.all([
    countByStatus(themesTable),
    countByStatus(stickerPacksTable),
    countByStatus(insertsTable),
    countByStatus(relatedProductsTable),
    countByStatus(editionsTable),
  ]);

  const userRows = await db
    .select({ role: usersTable.role, cnt: count() })
    .from(usersTable)
    .groupBy(usersTable.role);
  const totalUsers = userRows.reduce((s, r) => s + Number(r.cnt), 0);
  const staff = Number(userRows.find((r) => r.role === "staff")?.cnt ?? 0);
  const owner = Number(userRows.find((r) => r.role === "owner")?.cnt ?? 0);

  const genRows = await db
    .select({ status: generationJobsTable.status, cnt: count() })
    .from(generationJobsTable)
    .groupBy(generationJobsTable.status);
  const totalGen = genRows.reduce((s, r) => s + Number(r.cnt), 0);
  const completeGen = Number(genRows.find((r) => r.status === "complete")?.cnt ?? 0);
  const failedGen = Number(genRows.find((r) => r.status === "failed")?.cnt ?? 0);

  const [thisMonthRow] = await db
    .select({ cnt: count() })
    .from(generationJobsTable)
    .where(sql`date_trunc('month', ${generationJobsTable.createdAt}) = date_trunc('month', now())`);
  const thisMonth = Number(thisMonthRow?.cnt ?? 0);

  res.json({
    themes,
    packs,
    inserts,
    products,
    editions,
    users: { total: totalUsers, staff, owner },
    generations: { total: totalGen, thisMonth, complete: completeGen, failed: failedGen },
  });
});

export default router;
