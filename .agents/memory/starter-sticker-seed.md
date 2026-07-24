---
name: Starter sticker seed
description: How to re-run the starter sticker seed and what it inserts
---

## Command
```bash
pnpm --filter @workspace/scripts run seed-stickers
```
Idempotent (`onConflictDoNothing`). Sharp SVG → PNG generation with transparent backgrounds.

## What's inserted
**8 stickers** in `stickers_library` (origin='starter', status='live', authoredByStoreId=null):
- stk_starter_checkbox (fn: checkbox, #C87560)
- stk_starter_flag (fn: flag, #5E8B6A)
- stk_starter_habit (fn: habit, #8B5E8B)
- stk_starter_timeblock (fn: time-block, #3E7A8C)
- stk_starter_tab (fn: tab, #3E7A57)
- stk_starter_date (fn: date, #B85C3C)
- stk_starter_banner (fn: banner, #E07840)
- stk_starter_decorative (fn: decorative, #7A4E8C)

**3 packs** in `sticker_packs` (origin='starter', status='live', globalAvailable=true):
- stkpk_s001 "Planner Essentials" → checkbox, flag, date
- stkpk_s002 "Daily Rhythm" → habit, time-block, tab
- stkpk_s003 "Style & Accent" → banner, decorative, checkbox

## Visibility rules
- Platform catalog (`GET /platform/stickers`): all stickers including starter
- Store sticker list (`GET /stores/:id/stickers`): owned + starter (read-only; `origin='starter'` rows cannot be mutated via getOwnedSticker guard)
- Store owners cannot edit/delete starter stickers (403 from `getOwnedSticker`)

## Sharp dependency
`scripts/package.json` now has `sharp: ^0.35.3`. SVG input works via librsvg in the Replit environment. Fallback: solid-color PNG via `sharp({ create: ... })` if SVG rendering fails.
