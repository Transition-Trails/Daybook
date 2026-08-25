# Worldsmith — managed image-target catalog has no migration, and throws fatally

The aspect fix landed correctly. Verified at `abdd079e`:

- `applyMinSide` is a uniform upscale applied **before** rounding; `roundToSupportedDimension` is now
  pure rounding. Ordering is right: upscale → round → budget clamp.
- **Journal Card (3 × 4 in) at 150 DPI now yields 512 × 688** — aspect 0.744 against a true 0.75, one
  rounding step off. It was 512 × 608 (0.842).
- **At `WS_IMAGE_TARGET_DPI=72` it also yields 512 × 688**, not the 512 × 512 square. The low-DPI
  degradation is gone.
- `clampRoundedTargetToPixelBudget` still refuses to shave a side below `MIN_SIDE`, so the clamp cannot
  undo the floor.
- Quality accepts both vocabularies (`low|medium|high` and legacy `standard|hd`) — a correct
  deprecation path.

---

## The new problem

A managed catalog arrived with this change: `worldsmith_image_targets`, read at generation time so an
admin edit takes effect immediately. Good idea. Two defects.

### 1 — No migration creates or seeds the table

`lib/db/src/schema/worldsmith.ts` L145 declares `worldsmithImageTargetsTable`. **No script in
`scripts/src` creates it, and nothing seeds it.** This is exactly the `ws_prompt_modules.section`
situation — schema declared, migration missing — except the failure is louder.

### 2 — A missing row throws, and the throw is outside the try block

`getManagedWorldsmithImageTarget` does not fall back to `WORLD_SMITH_PRINT_SIZES_IN`. For an
orientation-aware type it queries the table and passes `undefined` when there is no row, which lands
on:

```ts
if (orientationAware && !printSize) {
  throw new Error(`WorldSmith print-size catalog is missing explicit dimensions for ...`);
}
```

And in `generateWorldsmithImage`, that resolution happens **before** the `try`:

```ts
const generation = await resolveWorldsmithImageGeneration(...);   // can throw — unguarded
...
try { await generateImage(...) } catch { /* non-fatal, keeps placeholder */ }
```

So an unseeded table — or a database blip during the lookup — is a **fatal unhandled error**, in a
module whose own header says provider failures are deliberately non-fatal and whose audit write is
best-effort for that reason.

**The startup validator does not catch this.** `validateWorldsmithPreviewGenerationConfiguration`
checks `WORLD_SMITH_PRINT_SIZES_IN`, the *hardcoded* catalog — which is fully populated. The managed
path never consults it. So startup reports healthy and generation throws.

---

## Fix

**a. Add the migration**, following `worldsmith-editorial-migration.mjs`: create
`worldsmith_image_targets`, and seed it from `WORLD_SMITH_PRINT_SIZES_IN` **inside the
`if (column/table does not exist)` block** — once, not on every run. Same rule as the `section`
backfill: a row an admin has edited must not be reset by a later migration.

**b. Fall back to the hardcoded catalog** rather than throwing:

```ts
const fallback = WORLD_SMITH_PRINT_SIZES_IN[type];
return resolveWorldsmithImageTarget(
  componentType,
  requestedOrientation,
  row ? [row.printWidthIn, row.printHeightIn] : fallback,
);
```

The bundled catalog is the right default — it is what the startup validator already guarantees is
complete. Log a warning when the fallback is used so an unseeded table is visible without being fatal.

**c. Wrap the lookup.** Move `resolveWorldsmithImageGeneration` inside the `try`, or give
`getManagedWorldsmithImageTarget` its own try/catch that falls back to the bundled catalog on a
database error. A DB outage should degrade to the default size, not fail the generation.

**Done when:** with `worldsmith_image_targets` absent or empty, generation still produces an image at
the bundled dimensions and logs a warning — and a seeded admin edit still takes precedence.

---

## Also worth a test

The aspect assertion from the last handoff does not appear to exist yet. It is the deliverable that
would have caught the original defect and would catch a regression in `applyMinSide`:

> for every entry in `WORLD_SMITH_PRINT_SIZES_IN`, at 72 / 150 / 300 DPI, assert the generated aspect
> ratio is within one `ROUND_TO` step of `printWidthIn / printHeightIn`.

Add a second case in the same test: an orientation-aware type with no catalog row resolves rather than
throws.
