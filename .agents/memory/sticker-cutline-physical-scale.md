---
name: Sticker cutline physical scale
description: Preserving legacy and physical-size sticker cut dimensions in SVG output.
---

Cutline generation must receive the effective DPI of the processed artwork:
use 96 DPI for unsized legacy/source-sized stickers and 300 DPI only after a
`sizeInMm` render. Use that same DPI for SVG CSS dimensions, physical speck
area filtering, and contour-simplification tolerance.

**Why:** Reinterpreting a legacy source-pixel image as 300 DPI changes its
physical cut size even when its visual shape has not changed.

**How to apply:** When adding a sticker pipeline entry point or regenerating a
cutline, pass the size/render context through to the cutline generator rather
than assuming every PNG is print-resolution artwork.