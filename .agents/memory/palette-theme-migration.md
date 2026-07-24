---
name: Palette/Background/Theme bundle migration
description: How the theme table was split into palettes + backgrounds + join tables; migration approach; generation priority chain
---

## Migration approach

Ran a deterministic SQL migration (lib/db/migrate-theme-palettes.sql) that:
1. Creates one palette per distinct `colors` JSON (md5 fingerprint for dedup key: `'pal_' || substr(md5(colors::text), 1, 12)`)
2. Links every non-deleted theme to its palette via `theme_palettes`
3. `themes.colors` column is left intact — old generation code continues to work unchanged

Result: 9 deduplicated palettes from 22 theme rows.

## New tables

- `palettes` — reusable named color arrays (same 6-slot schema as themes.colors)
- `backgrounds` — reusable backgrounds (color | texture | image) with assetRef text
- `theme_palettes` — M:N join (themeId, paletteId, position). Unique on (themeId, paletteId)
- `theme_backgrounds` — M:N join (themeId, backgroundId, position)
- `theme_packs` — M:N join (themeId, packId, position)
- `themes.fontPairing` — new nullable JSONB column (heading/subheading/body/accent)

## Generation priority chain (planners.ts + preview endpoint — both identical)

1. `style.paletteId` → palette.colors (buyer explicitly picked a palette within the theme)
2. `style.themeId` → theme.colors (backward-compat fallback)
3. `edition.themes[0]` → theme.colors (edition default)
4. Hard-coded default colors (no theme at all)

Old planners with only `style.themeId` and no `style.paletteId` are fully unaffected.

## Auth model

Same assertSameStore + owner/staff guard pattern as owned-catalog.ts:
- Staff can create/edit draft palettes/backgrounds
- Owner can publish/unpublish/delete
- DELETE auto-detaches from all themes (cascades via theme_palettes FK on delete cascade)

## Audit actions

owned.palette.create, owned.palette.edit, owned.palette.publish, owned.palette.unpublish, owned.palette.delete
owned.background.create/edit/publish/unpublish/delete
owned.theme.palettes.set, owned.theme.backgrounds.set, owned.theme.packs.set

## Storefront

`GET /shop/:storeSlug` and `GET /shop/:storeSlug/editions/:editionId` both return themes with `palettes: Palette[]` array attached. Builder shows palette picker when selected theme has 2+ palettes; auto-selects first on theme click; sends `style.paletteId` to generation.

## Admin UI (MyContent.tsx)

- Each theme row has a "Palettes" button → ManageThemePalettesModal (toggle which palettes are linked)
- New "Palette library" section: list/create/edit/delete/publish owned palettes
- EditPaletteModal: name + 6-slot color grid
- All palette queries keyed on ["store-palettes", storeId]

**Why:** themes.colors preserved for full backward compat. Only new code paths use palette.colors. Migration is idempotent (ON CONFLICT DO NOTHING).
