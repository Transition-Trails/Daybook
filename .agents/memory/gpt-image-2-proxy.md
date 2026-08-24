---
name: GPT Image 2 proxy compatibility
description: Confirmed request contract for GPT Image 2 through the configured Replit AI image endpoint.
---

The configured Replit AI OpenAI-compatible image endpoint accepts `gpt-image-2` at the image-generation route with a model, prompt, count, size, and quality. It returns base64 image data and usage metadata successfully when `response_format` is omitted.

**Why:** This was verified against the live configured proxy, so GPT Image 2 can be the default without requiring the direct OpenAI fallback.

**How to apply:** Keep the proxy request to its accepted minimal fields. Do not add `response_format`; preserve the direct OpenAI route only as a credential-based fallback.