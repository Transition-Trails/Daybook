# Daybook Image Generation Integration Spec

## Background

The Daybook app has a fully-built planner studio, PDF generator, and catalog system. **The only missing piece is actual AI image generation.** The sticker and background pipelines both call Claude to *write* a DALL-E-style prompt, but the code stops there — no image API is ever called. This spec adds that missing call and introduces the "kit" concept (curated themed asset bundles) for backgrounds.

All image generation uses **OpenAI DALL-E 3** via the existing `OPENAI_API_KEY` secret.

---

## Part 1 — Add `callDallE` to `ai-proxy.ts`

**File:** `artifacts/api-server/src/lib/ai-proxy.ts`

Add this function after the existing `callOpenAI` function:

```typescript
/**
 * Call DALL-E 3 for image generation.
 * Returns a base64 PNG data URL: `data:image/png;base64,...`
 */
export async function callDallE(
  prompt: string,
  options: {
    size?: "1024x1024" | "1792x1024" | "1024x1792";
    quality?: "standard" | "hd";
    style?: "natural" | "vivid";
  } = {},
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const body = {
    model: "dall-e-3",
    prompt,
    n: 1,
    size: options.size ?? "1024x1024",
    quality: options.quality ?? "standard",
    style: options.style ?? "natural",
    response_format: "b64_json",
  };

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { data: Array<{ b64_json: string }> };
  const b64 = data.data[0]?.b64_json;
  if (!b64) throw new Error("DALL-E returned no image data");
  return `data:image/png;base64,${b64}`;
}
```

---

## Part 2 — Add sticker image generation route

**File:** `artifacts/api-server/src/routes/stickers.ts`

The existing route `POST /stores/:storeId/stickers/generate/illustrative-prompt` returns a prompt and stops. Add a **new route** after it that takes that prompt and produces an actual sticker image:

```
POST /stores/:storeId/stickers/generate/illustrative-image
```

**Request body:**
```json
{
  "prompt": "string (the prompt from the previous step, or written directly)",
  "processingOptions": {
    "borderStyle": "none" | "thin" | "thick",      // optional, default "none"
    "borderColor": "#000000",                        // optional
    "sizeInMm": 50,                                  // optional, default 50
    "shadowStyle": "none" | "soft" | "hard",         // optional, default "soft"
    "shadowLiftPx": 8                                // optional, default 8
  }
}
```

**What it does:**
1. Calls `callDallE(prompt, { quality: "hd", style: "natural" })` — returns a base64 PNG
2. Runs the result through the existing `runPipeline()` helper (already in this file at line ~156):
   ```typescript
   const { processedImageData, cutlineSvg } = await runPipeline({
     imageBase64: dalleResult,
     borderStyle, borderColor, sizeInMm, shadowStyle, shadowLiftPx, ...
   });
   ```
3. Returns `{ processedImageData, cutlineSvg, prompt }` — same shape as the existing upload-and-process route

**Important:** This route does NOT save to the database — it returns the processed image data for the frontend to preview and optionally save. The frontend's existing "save sticker" flow handles persistence.

Import `callDallE` at the top of stickers.ts:
```typescript
import { callAi, callDallE } from "../lib/ai-proxy";
```

---

## Part 3 — Add background image generation route

**File:** `artifacts/api-server/src/routes/catalog.ts`

Add a new route after the existing backgrounds CRUD:

```
POST /stores/:storeId/backgrounds/generate
```

**Request body:**
```json
{
  "brief": "Victorian botanical garden, aged parchment texture, soft sepia tones",
  "type": "texture",       // "texture" | "image"
  "name": "Garden Parchment",
  "saveToStore": true      // whether to persist immediately or just preview
}
```

**What it does:**

1. **Build a background-specific prompt.** Use Claude first to expand the brief into a detailed DALL-E prompt optimised for seamless page backgrounds:
   ```typescript
   const systemPrompt = `You write DALL-E 3 prompts for digital planner page backgrounds.
   Rules:
   - The image must work as a full-page background behind handwriting — never busy or high-contrast
   - Seamless or near-seamless texture, no strong focal point
   - Describe light, texture, grain, and colour temperature precisely
   - Do NOT mention people, text, or logos
   - Output only the prompt, no commentary`;

   const result = await callAi(
     [{ role: "user", content: `Background brief: ${brief}` }],
     "claude",
     systemPrompt,
   );
   const expandedPrompt = result.content.trim();
   ```

2. **Call DALL-E 3:**
   ```typescript
   const imageDataUrl = await callDallE(expandedPrompt, {
     size: "1024x1024",
     quality: "hd",
     style: "natural",
   });
   ```

3. **Optionally save** if `saveToStore === true`:
   ```typescript
   const id = nanoid();
   await db.insert(backgroundsTable).values({
     id,
     name,
     type,                          // "texture" or "image"
     assetRef: imageDataUrl,        // full data URL stored directly
     status: "draft",
     origin: "authored",
     authoredByStoreId: storeId,
   });
   ```

4. **Return:**
   ```json
   {
     "id": "abc123",          // null if saveToStore false
     "name": "Garden Parchment",
     "assetRef": "data:image/png;base64,...",
     "expandedPrompt": "Aged cream parchment with..."
   }
   ```

Guard this route with `requireStoreAccess("store_staff")` (same as the other studio routes in this file).

---

## Part 4 — Wire the UI: Sticker Studio generate button

**File:** `artifacts/admin/src/pages/store/studios/StoreStudioPage.tsx` or wherever the sticker generate button lives after the "illustrative-prompt" step.

The existing flow shows a generated prompt and a "Generate image" button that currently does nothing (or is missing). Wire it to call the new route:

```typescript
// After the user has a prompt from illustrative-prompt:
const handleGenerateImage = async () => {
  setGenerating(true);
  try {
    const res = await api.post(
      `/stores/${storeId}/stickers/generate/illustrative-image`,
      { prompt: currentPrompt, processingOptions: { shadowStyle: "soft" } }
    );
    setPreviewImage(res.data.processedImageData);
    setCutlineSvg(res.data.cutlineSvg);
  } finally {
    setGenerating(false);
  }
};
```

Show the returned `processedImageData` as a preview image. The user can then save it using the existing sticker save route.

---

## Part 5 — Wire the UI: Background generator in Theme Studio

**File:** `artifacts/admin/src/pages/store/studios/StoreThemeStudio.tsx` (or wherever background management lives)

Add a "Generate background" button/form that:

1. Shows a text field for the brief (e.g. "Victorian garden, soft aged paper")
2. POSTs to `/stores/:storeId/backgrounds/generate` with `saveToStore: false` first (preview mode)
3. Shows the generated background as a full-screen preview behind sample text
4. Has "Save to my backgrounds" button → re-POSTs with `saveToStore: true` (or saves the returned `assetRef` directly)
5. The saved background appears in the theme's background picker immediately

---

## Part 6 — Kit concept (Victorian Garden Journals seed data)

**What a "kit" is:** A themed bundle — backgrounds + stickers + cover art + palette — that ships together as one edition of the Victorian Garden Journals series.

Each kit maps to existing Daybook entities:

| Kit component | Daybook table | Notes |
|---|---|---|
| Background papers (12 per kit) | `backgrounds` | `type: "texture"`, `origin: "platform"` |
| Kit stickers / washi / cards | `stickers_library` | `origin: "platform"`, `setId: "kit_<name>"` |
| Kit colour palette | `palettes` | 5 colours per kit |
| Kit theme | `themes` | links palette + backgrounds |

**Seed script to write:** `scripts/src/seed-kit-vgj.ts`

The script should:
1. Create a `palettes` row for each of the 8 Victorian Garden Journal volumes (e.g. Halloween October, Library November, etc.) with their 5 colours
2. Create a `themes` row linking to each palette with `origin: "platform"`, `status: "live"`
3. Create `backgrounds` rows for each paper in each kit — **the actual background images are in this repository at `attached_assets/` in the companion project** — they can be fetched as URLs or embedded as base64
4. Link backgrounds to themes via `theme_backgrounds` join table

The 8 kits and their palettes are:
```
halloween_october:  ["#2D1B34", "#E8612A", "#F4A261", "#8B4513", "#1A0A20"]
library_november:   ["#1B2A4A", "#8B6B4A", "#D4A96A", "#4A3728", "#E8D5B7"]
victorian_february: ["#4A1942", "#C8847A", "#E8C4B0", "#7B3F6E", "#F0E8D5"]
garden_may:         ["#2D4A1E", "#8BC34A", "#C8E6C9", "#4CAF50", "#F1F8E9"]
ocean_august:       ["#0D2137", "#1565C0", "#42A5F5", "#B0BEC5", "#E3F2FD"]
autumn_september:   ["#3E2723", "#BF360C", "#E64A19", "#FF8F00", "#FFF9C4"]
winter_december:    ["#1A237E", "#283593", "#B0BEC5", "#ECEFF1", "#FFFFFF"]
spring_march:       ["#1B5E20", "#F48FB1", "#CE93D8", "#81C784", "#FFF9C4"]
```

Run with: `pnpm --filter @workspace/scripts run seed-kit-vgj`

---

## Part 7 — Error handling pattern to follow

Daybook's api-server pattern for route errors (match existing routes):
```typescript
try {
  // ... logic
} catch (err) {
  logger.error({ err }, "background.generate failed");
  res.status(500).json({ error: "Image generation failed. Please try again." });
  return;
}
```

All routes that call external AI APIs should have a 60-second timeout guard:
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000);
try {
  const res = await fetch(url, { ..., signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeout);
}
```

Add the `signal: controller.signal` to the `callDallE` fetch call in `ai-proxy.ts`.

---

## Summary of files to change

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/ai-proxy.ts` | Add `callDallE()` function with abort signal support |
| `artifacts/api-server/src/routes/stickers.ts` | Add `POST .../generate/illustrative-image` route |
| `artifacts/api-server/src/routes/catalog.ts` | Add `POST /stores/:storeId/backgrounds/generate` route |
| `artifacts/admin/src/pages/store/studios/Sticker*.tsx` | Wire "Generate image" button to new route, show preview |
| `artifacts/admin/src/pages/store/studios/StoreThemeStudio.tsx` | Add background generation UI in Theme or Backgrounds section |
| `scripts/src/seed-kit-vgj.ts` | New seed script for 8 Victorian Garden Journal kits |

No new npm packages required — everything uses the existing `fetch`-based pattern in `ai-proxy.ts`.

---

## Testing checklist

After implementing:
1. `POST /stores/:storeId/stickers/generate/illustrative-image` with a simple prompt returns a `processedImageData` PNG within 30s
2. `POST /stores/:storeId/backgrounds/generate` with brief `"soft aged paper"` and `saveToStore: true` creates a row in `backgrounds` with a `data:image/png;base64,...` `assetRef`
3. The new background appears in the theme studio's background picker
4. Selecting the generated background and clicking "Generate planner" produces a PDF with that background on every page
5. The seed script runs cleanly: `pnpm --filter @workspace/scripts run seed-kit-vgj`
