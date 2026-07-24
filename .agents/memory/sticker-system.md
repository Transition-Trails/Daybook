---
name: Sticker system schema and auth
description: Where the sticker library lives in the DB, how auth works, and image processing approach
---

## Tables added

- `stickers_library` — central sticker library; one row per image asset. Columns: id, name, tags[], functionType, status (draft|live|deleted), origin, authoredByStoreId, borderStyle, borderWidth, borderColor, sizeInMm, exportTargets (JSONB), processedImageData (text/base64 PNG), cutlineSvg (text/SVG).
- `pack_stickers` — M:N join between `sticker_packs` and `stickers_library`. Columns: id (serial), packId, stickerId, position. Unique on (packId, stickerId).

## Auth model

Same pattern as `owned-catalog.ts`:
- `requireStoreAccess("store_staff")` middleware + `assertSameStore()` helper
- `starter`/`licensed` stickers are read-only to stores
- `owned` stickers: authoring store + super_admin can mutate; staff limited to drafts

## Image processing

`artifacts/api-server/src/lib/imageProcessing.ts`:
- `removeBackground()` — BFS flood-fill from edge pixels sampled at corners; tolerance-based colour matching. Works well for solid/gradient backgrounds. For complex photographic backgrounds, a dedicated AI service (e.g. remove.bg API) would produce better masks.
- `applyBorderAndSize()` — applies border stroke and resizes to mm target at 96 DPI
- `generateCutlineSvg()` — Moore neighbourhood boundary tracing + RDP simplification → real Cricut/Silhouette SVG cut path

Images are accepted as base64 data URLs in the JSON request body. Processed PNG and SVG cutline stored as text in the DB.

## Routes

All under `/stores/:storeId/stickers`. Bulk routes registered BEFORE `/:id` to prevent param capture.

## STICKER_FUNCTION_TYPES

Fixed enum: checkbox, flag, habit, time-block, tab, date, banner, decorative. Validated server-side; unknown values → 400.

## Admin UI

`artifacts/admin/src/pages/store/Stickers.tsx` — full library management page with filter bar, bulk-select toolbar, create/edit/usage/add-to-pack modals. Wired at `/store/:storeId/stickers`. "Sticker library" nav link added to StoreAdminShell between "My content" and "Customers".

**Why:** Sticker images stored as base64 in DB (text column) to avoid Google Drive dependency. Acceptable for sticker-sized images (typically <500KB uncompressed).
