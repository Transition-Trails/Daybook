# Daybook — Wave 6: finish the shared primitives

`lib/svg-contract.ts` is the best-executed brief in this project. It also exposed a failure mode nobody
predicted: **the shared colour parser was written correctly and the old callers were never migrated.**
The repo now holds a correct parser and a wrong one in the same directory, about two hundred lines
apart, and a future author will pick whichever they find first.

That is what this wave finishes. Two of the five Phase 4 primitives are genuinely done; one was written
without adoption; two were never started. Plus three defects in the new planner routes, one of which
undermines the design the routes exist to protect.

**Order matters.** Step 1 deletes the wrong parser, so nothing can adopt it later. Step 2 adds a
database constraint, and the code fix depends on the constraint existing.

---

## Step 1 — Adopt the colour parser, then delete the old one

**The defect (D104).** `parseSvgColor` is exactly right — it doubles `#RGB` digits, accepts `#RRGGBB`,
allows `none`, and throws on anything else. `planner-interior-renderer.ts` imports it. Meanwhile:

```ts
// lib/imageProcessing.ts:46
function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const h = hex.replace("#", "").padEnd(6, "0");
```

`#fff` still becomes `fff000`, so a white sticker border still renders bright yellow and is still baked
permanently into the stored PNG. The requested value is also stored on the row, so the library shows
`#fff` beside a yellow sticker.

**The fix.** Move `parseSvgColor` to its own module — it is no longer SVG-specific, and leaving it in
`svg-contract.ts` is why the sticker pipeline did not find it. Then:

```ts
// lib/color.ts
export function parseHexColor(value: string | undefined, fallback?: string): string   // moved
export function hexToRgba(value: string | undefined): { r: number; g: number; b: number; alpha: number }
```

Rewrite `imageProcessing.ts` to call the shared version, and **delete the local `hexToRgba`**. A wrong
implementation left in the tree is a trap, not a fallback.

**Then find the third caller.** D06 recorded the same unvalidated-hex shape in `pdf-generator.ts`. Read
it, and if the shape is there, migrate it in this step. Three callers of one helper was the original
argument for writing it.

**One behavioural note.** `parseSvgColor` *throws* on bad input while `hexToRgba` silently returned
garbage. That is the point — but it means an unvalidated `borderColor` now becomes a 400 rather than a
yellow border. Make sure the sticker route returns that as a validation error on the field, not a 500.

**Done when:** `#fff` produces a white border; a non-hex `borderColor` returns 400 with a message naming
the field; `hexToRgba` exists in exactly one file; and a test covers shorthand, full, `none`, and junk.

---

## Step 2 — Make the interior version number unambiguous

**The defect (D105).** The next version is computed before the transaction that writes it:

```ts
const [latest] = await db.select({ version: … }).orderBy(desc(…)).limit(1);
const nextVersion = (latest?.version ?? 0) + 1;
const result = await db.transaction(async (tx) => { /* inserts nextVersion */ });
```

Two concurrent requests both read version 3 and both write version 4. Either the loser throws an
unhandled 500, or — if no constraint exists — two rows share version 4 and `currentVersionId` becomes
whichever update committed last. For a table whose entire purpose is immutable, reproducible history, an
ambiguous version number undermines the feature rather than merely inconveniencing it.

**The fix, in two parts.** First the constraint, in a new numbered migration:

```sql
-- lib/db/drizzle/00NN_planner_interior_version_unique.sql
CREATE UNIQUE INDEX IF NOT EXISTS "planner_interior_versions_interior_version_idx"
  ON "planner_interior_versions" ("interior_id", "version");
```

Add the journal entry with the next `idx` and a `when` above the previous migration. Then move the
version read **inside** the transaction and retry once on a unique violation. The constraint is the
guarantee; the retry is the ergonomics.

**Done when:** two simultaneous version creates produce versions 4 and 5 with no error and no duplicate,
and the unique index exists on a fresh database and an existing one.

---

## Step 3 — Refuse a cross-store pin

**The defect (D106).** `POST /v1/editions/:editionId/pin-interior` loads the edition, loads the version
by id, and writes the pin. Nothing checks they belong to the same store. One store's authored interior
can be pinned into another store's product and shipped to its buyers, with no error and nothing in the
response to say so. The audit row then records `edition.authoredByStoreId ?? "platform"`, so the
misattribution is logged under the magic store id from D102.

**The fix.** Join the version to its interior and require the store ids to match:

```ts
const [row] = await db
  .select({ interiorStoreId: plannerInteriorsTable.storeId })
  .from(plannerInteriorVersionsTable)
  .innerJoin(plannerInteriorsTable, eq(plannerInteriorsTable.id, plannerInteriorVersionsTable.interiorId))
  .where(eq(plannerInteriorVersionsTable.id, versionId));

if (row.interiorStoreId !== edition.authoredByStoreId && row.interiorStoreId !== HOUSE_STORE_ID) {
  res.status(400).json({ error: "Interior belongs to a different store" });
  return;
}
```

The house-store exemption is deliberate — platform-authored interiors *should* be pinnable by any
edition. Cross-*seller* reuse may be wanted one day; it should be an explicit parameter then, not a
missing check now.

**Done when:** pinning store A's interior to store B's edition returns 400; a house-store interior pins
to any edition; and same-store pinning is unaffected.

---

## Step 4 — The last two primitives

**Decoded-pixel cap (D50).** The upload guard measures the *encoded* size — correct as far as it goes,
and the check order (size, then magic bytes, then pipeline) is right. But every stage downstream works
on raw RGBA, and a compliant 5 MB PNG can decode to 12,000px square, which is 576 MB of buffer, plus a
visited array, plus a queue that can hold every pixel. Fifty are allowed per batch request.

Read metadata first and reject or downscale above a megapixel budget. While in that file, fix the
buffer rebuild to pass the offset and length it was constructed with:

```ts
Buffer.from(px.buffer, px.byteOffset, px.byteLength)
```

so correctness stops depending on sharp handing back a buffer that owns its whole `ArrayBuffer`.

**Name-within-store dedup (D47, D93, D107).** `owned-catalog.ts` has `findOwnedDup` and `stickers.ts`
has `findStoreStickerDup` — two implementations of one idea, and the three places that need it next have
none: the bulk sticker paths, the studio save paths, and `POST /planner-interiors`.

Extract one helper that takes a table, a store id and a name, normalises the name, and returns any
non-deleted row that matches. Then use it in all five places. `POST /planner-interiors` should upsert
into an existing interior rather than creating a second one with the same name.

**Done when:** a 12,000px PNG is rejected or downscaled rather than decoded; posting the same interior
name twice returns the first interior; and one dedup helper has five callers.

---

## Step 5 — Two small honesty fixes in the new routes

**The GET preview reads a request body (D107).** `previewInterior` is mounted on both verbs and reads
`title`, `subtitle`, `year` and `themeColors` from `req.body`. A GET has no body — and the comment says
the GET exists *precisely* so an admin can open a PDF in a browser tab, which is the path where all four
options are silently dropped. Move them to query parameters so both verbs behave identically.

**`sanitizedDefinition` does not sanitise the manifest.** It returns the raw `manifest` alongside the
sanitised assets, and discards the `zones`, `slots` and `viewBox` the validator just computed. The
discarding is harmless — the renderer re-runs the same validator, which is why a bad template still
returns 400 from preview — but the name promises more than the function delivers. Rename it to
`validatedDefinition`, or return the derived geometry and let the renderer use it.

**Done when:** a preview opened by URL honours the same options as a POST, and no function named
`sanitized*` returns unsanitised data.

---

## Two things not to do

**Do not leave `hexToRgba` in place as a fallback.** The entire finding is that two parsers coexist. A
deprecated-but-present wrong implementation is the same bug with a comment on it.

**Do not widen the SVG contract to accept `transform`.** Refusing it is what keeps the link annotation
and the artwork in one coordinate space. If an authored template seems to need one, flatten it in the
design tool before export.

---

## After this

Phase 4 is then closed and **Wave 4 can continue on a clean base**. The next items on
`handoff/DAYBOOK-FIX-PLAN.md` are Phase 3's remainder — **D34**, the unauthenticated `POST /orders`
that prices from the request body and mails caller-supplied download links — and then Phase 6, the
Cricut criticals (**D41**, **D42**), which also unblock the sticker help articles.
