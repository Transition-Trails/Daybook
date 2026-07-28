---
name: WOFF subset corruption
description: Bundled WOFF files for Playfair Display and Lato crash fontkit during PDF save() due to truncated glyph data at high glyph indices. Probe approach and fix documented.
---

## Rule
Never rely on bundled WOFF files alone for production planner generation. The WOFF subsets for at least Playfair Display and Lato have a corrupt glyph entry at a high glyph index that only triggers during `pdfDoc.save()` (not during `embedFont` or `widthOfTextAtSize`).

## Symptom
```
RangeError: Trying to access beyond buffer length
  at TTFGlyph._getCBox
  at TTFGlyph._getMetrics
```
This is fontkit trying to read an `Int16BE` at an offset past the end of the WOFF file. The WOFF was subset but the glyph count table was not updated to match, leaving dangling references.

## What does NOT catch it
- `pdfDoc.embedFont(bytes)` — only parses the font header/tables, not individual glyph data
- `font.widthOfTextAtSize(text, size)` — only reads advanceWidth tables, not bounding boxes
- `font.encodeText(text)` — only maps chars to glyph IDs

## What DOES catch it
A full round-trip probe: embed in a throw-away PDFDocument → drawText → save():
```typescript
const probeDoc = await PDFDocument.create();
probeDoc.registerFontkit(fontkit);
const probeFont = await probeDoc.embedFont(bytes);
const probePg = probeDoc.addPage([500, 50]);
probePg.drawText(allPrintableASCII, { font: probeFont, size: 9 });
await probeDoc.save();  // triggers TTFGlyph._getCBox for all referenced glyphs
```
This is now live in `resolveEmbeddedFont` in `pdf-generator.ts`.

**Why:** Even this probe can miss it if the corrupted glyph isn't referenced by the probe chars. Current probe uses all 95 printable ASCII chars which covers planner content. But the same underlying WOFF bug exists.

## Permanent fix needed
Re-download the WOFF files using `scripts/download-fonts.mjs` with correct subset parameters, OR switch bundled format to TTF (no compression layer, more reliable glyph table access). Run the probe after re-download to verify.

## Generate-test-planners workaround
The `generate-test-planners.ts` script explicitly sets `FONT_OVERRIDE` (a dummy family name) to force StandardFonts (Helvetica/Times) and bypass the WOFF entirely. This is correct for device testing (which verifies links and layout, not typefaces).

## Production impact
The production api-server builds via esbuild, which runs in the same Node.js ESM environment. The same WOFF files are in `dist/fonts/`. The probe validation in `resolveEmbeddedFont` provides a safety net: if the WOFF probe fails, the generator falls back to network TTF → StandardFonts. If the network is also unavailable, StandardFonts are used. Generation never fails due to this bug.

**How to apply:** Any time bundled WOFF files are updated or new families added, run the probe test to confirm the WOFF is valid before shipping.
