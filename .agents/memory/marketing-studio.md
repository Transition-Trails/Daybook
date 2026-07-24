---
name: Marketing Studio
description: Store-scoped AI marketing workbench — profile grounding, listing/social/mockup generation, asset save.
---

## What was built

### DB (lib/db/src/schema/stores.ts)
- `storeProfilesTable` — one per store, `storeId` PK. `facts` JSONB (storeName, pitch, whatTheySell, whoItsFor, differentiators[], links[]) + `voice` JSONB (toneTags[], wordsWeLove[], wordsToAvoid[], formalityLevel, emojiLevel, styleSample).
- `marketingAssetsTable` — saved AI-generated assets. `assetType` = listing | social | mockup. `channelTarget`, `sourceEditionId`, `sourcePackId`, `voiceSnapshot` all nullable.

### Backend
- `artifacts/api-server/src/lib/profile-grounding.ts` — `buildProfileGrounding(profile, voiceOverride?)` → system prompt grounding block. Server-side only; inject at top of any AI studio system prompt.
- `artifacts/api-server/src/routes/store-profile.ts` — GET/PUT `/stores/:storeId/profile`. PUT merges facts/voice with existing (not full-replace). Mounted in routes/index.ts.
- `artifacts/api-server/src/routes/marketing.ts` — POST generate/listing, generate/social, generate/mockup (stubbed), GET/POST/DELETE assets. Mounted in routes/index.ts. All AI endpoints gate on `storeFlagsTable.aiEnabled`.

**Mockup stub:** Returns SVG placeholders + AI-described scene labels. `simulated: true` always. Real image model can replace the body without changing the route interface.

### Frontend
- `artifacts/admin/src/pages/store/settings/StoreProfile.tsx` — Facts + Voice form, completion meter, save/update.
- `artifacts/admin/src/pages/store/studios/MarketingStudio.tsx` — 3-col workbench (left rail + product picker, center tool panels, right copilot dock). Three tools: Listing (with Etsy char/tag limits), Social (multi-channel), Mockup (simulated). "Draft it all" calls all 3 in parallel. Copilot dock with "Guide me" flow + free-text commands.
- `artifacts/admin/src/lib/api.ts` — `storeProfileApi` (get/save), `marketingApi` (generateListing/Social/Mockup, listAssets, saveAsset, deleteAsset). All exported from end of file.
- `StoreAdminShell.tsx` — Settings nav group with "Store Profile & Voice", Marketing Studio added to STUDIO_NAV (aiEnabled-gated).
- `App.tsx` — Routes: `/store/:storeId/studios/marketing` + `/store/:storeId/settings/profile`.

## Key decisions

**Why:** All existing studios use client-side `aiApi.complete`. Marketing Studio uses dedicated server-side generate endpoints so profile grounding is injected server-side (keeps the profile secret from the client, also ensures consistency). Other studios could migrate the same way later.

**How to apply:** To inject profile grounding into an existing studio's AI call, add a server-side generate endpoint that calls `buildProfileGrounding` + `callAi`, rather than passing the grounding through `aiApi.complete`.

**Save = draft only:** Publish buttons copy to clipboard or save to DB. No external API posting to Etsy/TikTok in v1 — labelled clearly in UI.

**Mockup stub interface:** Replace the body of the mockup route's stub section (clearly marked) to swap in real image generation without touching the route signature or frontend.
