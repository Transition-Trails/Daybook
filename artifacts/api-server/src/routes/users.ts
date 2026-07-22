import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff, requireAuth } from "../lib/auth-middleware";
import type { User } from "@workspace/db";

const router: IRouter = Router();

router.get("/users", requireStaff, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const safe = users.map(({ passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...u }) => u);
  res.json(safe);
});

router.get("/users/:id", requireStaff, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

router.patch("/users/:id", requireStaff, async (req, res): Promise<void> => {
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
