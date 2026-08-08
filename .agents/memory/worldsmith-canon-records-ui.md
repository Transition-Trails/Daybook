---
name: WorldSmith Canon Records UI
description: Schema, routing, and component decisions for the Canon Records editorial screen (Steps 1–2 of the handoff build).
---

## Migration (Step 1 — completed)
Script: `scripts/src/migrate-canon-records-v2.ts`
Run with: `pnpm --filter @workspace/scripts run migrate-canon-records-v2`

Added to `ws_canon_records`: `emotional_register` (TEXT, nullable), `sensory_clauses` (TEXT default ''), `register_locked` (BOOLEAN default false)
Added to `worldsmith_worlds`: `world_rules` (JSONB TEXT[] default []), `style_guide_version` (INTEGER default 1)
New table: `ws_canon_record_relations` (from_record_id, to_record_id, relation_type, created_at) — used for transitive register cascade BFS.

**Why:** Confirmed decisions — cascade depth is transitive (BFS via relation table, stop at register_locked=true); sync direction is local-wins (write to Notion on approval, never overwrite local approved value on sync).

## Screen (Step 2 — completed)
`WorldsmithCanon.tsx` — full three-column page (236px rail | fluid editor | 352px margin).
Route: `/super/worldsmith/editorial/canon/:id` → wrapped in `EditorialProvider` directly (bypasses `EditorialShell`).
**Does NOT use EditorialShell** — the canon detail view is its own full-page layout.

EMOTIONAL REGISTER + SENSORY CLAUSES block is placed BEFORE the narrative text blocks to ensure it's above the fold at 1080p. This is the design contract — do not reorder.

Register palette: Withholding (#4A5E78) | Intimate (#A85C6E) | Guarded (#3D7A5C) | Trespass (#8B6220) | Absence (#6B7C8C) | Confidence (CLAY #C87560).

## API
PATCH `/v1/editorial/canon-records/:id` — now accepts `emotional_register`, `sensory_clauses`, `register_locked` in addition to existing fields.
Validation: `emotional_register` must be one of the 6 register values or null.

## Remaining steps from spec
- Step 3: Notion sync — populate `ws_canon_record_relations` from "Related Canon" property on sync; PATCH Notion pages on approval with the three new fields.
- Step 4: Register cascade write-loop — BFS from changed record through `ws_canon_record_relations`, stopping at `register_locked=true` nodes; batch-update descendants.
- Step 5: Margin rail AI Assist (coming later).

## Column that was added but not yet in DB (session guard)
`notionStyleGuidesDbId` was added to the schema by a prior task agent but NOT applied to the live DB (missing ALTER TABLE). Fixed by running `migrate-style-guides-db-col.ts`. Pattern: after any task-agent merge that adds schema columns, check lib/db typecheck and run `npx tsc -b lib/db --force` if stale.
