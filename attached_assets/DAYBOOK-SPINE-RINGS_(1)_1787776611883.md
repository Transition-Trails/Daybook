# Daybook — spine rings: the ability to add them

**Goal: a mechanism, not a finish.** The owner needs to add a ring image, pick it, and see it render on the
page. Asset quality and the wider binder model are explicitly later work — build the pipeline so tuning is a
matter of dropping in better files, not changing code.

**Deferred, do not build:** the binder cover, cover finishes (flat / fabric / velvet), the cover-shadow
toggle, and double-page spreads. Spreads change page geometry and belong in their own wave.

**Out of scope entirely:** the storefront, checkout, and everything under `pages/studios/` except the one
selection control in step 4.

---

## Step 1 — stop the current rings drawing

Two bindings render today and one is clipped: a column of vector rings down the **left** edge, cut off by the
page boundary, plus a second column of grey ellipses down the **vertical centre**. Find both and remove the
vector ring drawing entirely — it is being replaced, not adjusted.

Establish **one** binding position with a named constant rather than two competing ones. The spine goes on
the binding edge; if `tabPos` or orientation should influence which edge that is, make that explicit and say
what you chose. A page must never draw two bindings.

While you are there: the cover also renders the year twice — `coverTitle` already contains it and `coverYear`
draws it again, landing on top of the "Get started" label. Fix the duplication and the overlap; it is in the
same region of the code and it is two lines.

## Step 2 — a spine asset catalog

New table `spine_styles`, in a numbered Drizzle migration. Mirror the ownership model
`sticker_shape_recipes` uses — `origin` of `starter` or `owned`, with `authored_by_store_id` null for
starters — so platform styles ship as starters and a store can add its own.

| Column | Notes |
| --- | --- |
| `id` | `spn_` prefix |
| `origin` | `starter` \| `owned` |
| `authored_by_store_id` | null for starters |
| `name` | "Gold double loop" |
| `slug` | stable key, unique per origin+store |
| `asset_ref` | the ring image |
| `unit_aspect` | image width ÷ height, stored so geometry never depends on re-reading the file |
| `gap_ratio` | vertical gap between repeats, as a fraction of unit height. `0` for a continuous strip |
| `orientation` | `vertical` \| `horizontal` — which binding edge the asset is drawn for |
| `status` | `draft` \| `live` |

Seed **two** starter styles, one per orientation, from the owner-supplied assets:

| File | Dimensions | `orientation` | `unit_aspect` | `gap_ratio` |
| --- | --- | --- | --- | --- |
| `rings2.png` | 203 × 1500 | `vertical` | `0.1353` | `0` |
| `rings1.png` | 2249 × 189 | `horizontal` | `11.9` | `0` |

Both now carry a real alpha channel. Both are **continuous strips with even spacing already built in** — 14
ring pairs in the vertical, 19 in the horizontal — so `gap_ratio` is `0` and the whole strip is the tiling
unit. The vertical one has a continuous spine rod running its full length, which means it tiles seamlessly:
the rod meets across the repeat boundary. Confirm that seam looks clean at the join, since it is the one place
tiling a strip can show.

More styles after this are data, not code.

## Step 3 — composite it, and never stretch it

In the PDF generator, draw the spine by **tiling the unit down the binding edge**:

- Scale the unit by **height**, derive width from `unit_aspect`. Never scale the two axes independently —
  non-uniform scaling turns circular rings into ovals, which is the exact complaint that started this.
- Repeat down the edge with `gap_ratio` spacing until the page edge is reached, and **clip at the page
  bounds**. A partial ring at the end is correct and normal; a ring hanging outside the page is the current
  bug.
- One code path handles both cases the owner may supply: a single ring tiles many times, a full strip tiles
  once or twice. Do not write two implementations.
- Resolution-independent — the same style must render correctly at any page size, orientation and DPI.

**Tolerate imperfect assets rather than refusing them.** If an image has no alpha channel it will paint an
opaque box; log a clear warning naming the asset and draw it anyway. The owner is iterating on exports and a
hard failure would block her from seeing progress. A warning she can read is right; a crash is not.

## Step 4 — let her pick one

Surface spine style selection where planner style is already chosen (the same place `notePaper`, `tabPos` and
theme are set), including a "none" option so the spine can be switched off. Persist it in the planner config
alongside the other style fields.

Add the chosen style to the proof script's config so `pnpm proof:planner` exercises a real spine, and print
the style name in its summary.

## Step 5 — one test, and only one

`spine_styles` geometry, in `artifacts/api-server/src/test/`:

- A unit of known aspect ratio tiles down a page **without non-uniform scaling** — assert the drawn width
  and height preserve `unit_aspect` within a small tolerance. This is the assertion that protects against
  oval rings.
- Nothing is drawn outside the page bounds.
- `none` draws no spine at all.

Do not build a large suite here. The visual result is judged by eye; the only thing worth pinning mechanically
is that the geometry cannot distort or overflow.

---

## Definition of done

The owner can add a ring image as a spine style, select it, generate a planner, and see it tiled down one
binding edge at the correct aspect ratio with nothing outside the page. Vector rings are gone. No page draws
two bindings. The cover shows the year once.

## Report back

1. Which binding edge you chose and what decides it.
2. How the two seeded styles actually look on a generated page — plainly, since the owner will refine the
   files based on that answer. In particular whether the vertical strip's repeat seam is visible.
3. Anything the tiling revealed about the assets she should know before re-exporting. One thing already
   noticed and worth confirming on the page: the horizontal asset has small black rectangles at the base of
   each ring pair. If those read as page-edge shadow they are fine; if they read as leftover masking they
   need removing at source, not in code.
