---
name: WorldSmith PP-2.0 payload contract + Publishing Engine
description: PP-2.0 section-based payload format, format detection, validator aliases, and the Publishing Engine UX architecture (four-zone, three-tab workspace).
---

## PP-2.0 format detection
`shared_prompt` key present in payload → PP-2.0 structured sections.
Absent → PP-1.0 legacy flat keys (backward compat, no breaking change).

## PP-2.0 section keys
`shared_prompt`, `front_prompt`, `back_prompt`, `inside_prompt`, `outside_prompt`, `assembly_prompt`, `negative_prompt`

## Legacy PP-1.0 alias normalisation (validator.ts)
`card_role → asset_role`, `paper_and_materials → materials`, `front_layout + back_layout → composition`
These are normalised before flat-key validation runs. A `LEGACY_PAYLOAD_FORMAT` warning is always appended for legacy payloads.

## Validation 3-tier (client-side split)
`RECOMMENDATION_CODES` set in WorldSmithCompiler.tsx splits `warnings[]` into:
- **Errors** — compilation blocked (from `errors[]`)
- **Warnings** — quality affected (warnings not in RECOMMENDATION_CODES)
- **Recommendations** — modernization only (`LEGACY_PAYLOAD_FORMAT`, `MIGRATION_SUGGESTED`, `PAYLOAD_OPTIMIZATION`, `OPTIONAL_PROMPT_MODULE`, `OPTIONAL_MODULE`)

## Publishing Engine UX architecture (v3 — four-zone cockpit)

### Four zones
- **Zone 1** — `StickyPublishingHeader`: compact 2-row card (identity row + stats row). IntersectionObserver collapses it to a backdrop-blur strip when scrolled.
- **Zone 2** — `ActionCenter`: single full-width `h-11` primary button + secondary row. Primary is red when errors, navy when clean.
- **Zone 3** — `WorkspacePanel`: three-tab workspace (Overview / Inspector / History).
- **Zone 4** — `SpecPreviewSection`: rendered below the workspace by the parent, only visible when no successful board has been generated yet.

### WorkspacePanel tabs

**Overview tab** (`OverviewTab`):
- Top row (5-col grid): `ProductionSummaryCard` (3 cols: Identity / Workflow / Compilation groups) + `PublishingJourneyCard` (2 cols: vertical 11-stage clickable timeline)
- `GroupedReadinessCard`: 4 collapsible groups (Governance / Compilation / Output / Publishing), arranged in a 4-col grid
- `CompilationTimeline`: per-stage timestamps (existing component)
- Bottom row: `ProductionContextCard` (volume progress placeholder) + `NextAfterThisCard` (forward path from current stage)

**Inspector tab** (`InspectorWorkspaceTab`):
- `PublishingPipeline` (horizontal stage nav, existing)
- Stage panel below: ResolvePanel / ValidationTab / InspectorTab / PromptSectionsTab / TechnicalTab / ReadinessPanel / FuturePlaceholderPanel

**History tab** (`HistoryTab`):
- `useQuery` for runs keyed by `result.production_spec_id`
- Sections: Compile History (live) / Spec Board History (placeholder) / Artwork / QA / Publishing (future placeholders)

### State model (InspectorScreen)
```tsx
const [workspaceTab, setWorkspaceTab]     = useState<"overview"|"inspector"|"history">("overview");
const [inspectorStage, setInspectorStage] = useState<PipelineStageKey>("ready-for-spec-board");
function goToStage(stage) { setInspectorStage(stage); setWorkspaceTab("inspector"); }
```
`goToStage` is threaded into `StickyPublishingHeader`, `ActionCenter`, `WorkspacePanel`, and `PublishingJourneyCard` — clicking any stage in the journey, or clicking a validation shortcut, navigates to the Inspector tab at the right stage.

### PublishingJourneyCard stages (11)
Resolve → Validate → Inheritance → Prompt Assembly → Hash Generation → Specification Board (current) → Human Review → Artwork Generation → Artwork QA → Publishing Approval → Published.
Completed stages are emerald, current stage has a pulsing navy dot. Clicking a completed or current stage calls `goToStage`.

### Compact header (Zone 1 non-sticky state)
Row 1: `[abbr] title [PP-1.0] · component · volume · world  [↗] [New]`
Row 2: `[●] stage | readiness% [bar] | errors/warnings/recs | [Generate →]`

### SpecPreviewSection (Zone 4) status model
Status badge: Not Generated / Generating… / Failed / Dry Run Complete. Idle state has a dashed placeholder. Primary = full-width Generate; Secondary = full-width Dry Run.

### Key language conventions
- "Generate Preview" → "Generate Specification Board"
- "Validation Status" → "Production Readiness"
- "Prompt Hash" → "Compiled Artifact ID" (in UI summary rows)
- "Publishing Progress" / "Ready For" → "Publishing Journey"

**Why:** The page must feel like a professional publishing cockpit (Adobe InDesign Preflight / GitHub Actions), not a compiler output screen. Every label and layout decision serves the "Where am I / What am I working on / What should I do next / How does this affect the pipeline?" orientation model.

## ProvenanceRecord fields (post-task-201 merge)
Includes `collection?: string` and `collection_notion_id?: string`.

## ProductionSummaryCard field sources
- World: `prov?.world ?? preflight?.world`
- Collection: `prov?.collection`
- Volume: `prov?.volume ?? preflight?.volume`
- Component: `prov?.component_type ?? result.component_type ?? preflight?.component_type`
- Component Set: `prov?.component_set`
- Compilation timestamp: `prov?.compilation_timestamp`
- Compiled Artifact ID: `result.run_id`
