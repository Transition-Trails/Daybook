---
name: Ink feature flag
description: How the inkEnabled gate works — DB column, API endpoint, server guards, frontend InkGate, and the no-data-deletion guarantee.
---

## Rule
`inkEnabled` in `store_flags` is a pure visibility gate. Toggling it off NEVER touches `annotation_layers` rows.

## DB
- Column: `store_flags.ink_enabled boolean NOT NULL DEFAULT false`
- Migration: `lib/db/migrate-ink-flag.mjs` (safe to re-run; IF NOT EXISTS)
- Schema: `lib/db/src/schema/stores.ts` → `storeFlagsTable.inkEnabled`

## Server (ink.ts)
- `isInkEnabledForUser(userId, isSuperAdmin)` — super_admin always passes; others need one ink-enabled store membership via `store_members ⋈ store_flags`.
- `GET /ink/enabled?storeSlug=<slug>` — auth-only, NOT ink-gated (used by InkGate itself). With `storeSlug` param it checks that store's flag directly (for buyers who aren't store members).
- All 6 route handlers have a 403 guard at the top calling `isInkEnabledForUser`.

## Frontend
- `inkApi.enabled(storeSlug?)` in `artifacts/admin/src/lib/api.ts`.
- `InkGate` component in `App.tsx` — calls `inkApi.enabled`, redirects on flag=false. Wraps only the shop route `/s/:storeSlug/ink/:id`; the `/daybook/` routes are already super_admin-only via `RequireSuperAdmin`.
- Feature Flags page (`/super/flags`) has an Ink toggle column for per-store overrides.

**Why:** Ink is a beta/paid feature. Toggling the flag keeps annotation data intact — offboarding guarantee is that writers lose access to the editor but not their saved strokes.

**How to apply:** Any new ink route must call `isInkEnabledForUser` at the top of its handler. Any new buyer-facing ink UI must be inside `<InkGate storeSlug={...}>`.
