---
name: Support system
description: Two-tier issue-reporting feature — store owners file to platform queue, buyers file to store queue.
---

## Architecture

**Tiers:**
- Store owner / staff → `recipientScope = "platform"` → super admin handles
- Buyer / unauthenticated → `recipientScope = storeId` → store owner handles

**DB tables:** `tickets` + `ticket_replies` — created via `lib/db/migrate-tickets.mjs`
(drizzle push needs TTY; use `node migrate-tickets.mjs` from lib/db for migrations)

**Schema file:** `lib/db/src/schema/tickets.ts` — exported from `lib/db/src/schema/index.ts`

## Routes

| URL | Component |
|-----|-----------|
| `/s/:storeSlug/support` | `pages/shop/SupportPage.tsx` — public, role-adaptive |
| `/super/support` | `pages/super/SupportInbox.tsx` — platform queue |
| `/store/:storeId/support-inbox` | `pages/store/SupportInbox.tsx` — buyer queue |

## Key decisions

**Area arrays in separate file:** `pages/shop/support-areas.ts` — must NOT live in SupportPage.tsx.
Vite React Fast Refresh requires files with a default component export to not also export non-component values (arrays, constants). Violating this causes HMR invalidation on every save.

**Tier detection:** Fetch `/api/me/stores`, check if any entry for this store has role `store_owner` or `store_staff`. Falls back to buyer tier if unauthenticated or no matching store role.

**Diagnostics assembled server-side:** `POST /support/tickets` fetches the plannerConfig by `buildRef` (asserts `userId` match), enriches with theme/edition names + last generation job, stores full JSONB in `tickets.diagnostics`.

**Screenshot flow:** Uses existing `storageApi.requestUploadUrl` → presigned PUT → objectPath stored in `screenshotRefs[]`. Never base64 in the ticket row.

**Article matching:** `GET /support/articles?area=&symptoms=&scope=` — simple keyword scoring against `helpContentTable`. EXACT MATCH ≥ title hit on symptom term; LIKELY ≥ score 4; RELATED > 0.

**Why separate area file:**
Fast Refresh limitation — any file exporting a default component must ONLY export components. Mixed exports (component + constant arrays) break HMR and trigger full page reload on every edit.
