import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { AiChatBody, UpdateAiSettingsBody } from "@workspace/api-zod";
import { callAi } from "../lib/ai-proxy";

const router: IRouter = Router();

async function ensureAiSettings(userId: number) {
  const [existing] = await db.select().from(aiSettingsTable).where(eq(aiSettingsTable.userId, userId));
  if (existing) return existing;
  const [created] = await db.insert(aiSettingsTable).values({ userId, enabled: true, provider: "claude" }).returning();
  return created;
}

router.post("/ai/chat", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const settings = await ensureAiSettings(user.id);

  if (!settings.enabled) {
    res.status(403).json({ error: "AI features are disabled" });
    return;
  }

  const parsed = AiChatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const provider = parsed.data.provider ?? settings.provider;
  try {
    const result = await callAi(parsed.data.messages as { role: "user" | "assistant" | "system"; content: string }[], provider, parsed.data.systemPrompt);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "AI chat failed");
    res.status(502).json({ error: `AI provider error: ${String(err)}` });
  }
});

router.get("/ai/settings", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const settings = await ensureAiSettings(user.id);
  res.json({ enabled: settings.enabled, provider: settings.provider });
});

router.patch("/ai/settings", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as typeof usersTable.$inferSelect;
  const parsed = UpdateAiSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await ensureAiSettings(user.id);
  const [settings] = await db
    .update(aiSettingsTable)
    .set(parsed.data)
    .where(eq(aiSettingsTable.userId, user.id))
    .returning();
  res.json({ enabled: settings.enabled, provider: settings.provider });
});

export default router;
