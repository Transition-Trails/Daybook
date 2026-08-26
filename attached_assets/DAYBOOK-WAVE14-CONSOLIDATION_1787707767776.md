# Daybook — Wave 14: consolidate the studios

Phase 10. This is the wave that makes every later wave cheaper, and Wave 13 proved why it cannot wait.

The price rule now has a validator and a passing test — `getPackPriceError` with cases for empty, zero,
sub-cent and exponent input. It is enforced on **one of six paths** that create a pack. The other five
still coerce a junk price to zero:

```
MyContent.tsx:796           parseFloat(price) || 0
StoreStudioPage.tsx:745     parseFloat(price) || 0
PackStudio.tsx:141, :142    parseFloat(price) || 0
StickerStudio.tsx:106       parseFloat(price) || 0
StickerStudioHub.tsx:664    parseFloat(price) || null
```

The dead "coming soon" cover control is duplicated too, at `PackStudio.tsx:269` and
`StickerStudio.tsx:189`.

**The test is the dangerous part.** A defect with a green test looks closed. The next person to read this
code will reasonably believe the price rule is enforced, because there is a file proving it — and be
wrong five times out of six.

**So this wave does not fix those five call sites.** Fixing them buys one defect and leaves the
multiplier running. It removes the duplication that generates them.

**Order matters absolutely.** Step 1 is a prerequisite for step 3; step 2 is what makes step 3 safe.

---

## Step 0 — Confirm the map before moving anything

Pass 6 established the shape, but verify it still holds before deleting code:

- For each domain — **Theme, Edition, Trends, Sticker, Pack, Planner** — list the implementations. The
  expected pattern is three: a hub at `pages/studios/*Hub.tsx`, a superseded standalone at
  `pages/studios/*.tsx` still routed, and a store-scoped variant at `pages/store/studios/*`.
- For each, note which routes reach it (`pages/routes.tsx` and `App.tsx`) and which are in `Shell.tsx`'s
  nav.
- Note every **cross-tree import** — the known one is `pages/store/studios/PlannerStudio.tsx` importing
  `PLANNER_FONT_FAMILIES` from `pages/studios/PlannerStudioHub`, plus two test files importing
  `BuildCenter` and the style round-trip helpers from the same module.

**Done when:** a table of domain → implementations → routes → cross-imports exists in the PR description.
Nothing is deleted in this step.

---

## Step 1 — Extract the shared module (D63)

**The defect.** The store-scoped Planner Studio imports its font list from the *platform hub*, and two
tests import `BuildCenter` and the style helpers from it. So `PlannerStudioHub` is not only a page — it is
a de facto shared module that a tenant-facing surface depends on, with no separation between the two
roles. The coupling runs the wrong way: the tenant surface depends on the platform page rather than both
depending on a shared module.

**The fix.** Move the genuinely shared things out of the hub pages into real modules — a `studios/shared/`
directory or similar:

- `PLANNER_FONT_FAMILIES` and any other constant lists.
- `BuildCenter` and the style round-trip helpers the tests import.
- Anything else step 0 found being imported across the tree.

Then have **both** hubs and the store variants import from there. No page should import from another page.

This is the prerequisite for everything after it: while a hub is load-bearing for code elsewhere, it
cannot be consolidated or deleted.

**Done when:** no file under `pages/` imports from another file under `pages/`, and the two tests import
from the shared module.

---

## Step 2 — Redirect the back-compat routes (D65)

**The defect.** `routes.tsx` keeps four superseded pages mounted at their original paths — `/studios/theme`,
`/studios/edition`, `/studios/trends`, `/studios/pack` — and the header comment says each is now a *mode
inside a hub*. But the routes do not send anyone there; they render the old component. So a bookmarked
`/studios/theme` serves a superseded editor with its own validation, while the nav points everyone else at
the hub. Two people editing the same theme can be in different UIs.

**The fix is already in that file.** `/catalog/products` and `/catalog/products/:id` are `Redirect`
components with the mode preselected in the query string. Convert the four to match.

That preserves every bookmark, removes four render paths, and — this is the point — **it is what makes
step 3's deletions possible.** A route that redirects has no component to keep alive.

**Done when:** the four paths redirect to the corresponding hub mode, and no superseded standalone is
reachable by URL.

---

## Step 3 — Consolidate, one domain at a time, starting with Theme

**Theme first**, because it has the smallest surface: `ThemeStudioHub` (canonical), `ThemeStudio`
(superseded, now redirected by step 2), and `StoreThemeStudio` (tenant-scoped).

For each domain, in order:

1. **The hub is canonical.** Anything the store variant does differently is either a tenant-scoping
   concern or a divergence that needs a decision — do not preserve a difference just because it exists.
2. **Reduce the store variant to a thin tenant-scoped wrapper** around the hub, passing the store id and
   whatever the tenant context requires. It should not reimplement the studio.
3. **Delete the superseded standalone** now that its route redirects.
4. **Move the price rule in.** `getPackPriceError` goes into the shared module in the same commit as the
   Pack/Sticker domain, and the five remaining `parseFloat(price) || 0` call sites disappear because the
   code containing them does. That is the difference between fixing D130 and *dissolving* it.
5. **Delete the duplicated dead cover controls** with the pages that hold them.

Then Sticker/Pack, then Edition, then Trends, then Planner last — it is the largest and the one with the
cross-tree dependency step 1 untangles.

**Do this as one commit per domain.** Six small reviewable changes, each independently revertable, beats
one large one nobody can verify.

**Done when:** each domain has one implementation plus a thin store wrapper, `grep parseFloat(price)`
returns one result, and `grep "coming soon"` returns one.

---

## Step 4 — The one that was never a duplicate

**D88** — help categories are still a free-text `<Input>` defaulted to `"general"`, and category is the
axis help is browsed by. Values drift immediately (`general`, `General`, `getting started`), and the
"Draft the article" deep link injects its `areaLabel` into the same field, so machine and human values mix
in one column.

The two forms are already one component (`HelpArticleForm`, from Wave 5), so this is a single change: a
`<Select>` over a fixed list using the SupportPatterns areas as values, plus a migration lowercasing and
mapping existing rows to the nearest entry.

**Done when:** categories come from a list and existing rows are normalised.

---

## Three things not to do

**Do not delete the legacy `/daybook` tree.** It is mounted in two routers, linked in `Shell.tsx`'s nav,
and the store surface imports from it (D62). The old deletion plan is void — this wave *consolidates*, it
does not remove the console.

**Do not fix the five price call sites as a shortcut.** If they are still there when the consolidation
lands, they will be deleted with their files. Fixing them first is work you throw away, and it removes the
pressure that makes this wave happen.

**Do not preserve a store-variant behaviour just because it differs.** Every divergence found is either a
tenant-scoping requirement or a bug in one of the two. Decide which, and write the decision in the commit
message.

---

## After this

The duplication multiplier is gone and every remaining item gets cheaper:

- **D124** — one sheet of vinyl, four stickers, to prove the cut line before the sticker help articles
  ship.
- **D118** — selling sticker packs; a delivery format exists and, after this wave, one code path creates a
  pack.
- **Help pass B** — `PlannerStudio.tsx`, the edition and storefront screens, and `StaffRoles.tsx`. Worth
  doing after consolidation rather than before: articles written against six implementations document the
  wrong one.
- **Redemption, the loyalty ledger, and the Discord gallery** — all unblocked, and all cheaper once one
  studio path exists per domain.
