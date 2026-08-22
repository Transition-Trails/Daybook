# Changelog

All notable changes to Daybook are documented in this file.

## 2026-08-21 — WorldSmith editorial updates

### Added

- Added mutable Production Spec saving from the WorldSmith SpecEditor, including payload,
  payload version, canon record links, prompt modules, style guide, and component spec
  updates.
- Added unsaved-change detection and a discard action in the SpecEditor.
- Added regression coverage for the SpecEditor save round trip and related admin flows.
- Added World Bible failure recording and field-conditional rendering coverage.

### Changed

- Updated the WorldSmith spec-board template to version 3.1 and removed invented emotional
  language from companion content.
- Made readiness orientation checks conditional on component type in both the API and admin
  readiness UI.
- Added a five-minute in-process cache for inherited WorldSmith Notion pages.
- Added explicit linked-world validation so orphaned Production Specs return HTTP 422 instead
  of being created or failing as an internal server error.
- Strengthened spec-board font and geometric rendering regression checks.