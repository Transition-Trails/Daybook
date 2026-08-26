# Daybook — Wave 13: stop lying to the store owner

Phase 9. None of these will crash anything. Together they are the reason a seller stops trusting the
product: a control that does nothing, a number that means something else, a price that silently becomes
zero, and a button that refuses without saying why.

Every one of them is small. The reason they matter is cumulative — a seller who has been misled twice
starts checking everything by hand, and that is the point where the tool stops saving them time.

**Order matters only loosely.** Step 1 is the one that costs money today.

---

## Step 1 — Refuse to publish an empty pack (D90, D91)

**Two defects, one screen.** `StorePackStudio.tsx` has a dead cover control:

```tsx
<div className="… cursor-not-allowed …">
  <Upload /> Drop cover image (coming soon)
</div>
```

Directly below it sits a live price input **pre-filled at $4.99**. And the studio generates a name, four
tags and four *text* sticker ideas — its own description says they are "ready to hand to an illustrator."
Nothing generates stickers.

So **Publish** puts a priced pack with no artwork and no contents into the catalog, ready to enable on a
storefront. Nothing warns. The help article we drafted for this screen had to end with "keep it a draft",
which is a documentation workaround for a missing guard.

The price is the second defect:

```ts
price: parseFloat(price) || 0
```

Empty or non-numeric input publishes at **$0.00**. Wave 1 closed exactly this class on the checkout side —
a null price now returns 500 rather than a zero-amount session — and Wave 12 closed it for editions with
`price > 0`. The authoring side still produces the free product both of those were taught to refuse.

**The fix.**

- **Block Publish** until the pack has a cover and at least one sticker. Leave **Save as draft** open —
  drafting the spec first *is* the workflow, and the studio is good at it.
- Say why on the disabled button, the way the owner-only Publish button already does correctly a few lines
  away (`title="Publishing requires store owner role"`). That pattern is right there; reuse it.
- **Validate the price before save.** Reject non-positive with a message on the field. Use the same rule
  as `isPurchasableCatalogItem`: an integer number of cents, greater than zero.

**Done when:** a pack with no cover cannot be published but can be saved as a draft, the disabled button
states the reason, and an empty price field produces a field error rather than a $0.00 pack.

---

## Step 2 — Make the dashboard numbers mean what they say (D85)

```tsx
<StatTile label="Planner builds"
          value={catalog.filter((c) => c.itemType === "edition").length}
          sub="Editions enabled" />
```

The tile counts **enabled editions**. Its label says builds, its own sub-label says editions, so the card
contradicts itself — and there is a separate `PlannerBuilds.tsx` page that presumably holds the real
figure. A store owner reading "Planner builds: 3" believes three planners were generated.

**The fix.** Rename the tile to what it counts, and if a build count is wanted, query it from wherever
`PlannerBuilds` gets its data. A number on a dashboard is a claim; two labels disagreeing on one card is
the clearest possible signal that nobody checked.

**While you are in `Dashboard.tsx`:** the staff tile counts `m.role !== "customer"`, which counts any role
not literally named — including one added next year. Wave 12 shipped `admin/src/lib/permissions.ts` for
exactly this; use `isStaffRole`.

**Done when:** every tile's label matches its query, and no role is counted by exclusion.

---

## Step 3 — Let an owner see their own licence state (D86, D39)

`EntitlementPanel` — the only surface that displays `subscriptionActive` — renders under
`{isSuperAdmin && …}`. The owner's dashboard says nothing about it.

Their only signal is the amber banner on Shop catalog, and that appears **only when a lapsed licensed item
is already enabled**. So a store that lapsed while running starter items gets no signal anywhere, then
finds generation blocked with no explanation available to them.

**The fix.** Show licence state to the owner, read-only: active or inactive, and what that means for them —
licensed content cannot be used for *new* generation, starter and owned content is unaffected, and already-
generated planners are never taken away. That last part is the offboarding guarantee `entitlement.ts`
documents, and it is exactly what a worried seller needs to read.

**Same file, one word (D39):**

```ts
const subscriptionActive: boolean = (store as any).subscriptionActive ?? true;
```

An `any` cast and a **fail-open** default on the licence gate. Type the store object and default to
`false`. The column is `notNull` so the coalesce is dead today, but a gate whose unknown state is "open" is
the wrong thing to write down.

**Done when:** an owner can see whether their licence is active without asking, the copy says what is and
is not affected, and no licence read defaults to true.

---

## Step 4 — Say why the button is disabled (D92)

`StoreThemeStudio.tsx`:

```ts
const canSave = !!name && colors.length === 6 && colors.every(isValidHex);
```

The six hex fields are free text. An invalid value renders its swatch as a grey placeholder and disables
both save buttons — with **no message and no marker on the offending field**. The user sees a dead button
and a grey square and has to guess.

**The fix.** Mark the invalid field, and put the reason on the disabled button's tooltip. Small, and it is
the difference between a support ticket and a self-service fix.

Note there is now a server-side parser that agrees on what a valid colour is: `parseHexColor` in
`lib/color.ts`, from Wave 6. If the client's `isValidHex` disagrees with it in any case, the client is
wrong — a value the server will reject must not look acceptable in the field.

**Done when:** an invalid swatch is visibly marked, the disabled button explains itself, and client and
server agree on validity.

---

## Step 5 — Give help categories a fixed list (D88)

Both help forms use a free-text `<Input>` defaulted to `"general"` — and category is the axis help is
browsed by. Hand-typed values drift immediately (`general`, `General`, `getting started`,
`Getting Started`), and the "Draft the article" deep link from SupportPatterns injects its `areaLabel`
into the same field, so machine-generated and hand-typed values mix in one column.

**The fix.** A `<Select>` over a fixed list, with the SupportPatterns areas as its values. Migrate existing
rows by lowercasing and mapping to the nearest entry. One shared list, used by the platform and store
forms — which are now one component (`HelpArticleForm`, from Wave 5), so this is a single change.

**Done when:** categories come from a list, and existing rows have been normalised.

---

## Two things not to do

**Do not "fix" step 1 by removing the price field.** Pricing a pack while drafting it is reasonable; the
defect is that Publish accepts a pack with nothing in it.

**Do not add a build count by guessing a query.** If `PlannerBuilds.tsx` already answers it, reuse that.
Two pages counting builds differently is how the current defect started.

---

## After this

Remaining on `handoff/DAYBOOK-FIX-PLAN.md`:

- **Phase 10 — consolidation** (D63 → D65 → D64). Extract the shared module, convert the four back-compat
  routes to redirects, then consolidate per domain starting with Theme. Last by severity, **first by
  leverage** — D64 is why a fix applied once stays live in two other paths, so every future wave is cheaper
  after it.
- **D124** — one sheet of vinyl, four stickers, to prove the cut line before the sticker help articles
  ship.
- **D118** — selling sticker packs, now that a delivery format exists. Step 1 above is a prerequisite: do
  not make an empty pack purchasable.
- **Help pass B** — `PlannerStudio.tsx`, the edition and storefront screens, and `StaffRoles.tsx`.
- **Redemption, the loyalty ledger, and the Discord/gallery work** — all unblocked.
