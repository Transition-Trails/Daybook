---
name: WorldSmith Editorial Suite
description: Local-first creative authoring tables, API routes, and admin UI for the Editorial Suite (task #253).
---

# WorldSmith Editorial Suite

**Why:** Replace Notion as the authoring surface for WorldSmith production specs. Local DB is authoritative; Notion is a publication target.

## Schema
8 new tables in `lib/db/src/schema/worldsmith-editorial.ts`, all prefixed `ws_`:
`ws_collections`, `ws_volumes`, `ws_canon_records`, `ws_style_guides`, `ws_component_specs`, `ws_prompt_modules`, `ws_production_specs`, `ws_prompt_payloads`

All have `notion_page_id TEXT` + `synced_at TIMESTAMPTZ` for the publish adapter.

Run migration: `pnpm --filter @workspace/scripts run migrate-worldsmith-editorial`

## API routes
`artifacts/api-server/src/routes/worldsmith-editorial.ts` — mounted in `routes/index.ts`.
All routes under `/v1/editorial/` prefix, all protected by `requireAuth + requireSuperAdmin`.

Key endpoints:
- `GET /v1/editorial/worlds` — world selector list
- `GET /v1/editorial/board?world_id=` — swimlane board (specs grouped by pipeline status)
- `GET /v1/editorial/canon-board?world_id=` — kanban board (canon records grouped by status)
- `POST /v1/editorial/canon-records/:id/transition` — status transitions with guard
- `GET /v1/editorial/specs/:id` — enriched response with relationships panel data
- `POST /v1/editorial/specs/:id/publish` — Notion publish; returns 422 with `NO_NOTION_DB` if world has no notionProductionDbId

## Readiness score
`computeReadinessScore()` in the routes file — 18 checks across 5 sections. Stored as `readiness_score` (0-100) on every save.
`derivePipelineStatus()` derives `draft/payload_ready/canon_clear/compiled/published/blocked` from the score + canon guard.

## Admin UI
Located in `artifacts/admin/src/pages/super/worldsmith-editorial/`:
- `EditorialShell.tsx` — left nav (world/collection selector, record tree, sync footer). Internally provides `EditorialProvider` context. Do NOT double-wrap with `EditorialProvider` in App.tsx.
- `ReadinessBoard.tsx` — 6-column swimlane board
- `CanonBoard.tsx` — 5-column kanban with status transitions
- `NewSpecFlow.tsx` — 5-section progressive creation form; needs `EditorialProvider` wrapper in App.tsx (no shell)
- `SpecEditor.tsx` — tabbed form (Identity, Creative, Canon, Payload) + right sidebar (completion circle, dependency SVG graph, publish button)

Context: `artifacts/admin/src/contexts/EditorialContext.tsx` — `EditorialProvider` + `useEditorial()`.

## Routes in App.tsx
```
/super/worldsmith/editorial         → EditorialShell > ReadinessBoard
/super/worldsmith/editorial/board   → EditorialShell > ReadinessBoard
/super/worldsmith/editorial/canon   → EditorialShell > CanonBoard
/super/worldsmith/editorial/specs/new → EditorialProvider > NewSpecFlow (no Shell)
/super/worldsmith/editorial/specs/:id → EditorialShell > SpecEditor
```

## Canon transitions
`proposed → under_review → accepted → superseded`
`proposed → rejected → proposed`
Guards enforced server-side in `CANON_TRANSITIONS` map.

**How to apply:** Any new editorial screen must use `useEditorial()` and be wrapped in at least `EditorialProvider` (or EditorialShell which includes it).
