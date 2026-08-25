---
name: GPT image generation
description: generateImage() contract, model selection, timeout, and ItemOrigin constraint for AI image features
---

## Rule
`generateImage(prompt, options?)` in `artifacts/api-server/src/lib/worldsmith/image-generation.ts` is the shared audited image-generation core. It returns an `ImageGenerationResult` containing the `dataUrl` plus effective provider, model, version, size, and quality metadata.

The default model is **gpt-image-2**, selected through `WS_IMAGE_MODEL` and sent through the Replit AI integrations proxy when its configured environment variables are available. `gpt-image-1` is the only supported fallback model. Unsupported model names fail configuration validation instead of silently falling back.

**Why:** WorldSmith prompt hashes and audit records must include the effective image settings, not only the returned image bytes. The shared result keeps provider, model, size, and quality visible to those callers.

**How to apply:**
- Import `generateImage` and, when needed, `ImageGenerationMetadata` or `ImageGenerationResult` from the shared image-generation module or its `ai-proxy` re-export.
- The Replit proxy request omits `response_format`; it returns base64 image data in the normal response shape.
- Direct OpenAI fallback uses `OPENAI_API_KEY` when the Replit integration is unavailable.
- `options.quality` accepts `low`, `medium`, `high`, and legacy `standard`/`hd` values; legacy values map to `medium`/`high` with warnings.
- GPT Image 1 legacy sizes are explicitly mapped for compatibility; GPT Image 2 sizes must use supported multiples of 16, aspect ratios, and pixel budgets.
- Generation and optional image download share a 90-second `AbortController` timeout.

## ItemOrigin constraint
`ItemOrigin = "starter" | "licensed" | "owned"` — `"platform"` is NOT valid.
- Use `"licensed" as const` when inserting Daybook-curated catalog rows.
- Use `"owned"` for store-generated content.

**Why:** The type is narrowed at the Drizzle schema level; passing `"platform"` causes a compile error with a confusing overload message.