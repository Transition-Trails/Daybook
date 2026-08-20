---
name: DALL-E image generation
description: callDallE() pattern, timeout, and ItemOrigin constraint for AI image features
---

## Rule
`callDallE(prompt, options?)` lives in `artifacts/api-server/src/lib/ai-proxy.ts`. Uses **gpt-image-1** via the Replit AI integration proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`). Falls back to `OPENAI_API_KEY` + direct OpenAI URL if integration vars are absent. Returns `data:<mime>;base64,...`.

**Why:** The Replit proxy rejects `dall-e-3` as a model name, `response_format`, and `style` params. `gpt-image-1` is the correct model for the proxy and always returns base64 with no extra params needed.

**How to apply:**
- Import as `import { callDallE } from "../lib/ai-proxy";` alongside `callAi`.
- `options.quality = "hd"` maps to `"high"`; `"standard"` maps to `"medium"` internally.
- `options.size = "1024x1024"` is the default; `"1792x1024"` → `"1536x1024"`, `"1024x1792"` → `"1024x1536"`.
- 90-second AbortController timeout (generation + optional URL download).
- `style` param is accepted in the interface for API compat but silently ignored (gpt-image-1 doesn't support it).
- Run `setupReplitAIIntegrations({ providerSlug: "openai" })` in CodeExecution once to provision the env vars.

## ItemOrigin constraint
`ItemOrigin = "starter" | "licensed" | "owned"` — `"platform"` is NOT valid.
- Use `"licensed" as const` when inserting Daybook-curated catalog rows.
- Use `"owned"` for store-generated content (background generate route uses this).

**Why:** The type is narrowed at the Drizzle schema level; passing `"platform"` causes a compile error with a confusing overload message.
