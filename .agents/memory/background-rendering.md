---
name: Background rendering
description: How page backgrounds are resolved and drawn in the PDF generator
---

## BackgroundSpec
Defined in `artifacts/api-server/src/lib/pdf-generator.ts`:
```typescript
export interface BackgroundSpec { type: string; assetRef?: string | null; }
```
Optional fourth param on both `buildPdf` and `buildPreviewPdf`.

## Resolution chain (planners.ts, both runGeneration + preview route)
1. `style.backgroundId` (explicit buyer/builder selection) → look up `backgroundsTable`
2. Theme's first linked row in `themeBackgroundsTable` ordered by `position` → if none selected
3. No background (render identically to before — paper fill only)

**Why:** Backward-compatible — themes with no linked backgrounds are unaffected. Stores add backgrounds via owned-catalog API.

## Rendering layers (per page)
1. Paper fill (replaced by `bgColorOverride` when type=`color`)
2. Embedded image drawn full-page (type=`image` or `texture`) — `bgEmbedded` embedded once before page loop
3. Accent header bar + page ID text (always on top)
4. Content (links, text) drawn after page setup — always on top

## Shop response
`GET /shop/:storeSlug` and `/shop/:storeSlug/editions/:editionId` both return themes with a `backgrounds: Background[]` field (empty array when no backgrounds linked).

## Builder UI (StoreBuilder.tsx)
`backgroundId` state; picker shown only when selected theme has ≥ 1 background; "None" chip is default (empty string = no background override).

## Graceful failure
Malformed hex → `try/catch`, uses paper fill. Bad base64 image → `console.warn` + skip background, never fails generation.
