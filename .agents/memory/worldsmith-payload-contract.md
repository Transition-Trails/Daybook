---
name: WorldSmith PP-2.0 payload contract + Publishing Engine
description: PP-2.0 section-based payload format, format detection, validator aliases, and the Publishing Engine UX architecture.
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

## Publishing Engine UX architecture
`PipelineStageKey` type (12 stages) drives `activeStage` state in `InspectorScreen`.
Pipeline IS the navigation — clicking a stage opens its inspector panel.

Stage → panel mapping:
- `resolve` → `ResolvePanel` (clean list of resolved records)
- `validate` → `ValidationTab` (3-tier)
- `inheritance` → `InspectorTab` (node cards + ProvenanceChain)
- `prompt-assembly` → `PromptSectionsTab`
- `hash-generation` → `TechnicalTab`
- `ready-for-spec-board` → `ReadinessPanel` (checklist + summary) — **default**
- `specification-review` … `published` → `FuturePlaceholderPanel`

`ActionCenter` shows prioritised actions above the pipeline, driven by `errCount`.

## ProvenanceRecord fields
All human-readable names (no raw UUIDs in primary UI). Raw IDs in TechnicalTab behind "Show Technical IDs" toggle.
Fields: `production_spec_title`, `component_type`, `component_set`, `world`, `volume`, `style_guide`, `component_specification`, `prompt_modules[]`, `canon_records[]`, `run_id`, `compilation_timestamp`, `production_spec_notion_id`, `style_guide_notion_id`, `component_spec_notion_id`, `prompt_payload_notion_id`, `prompt_module_notion_ids[]`, `canon_record_notion_ids[]`, `prompt_payload_type`, `prompt_hash`, `payload_version`, `payload_format`, `compiler_version`.

**Why:** UUIDs overwhelm non-technical reviewers; ProvenanceRecord keeps human names front-and-centre.

## Key language
- "Generate Preview" → "Generate Specification Board"
- "Validation Status" → "Production Readiness" 
- "Warnings" (page title) → "Validation Report"
- `SpecPreviewSection` card has `id="spec-preview-card"` for ActionCenter scroll target
