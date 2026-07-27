---
name: Font bundle coverage
description: Which font families are bundled, which need network, and how the coverage guard works.
---

## Rule
Every family reachable from a UI picker must have a `.woff` file in `artifacts/api-server/src/lib/fonts/` using the exact naming convention `_bundledFontPath()` expects:
  `${familyName.replace(/\s+/g, "_")}-${weight}.woff` (e.g. `Work_Sans-400.woff`)

The `.ttf` files (`InstrumentSans-*.ttf`, `Spectral-*.ttf`, `SpaceMono-*.ttf`) are used ONLY by `labelImageGen.ts` for sticker label rasterisation via `@napi-rs/canvas` — they are **not** read by `_bundledFontPath` and have no effect on PDF generation.

## Families now fully bundled (as WOFF)
Playfair Display, Lora, Cormorant Garamond, Source Sans Pro, Lato,
Spectral, Work Sans, Crimson Pro, Instrument Sans, DM Serif Display,
DM Sans, EB Garamond, Inter, Space Grotesk, Nunito Sans,
Playfair Display SC, Cormorant SC

DM Serif Display has no weight-700 variant on Google Fonts; the 400 file is copied as the 700.

## Guard / re-download
- `UI_REACHABLE_FAMILIES` in `pdf-generator.ts` is the canonical set.
- `warmFontCache()` in `font-warmup.ts` runs `checkBundleCoverage()` at startup — logs `⚠ BUNDLE COVERAGE GAP` if any family is missing.
- To re-download: `node scripts/download-fonts.mjs` then rebuild (`pnpm --filter @workspace/api-server run build`).
- Super-admin REST endpoint: `GET /api/platform/font-coverage`.

## Per-generation substitution tracking
`buildPdf` and `buildPreviewPdf` now return `fontSubstitutions: string[]`.
The preview route emits `X-Font-Substitutions: Family,Family` header when non-empty.
`PdfPreviewDock` reads the header and shows an amber warning banner.
`runGeneration` returns `fontSubstitutions` so callers can log or store it.

**Why:** bundled WOFF files eliminate all network calls for PDF generation; without them the generator silently falls back to Times Roman / Helvetica whenever Google Fonts is slow or unreachable.
