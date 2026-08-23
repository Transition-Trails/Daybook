# Changelog

All notable changes to Daybook are documented in this file.

## 2026-08-21 — WorldSmith editorial updates

### Added

- Added a local-first WorldSmith inheritance resolver that compiles Editorial Suite Production
  Specs and their linked collection, volume, governance, module, and canon records directly
  from Postgres.
- Added local compilation coverage for an unreachable Notion client and for missing World Bible
  grounding, which now blocks a local compile with a visible structured warning.
- Added persistent local WorldSmith spec-preview boards in protected App Storage and exposed them
  in Editorial Suite, so unpublished editorial specs can be reopened without Notion publication.
- Added mutable Production Spec saving from the WorldSmith SpecEditor, including payload,
  payload version, canon record links, prompt modules, style guide, and component spec
  updates.
- Added unsaved-change detection and a discard action in the SpecEditor.
- Added regression coverage for the SpecEditor save round trip and related admin flows.
- Added World Bible failure recording and field-conditional rendering coverage.

### Changed

- WorldSmith CANON POLICY now includes the authored canon narrative, historical context, visual
  notes, emotional register, sensory clauses, and notes, so those edits affect compiled prompts
  and prompt hashes.
- Compilation accepts `production_spec_id` for local records and selects the local resolver by
  default in development; Notion writeback is retained only for records that have a publication ID.
- Local World Bible lookup now uses the Production Spec's world ID rather than its display name.
- Consolidated WorldSmith authored-spec readiness into one shared definition for the API,
  New Spec flow, and SpecEditor. Scores, per-section progress, readiness bands, canon rules,
  and payload structure checks now agree across all three surfaces.
- Removed the defaulted Canon Dependency completion credit and made pipeline readiness depend
  on direct payload and canon conditions rather than an unrelated aggregate percentage.
- Updated the WorldSmith spec-board template to version 3.1 and removed invented emotional
  language from companion content.
- Made readiness orientation checks conditional on component type in both the API and admin
  readiness UI.
- Added a five-minute in-process cache for inherited WorldSmith Notion pages.
- Replaced fabricated default palette swatches and constraint prose with an explicit palette
  empty state and the constraints actually carried by each spec.
- Unified preview idempotency and audit records with the board template's shared version
  constant, so stale `v2` previews are eligible for regeneration under template version 3.1.
- Added explicit linked-world validation so orphaned Production Specs return HTTP 422 instead
  of being created or failing as an internal server error.
- Strengthened spec-board font and geometric rendering regression checks.