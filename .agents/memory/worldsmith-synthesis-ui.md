---
name: WorldSmith Synthesis canon UI
description: WorldsmithCanon.tsx replaced with the Synthesis design — new layout, preserved all data mutations.
---

## Layout
- **Height**: 100dvh flex column
- **Top bar**: 48px — back button, world selector, tab nav (Canon / Prompt modules / Style guides / Visual assets), Notion chip
- **Body row**: [210px LeftRail | fluid main | 280px RightPanel]

## Left Rail
Name-only record list grouped by canon type. Color dot per type (purple=character, blue=location, amber=object…). ◆ marker on object-type records. Filter chips at top (type abbreviations). Active record gets clay left border.

## Main area
- Playfair Display 38px name
- Badges row: type pill (colored), Space Mono ID stamp, status pill
- AutoField prose textarea (narrativeDetails) — autosave on blur
- Three tabs: **Image Ideas** | **Compose a Scene** | **Daybook & Game**

### Image Ideas tab
`generateImageIdeas(record, world)` returns `ImageIdea[]` (typed — must use `ImageIdea[]` not inferred to avoid TS2322). Template cards based on canonType + name + world.visualPalette/atmosphericNotes. Object-type records get amber "Object & Mystery" variant card.

### Scene Builder tab
Picks from related locations/characters/objects (from relations query). Assembled prompt preview. Mood selection. Generate button (disabled until AI wired).

### Daybook & Game tab
Three real API queries:
- `GET /v1/editorial/canon-records/:id/story-links` → story role section
- `GET /v1/editorial/canon-records/:id/journal-prompts` → journal prompts section
- `GET /v1/editorial/canon-records/:id/encounters` → encounters (location type only)
Physical page preview with real record name and prompts.

## Right Panel (280px)
- Objects & Mystery: relations filtered to canonType=object
- Canon Gaps: computed (no register? no prose? no object connections?)
- Record Details accordion (collapsed by default): ALL admin fields — status transitions, emotional register picker, sensory clauses, visibility, stability, historical context, visual notes, relations manager (add/remove/retype), linked specs, delete with confirm modal

## Data hooks preserved
All existing mutations: `patchMutation`, `transitionMutation`, `deleteMutation`, `addRelMutation`, `removeRelMutation`, `patchRelTypeMutation`, `cascadeMutation`. All existing queries: record, list, relations, inbound-relations, linked specs.

**Why:** The old 2297-line file had all admin fields in the main flow. New design moves admin to collapsed right-panel accordion so the creative actions (image generation, scene building) are the primary affordance.
