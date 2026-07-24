---
name: Studio grounding pattern
description: How profile grounding is injected into studio AI calls; cross-store product validation; copilot architecture
---

## Server-side generate endpoints
All four store studios now call server-side generate endpoints instead of client-side `aiApi.complete`:
- `POST /stores/:storeId/studios/theme/generate`
- `POST /stores/:storeId/studios/pack/generate`
- `POST /stores/:storeId/studios/edition/generate`
- `POST /stores/:storeId/studios/trends/generate`

These live in `artifacts/api-server/src/routes/store-studios.ts` and are mounted in `routes/index.ts` before `storeProfileRouter`.

**Why:** Client-side calls bypass profile grounding (system prompts were hardcoded constants). Server-side endpoints fetch the store profile, call `buildProfileGrounding`, prepend grounding to the system prompt, then call `callAi`.

## Frontend API
`studioGenerateApi` exported from `artifacts/admin/src/lib/api.ts` — four methods (`generateTheme`, `generatePack`, `generateEdition`, `generateTrends`). Each returns the parsed JSON directly with `model` and `provider` fields appended. The client no longer calls `extractJson` — the server handles parsing and returns 502 with `{ raw }` if Claude is malformed.

**How to apply:** Any new studio that calls Claude for generation should use this same pattern: server endpoint → grounding prepend → callAi → parse → audit → return direct JSON.

## Cross-store product ownership validation
`validateProductOwnership(storeId, editionId?, packId?)` helper in `marketing.ts` checks that the item's `authoredByStoreId` is either null (platform item, always allowed) or equals `storeId`. Returns `{ status, message }` on rejection, null if OK. Called in all three generate routes before `buildProductBrief`.

**Why:** Without this check, any staff member could construct a POST with a foreign store's editionId and generate marketing copy grounded in another store's product details.

## Copilot architecture
`POST /stores/:storeId/marketing/copilot` in `marketing.ts`:
- Accepts `{ messages: [{role,content}][], context?: { activeTool, selectedProduct } }`
- Fetches profile grounding via `getGrounding`
- System prompt includes: grounding + tool manifest (generate_listing / generate_social / generate_mockup / draft_all) + selected product context
- Claude responds with `{ message, action?: { type } }` — JSON only
- Frontend `copilotMutation` passes full conversation history + triggers the matching generation mutation when `action` is present
- Safety cap: last 20 messages only sent to avoid context blow-out

## Dashboard onboarding banner
`ProfileSetupBanner` in `Dashboard.tsx`: fetches `store-flags` and `store-profile` queries (both already cached). Shows only when `aiEnabled=true` and profile lacks both `facts.pitch` and `facts.whatTheySell`. Disappears automatically once those fields are set — no dismiss button needed.
