---
name: House store planner generation
description: How to regenerate hs_cfg_2026_daily and what the results look like
---

## Command
```
pnpm --filter @workspace/api-server run generate:house
```
Script: `artifacts/api-server/scripts/generate-house-planner.ts`

## What it does
1. Fetches `hs_cfg_2026_daily` from DB (12-month 2026 daily planner for store-house)
2. Overlays `userId: SUPER_ADMIN_USER_ID` to use the super-admin's Google token for Drive
3. Injects FONT_OVERRIDE (`_std_no_bundle_`) to bypass the Playfair Display WOFF corrupt-glyph probe
4. Calls `runGeneration(config)` — full pipeline: buildPdf + Drive upload
5. Updates `planner_configs.drive` with returned file IDs and sets `generatedAt`

## Why
`hs_cfg_2026_daily.drive.pdfFileId` was a fake placeholder string from the seed.
Running `generate:house` replaces it with a real Google Drive file ID (or a timestamp stub if Drive is unavailable).

## Last known result
- 455 pages, generated in ~6.3s
- `pdfFileId`: `1g96r3QF2fQ8D45fXKOe3vpchZyOfGoZw` (real Drive ID — super-admin had Google authorized)
- `generatedAt`: 2026-07-28T21:29:10Z

## Repeatable
Re-run any time the planner config changes or a fresh Drive file is needed.
Does NOT modify the seed itself — generation requires live Google credentials.
