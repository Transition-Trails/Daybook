/**
 * AI settings routes — GET/PATCH /ai/settings
 * Reads and writes aiEnabled + aiProvider on the current user record.
 */
import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import type { User } from "@workspace/db";

const router: IRouter = Router();

router.get("/ai/settings", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  res.json({
    enabled: user.aiEnabled ?? true,
    provider: user.aiProvider ?? "claude",
  });
});

router.patch("/ai/settings", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const body = req.body as { enabled?: boolean; provider?: string };

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (typeof body.enabled === "boolean") updates.aiEnabled = body.enabled;
  if (body.provider) updates.aiProvider = body.provider;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, user.id as string))
    .returning();

  res.json({
    enabled: updated.aiEnabled ?? true,
    provider: updated.aiProvider ?? "claude",
  });
});

export default router;
