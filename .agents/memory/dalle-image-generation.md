---
name: DALL-E image generation
description: callDallE() pattern, timeout, and ItemOrigin constraint for AI image features
---

## Rule
`callDallE(prompt, options?)` lives in `artifacts/api-server/src/lib/ai-proxy.ts`. It enforces a 60-second hard timeout via `AbortController` and returns `data:image/png;base64,...`.

**Why:** DALL-E 3 can hang indefinitely without a signal; 60 s is the agreed SLA for all external AI calls.

**How to apply:**
- Import as `import { callDallE } from "../lib/ai-proxy";` alongside `callAi`.
- `options.quality = "hd"` for sticker art; `"standard"` is fine for previews.
- `options.size = "1024x1024"` is the default; `"1792x1024"` for landscape backgrounds.
- Response format is always `b64_json` — never `url` (URLs expire).

## ItemOrigin constraint
`ItemOrigin = "starter" | "licensed" | "owned"` — `"platform"` is NOT valid.
- Use `"licensed" as const` when inserting Daybook-curated catalog rows.
- Use `"owned"` for store-generated content (background generate route uses this).

**Why:** The type is narrowed at the Drizzle schema level; passing `"platform"` causes a compile error with a confusing overload message.
