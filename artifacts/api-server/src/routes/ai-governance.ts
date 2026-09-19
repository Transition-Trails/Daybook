import { Router } from "express";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, aiProviderConfigsTable, aiUsageRecordsTable, storeMembersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { requireSuperAdmin } from "../middleware/requireRole";
import { encryptAiCredential, decryptAiCredential } from "../lib/ai-secrets";
import { isSuperAdmin } from "../lib/roles";

const router = Router();
const providers = new Set(["claude", "chatgpt", "gemini"]);
function safe(row: typeof aiProviderConfigsTable.$inferSelect) {
  return { provider: row.provider, enabled: row.enabled, hasCredential: Boolean(row.encryptedCredential),
    maskedCredential: "••••••••", allowPlatformFallback: row.allowPlatformFallback,
    allowedModels: row.allowedModels, requestsPerDay: row.requestsPerDay, estimatedCentsPerMonth: row.estimatedCentsPerMonth };
}
function scope(req: Parameters<typeof requireAuth>[0]): string | null {
  return typeof req.query.storeId === "string" ? req.query.storeId : null;
}
async function canUseStore(req: any, storeId: string): Promise<boolean> {
  if (isSuperAdmin(req.user as any)) return true;
  const [member] = await db.select({ role: storeMembersTable.role }).from(storeMembersTable)
    .where(and(eq(storeMembersTable.storeId, storeId), eq(storeMembersTable.userId, req.user.id)));
  return member?.role === "store_owner";
}

router.get("/ai/provider-configs", requireAuth, async (req, res) => {
  const storeId = scope(req);
  if (!storeId && !isSuperAdmin(req.user as any)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (storeId && !(await canUseStore(req, storeId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(aiProviderConfigsTable)
    .where(storeId ? eq(aiProviderConfigsTable.storeId, storeId) : isNull(aiProviderConfigsTable.storeId));
  res.json(rows.map(safe));
});

// Contract endpoint used by generated clients. A storeId body selects the
// tenant; omission means platform scope and is super-admin-only.
router.put("/ai/provider-configs", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  if (storeId ? !(await canUseStore(req, storeId)) : !isSuperAdmin(req.user as any)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const provider = String(body.provider);
  if (!providers.has(provider)) { res.status(400).json({ error: "provider is required" }); return; }
  const values: any = {
    enabled: body.enabled !== false, allowPlatformFallback: body.allowPlatformFallback !== false,
    allowedModels: Array.isArray(body.allowedModels) ? body.allowedModels.filter((x): x is string => typeof x === "string") : [],
    requestsPerDay: typeof body.requestsPerDay === "number" ? body.requestsPerDay : null,
    estimatedCentsPerMonth: typeof body.estimatedCentsPerMonth === "number" ? body.estimatedCentsPerMonth : null,
    updatedAt: new Date() };
  if (typeof body.credential === "string" && body.credential.length > 0) {
    const e = encryptAiCredential(body.credential);
    values.encryptedCredential = e.ciphertext;
    values.credentialIv = e.iv;
    values.credentialTag = e.tag;
  }
  if (!values.encryptedCredential) {
    const [existing] = await db.select({ id: aiProviderConfigsTable.id }).from(aiProviderConfigsTable).where(and(
      storeId ? eq(aiProviderConfigsTable.storeId, storeId) : isNull(aiProviderConfigsTable.storeId),
      eq(aiProviderConfigsTable.provider, provider),
    )).limit(1);
    if (!existing && !(storeId && body.allowPlatformFallback === true)) {
      res.status(400).json({ error: "credential is required for a new configuration" }); return;
    }
  }
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${storeId ?? "platform"}:${provider}`}))`);
    const existing = await tx.select().from(aiProviderConfigsTable).where(and(
      storeId ? eq(aiProviderConfigsTable.storeId, storeId) : isNull(aiProviderConfigsTable.storeId),
      eq(aiProviderConfigsTable.provider, provider),
    ));
    if (!existing.length && !values.encryptedCredential && !(storeId && body.allowPlatformFallback === true)) {
      throw new Error("credential is required for a new configuration");
    }
    return existing.length
      ? tx.update(aiProviderConfigsTable).set(values).where(eq(aiProviderConfigsTable.id, existing[0]!.id)).returning()
      : tx.insert(aiProviderConfigsTable).values({ ...values, storeId, provider, createdBy: (req.user as any).id }).returning();
  });
  res.json(safe(row!));
});

router.post("/ai/provider-configs/test", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const provider = String(body.provider);
  const storeId = typeof body.storeId === "string" ? body.storeId : null;
  if (!providers.has(provider) || (storeId ? !(await canUseStore(req, storeId)) : !isSuperAdmin(req.user as any))) {
    res.status(403).json({ ok: false, provider, error: "Forbidden" }); return;
  }
  try {
    const [config] = await db.select().from(aiProviderConfigsTable).where(and(
      storeId ? eq(aiProviderConfigsTable.storeId, storeId) : isNull(aiProviderConfigsTable.storeId), eq(aiProviderConfigsTable.provider, provider),
    ));
    if (!config?.encryptedCredential || !config.credentialIv || !config.credentialTag) { res.json({ ok: false, provider, error: "Credential is not configured" }); return; }
    const credential = decryptAiCredential({ ciphertext: config.encryptedCredential, iv: config.credentialIv, tag: config.credentialTag });
    const endpoint = provider === "claude" ? "https://api.anthropic.com/v1/messages"
      : provider === "gemini" ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(credential)}`
      : "https://api.openai.com/v1/chat/completions";
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (provider !== "gemini") headers.Authorization = `Bearer ${credential}`;
    if (provider === "claude") { headers["x-api-key"] = credential; headers["anthropic-version"] = "2023-06-01"; }
    const payload = provider === "claude" ? { model: "claude-opus-4-5", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }
      : provider === "gemini" ? { contents: [{ role: "user", parts: [{ text: "ping" }] }] }
      : { model: "gpt-5", max_completion_tokens: 1, messages: [{ role: "user", content: "ping" }] };
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    res.json({ ok: response.ok, provider, error: response.ok ? null : "Provider rejected the credential" });
  } catch {
    res.json({ ok: false, provider, error: "Provider test failed" });
  }
});

router.get("/ai/usage", requireAuth, async (req, res) => {
  const user = req.user as any;
  const storeId = scope(req);
  if (storeId && !(await canUseStore(req, storeId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const where = storeId ? eq(aiUsageRecordsTable.storeId, storeId) : isSuperAdmin(user) ? undefined : eq(aiUsageRecordsTable.userId, user.id);
  const records = await db.select({ requestId: aiUsageRecordsTable.requestId, storeId: aiUsageRecordsTable.storeId,
    userId: aiUsageRecordsTable.userId, feature: aiUsageRecordsTable.feature, provider: aiUsageRecordsTable.provider,
    model: aiUsageRecordsTable.model, status: aiUsageRecordsTable.status, errorCategory: aiUsageRecordsTable.errorCategory,
    durationMs: aiUsageRecordsTable.durationMs, inputTokens: aiUsageRecordsTable.inputTokens, outputTokens: aiUsageRecordsTable.outputTokens,
    estimatedCostCents: aiUsageRecordsTable.estimatedCostCents, fundingSource: aiUsageRecordsTable.fundingSource, createdAt: aiUsageRecordsTable.createdAt })
    .from(aiUsageRecordsTable).where(where).orderBy(desc(aiUsageRecordsTable.createdAt)).limit(Math.min(Number(req.query.limit) || 100, 100));
  res.json({ records });
});

router.get("/ai/usage/summary", requireAuth, async (req, res) => {
  const user = req.user as any; const storeId = scope(req);
  if (storeId && !(await canUseStore(req, storeId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const where = storeId ? eq(aiUsageRecordsTable.storeId, storeId) : isSuperAdmin(user) ? undefined : eq(aiUsageRecordsTable.userId, user.id);
  const [summary] = await db.select({ requestCount: sql<number>`count(*)`, estimatedCostCents: sql<number>`coalesce(sum(${aiUsageRecordsTable.estimatedCostCents}),0)`,
    inputTokens: sql<number>`coalesce(sum(${aiUsageRecordsTable.inputTokens}),0)`, outputTokens: sql<number>`coalesce(sum(${aiUsageRecordsTable.outputTokens}),0)` }).from(aiUsageRecordsTable).where(where);
  res.json(summary);
});

router.delete("/ai/provider-configs/remove", requireAuth, async (req, res) => {
  const provider = String(req.query.provider);
  const storeId = typeof req.query.storeId === "string" ? req.query.storeId : null;
  if (storeId ? !(await canUseStore(req, storeId)) : !isSuperAdmin(req.user as any)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(aiProviderConfigsTable).where(and(storeId ? eq(aiProviderConfigsTable.storeId, storeId) : isNull(aiProviderConfigsTable.storeId), eq(aiProviderConfigsTable.provider, provider)));
  res.status(204).end();
});

export default router;