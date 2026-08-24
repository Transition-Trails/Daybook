# Worldsmith — cleanup, remaining batch

Three items I previously reported as outstanding are **done**. What is left is the small-items batch
below, none of which changes behavior a user sees.

---

## First: corrections to my last report

I said the publish button gave no reason and that spec immutability was still undecided. Both wrong —
I searched for names I had invented rather than reading the file.

- **The publish reason is there.** The button carries
  `aria-describedby="publish-requirements"` and a paragraph reading *"Publishing is unavailable until
  the prompt payload is complete and at least one prompt module is linked."* Properly wired for screen
  readers, which is better than the tooltip I asked for.
- **Spec immutability was narrowed** — the option I leaned toward. `PATCH /v1/editorial/specs/:id` now
  accepts a mutable-fields contract (`prompt_payload`, `payload_version`, `canon_record_ids`,
  `prompt_module_ids`, `style_guide_id`, `component_spec_id`) while Identity and Creative stay locked.
  The banner and the "Identity locked" chip say exactly that.
- **Finding 12 is fixed, and better than specified.** I asked for `disabled` on every field. The
  implementation puts **`inert`** on the section wrapper instead, plus `aria-readonly` and a muted
  background — one attribute that blocks focus, clicks and typing for the whole subtree. That also
  means the silent-data-loss trap I was about to warn about cannot happen: a locked field cannot
  receive input at all, so `hasUnsavedChanges` correctly ignores those fields.

Two notes on that last one, neither blocking:

- `inert` needs Safari 17+ / Firefox 112+. Fine for an internal admin tool; worth knowing if this ever
  ships to stores.
- `IdentityTab` and `CreativeTab` still thread `onChange` into their inputs. It cannot fire while
  `inert` is set — but if anyone removes `inert` later, those fields would start mutating local state
  that `saveMutation` never sends, and the dirty check would not notice. A comment at each call site
  saying the handler is unreachable by design would prevent that.

---

## The remaining batch

All small, all independent, no user-visible behavior change. One commit is fine.

### 1 — Confirm or fix the detail crops (finding 18)

`DETAIL_CROP_SOURCE_RECTS` in `spec-board-template.ts` L77 is now computed by an IIFE rather than four
literals, which *may* already be the fix. **Check before changing anything.**

The original problem: the concept area is 1504 × 1268 (ratio 1.19) and DALL·E returns 1024 × 1024.
Resized `fit: inside` and centred, the image occupies ~1258px of the 1504 width, leaving ~123px of
board on each side. Crops that start 32px from the edge take in ~90px of empty background, so four
thumbnails labelled "detail reference" carry a grey band.

If the IIFE computes from the area constants, it has the same bug. It needs to compute from the
**composited image box**, or `SPEC_PREVIEW_SIZE` should be set to `1792x1024` to match the area ratio
— the env var already exists.

**Done when:** a test asserts every crop rectangle falls inside the composited image box, not merely
inside the concept area.

### 2 — Reference images: render them or delete the scavenging (finding 19)

`spec-preview-service.ts` L728 and L806–807 collect up to four image URLs — scanning the style guide's
file properties, then falling back to canon records — and assign them to
`safeBoardData.referenceImageUrls`. The template never reads that field.

Confirmed an unlanded feature, not a regression: no test references `referenceImageUrls`. So it costs
Notion round-trips on every compile and produces nothing.

**Decide, then act.** Rendering a four-up reference strip on the board would be genuinely useful when
reviewing a concept against its source material. If you do not want it, delete the scavenging.

**Done when:** either the thumbnails appear on a rendered board, or the field and both collection
blocks are gone.

### 3 — Compress instead of downscaling (finding 20)

`spec-preview-service.ts` L985: when the PNG exceeds 4 MB, `.resize(1400, …)`. The board is authored at
2400px with metadata text at 8.5–9px, so that is a 42% reduction taking the smallest text to ~5px —
and it fires precisely on the richest boards, silently. The catch falls back to the oversized buffer,
so you cannot tell from the result which path ran.

Try palette reduction or a JPEG concept layer first; both usually clear 4 MB without touching
geometry. If a downscale is genuinely unavoidable, log it and record it on the audit row so a
degraded board is identifiable.

**Done when:** a board that would have exceeded 4 MB is delivered at full 2400px width, or the audit
row says it was downscaled.

### 4 — Four bits of tidying

- **`normalizeNotionId` duplicates server logic** — `WorldSmithCompiler.tsx` L30, by its own comment.
  Import the shared helper.
- **Split localStorage namespaces** — some keys use `worldsmith:`, others `ws:editorial:`. Pick one and
  migrate the other on read.
- **`RECOMMENDATION_CODES` is declared at L3946 but first used at L2310.** Hoist it to the top of the
  module.
- **`BANDS.canonClear` is dead** since step 16 — verdicts come from the `canonClear()` predicate now,
  and `SpecEditor` only reads `BANDS.payloadReady` as a color threshold. Remove `canonClear` from
  `BANDS`, or comment why it stays.

### 5 — Be honest about cost

`CostEstimateCard` (`WorldSmithCompiler.tsx` L3219) shows four hardcoded dollar literals summed into
"Estimated Total", and its own comment admits they are static. `SPEC_PREVIEW_QUALITY` can be set to
`hd`, which changes real cost without changing the display. Same in prose at L3075: "Estimated effort:
Under two minutes."

Either label both as indicative, or derive the figure from the provider and quality actually
configured. A number that looks calculated and is not is worse than no number.

**Done when:** the card either reads as an estimate or reflects the configured quality.

---

## Deliberately not in this batch

**A compile that dropped module dependencies still reports a clean "Compiled".** There is a 19 KB test
asserting drop-and-continue, so the behavior is intentional and should stay. The worthwhile change is
to the *reporting* — a distinct status such as "Compiled with omissions" — which is product design, not
tidying. It belongs with Phase 2.

---

## After this, Worldsmith is clean

Phase 2 generation carries exactly two known items:

- **finding 24** — `computePromptHash` declares `generation_provider`, `model_name`, `model_version`
  and `generation_settings`; the orchestrator passes none. Harmless while nothing generates. The day
  it does, two quality settings produce one hash and the preview idempotency gate keys on it. Fix it
  with that work, plus a test asserting two settings differ.
- **finding 29** — `canon-records/generate-image` is live while `production-packages` returns 501. A
  working generation path already exists for the spec pipeline to borrow; decide that deliberately
  rather than building a second one.
