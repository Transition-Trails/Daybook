# Daybook — Wave 10: make the cut line true

Phase 6, and the oldest criticals still open. Two of them make an advertised feature actively wrong:
**a sticker with a border is cut as a rectangle**, and **multi-part artwork has one piece traced while
the machine slices the rest.** Neither is visible on screen. Both are only discovered when a sheet comes
out of a Cricut ruined.

This wave also unblocks two other things: the sticker help articles, which must not be written while the
export is broken, and selling sticker packs at all (D118), which needs a delivery format worth shipping.

**Order matters, and not in severity order.** Step 1 is a five-word fix that makes every later
measurement trustworthy. Step 2 changes what `borderWidth` *means*, which changes the dilation radius in
step 3. Step 3 restores the alpha channel the tracer depends on, which is what makes step 4 meaningful.

**Before anything: preserve the comments.** `imageProcessing.ts` carries the best comments in the repo,
and they are not descriptions — they are paid-for failures written down. That `extractChannel("alpha")`
silently returns zeros on some sharp builds, so alpha is read out of raw RGBA. That a lazy sharp pipeline
loses the alpha channel across a resize, so the buffer is materialised first. That the cutline must be
traced before the shadow or Design Space misaligns and wastes the sheet. A rewrite that drops those
re-buys the bugs.

---

## Step 0 — Write the test that fails first

These defects survived four passes because nothing asserts on the emitted geometry. `sticker-pipeline.test.ts`
already exists and already covers the pixel budget, so the harness is there.

Three assertions, written before any fix:

1. **A bordered sticker's cut path is not a rectangle.** Trace a shape with transparent corners, apply a
   border, and assert the emitted `d` attribute has more than five points and that its bounding box is
   smaller than the canvas.
2. **Two-part artwork produces two subpaths.** Two disjoint blobs in one image; assert the path contains
   two `M` commands.
3. **A hole is cut.** A ring; assert an inner contour exists.

All three should fail today. That is the point — a green test suite after this wave is the only evidence
that will not require a machine and a sheet of vinyl.

**Done when:** three failing tests exist and describe the defects in their names.

---

## Step 1 — One padding formula (D43)

```ts
// shadowExpansionPad
Math.max(Math.abs(offX), Math.abs(offX))
```

`offX` twice. `addDropShadow` computes the same padding independently, and this helper's comment promises
it is "kept byte-for-byte in sync". It is inert only because `offY` is currently assigned from `offX`,
and the line that does so says **"uniform for now"** — the author recording that the divergence is
planned. The day `offY` becomes its own value, this returns a pad that is too small,
`adjustCutlineSvgForShadow` translates the contour by the wrong amount, and the cut drifts off the
artwork — the exact failure that function exists to prevent, described in its own comment as wasting the
entire sheet.

**The fix.** Delete the duplicate. `addDropShadow` calls `shadowExpansionPad`; there is one formula and
the typo becomes unreachable. Then assert the exported PNG width equals `origW + 2 * pad` — one line,
and it locks the invariant.

**Done when:** the padding is computed in exactly one place and a test pins the output dimensions.

---

## Step 2 — Border width in millimetres, resize first (D44)

**The defect.** `borderWidth` is taken as a pixel count and applied at the *source* resolution; the
resize to `sizeInMm` happens afterwards in the same function. So the same `borderWidth: 2` gives a bold
outline on a 200px upload and under a third of a pixel on a 2400px one, for identical output stickers.
What the seller sees depends on the file they happened to upload.

**The fix.** Express `borderWidth` in **mm**, like every other dimension in this pipeline, and derive the
pixel value after the resize. Order becomes: resize to output size → compute the dilation radius in
output pixels → apply the border → trace.

Two things riding along, both worth fixing here:

- The resize targets a **square** (`pxSize` on both axes with `fit: contain`), so `sizeInMm` is really a
  bounding box and a wide banner sticker ends up letterboxed in transparent padding. Take width and
  height, or preserve the source aspect within the given long edge.
- `Math.max(32, …)` silently floors anything under about 8.5mm at 96 DPI, which is most date stickers —
  so the smallest stickers come out larger than requested. Raise the working DPI instead of clamping the
  pixel count, and let a small sticker be small.

**Migration note.** Existing `borderWidth` values are pixels. Convert them on read, or add
`border_width_mm` and leave the old column annotated as legacy the way `yearly_price` was in Wave 2. Do
not silently reinterpret the same number in a new unit.

**Done when:** two uploads of different resolutions produce visually identical borders at the same
`sizeInMm`, and a 6mm sticker is 6mm.

---

## Step 3 — Dilate the silhouette; stop compositing a rectangle (D41)

**The defect, precisely.** `applyBorderAndSize` does not outline anything. It creates a solid rectangle
of the border colour at `width + 2bw × height + 2bw` and composites the cutout on top of it. Every
transparent pixel `removeBackground` just cleared is filled back in with the border colour. The sticker
becomes a coloured box with art in the middle.

Then `runPipeline` traces the cutline at step 4 — from that image — and `generateCutlineSvg` thresholds
on `alpha > 128`, which is now **every pixel in the canvas**. So the contour it finds is the edge of the
image, and the SVG handed to Design Space is a rectangle. The documented intent, "a white matte border,
useful for stickers meant to be cut out", describes a dilated silhouette. The code does something else
entirely.

**The fix.** Build the border from the alpha mask:

1. Extract the alpha channel (out of raw RGBA — see the existing comment about `extractChannel`).
2. **Dilate** it by the radius from step 2. A distance transform is cleanest; a separable box dilation is
   adequate and much faster.
3. Fill the dilated mask with the border colour to produce the matte layer.
4. Composite the original cutout over the matte.
5. **Leave transparency transparent.** The canvas outside the dilated mask must stay alpha 0 — that is
   what makes the trace in step 4 find the sticker instead of the page.

**Keep tracing after the border**, not before. The cut line should follow the outside of the matte, which
is the whole point of a matte border. Tracing first would cut inside it.

**Done when:** a bordered sticker's PNG has transparent corners, and step 0's first test passes.

---

## Step 4 — Trace every component, and the holes (D42)

**The defect.** `generateCutlineSvg` scans top-to-bottom for the first pixel above the alpha threshold
and walks one closed contour from it. Whatever else is in the image is never visited. Planner sticker art
is very often more than one blob — a dotted i, a detached sparkle, a two-part arrow, any label with a
separate accent mark — and for all of those the SVG contains a single path around one component. The
machine cuts that shape and slices through the others.

**The fix.**

- **Label connected components** on the (dilated) alpha mask, then trace each one and emit **one subpath
  per component inside a single `<path>`** — that is what Design Space expects, and it is why the
  `d` attribute should contain several `M` commands rather than several elements.
- **Handle inner contours.** A genuine hole in the artwork should be cut. Trace interior boundaries with
  the opposite winding so an even-odd or non-zero fill rule reads them as holes.
- **Drop specks.** After dilation, components below a small area threshold are noise, not stickers —
  cutting them wastes blade passes and tears vinyl. Make the threshold a millimetre area, not a pixel
  count.
- **Simplify in output space.** The RDP epsilon of 1.5 is currently applied to a contour in *source*
  pixels, so how much detail survives depends on the upload resolution. Run it on a contour already
  scaled to the output mm size, so simplification is resolution-independent — the same lesson as step 2.

**Done when:** step 0's second and third tests pass, and a single-blob sticker's path is unchanged from
today apart from the border.

---

## Step 5 — Verify on the machine, once

Everything above can be proven in tests except the thing that matters: that Design Space opens the file
and the blade follows the art. Cut one sheet with four stickers — one plain, one bordered, one two-part,
one with a hole — and keep the SVGs as fixtures.

**Done when:** a real sheet cuts correctly and the four SVGs are checked in as regression fixtures.

---

## Three things not to do

**Do not trace the cutline before the border.** The cut must follow the outside of the matte. Tracing
first is the quick fix that produces a sticker with an uncut border ring around it.

**Do not rasterise or flatten to solve the alpha problem.** Every fix here depends on transparency being
real outside the silhouette.

**Do not rewrite `imageProcessing.ts` from scratch.** Its comments encode failures that were paid for
once — the sharp alpha quirks, the resize ordering, the shadow/cutline sequence. Change the functions
that are wrong and leave the knowledge in place.

---

## After this

- **The sticker help articles** can be written (help pass A, articles 4 and 5 were deliberately held).
- **D118** — selling sticker packs becomes possible once there is a delivery format. A pack is a zip of
  PNGs plus the cut SVGs; that is a small step from here and it is the cheapest repeat purchase in the
  catalog.
- **D109** — name dedup still needs the constraint that interior versions got.
- **D110** — one query: confirm `planner_interior_versions_interior_version_uq` exists on the running
  database.
- **D122** — decide what a zero-priced edition means.
