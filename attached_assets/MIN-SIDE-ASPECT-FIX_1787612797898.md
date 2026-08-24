# Worldsmith — MIN_SIDE floor distorts aspect ratio on small components

The image-target cleanup landed correctly. Verified at `fc2443bd`:

- **Pixel budget applied in both modules** — `image-generation-service.ts` L103 and
  `image-generation.ts` L68 use the same `2560 * 1440` (experimental `3840 * 2160`). They agree, which
  matters: the service computes a size the validator must accept.
- **DPI is now honest.** `dpi` is the effective value derived from the generated pixels;
  `requestedDpi` carries the configured target separately, with comments distinguishing them.
- **Hero Paper improved measurably** — 12 × 12 in at 150 DPI now lands at **1808 × 1808** and reports
  150 DPI, where the side-cap version produced 1440 × 1440 and *claimed* 150. That is 26% more linear
  resolution and a true number.
- `clampRoundedTargetToPixelBudget` correctly re-checks after rounding, since rounding up to a
  multiple of 16 can push a borderline size over budget.
- Log strings are model-neutral now.

---

## The remaining defect

`roundToSupportedDimension` applies the 512px floor **per side, independently**:

```ts
function roundToSupportedDimension(value: number): number {
  return Math.max(MIN_SIDE, Math.round(value / ROUND_TO) * ROUND_TO);
}
```

When only one side is below the floor, the aspect ratio changes silently.

**Journal Card, 3 × 4 in at the default 150 DPI:**

| | |
| --- | --- |
| Unrounded | 450 × 600 |
| Width rounds to | 448 → floored to **512** |
| Height rounds to | **608** |
| Generated | 512 × 608 |
| Aspect | 0.842 |
| Should be | 0.75 |

So a 3 × 4 card is generated at the shape of a 3.37 × 4 card. Anything composed to fill the frame is
wrong by 12% on one axis — it needs cropping, and the crop is not recorded anywhere.

**It gets worse at lower DPI.** With `WS_IMAGE_TARGET_DPI=72`, Journal Card computes 216 × 288, both
sides floor to 512, and the result is **512 × 512 — a square image for a 3 × 4 card.**

## Fix

Make the floor a **uniform upscale**, not a per-side clamp. Scale both dimensions until the short side
reaches `MIN_SIDE`, then round:

```ts
function applyMinSide(width: number, height: number): readonly [number, number] {
  const shortest = Math.min(width, height);
  if (shortest >= MIN_SIDE) return [width, height];
  const factor = MIN_SIDE / shortest;
  return [width * factor, height * factor];
}

// in getWorldsmithImageTarget, before rounding:
const [rawWidth, rawHeight] = applyMinSide(
  printWidthIn * requestedDpi * scale,
  printHeightIn * requestedDpi * scale,
);
const [width, height] = clampRoundedTargetToPixelBudget(
  roundToSupportedDimension(rawWidth),
  roundToSupportedDimension(rawHeight),
  maxPixels,
);
```

Then `roundToSupportedDimension` drops its `Math.max(MIN_SIDE, …)` and becomes pure rounding — the
floor is handled once, before rounding, where it can preserve the ratio.

Journal Card at 150 DPI then gives 512 × 688 (0.744, one rounding step off 0.75) instead of
512 × 608 (0.842).

**Note the ordering:** the upscale must run *before* the budget clamp, since raising the short side
increases the pixel count. The existing `clampRoundedTargetToPixelBudget` already handles that — it
will step a side back down if the upscale pushes it over — but its `width > MIN_SIDE` guard means it
cannot violate the floor while doing so, which is correct.

**Done when:** a test asserts the generated aspect ratio is within one `ROUND_TO` step of
`printWidthIn / printHeightIn` for every entry in `PRINT_SIZES_IN`, at 72, 150 and 300 DPI.

That test is the real deliverable here — it covers the whole table at three configurations, and it
would have caught this.
