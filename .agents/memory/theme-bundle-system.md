---
name: Theme bundle system
description: How themes work as bundles after the consolidation — schema, API, palette links, and generation fallback chain.
---

## What a theme is now
A theme is a **bundle** containing:
- 2–N palettes (one marked `is_primary=true` in `theme_palettes`)
- 0–N backgrounds via `theme_backgrounds`
- 0–N sticker packs via `theme_packs`
- A `fontPairing` JSONB: `{ heading, subheading, body, accent }`

## Surviving themes after consolidation (2026-07-26)
| ID  | Name         | Status  | Origin   | Palettes (→ palette IDs)                                   |
|-----|-------------|---------|----------|------------------------------------------------------------|
| t1  | Warm Earth  | live    | starter  | Terracotta (primary), Sunrise                              |
| t2  | Botanicals  | live    | starter  | Sage Calm (primary), Forest                                |
| t3  | Deep Ocean  | draft   | licensed | Ocean (primary), Ocean Mist                                |
| t5  | Velvet Night| draft   | licensed | Plum (primary), Crimson Dusk, Smoky Quartz                 |

Soft-deleted: t4, t6, th_8b7796f44866, th_c0002647ec4c, th_bfe83c2cbec2, test-theme-noglobal-tcumc5nv

## Schema
- `theme_palettes`: has `is_primary BOOLEAN NOT NULL DEFAULT FALSE` column (added via migrate-themes)
- `theme_backgrounds`, `theme_packs`: unchanged, both have unique constraints
- `themes.font_pairing` JSONB, `themes.colors` JSONB (kept as generation fallback)

## API — enriched theme routes
Platform `GET /themes` and `GET /themes/:id` now return enriched objects with:
```json
{ "palettes": [...], "backgrounds": [...], "packs": [...], "fontPairing": {...} }
```
These are NOT in the generated `@workspace/api-client-react` types — use raw `fetch` in admin pages.

Composer sub-routes (all `requireSuperAdmin`):
- `PUT  /themes/:id/palettes`     — body: `{paletteId, isPrimary?, position?}[]`
- `PUT  /themes/:id/backgrounds`  — body: `{backgroundId, position?}[]`
- `PUT  /themes/:id/packs`        — body: `{packId, position?}[]`
- `PATCH /themes/:id/font-pairing` — body: font pairing object

## Generation fallback chain (unchanged)
`paletteId → themeId → edition-default`

Previously generated planner PDFs are safe: generation does raw SELECT on themes without status filter, so soft-deleted theme IDs still resolve.

## Shell nav
- Themes: group "Catalog" (prominent)
- Palettes: group "Parts" (secondary, last in sidebar)
- Groups rendered: `["Studios", "Catalog", "Parts", "Platform"]`

## Admin pages
- `catalog/themes/list.tsx` — bundle summary cards, fetches enriched themes via raw `fetch("/api/themes")`
- `catalog/themes/detail.tsx` — tabbed composer: Basic | Palettes | Backgrounds | Font Pairing | Packs

**Why:** Themes were 1:1 mirrors of single palettes, making the layer invisible. Consolidation into aesthetic families (Warm/Botanical/Ocean/Velvet) gives themes real bundle value.
