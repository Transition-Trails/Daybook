---
name: VGJ kit catalog
description: Victorian Garden Journal kit seed — IDs, status, and activation steps
---

## What was created
8 platform kits seeded via `pnpm --filter @workspace/scripts run seed-kit-vgj`:

| Kit | theme ID | palette ID |
|-----|----------|-----------|
| Botanica Regency | vgj_01_botanica | vgj_01_botanica_palette |
| Fern & Fossil | vgj_02_fern | vgj_02_fern_palette |
| Midnight Orchid | vgj_03_midnight | vgj_03_midnight_palette |
| Ivory & Umber | vgj_04_ivory | vgj_04_ivory_palette |
| Crimson Herbarium | vgj_05_crimson | vgj_05_crimson_palette |
| Cobalt & Cream | vgj_06_cobalt | vgj_06_cobalt_palette |
| Amber Conservatory | vgj_07_amber | vgj_07_amber_palette |
| Moonrise Moss | vgj_08_moonrise | vgj_08_moonrise_palette |

## Current state
- Themes + palettes: `status: "draft"`, `origin: "licensed"`, `globalAvailable: true`
- 24 backgrounds (3 per kit): `assetRef: null`, `status: "draft"`, `type: "texture"`
- All rows use the `vgj_` prefix for easy identification.

## To activate
1. Generate background textures via `POST /stores/:storeId/backgrounds/generate`
2. `PATCH /backgrounds/:id` to set `assetRef` on each row
3. Promote all rows to `status: "live"`

**Why:** Backgrounds with `assetRef: null` don't render in PDF generation. The AI generation route (Part 3 of the spec) makes step 1 self-service for store staff.
