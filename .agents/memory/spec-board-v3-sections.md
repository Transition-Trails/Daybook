---
name: Spec board V3 section labels
description: V3 spec-board-template.ts renamed several sections; tests that assert on old V2 label strings will fail.
---

## Rule
When writing tests against `buildSpecBoardSvg` output, use the V3 section labels:

| V2 label (old) | V3 label (current) |
|---|---|
| "ILLUSTRATED NARRATIVE" | "NARRATIVE ROLE" |
| "CANON LOCK" | "RELATIONSHIP TO COMPANION ASSETS" |
| "WORLDSMITH FOUNDATION" (subtitle fallback) | "WORLDSMITH LIVING ARCHIVE  ·  THE CURATOR'S DESK" |

Also removed in V3:
- "Canon Dependency: …" prefix — `canonDependency` field is no longer rendered as a visible label.
- "3 Canon Records linked" / "No canon records linked" count fallbacks — replaced by `<componentType> Series` (from the companion row).
- "Required content:" / "Component type:" / "Asset role:" fallback prefixes in the Narrative section — V3 fallback chain is `illustratedNarrative → narrativePurpose → designIntent → "—"`.

**Why:** V3 redesigned the spec board from a numbered-section layout to a named-section editorial layout with companion/emotional/artist columns.

## How to apply
- Section label assertions: use `.toUpperCase().toContain("NARRATIVE ROLE")` etc.
- Fallback tests: check for `narrativePurpose` text (present in the default makeBoard) or `requiredContent` items in the Required Elements Checklist column.
- Canon names: still appear prefixed "HP001: …" in the Relationship to Companion Assets column.
