# Daybook — Wave 4: image-based planner templates

The interior stops being math and becomes **authored geometry**: a designer (or Claude) produces an
SVG per template, and the named layers in it *are* the coordinate map. The cover is a raster asset,
because it is the one page with no geometry obligations. A product **references** a pinned interior
version rather than copying it.

This is a new subsystem, not a fix pass. But it inherits one property from `pdf-generator.ts` that
must survive, and five lessons from the sticker pipeline that are already paid for.

**The invariant to protect.** Today the drawn cell and the tap target come from the same computed
rectangle, so the ink and the hyperlink physically cannot drift. That is why the PDF defects in pass 1
were cosmetic rather than "every link is one row off." In this design the same property holds for a
different reason: **the link rect and the artwork come from the same SVG in the same coordinate
space.** Anything that breaks that — rasterizing a page, storing zones separately from art, letting
the manifest restate a position — reintroduces drift. Do not do those things.

**Order matters.** Step 1 is the validator, and it ships before anything renders. It is what makes
Claude-generated templates safe later, and it is testable with no pipeline behind it.

---

## Step 1 — The zone contract, and a validator that enforces it

**Why.** An SVG carries geometry, so layer names can carry meaning. Illustrator and Figma both export
layer names into `id` / `data-name`, which makes the design tool the authoring surface with no
plugin.

**The contract.** Four prefixes, and nothing else is special:

| prefix | meaning |
| --- | --- |
| `zone:link:<target>` | element's bbox becomes a PDF link annotation. Never rendered. |
| `slot:text:<field>` | a `<text>` element whose content is substituted at generation. Its font, size, anchor and fill are kept as authored. |
| `guide:*` | stripped entirely — safe area, trim, notes. |
| anything else | static artwork, passed through untouched. |

Link targets are **symbolic**, resolved after page expansion (step 3):
`next` · `prev` · `index` · `home` · `month:<1-12>` · `tab:<name>` · `page:<template-id>`

**Two rules that do the real work.** A `slot:text` keeps the designer's type styling — the generator
substitutes the string and nothing else, so typography is never guessed in code. And the SVG's own
`viewBox` **is** the page coordinate space: the trim size in mm maps onto it by one uniform scale.

**Validate, don't repair.** The validator rejects with a specific message: an unknown `zone:link`
target, a `slot:text` on a non-text element, a zone whose bbox falls outside the viewBox, a viewBox
aspect that disagrees with the declared trim beyond ~0.5%, or any element outside the sanitize
allowlist. **Never fabricate a viewBox and never stretch to fit** — that is D45, and it produced cut
paths 20% oversized in the sticker pipeline.

**Reuse the sanitizer.** This SVG is externally authored, so it goes through the same element and
attribute allowlist D46 asks for — one shared module, used by stickers and templates both. `script`,
`foreignObject`, event handlers and external refs do not survive it.

**Done when:** a hand-authored SVG with two link zones and a date slot passes; the same file with a
typo'd target, a 4:5 viewBox on an A5 trim, and an inline `<script>` produces three distinct errors.

---

## Step 2 — Versioned interiors, pinned by product

**Why.** One interior will sell under several covers as separate products. If a product copies the
manifest, a link fix is six fixes — that is D64 in a new place. If it references a pinned version, it
is one fix that products opt into, and a PDF you sold last month is still regenerable.

**Migration `0015`**, additive, `IF NOT EXISTS`, journal `idx: 15`, no backfill:

- `planner_interiors` — `id`, `store_id`, `name`, `current_version_id`
- `planner_interior_versions` — `id`, `interior_id`, `version`, `manifest` jsonb, `assets` jsonb
  (template id → SVG), `created_at`. **Immutable once written.**
- `products.interior_version_id` — nullable FK, the pin.

**Store templates, not pages.** 365 daily pages are one stored SVG plus a repeat rule. Editing an
interior writes a new version row; existing products keep their pin until explicitly bumped. That
keeps the table small and makes "regenerate exactly what they bought" a query rather than an
archaeology project.

**Done when:** editing an interior leaves every existing product rendering byte-identical output, and
bumping one product's pin changes only that product.

---

## Step 3 — The expander: manifest → page list → resolved links

**Why.** This is where the math went. It did not disappear; it moved out of layout and into
sequencing, which is a better place for it.

```jsonc
{
  "trim": { "w": 148, "h": 210, "unit": "mm" },
  "pages": [
    { "template": "cover",   "once": true },
    { "template": "index",   "once": true },
    { "template": "monthly", "repeat": { "over": "months", "from": "2027-01", "to": "2027-12" } },
    { "template": "daily",   "repeat": { "over": "days",   "from": "2027-01-01", "to": "2027-12-31" } }
  ]
}
```

Expansion is a **pure function**: manifest + date range → ordered pages, each with resolved
`slot:text` values (`date`, `weekday`, `month`, `year`, `week`) and every `zone:link` target resolved
to a concrete page index. `next` on the last page and `prev` on the first resolve to nothing and the
link is omitted — not stamped at 0.

**Fail loudly here, not downstream.** An unresolvable target (`tab:projects` with no such template)
is an error at expansion, not a dead link in a shipped PDF. This is the one place a whole book can be
checked before a single byte is rendered.

**Done when:** a 3-template manifest expands to 379 pages in stable order, every link target resolves
to an in-range index, and the same input twice produces identical output.

---

## Step 4 — Render: SVG page + slots → PDF page + link annotations

**The fix.** For each expanded page: take the template SVG, substitute its `slot:text` contents, strip
`guide:*`, draw it into the page box at the single uniform scale from step 1, and stamp a link
annotation on each `zone:link` bbox **transformed by that same scale**. One transform, applied once,
to both the art and the annotations — that is the invariant.

**Geometry in mm, derived at render.** Never carry a pixel measurement from an authored asset into
output sizing. D44 is exactly this bug in the sticker pipeline: a border width in upload pixels
scaled away to nothing, so identical stickers got different borders depending on the source file.

**Colours through one parser.** If the manifest ever names a colour, it goes through the shared
validated parser — expand shorthand, reject the rest. D06 and D49 are the same bug in two subsystems
because that helper does not exist yet; this is the third caller, so write it.

**Done when:** every link in a generated 379-page PDF lands inside its drawn element in GoodNotes at
100% and at 200%, and a page with no links renders with no annotations.

---

## Step 5 — Placeholder cover, end to end

Do not let the cover feature gate the pipeline. Generate page 1 from the theme — title, subtitle,
year, blueprint motif — so the chain **manifest → interior → cover → PDF → product → listing** is
complete from the first build and the upload path later fills a hole that already exists.

When the real cover ingest lands it reuses the sticker upload guard: size check, then magic bytes,
then decode — and a **pixel** cap, not a byte cap. D50 stands: a compliant 5 MB PNG can decode to
576 MB of RGBA.

**Done when:** a manifest with no cover asset still produces a complete, sellable PDF.

---

## Three things not to do

**Do not rasterize interior pages.** It breaks the link invariant, inflates the file, and throws away
the reason for choosing SVG.

**Do not store expanded pages.** Template plus repeat rule. The moment 365 rows exist per planner,
every edit becomes a migration.

**Do not let the manifest restate anything the SVG already says.** Position, font, colour, size — one
source. D43 is a five-word duplication of a padding formula that is *already wrong* in the copy and
inert only by accident; a manifest that mirrors SVG geometry is that failure with more surface area.

---

## After this

- **Claude authoring the template.** The manifest is structured output and the SVG is generated art
  with a naming convention — both validated by step 1, which is why step 1 is first. Nothing
  generated reaches the renderer unvalidated.
- **Cover upload.** Aspect-vs-trim safe area with a live preview, two DPI thresholds (print ~300,
  digital far lower), spine width from page count for printable wraps.
- **Listing generation.** Page count, trim sizes, link map and theme all live in the manifest, so the
  listing copy and the printing-instructions page are derivable rather than retyped.
