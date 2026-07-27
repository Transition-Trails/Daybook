---
name: Platform planner templates
description: Platform-admin-owned planner templates persisted in DB, served via API, managed in PlannerStudioHub with left-rail template selector.
---

## Rule
Platform admins create planner templates at `/studios/planner?mode=build`. These are persisted, published to catalog, and adoptable by stores — not ephemeral one-off PDFs.

## DB
- Table: `platform_planner_templates` (created via `executeSql` migration and defined in `lib/db/src/schema/planner.ts`)
- Key fields: `id`, `name`, `description`, `status` (draft|published|archived), `editionId`, `productType`, `setup` (jsonb), `style` (jsonb), `output` (jsonb), `drive` (jsonb with pdfFileId/configFileId), `generatedAt`, `publishedAt`
- `setup.startMonth` is **0-indexed** (Jan=0, Dec=11) — matches template, differs from BuildState (1-indexed)

## Backend
- Route file: `artifacts/api-server/src/routes/platform-planners.ts`
- Mounted in `routes/index.ts` with `router.use(platformPlannersRouter)`
- Auth: `requireSuperAdmin` middleware (NOT `requireAuth` — that doesn't exist; `requireAuth` → `requireSuperAdmin`)
- Setup fields locked after generation (returns 409 with `code: "SETUP_LOCKED"`)
- Generate uses `runGeneration(fakeConfig, ...)` by casting template to PlannerConfig shape with `as unknown as PlannerConfig`

## Frontend
- Types: `PlatformPlannerConfig`, `platformPlannersApi` in `artifacts/admin/src/lib/api.ts`
- Hub: `artifacts/admin/src/pages/studios/PlannerStudioHub.tsx`
  - Left rail: `PlatformTemplateRail` (replaces old `UnifiedRail` with preset cards)
  - Build tab: `BuildCenter` now takes `template: PlatformPlannerConfig | null` + `onUpdated` + `onCreateNew` callbacks
  - No template selected → creation form (name + optional edition)
  - Template selected → two-card UI (SET UP ONCE / CUSTOMIZE ANYTIME) backed by API mutations
  - `templateToBuildState(t)` helper converts template to `BuildState` for `PdfPreviewDock`

## Why
Stores need consistent, platform-blessed planner templates. Platform admins create → generate → publish; stores adopt. Store-level `PlannerStudio.tsx` remains for store-specific customization on top.
