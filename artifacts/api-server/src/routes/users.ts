import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, userPurchasesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireStaff } from "../lib/auth-middleware";
import {
  ListUsersQueryParams,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users", requireStaff, async (req, res): Promise<void> => {
  const params = ListUsersQueryParams.safeParse(req.query);
  let users;
  if (params.success && params.data.role) {
    users = await db.select().from(usersTable).where(eq(usersTable.role, params.data.role)).orderBy(usersTable.createdAt);
  } else if (params.success && params.data.planId) {
    users = await db.select().from(usersTable).where(eq(usersTable.planId, params.data.planId)).orderBy(usersTable.createdAt);
  } else {
    users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  }
  const safe = users.map(({ passwordHash, googleAccessToken, googleRefreshToken, ...u }) => u);
  res.json(safe);
});

router.get("/users/:id", requireStaff, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, ...safe } = user;
  res.json(safe);
});

router.patch("/users/:id", requireStaff, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, ...safe } = user;
  res.json(safe);
});

router.get("/users/:id/purchases", requireStaff, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const purchases = await db.select().from(userPurchasesTable).where(eq(userPurchasesTable.userId, params.data.id));

  const grouped: Record<string, number[]> = {
    themeIds: [],
    stickerPackIds: [],
    insertIds: [],
    productIds: [],
    editionIds: [],
  };
  for (const p of purchases) {
    const key = `${p.entityType}Ids` as keyof typeof grouped;
    if (grouped[key]) grouped[key].push(p.entityId);
  }
  res.json(grouped);
});

export default router;
