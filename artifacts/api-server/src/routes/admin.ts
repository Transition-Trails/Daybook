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
  editionsTable,
  usersTable,
  storeMembersTable,
  generationJobsTable,
  plansTable,
} from "@workspace/db";
import { count, sql, inArray } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";

const router: IRouter = Router();

router.get("/admin/stats", requireSuperAdmin, async (_req, res): Promise<void> => {
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

  // Notebook / journal / memory-keeping editions — sourced from editions table
  // after related_products was retired and its rows migrated into editions.
  async function countNotebookEditions() {
    const rows = await db
      .select({ status: editionsTable.status, cnt: count() })
      .from(editionsTable)
      .where(inArray(editionsTable.productType, ["notebook", "journal", "memory-keeping"]))
      .groupBy(editionsTable.status);
    const live = Number(rows.find((r) => r.status === "live")?.cnt ?? 0);
    const draft = Number(rows.find((r) => r.status === "draft")?.cnt ?? 0);
    return { total: live + draft, live, draft };
  }

  const [themes, packs, inserts, products, editions, planCount] = await Promise.all([
    countByStatus(themesTable),
    countByStatus(stickerPacksTable),
    countByStatus(insertsTable),
    countNotebookEditions(),
    countByStatus(editionsTable),
    db.select({ cnt: count() }).from(plansTable).then(r => Number(r[0]?.cnt ?? 0)),
  ]);

  const [userCount, memberRows] = await Promise.all([
    db.select({ cnt: count() }).from(usersTable),
    db.select({ role: storeMembersTable.role, cnt: count() })
      .from(storeMembersTable)
      .groupBy(storeMembersTable.role),
  ]);
  const totalUsers = Number(userCount[0]?.cnt ?? 0);
  const staff = Number(memberRows.find((r) => r.role === "store_staff")?.cnt ?? 0);
  const owner = Number(memberRows.find((r) => r.role === "store_owner")?.cnt ?? 0);

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
    stickerPacks: packs,
    inserts,
    products,
    editions,
    plans: { total: planCount, live: planCount, draft: 0 },
    users: { total: totalUsers, staff, owner },
    generations: { total: totalGen, thisMonth, complete: completeGen, failed: failedGen },
  });
});

export default router;
