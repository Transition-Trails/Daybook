---
name: WorldSmith Stories + Bible tabs
description: Two new tabs in FocusedWorldView (WorldSmithHome.tsx): Stories (story CRUD + act view) and World Bible (prose-first creative form).
---

## FocusedWorldView activeSection type
`"overview" | "production" | "review" | "integrations" | "stories" | "bible"`

## SECTIONS order
Overview → Stories → World Bible → Runs → Review → Settings

## StoriesSection
- Fetches `GET /v1/editorial/stories?world_id=` via useQuery `["ws-stories", world.id]`
- Returns `WsStoryWithActs[]` (stories with acts embedded in response)
- Story picker: pill buttons at top; clicking selects story
- Create form: inline when "New Story" clicked
- Acts display: 3-column grid of act cards; empty state with link to canon
- Products strip at bottom: 4 placeholder product cards (Solo RPG Daybook, Junk Journal Kit, Sticker Kit, Monthly Membership) — status = planned/draft

## WorldBibleSection
- Edits: visualPalette, proseVoice, atmosphericNotes, materialWorld, worldRules
- Prose-first UX: each field presented as a question ("What does this world look like?")
- Uses `apiFetch PATCH /v1/worldsmith/worlds/:id` — same endpoint as IntegrationsSection
- Local dirty state; "Save World Bible" button activates when dirty
- worldRules: add/remove individual rules; Enter key adds

**Why:** The existing Settings tab mixes technical config (Notion IDs, Drive folder) with creative Bible fields. Separating them lets the world-builder author prose without scrolling past database IDs.
