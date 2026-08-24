# Worldsmith — cleanup batch, what actually landed

Verified by reading `spec-board-template.ts` in full at `a3e10574`, not by name search.

## Genuinely done — and this is the big one

**The spec board no longer invents content.** Every fabrication I catalogued is gone:

- `DEFAULT_SWATCHES` — gone. An empty palette now renders *"No palette specified for this spec."*
  and the note line switches to *"No spec-level palette provided."*
- `emotionalWords` — gone. Emotional Intent now derives from `designIntent || narrativePurpose`,
  with a comment saying never to invent placeholder phrases here.
- `stdConstraints` padding — gone. Constraints come only from `textRule` / `printRule` / `canonRule`.
- Required-elements padding — gone, with a comment: *"never pad with invented content that doesn't
  come from the real spec data."*
- A `usesCompiledSections` flag now distinguishes "compiled and absent" (→ *"Not specified."*) from
  legacy data (→ `—`). That distinction is better than what I asked for.

**Fonts are correct too** — `FONT_DIR` points one level up, all five faces use the real filenames
including `Spectral-Italic-400.woff`, and `renderSpecBoardToPng` passes `fontDirs` and
`defaultFontFamily` to resvg. `TEMPLATE_VERSION` is `"3.1"`, matching the header.

---

## Not done — finding 18, the detail crops

I said the IIFE at L77 *might* be the fix. It is not. It computes from the concept **area**, which is
the same bug in a more readable form:

```ts
const cw = IMG_W;   // 1504 — the AREA, not the image
const cropW = Math.floor(cw * 0.38);            // 571
{ x: IMG_X + 32, y: IMG_Y + 28, width: cropW, height: cropH }
```

The area is 1504 × 1268 (ratio 1.19). DALL·E returns 1024 × 1024. Composited `fit: inside` and
centred, the image occupies ~1258px of the 1504 width — leaving **~123px of `#E8E3D8` board on each
side**. The left crops start 32px from the area edge, so they take in ~90px of empty board; the right
crops do the same. Four thumbnails labelled "detail reference" carry a grey band.

**Two ways to fix it. The second is one line.**

1. Compute the crops from the composited image box: derive the rendered image width from the actual
   DALL·E aspect ratio, centre it in `CONCEPT_IMAGE_AREA`, and inset 32px from *that* box.
2. Set `SPEC_PREVIEW_SIZE=1792x1024` (ratio 1.75) — still not 1.19, so bars shrink but do not vanish.

Option 1 is correct. Option 2 alone is not sufficient — I was wrong to offer it as equivalent
earlier; no DALL·E size matches 1.19 exactly.

**Done when:** a test asserts every crop rectangle lies inside the composited image box, not merely
inside `CONCEPT_IMAGE_AREA`.

---

## Not done — the rest of the batch

- **`referenceImageUrls`** — still assigned at `spec-preview-service.ts` L728 and L806–807, still
  declared at `types.ts` L497, and `spec-board-template.ts` never reads it. I read the whole
  template to confirm: the field appears nowhere in it. Render the thumbnails or delete the
  scavenging.
- **The 4 MB guard** — `spec-preview-service.ts` L985 still `.resize(1400, …)`. Compress instead;
  if a downscale is unavoidable, record it on the audit row so a degraded board is identifiable.
- **`normalizeNotionId`** — still local at `WorldSmithCompiler.tsx` L30.
- **`RECOMMENDATION_CODES`** — still declared at L3946, first used at L2310.
- **localStorage namespaces** — still split; `ws:editorial:` in three files.
- **`CostEstimateCard`** — "Estimated Total" at L3252 still sums hardcoded literals.

---

## One thing worth adding while you are in the template

`conceptImageFrame` draws the "CONCEPT PREVIEW · FOR HUMAN REVIEW" caption strip at
`y + h - 38`, and the service composites its own label strip in the same region — so the strip
covers the `Specimen No.` line drawn at `y + h - 8`. Either move the specimen ID above the strip or
have the service skip its label when the template already draws one.
