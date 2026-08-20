---
name: WorldSmith Story schema
description: Five new DB tables for stories, acts, encounters, journal prompts, and record-story links; how to re-run and what each table stores.
---

## Tables created

| Table | Purpose |
|---|---|
| `ws_stories` | One story per world; has title, summary, status (draft/active/planned/archived), sort_order |
| `ws_story_acts` | Acts within a story (act_number, title, tagline); FK → ws_stories CASCADE |
| `ws_encounters` | Encounter events within an act; optional location_record_id; FK → ws_story_acts CASCADE |
| `ws_journal_prompts` | Printed journal page prompts linked to a canon record and optionally a story |
| `ws_canon_record_story_links` | Junction: canon record ↔ story (composite PK); optional act_id for finer placement |

## Migration
Run: `pnpm --filter @workspace/scripts run migrate-worldsmith-stories`
Script: `scripts/src/migrate-worldsmith-stories.ts` — idempotent, uses `CREATE TABLE IF NOT EXISTS`.

## Drizzle schema location
All five tables added to `lib/db/src/schema/worldsmith-editorial.ts` (bottom of file). Types exported as `WsStory`, `WsStoryAct`, `WsEncounter`, `WsJournalPrompt`, `WsCanonRecordStoryLink`.

## API routes added (worldsmith-editorial.ts)
- `GET /v1/editorial/stories?world_id=` — returns stories with acts embedded
- `POST /v1/editorial/stories`
- `PATCH /v1/editorial/stories/:id`
- `DELETE /v1/editorial/stories/:id`
- `GET/POST /v1/editorial/stories/:id/acts`
- `PATCH /v1/editorial/acts/:id`
- `DELETE /v1/editorial/acts/:id`
- `GET/POST /v1/editorial/canon-records/:id/journal-prompts`
- `DELETE /v1/editorial/journal-prompts/:id`
- `GET /v1/editorial/canon-records/:id/encounters`
- `GET/POST/DELETE /v1/editorial/canon-records/:id/story-links`

**Why:** TS7030 "not all code paths return a value" is triggered whenever a handler has `return res.json()` on some paths but not others. Fix: always use `res.json(...); return;` (never `return res.json(...)`).
