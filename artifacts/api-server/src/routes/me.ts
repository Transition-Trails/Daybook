/**
 * GET /me/stores — returns the stores the current user is a member of,
 * with their role and basic store info. Used by the frontend to route
 * store-admin users to their store console.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { storesTable, storeMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { isSuperAdmin } from "../lib/roles";
import { getActiveImpersonation } from "../middleware/requireRole";

const router: IRouter = Router();

router.get("/me/stores", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = req.user as User;

  // super_admin: return all stores
  if (isSuperAdmin(user)) {
    const impersonation = getActiveImpersonation(req, user.id);
    if (impersonation) {
      const stores = await db
        .select()
        .from(storesTable)
        .where(eq(storesTable.id, impersonation.storeId))
        .limit(1);
      res.json(stores.map(s => ({ ...s, role: "super_admin" })));
      return;
    }
    const includeSeed = req.query.includeSeed === "true";
    const stores = await db
      .select()
      .from(storesTable)
      .where(includeSeed ? undefined : eq(storesTable.isSeed, false))
      .orderBy(storesTable.name);
    res.json(stores.map(s => ({ ...s, role: "super_admin" })));
    return;
  }

  // Regular user: return only stores they are members of
  const rows = await db
    .select({
      storeId: storeMembersTable.storeId,
      role: storeMembersTable.role,
      name: storesTable.name,
      status: storesTable.status,
      plan: storesTable.plan,
    })
    .from(storeMembersTable)
    .innerJoin(storesTable, eq(storesTable.id, storeMembersTable.storeId))
    .where(eq(storeMembersTable.userId, user.id))
    .orderBy(storesTable.name);

  res.json(rows);
});

export default router;
