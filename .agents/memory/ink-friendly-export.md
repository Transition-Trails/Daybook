---
name: Ink-friendly B&W export
description: How the ink-friendly planner PDF variant works — generator flag, colour overrides, and dual Drive upload.
---

## The rule
`buildPdf` accepts an 8th boolean parameter `inkFriendly` (default `false`). When true it produces a line-art B&W PDF from the same layout data.

**Why:** Buyers printing at home save significant ink when colour fills and photographic backgrounds are stripped out.

## How to apply
- `accent` and `ink` colour variables are forced to `{r:0,g:0,b:0}` — all downstream draw calls are automatically black.
- `paper` is forced to `#FFFFFF` — no kraft or slate tints.
- The `background` argument is ignored entirely (no `bgColorOverride` or `bgEmbedded` set).
- `renderStyle` is forced to `"flat"` — no grain, gutter, or ring overlays rendered.
- The accent header rectangle uses a white fill + 0.5pt black border instead of a solid colour fill; page ID text is black.

## Dual-file generation in `runGeneration`
- `runGeneration` reads `output.inkFriendly` from the config JSONB.
- When true it calls `buildPdf` twice: once normally, once with `inkFriendly=true`.
- The ink-friendly buffer is uploaded to Drive as `<configId>-inkfriendly`.
- Return type includes `inkFriendlyPdfFileId: string | null` (null when inkFriendly was not requested or upload failed).
- The drive JSONB stored on `platform_planner_templates` is extended with `inkFriendlyPdfFileId` when present.

## API surface
- `POST /platform/planners/:id/generate` accepts body `{ inkFriendly?: boolean }`.
- The flag is merged into the `output` JSONB before calling `runGeneration`.
- `platformPlannersApi.generate(id, { inkFriendly })` in `api.ts` passes the option.

## UI
- `BuildCenter` in `PlannerStudioHub.tsx` has an `inkFriendly` boolean state.
- A checkbox labelled "Include ink-friendly B&W version — line art, no colour fills" sits above the Generate/Publish buttons.
- The generation toast appends " · + ink-friendly" when the flag was set.
