import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";

const router: IRouter = Router();

/** Global user records are platform administration data, not store data. */
router.get("/users", requireSuperAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const safe = users.map(({ passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...u }) => u);
  res.json(safe);
});

router.get("/users/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

router.patch("/users/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null) updates.avatarUrl = body.avatarUrl;
  if (typeof body.plan === "string" || body.plan === null) updates.plan = body.plan;
  if (typeof body.aiEnabled === "boolean") updates.aiEnabled = body.aiEnabled;
  if (typeof body.aiProvider === "string") updates.aiProvider = body.aiProvider;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No permitted user fields supplied" });
    return;
  }
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

export default router;
