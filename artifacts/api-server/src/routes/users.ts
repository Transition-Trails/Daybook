import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { isSuperAdmin } from "../lib/roles";

const router: IRouter = Router();

/**
 * The legacy users console is also the super-admin customer-support surface.
 * Keep staff/owner access for its existing management flow while allowing
 * platform-only super admins, whose legacy role may still be "user".
 */
function requireCustomerSupportAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = req.user as User;
  if (!isSuperAdmin(user) && user.role !== "staff" && user.role !== "owner") {
    res.status(403).json({ error: "Forbidden: customer support access required" });
    return;
  }
  next();
}

router.get("/users", requireCustomerSupportAccess, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const safe = users.map(({ passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...u }) => u);
  res.json(safe);
});

router.get("/users/:id", requireCustomerSupportAccess, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

router.patch("/users/:id", requireCustomerSupportAccess, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const body = req.body as Partial<User>;
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).passwordHash;
  delete (body as Record<string, unknown>).googleAccessToken;
  const [user] = await db.update(usersTable).set(body).where(eq(usersTable.id, id as string)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

export default router;
