# Replit follow-up — admin IA, round 2

Phases 1–6 of `REPLIT-ADMIN-IA-PROMPT.md` are in. The shell collapse, the grouped nav, the
token block in `index.css`, the capability chips, the drawer and the save bar all landed and
are right. This file is only the gap list.

**Four of these are bugs, not styling.** Do those first, in the order given.

---

## BUGS — do these first

### 1. Unsaved capability edits are silently discarded

`pages/super/FeatureFlags.tsx`

```ts
useEffect(() => {
  if (!stores.length || !flagsQuery.data) return;
  setRows(stores.map(...));   // ← blows away this.state.rows
}, [stores, flagsQuery.data]);
```

`stores` is a new array identity on every `["stores"]` refetch (window refocus, invalidation,
polling). When that fires, `setRows` rebuilds from server data and every queued edit vanishes —
while the save bar is on screen telling the user their changes are safe. That is the worst
possible version of this bug.

Fix: seed `rows` once, then reconcile. On refetch, update `original` for rows the user has not
touched and leave dirty rows alone. If the server value of a dirty field changed underneath,
mark that row conflicted and say so in the drawer. Never overwrite a dirty field from a refetch.

Add a test: render, toggle a capability, trigger a `["stores"]` invalidation, assert the toggle
is still dirty and the save bar still shows 1.

### 2. `isSeed` is a cast, so the seed filter may be filtering nothing

`pages/super/Dashboard.tsx`

```ts
allStores.filter((store) => Boolean((store as Store & { isSeed?: boolean }).isSeed))
```

Casting an optional field onto `Store` twice means the field is not on the type, not in the zod
response schema, and — quite possibly — not in the payload. If the API never sends it, every
`isSeed` is `undefined`, "Hide test & seed stores" hides zero rows, the caption reads "0
hidden", and the dashboard silently still counts 17 test stores. It looks like it works.

Do it properly, all four layers:

1. Migration: `is_seed boolean not null default false` on stores. Backfill true for anything
   created by seeds, migrations or CI.
2. Add `isSeed: z.boolean()` to the store response schema so it is a contract, not a cast.
3. Exclude seed stores **at the query layer** — the default `storesApi.list` and every
   platform metric. An explicit `includeSeed: true` parameter is the only way to get them.
4. Only then does the dashboard checkbox make sense: it flips `includeSeed`, and the caption
   reads the real hidden count from the response.

Remove both casts. Grep for `as Store &` afterwards; there should be none.

### 3. Impersonation is a client-side guess

`AdminLayout.tsx`

```ts
const isImpersonating = role === "owner" && store?.role === "super_admin" && storeId !== "store-house";
```

This infers impersonation from the `me` payload. There is no scoped session, so:

- Nothing on the server knows the request is impersonated. Audit rows name the store, not the
  real actor. **The whole point of Phase 3 was that the real actor stays recoverable.**
- "Exit store" is a `<Link href="/super">`. It navigates. It drops nothing, because there is
  no scope to drop.
- No expiry. A superadmin who enters a store at 09:00 is still "inside" it at 18:00.

Build the real thing: a server-issued scoped session carrying superadmin identity + target
store id, an `impersonatedStoreId` on the request context, dual-attribution audit writes, a
30-minute expiry, and an exit endpoint that revokes the scope before redirecting. `AdminLayout`
then reads a fact instead of guessing.

### 4. The flags page fires one request per store

```ts
queryFn: () => Promise.all(stores.map(async (store) => ({ storeId: store.id, flags: await storesApi.flags.get(store.id) })))
```

22 stores, 22 round trips, re-run on every `stores` identity change. Add `GET /stores/flags`
returning all rows in one response. `updateBulk` already exists on the write side; mirror it.

---

## Divergences from the spec

### 5. The owner nav reintroduces the flat studio list

The Build group renders: All studios, Theme Studio, Sticker Studio, Edition Studio, Planner
Studio, Trend Research, Marketing Studio, Product Builder. Eight items — the exact pattern the
brief said to remove, now in the owner app instead of the platform one. A new recipe still can
not add a nav item, but a new *studio* adds one, and the list is already the longest group in
the sidebar.

Also: `All studios` points at `${base}/studios/edition`, the same href as Edition Studio. So
the entry point is not an entry point, and owners have no picker at all — `StudioPicker.tsx`
exists but only at `/super/studios`.

Fix: add `/store/:storeId/studios` rendering the same picker with the store's enabled studios,
point All studios at it, and delete the seven individual studio nav items. The picker is the
index; the sidebar is not a second copy of it.

### 6. Two "leave impersonation" affordances

When impersonating, the sidebar renders `← Back to platform` **and** the banner renders
`Exit store`. Phase 1 deleted "Back to super admin" from the sidebar; this puts it back.
Keep the banner's Exit store. Delete the sidebar link.

### 7. Two stacked page headers, and the real one scrolls away

`.admin-page-header` is a 56px fixed bar showing only a 12px muted `titleContext`, the AI
button and the role pill. Then every page renders its own `<PageHeader title=… />` **inside**
`.admin-content`, which scrolls. Net effect: the sticky bar says "Platform" forever while the
actual page title and its actions scroll out of view.

The spec's header was one bar: Spectral 19px title, sub-line under it, actions right-aligned,
56px, `#FFFDF9`, sticky. Merge them — pages declare title/description/actions (layout prop or
a small context) and the chrome bar renders them next to the AI button and role pill. Delete
the in-content `PageHeader`.

### 8. The metric strip has no trend, which was its entire purpose

```ts
{ label: "Trial → paid", value: "Unavailable", delta: "Not measured", neutral: true }
{ label: "Failed builds", value: "Unavailable", delta: "Not measured", neutral: true }
```

All five metrics are `neutral: true`, three of them say "Current total", two say "Unavailable".
A trend strip that shows no trend is worse than the four big cards it replaced — it costs the
same space and carries less.

Either wire period-over-period values and 6-point series from the stats endpoint (add them to
`platformApi.stats`), or cut the two unmeasured cells down to three real ones. Do not ship
"Unavailable" in a hero strip. If trial→paid and failed builds are genuinely not instrumented,
say so in one line under the strip and drop the cells.

### 9. The decision queue is a filtered store list

Only `status === "suspended" || "trial"`, sorted by `updatedAt`. Missing: draft recipes with a
release month inside 60 days, recipes failing the engine-gap check, live listings claiming
hyperlinked nav on a poor-links device, trials ending within 5 days with zero planners built.
And no thresholds — a store suspended two minutes ago outranks nothing, and one suspended a
month ago sits at the bottom by luck of `updatedAt`.

Make it a real union of typed signals, each with its own condition and its own severity, sorted
by severity then age. Suspension only qualifies past 48h.

### 10. Release runway shows app versions, not recipes

`releasesApi.list` gives "Version 1.0.0 · Aug 2026". The card was meant to be the recipe
release schedule — that is the renewal argument, and it is what a store sees as "new this
month". Point it at recipes. App releases belong on `/super/releases`.

### 11. Flags row height varies, so the overlap will come back

The store cell stacks name over status pill; other cells are single-line. That variance is what
caused the original clipping. Put name and pill on one line in a flex row with `gap: 9px`, and
give every row identical `padding: 12px 18px`.

### 12. Help center views column is hardcoded `0`

`<span …>0</span>` for every row, under a "Views 30d" header. Either wire real analytics or
remove the column and widen Article. A column of zeros is a promise you are not keeping.

### 13. Help center: rows are not clickable, and the tab counts ignore the filter

The chevron opens the edit sheet but the row does not, so the click target is 16px in a 44px
row. Make the whole row open the sheet, keep the status pill's own click for status, and stop
the delete button from bubbling. Separately, the Articles/FAQs tab counts use unfiltered
`articles`, so they disagree with the visible list whenever a status filter is on.

### 14. `--admin-prototype-ink: #121D34` is dead

That colour existed only for the prototype strip in the design file — the bar with the screen
switcher. It has no meaning in the product. Remove the token.

### 15. Icon-only nav at 620px has no accessible name

```css
.admin-nav-item > span, .admin-nav-badge { display: none; }
```

The hidden span is the only text in the item, so the collapsed nav is icons with no accessible
name and no tooltip. Add `aria-label={item.label}` and `title={item.label}` on the item, or
render the label in a visually-hidden span instead of removing it. Same for the badge — a
hidden count is fine visually, but the number should still reach a screen reader.

---

## Not yet started

Phases 7–9 as written in `REPLIT-ADMIN-IA-PROMPT.md`: catalog authoring landing
(`CatalogAuthoring.tsx` exists — check it against Phase 7 before rebuilding), studio picker
polish, and the store owner home. Do not start them until items 1–4 are closed.
