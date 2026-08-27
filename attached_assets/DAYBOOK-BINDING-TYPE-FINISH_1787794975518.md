# Daybook — binding type and finish become real again

The image spine works. But `drawBindingHardware` is now dead code with **zero call sites**, while
`bindingType` and `bindingFinish` are still defaulted in `plannerState.ts` and still wired into
`PlannerStudioHub`. That is a setting accepted, stored, and having no effect on the output — the same defect
class as D05, which we just spent a wave removing from `weekStart`.

**The owner's decision: binding type and finish are relevant and stay.** So make them mean something.

## The design

**Type and finish become attributes of a spine style, not a second rendering path.** A spine style row gains
a binding type and a finish; the studio's two controls then *filter the catalog* to matching styles. The
owner has ten ring images that already span this space — coils and twin-loops, in gold, rose, silver and
copper — so the controls map onto real artwork instead of onto vector primitives.

There is exactly one way a binding renders: a catalogued image, tiled. The vector path goes.

---

## Step 1 — extend the catalog

Migration `0028`, additive, no backfill beyond the two seeded rows.

Add to `spine_styles`:

- `binding_type` — CHECK constrained to the existing vocabulary: `coil`, `twin-loop`, `disc`, `3-ring`.
  **Do not widen it.** It is already the product's binding vocabulary and it came from the vector code;
  keeping it fixed is what stops it growing a value per image.
- `finish` — CHECK constrained to an allowlist. Derive the list from the assets that exist plus the old
  `BINDING_FINISH_RGB` keys, and define it **once in shared code** with a type and a label lookup, the way
  `HELP_CATEGORIES` is defined. Free-text finish is the D88 defect waiting to happen.

Classify the two seeded rows: `rings2.png` is a **coil** (continuous rod with wrapped loops), `rings1.png` is
a **twin-loop** (paired wires). Set their finishes from what the artwork actually shows, and say what you
chose — the remaining eight assets get added as data later.

## Step 2 — the controls select artwork

In `PlannerStudioHub`, binding type and finish stop being decorative and become the filter over spine styles:
choosing a type and finish narrows the visible styles to those that match. Keep the explicit "none" option so
a planner can have no spine.

Handle the empty case honestly: if a type-and-finish combination has no asset, say so in place — "no coil in
silver yet" — rather than showing an empty grid or silently falling back to something else. A missing
combination is a content gap the owner can fill, and it should read that way.

Whatever the controls resolve to must be what renders. If the selected combination cannot be satisfied, no
spine renders and the UI says why.

## Step 3 — delete the vector path

Remove `drawBindingHardware` and `BINDING_FINISH_RGB` from `pdf-generator.ts` entirely. Zero call sites
already; this is deleting dead code, not changing behaviour. Leaving a second binding implementation in the
tree is exactly what Wave 14 removed five files to prevent.

Keep the gutter shading — that is page shading, not hardware, and it is unrelated.

## Step 4 — test the branch that ships an asset

`spine-geometry.test.ts` covers `vertical` only, but the two branches have different step math and
`rings1.png` runs on the **horizontal** path. Add the horizontal case with the same three assertions: aspect
preserved, tiles inside the page, `null` renders nothing.

## Step 5 — the cover year

`:942-943` added `coverYear !== false → showCoverYear` and `:1162` gates on it, which makes the duplicate
*avoidable by config*. That is not the same as fixing it. Confirm which was done, and if the underlying
collision is still there — two elements resolving to the same vertical position — fix that too. A layout that
overlaps whenever the title is long is a defect a flag only hides.

---

## Definition of done

Binding type and finish visibly change which spine styles are offered, and the selection is what renders.
No vector binding code remains. The horizontal tiling branch is tested. The cover shows the year once,
without relying on a config flag to avoid an overlap.

## Report back

1. The finish allowlist you settled on and where it is defined.
2. What you classified the two seeded assets as.
3. Whether the cover-year collision was already fixed or you fixed it in this wave.
