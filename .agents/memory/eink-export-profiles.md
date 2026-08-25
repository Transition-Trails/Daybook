---
name: E-ink device export profiles
description: How e-ink device presets wire through buildPdf, runGeneration, and the admin UI — not a new studio, inherited by every recipe.
---

## The rule
Every planner renderer, including pinned authored SVG interiors, must honor ink-friendly and device output options. `buildPdf` accepts a 9th string parameter `einkDevice` (preset key like `"remarkable"`); authored interiors receive equivalent renderer options. When set, the export forces `inkFriendly=true`, overrides the page trim to the device's native dimensions, and enforces minimum 0.75 pt line weights. The colour/standard-trim PDF is still built as the main file; the e-ink variant (B&W + device trim) is uploaded as `inkFriendlyPdfFileId`.

**Why:** "The B&W asset from ink-friendly IS the e-ink asset — do not build a second pipeline." Setting `einkDevice` simply adds device trim + quality gates on top of the existing B&W path.

## Preset library (`artifacts/api-server/src/lib/eink-presets.ts`)
Four presets: `remarkable` (447×597 pt), `supernote` (447×597 pt), `boox` (447×597 pt, closest preset), `kindle_scribe` (446×595 pt). All have a `linksQuality` field (`"full"` or `"poor"`). Kindle Scribe carries a `caveat` string for listing copy.

## Quality checker (`artifacts/api-server/src/lib/eink-checker.ts`)
`collectEinkViolations(opts)` returns a string array of violations. Two checks:
1. **Contrast floor** — original accent colour brightness > 0.85 (lighter than ~15% gray)
2. **File weight** — PDF buffer > 10 MB

`assertEinkSafe(opts)` throws `EinkSafetyError` on any violation.

## Page sizing
Inside `buildPdf`, and inside the authored interior renderer, an `einkDevice` uses the preset's `pts` dimensions instead of the normal trim. Portrait only for e-ink (no landscape override). The existing MARGIN=40 pt already covers safe inset for all four device toolbars.

## Line weight enforcement
`lt(n)` and `lo(n)` helpers are defined inside `buildPdf` (`Math.max(n, 0.75)` / `Math.max(n, 0.30)` when `einkMode`). Applied to all thin draw calls (weekly grid dividers, daily time-grid lines). `buildPreviewPdf` has identity-stub versions of the same helpers (preview never targets a device).

## URI annotation suppression (Kindle)
`skipLinks = einkMode && linksQuality === "poor"`. All `addUriAnnotation` calls in weekly and daily build sections are wrapped with `if (!skipLinks)`. AI-block links likewise suppressed.

## `runGeneration` flow
- `output.einkDevice` drives `shouldGenerateEinkVariant` alongside `output.inkFriendly`
- When device key is set: after building the ink-friendly buffer, calls `collectEinkViolations`; throws `EinkSafetyError` (hard failure — build does not upload) if violations found
- `einkCaveat` (Kindle caveat string or null) included in return value and propagated to the generate API response
- Device slug appended to filename via `plannerFileName({ …, einkDevice })`

## `PlannerOutput` schema extension
`einkDevice?: string | null` added to the type in `lib/db/src/schema/planner.ts` (JSONB field, no migration needed).

## Admin UI
- `POST /platform/planners/:id/generate` body: `{ inkFriendly?, einkDevice? }`
- `BuildCenter` in PlannerStudioHub: ink-friendly checkbox + 5-button device picker (None / reMarkable 2/Pro / Supernote A5X / Boox Note/Tab / Kindle Scribe). Selecting a device forces inkFriendly; clearing ink-friendly also resets device.
- Kindle Scribe generate success surfaces a second toast with the listing caveat.
- `ProductRecipes` page: "E-Ink Export Profiles" section with 4 device preset rows + "What the profile enforces" table, positioned between the recipe list and the two bottom info cards.
