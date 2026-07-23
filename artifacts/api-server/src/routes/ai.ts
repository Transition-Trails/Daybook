/**
 * AI proxy — POST /ai/complete {system, messages, provider}
 * Routes to Claude/ChatGPT/Gemini per user.aiProvider; honors user.aiEnabled.
 * Server holds all API keys.
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { callAi } from "../lib/ai-proxy";
import type { User } from "@workspace/db";

const router: IRouter = Router();

router.post("/ai/complete", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;

  if (!user.aiEnabled) {
    res.status(403).json({ error: "AI features are disabled for your account" });
    return;
  }

  const body = req.body as {
    system?: string;
    systemPrompt?: string; // alias accepted from generated client
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    provider?: string;
  };

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const provider = body.provider ?? user.aiProvider ?? "claude";
  const systemPrompt = body.system ?? body.systemPrompt;

  try {
    const result = await callAi(body.messages, provider, systemPrompt);
    res.json({ text: result.content, provider: result.provider, model: result.model });
  } catch (err) {
    req.log.error({ err }, "AI complete failed");
    res.status(502).json({ error: `AI provider error: ${String(err)}` });
  }
});

export default router;
