# Worldsmith — image target cleanup

Three fixes to the new image-generation modules. Item 1 is a real defect; item 2 needs one API call to
settle; item 3 is two strings.

**Order:** item 2 first (its answer changes the numbers in item 1), then item 1, then item 3. All three
can ship in one commit once item 2's question is answered.

---

## 1 — The board reports a DPI the image does not have

**This is the defect.** `getWorldsmithImageTarget` clamps dimensions but returns `dpi` **unclamped**:

```ts
const dpi = configuredDpi();                    // 150
const scale = Math.min(1, maxLongSide / longSide, maxShortSide / shortSide);
const width  = roundToSupportedDimension(printWidthIn  * dpi * scale);
const height = roundToSupportedDimension(printHeightIn * dpi * scale);
return { size: `${width}x${height}`, dpi, printWidthIn, printHeightIn, orientation };
```

Worked example, Hero Paper, all defaults:

| | |
| --- | --- |
| Print size | 12 × 12 in |
| `WS_IMAGE_TARGET_DPI` | 150 |
| Unclamped | 1800 × 1800 |
| `scale` | `min(1, 2560/1800, 1440/1800)` = **0.8** |
| Generated | **1440 × 1440** |
| Actual DPI | **120** |
| `dpi` returned | **150** |

`spec-board-template.ts` L549 prints
`${printWidthIn} × ${printHeightIn} in @ ${dpi} DPI` — so the board states **"12 × 12 in @ 150 DPI"**
for an image that is 12 × 12 in at 120 DPI.

This is the overstatement we just removed from that exact line, in a new form. It is worse than the
`3600 × 3600` version in one way: that number was obviously aspirational, whereas this one looks
computed.

**Fix — either is fine, pick one:**

- Return the **effective** DPI: `Math.round((width / printWidthIn))` after clamping, and let the board
  print that. Add `requestedDpi` alongside if the configured value is still useful.
- Or have the board print the real pixel dimensions and the print size, and drop the DPI claim
  entirely: `1440 × 1440 px · 12 × 12 in · upscale for master`.

I lean to the second. Pixel dimensions are the fact; DPI is a derived interpretation, and an operator
deciding how much to upscale wants the pixels.

**Done when:** a test asserts the board's stated DPI (or dimensions) matches `size` for Hero Paper at
default configuration.

---

## 2 — The short-side cap costs square components a third of their resolution

`maxLongSide` / `maxShortSide` are enforced independently:

```ts
Math.max(width, height) > maxLongSide ||
Math.min(width, height) > maxShortSide
```

OpenAI documents the limit as a **resolution** — above 2560×1440 is experimental, maximum 3840×2160 —
which reads as a pixel budget rather than two independent side caps. Under a budget reading,
2560 × 1440 is 3.69M pixels, and 1920 × 1920 is 3.69M pixels: the same cost. The current check
accepts the first and rejects the second.

That matters here because **squares are your dominant format** — Hero Paper, Decorative Paper and
Coordinating Paper are all 12 × 12. Every one of them is capped at 1440 × 1440 when 1920 × 1920 is the
same pixel budget. That is a third of the linear resolution given away, on the flagship component
types, before any upscale.

**This needs verification, not assumption. Do this first — the answer changes item 1's numbers.**
Make one call through `generateImage` at `1920x1920` and read the response.

- **If accepted:** replace the two side caps with a pixel-budget check
  (`width * height <= 2560 * 1440`, experimental `<= 3840 * 2160`), keeping the divisible-by-16 and
  1:3–3:1 ratio rules. Squares then reach 1920 × 1920 and Hero Paper lands at 160 DPI.
- **If rejected:** keep the caps and leave a comment recording the test, so the next reader does not
  re-litigate it.

---

## 3 — Stale DALL·E naming in the new module

Two strings. `image-generation-service.ts` logs `"Calling DALL-E for concept visual"` and
`"DALL-E concept visual failed — using the caller's placeholder"`. The model is gpt-image-2.

Same class of problem as `callDallE` — a wrong name in a log line is how I ended up writing an entire
handoff against the wrong model's capabilities.

While you are there: `spec-preview-service.ts` has sibling log lines and comments using DALL·E
phrasing (`dallePrompt`, `dalleErrorMsg`, `dalle_skipped`). The response field `dalle_skipped` is a
public API shape — leave it, or rename it deliberately with the client. The internal locals and log
strings are free to fix.

---

## Not defects — worth noting as good

- `generateWorldsmithImage` returning `{ error }` rather than throwing keeps generation non-fatal by
  design, exactly as asked.
- `saveWorldsmithImageAudit` swallowing DB errors is right, and the comment says why: a database
  outage must not turn a successfully uploaded image into a false failure.
- `configuredDpi()` defaulting to 150 rather than 300 is an honest default given the model ceiling.
- `MIN_SIDE = 512` floor stops a small component degenerating into a thumbnail.
- The module genuinely knows nothing about layout, which is what makes step B's reconciliation clean.
