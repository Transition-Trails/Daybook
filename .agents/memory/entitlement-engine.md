---
name: Entitlement engine
description: Origin-based content gating for catalog items — rules, offboarding guarantee, DB fields, and route locations.
---

## Rules
- **starter** → always entitled, never gated.
- **licensed** → entitled only when `store.subscriptionActive = true`. Stripe will flip this; super_admin can toggle manually via `PATCH /stores/:storeId/entitlement`.
- **owned** → entitled only for `authoredByStoreId` store (and super_admin management views).

## Offboarding guarantee (critical)
The gate fires at NEW generation time only (`POST /planners` with `storeContext`). Already-generated planner PDFs and their Ink layers are served via `/planners/:id` and `ink.ts` — those paths are NEVER re-checked against the store's subscription state.

## DB fields
- All catalog tables (`themes`, `sticker_packs`, `inserts`, `related_products`, `editions`): `origin text NOT NULL DEFAULT 'licensed'`, `authored_by_store_id text NULL`.
- `stores` table: `default_mode text NOT NULL DEFAULT 'curated'`, `subscription_active boolean NOT NULL DEFAULT true`.

## Starter subset (seeded)
- Themes: `t1` (Terracotta), `t2` (Sage Calm)
- Inserts: `i1` (Section header banner), `i2` (Habit tracker grid)
- Editions: `e4` (Basic 2026)
- Packs, related_products: all `licensed`

## Demo state (seed)
- `store-delta`: `subscriptionActive=false`, `defaultMode=independent` — demonstrates gated state. Status=suspended so public shop returns 410.
- `store-alpha/beta/gamma`: `subscriptionActive=true`, `defaultMode=curated`.

## Routes
- Central helper: `artifacts/api-server/src/lib/entitlement.ts` — `resolveEntitlement()`, `filterEntitled()`, `assertEntitled()`, `annotateWithEntitlement()`.
- `PATCH /stores/:storeId/entitlement` — super_admin only; writes audit log.
- `GET /stores/:storeId/catalog` — returns rows enriched with `origin` + `entitlementStatus` by joining catalog tables in batch.
- `GET /shop/:storeSlug` — applies `filterEntitled()` before returning items.
- `POST /planners` — when `storeContext.storeId` is in body, calls `assertEntitled()` for edition + themeId. Returns 403 with human-readable `EntitlementError` message.

## Admin UI
- `ShopCatalog.tsx` — OriginBadge (Starter=blue/Licensed=amber/Yours=green), EntitlementChip (gated-license-lapsed=red), subscription-inactive warning banner.
- `Dashboard.tsx` — `<EntitlementPanel>` visible to super_admin only; `subscriptionActive` Switch + `defaultMode` selector cards; calls `storesApi.entitlement.update()`.

**Why:** isSuperAdmin bypass is for management views only. Storefront and generation paths always use the store's real subscription state — super_admin cannot bypass on behalf of a customer store.
