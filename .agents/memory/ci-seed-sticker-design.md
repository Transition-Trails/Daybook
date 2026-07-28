---
name: CI seed sticker-asset design rule
description: Why ci_bad_asset must link to ci_pack_a, not ci_bad_pack, and why stickers.id needs an explicit value
---

## Rule
`ci_bad_asset` (the sticker with `transparent=false`) MUST be linked as a sticker into `ci_pack_a` (the good pack), NOT into `ci_bad_pack`.

## Why
`checkPacks` counts stickers by querying the `stickers` table for rows with a matching `pack_id`.  
If `ci_bad_asset` is linked to `ci_bad_pack`, the pack appears non-empty → checker returns "ok" → false green on the pack check.  
`ci_pack_a` has an `instructionSheetFileId` so it passes the pack check regardless of whether `ci_bad_asset` is linked to it.

## How to apply
When re-running `seed:ci` or editing the seed, keep:
- sticker row: `{ id: "ci_bad_sticker", packId: "ci_pack_a", assetId: "ci_bad_asset" }`
- `ci_bad_pack` stays with 0 stickers and no instruction sheet

## Also
`stickers.id` is `text NOT NULL` with **no DB default** — always provide an explicit id when inserting via raw SQL.  
Drizzle-ORM insert via `db.insert(stickersTable).values(...)` will also fail unless `id` is provided.
