# Worldsmith — migrate image generation to gpt-image-2

Do this **before** Phase 2. Everything in `PHASE2-GENERATION.md` assumes a model; this decides which
one, and removes a two-month cliff from under the work.

`gpt-image-1` shuts down **October 23, 2026**. `gpt-image-2` is the migration target and is a better
fit for Worldsmith on its own merits — it supports arbitrary output sizes rather than three fixed ones.

---

## Step 0 — Verify the proxy serves it. Do not skip.

Everything below depends on this, and the answer is not in the codebase.

The Replit AI integration proxy is what forced gpt-image-1 in the first place: per
`.agents/memory/dalle-image-generation.md`, the proxy **rejects `dall-e-3`** as a model name, and
rejects `response_format` and `style`. So the proxy has its own allowlist, and there is no guarantee
`gpt-image-2` is on it.

Make one throwaway call through `callDallE`'s code path with `model: "gpt-image-2"` and a small square
size, and look at what comes back.

- **If it works** — proceed with the whole plan below.
- **If the proxy rejects the model** — stop and do step 3 only (config, not hardcoding), then report
  back. Options at that point are waiting for Replit to add it, or using the existing direct-OpenAI
  fallback path (`OPENAI_API_KEY` + direct URL) for image generation specifically. That is a real
  decision about a second credential path, not something to decide inside this task.

Also worth checking in the same call: **OpenAI requires API Organization Verification** for GPT Image
models. If the account has not completed it, that surfaces here rather than in production.

**Done when:** you can state, with a response body as evidence, whether `gpt-image-2` is reachable.

---

## Step 1 — Rename `callDallE`

It is called `callDallE()` and has not used DALL·E for some time. That name cost me an entire handoff
document written against the wrong model's capabilities — it will mislead the next reader too.

Rename to `generateImage()`, keep a one-line deprecated alias if anything outside Worldsmith imports
it, and rename `.agents/memory/dalle-image-generation.md` to match. Update the memory file's body:
it currently documents gpt-image-1's three sizes as though they were the only option.

---

## Step 2 — Stop the silent size and quality mapping

`ai-proxy.ts` L338–343 remaps requested sizes to the nearest supported value, and quality maps
`hd` → `high`, `standard` → `medium`. Both mappings are deliberate and documented in the memory file —
the defect is that they are **not surfaced**: no runtime warning, nothing on the audit row, and the env
vars still speak DALL·E's vocabulary.

On gpt-image-2 the size remapping should mostly disappear, since arbitrary sizes are supported. But
the reporting fix is what matters and applies regardless:

- **Return the effective size and quality** from the generation call alongside the image.
- **Warn when a mapping is applied**, naming both the requested and effective value.
- **Callers record the effective values**, never the requested ones.

This is not housekeeping. It is the precondition for the hash fix in step 4 being correct.

---

## Step 3 — Put the model in config, not in code

`model: "gpt-image-1"` is currently a literal in `ai-proxy.ts` L348. Move it to an env var with a
sensible default:

```
WS_IMAGE_MODEL=gpt-image-2
```

Two reasons. Migration becomes an env change rather than a deploy. And when gpt-image-2 is itself
superseded — the family has moved four times in eighteen months — you change one variable.

Validate the value against a known list at startup and fail loudly on an unknown one, rather than
discovering it on the first generation attempt.

---

## Step 4 — Size selection, revised for arbitrary resolutions

gpt-image-2 accepts `WIDTHxHEIGHT` where both are divisible by 16 and the aspect ratio is between
1:3 and 3:1. Resolutions above 2560×1440 are experimental; the ceiling is 3840×2160.

This changes the decision recorded earlier. You chose "generate at the maximum and upscale
afterwards." With arbitrary sizes that becomes **generate at or near the real target**, and upscale
much less — or not at all for smaller components.

- Derive the aspect from the component type, reusing `ORIENTATION_AWARE_TYPES` from the readiness
  module rather than inventing a second notion of orientation.
- Pick dimensions from the component's real print size at a chosen DPI, clamped to the model's limits
  and rounded to a multiple of 16.
- **Stay at or below 2560×1440 by default.** Above that is documented as experimental, and an
  experimental setting is a poor default for a pipeline that bills per call. Make the higher range
  opt-in via config.
- **3600 × 3600 is not achievable** — it exceeds the pixel ceiling. So the board's spec block is wrong
  either way.

**Correct `spec-board-template.ts` L547.** It reads `3600 × 3600 px (or 2550 × 3300)` and promises
`300 DPI`. State the real generated dimensions, and name any upscale as a downstream step. A board
that overstates its own output is the exact pattern we spent four waves removing from that file.

---

## Step 5 — Then the hash

Now do step 1 of `PHASE2-GENERATION.md`: pass `generation_provider`, `model_name`, `model_version` and
`generation_settings` into `computePromptHash` — using the **effective** values from step 2, not the
requested ones.

This has to come after steps 2–4, because hashing a requested size that was silently remapped gives
two genuinely different renders one identical hash, and the preview idempotency gate keys on it.

**Done when:** a test asserts that the same prompt at two different sizes, and at two different quality
levels, produces three distinct hashes.

**Watch:** every existing compiled record's hash changes once these fields carry values. Previously
generated boards will regenerate on next call. That is correct — but it is a one-time cost, so do it
knowingly.

---

## Order and what not to do

Step 0, then 1–3 in any order, then 4, then 5. Phase 2 proper starts after that.

**Do not migrate and implement `production-packages` in the same pass.** If a generation goes wrong
afterwards you want to know whether it was the model change or the new endpoint.

**Do not remove the direct-OpenAI fallback path.** It is the only route that does not depend on the
Replit proxy's allowlist, and step 0 may prove you need it.
