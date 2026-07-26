---
name: Sticker Studio Gap Closure
description: Six UX/feature gaps closed in the Sticker Studio in one session — details on decisions and gotchas.
---

## Gaps closed

### Gap 1 — Set Generator (biggest)
- New `artifacts/api-server/src/lib/labelImageGen.ts`: `getSetLabels()` + `renderLabelPng()` via `@resvg/resvg-js` + DejaVu fonts at `/usr/share/fonts/truetype/dejavu/`.
- New route `POST /platform/stickers/generate-set` — renders in batches of 5, returns base64 PNG array (no DB write).
- New route `POST /platform/stickers/batch` — saves pre-processed images directly, skips pipeline.
- `GenerateSetCard` component inside `CreateCenter` — full UI with set type / label style / font / colour / size / border / shadow controls, thumbnail review grid, select/deselect, batch save.

### Gap 2 — Dead top-bar buttons
- Hub state: `libCreateTrigger` (number) + `uploadTrigger` (number), incremented on click.
- `LibraryCenter` accepts `triggerCreate?: number`; `useEffect([triggerCreate])` → `setShowCreate(true)`.
- `CreateCenter` accepts `uploadTrigger?: number`; `useEffect([uploadTrigger])` → `fileRef.current?.click()`.

### Gap 3 — In-studio pack composer
- New `CreatePackModal` component: name/price/tags fields + live sticker picker grid.
- Hub state: `showNewPack: boolean`, toggled by Packs primary action button.
- Backend: `POST /platform/sticker-packs` route creates pack + optional sticker memberships.
- Backend: `PATCH /platform/sticker-packs/:id` route for publish/unpublish toggle.

### Gap 4 — Contrast fail on function-type active chip
- Replaced `bg-primary` (clay, ~3.5:1) with inline `style={{ background: CHIP_ACTIVE_BG, ... }}` = Ink Navy `#1B2A4A`.

### Gap 5 — "Set size → opens Edit" stub
- `StickerScalePreview` now accepts `onOpenEdit?: () => void` prop.
- Hub state: `hubEditTarget: LibrarySticker | null`; clicking button sets it; hub renders `<StickerFormModal mode="edit" ...>`.

### Gap 6 — Pack cover swatch
- `GET /platform/sticker-packs` joins `pack_stickers → stickers_library` to return `coverImage` (first sticker's `processedImageData`).
- `PacksCenter` switched from `useListStickerPacks()` to `platformStickersApi.listPacks()` (platform endpoint with coverImage).
- `PackRow` renders `<img>` when `coverImage` present, fallback `<Sticker>` icon.

## Key gotchas

- **`@resvg/resvg-js` must be in esbuild externals** (`build.mjs`): add both `"@resvg/resvg-js"` and `"@resvg/resvg-js-linux-x64-gnu"` to the `external` array. `"*.node"` alone is insufficient.
- **Hub state ordering**: all `useState` calls must precede any computed values (`leftRail`, `rightDock`) that reference those setters. Placing state after the rightDock causes TS errors.
- **`stickerPacksTable` has no `editionIds` field** — it's `planners` (jsonb `string[]`). Also `price` is `real NOT NULL default 0`, so use `price ?? 0` not `price ?? null` or `price ?? undefined`.
- **`platformStickersApi.list()` doesn't exist** — for listing stickers use `platformApi.stickers({ status: "live" })`.
