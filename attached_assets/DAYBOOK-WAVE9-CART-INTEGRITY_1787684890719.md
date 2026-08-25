# Daybook — Wave 9: make checkout survive a real cart

Wave 8 built seller checkout correctly and left one defect that reaches every buyer with more than about
five items in their cart. Everything else here is cleanup of the compromises Wave 8 knowingly made — the
comments in that code name most of them, which is why this wave is short.

**Order matters.** Step 1 is the only thing that blocks selling. Step 2 changes what a buyer is charged,
so it should land before real orders accumulate at the wrong price.

---

## Step 1 — Stop round-tripping the cart through Stripe metadata

**The defect (D116).** The resolved cart is serialised into the Checkout Session's metadata:

```ts
metadata: {
  commerce: "seller",
  storeId,
  items: JSON.stringify(resolvedItems.map(({ itemType, itemId, name, priceCents, quantity }) => …)),
}
```

**Stripe caps each metadata value at 500 characters.** One typical entry —
`{"itemType":"edition","itemId":"e1","name":"Classic 2026","priceCents":2900,"quantity":1}` — is about
ninety characters, so five items sits on the limit and six exceeds it. `parseRequestedItems` explicitly
permits **twenty**. Past the limit Stripe rejects the session, the handler logs and returns 502
*Failed to create seller checkout session*, and the buyer sees a generic failure at the moment they
committed to pay. Nothing in the message points at cart size.

**The fix.** Persist the resolved cart and reference it:

1. A `checkout_intents` table — `id`, `store_id`, `buyer_user_id` (nullable), `items` jsonb,
   `amount_cents`, `currency`, `created_at`, `expires_at`. Written in the same request that creates the
   session, in a new numbered migration.
2. Metadata carries `commerce: "seller"`, `storeId`, optional `userId`, and `intentId` — four short
   values, none of them growing with the cart.
3. `processSellerCheckoutPayment` loads the cart from `checkout_intents` by `intentId` instead of parsing
   metadata, and refuses if the intent is missing, expired, or belongs to a different store.

This is also stricter than what it replaces. A database row is authoritative; a JSON blob that has been
out to Stripe and back is input, and the current code has to re-validate every field precisely because
of that.

Expire intents — an hour is generous — and sweep them, or leave them and index on `expires_at`. An
abandoned intent is not an order and must never become one.

**Done when:** a twenty-item cart completes checkout and produces one order with twenty line items; a
tampered `intentId` produces no order; and an expired intent is refused rather than fulfilled.

---

## Step 2 — Give an edition one price

**The defect (D117).** Checkout charges `priceLow`:

```ts
// Editions currently expose a retail range, not variants. The lower
// bound is the canonical digital checkout price until variants exist.
priceCents = centsFromDollars(row.priceLow);
```

The comment is honest, and the consequence is that a pricing decision is being made by a fallback.
Classic 2026 is seeded at 29–39 and will always sell for 29. If any storefront surface renders the range,
the displayed price and the charged price disagree — which is the shape of complaint that costs more than
the discount.

**The fix.** Editions get one digital price that both the storefront and checkout read — a single
`digital_price_cents` column, set from `priceLow` in the migration so nothing changes silently, then
edited deliberately. `priceLow`/`priceHigh` stay as display-only marketing range fields, annotated as
such the way `yearly_price` was in Wave 2.

**Do not put the amount in Stripe** for this one. Subscriptions moved to Stripe Price ids because there
is one plan in one account; seller editions are per-connected-account and per-store, so a Price object
per edition per seller is a synchronisation problem, not a simplification. A single authoritative column
is the right answer here even though the opposite was right for plans.

**Done when:** one column decides the price, the storefront renders the number checkout will charge, and
a migration backfills it from `priceLow` with no visible change.

---

## Step 3 — Stop selling what cannot be delivered

**The defect (D118).** `loadResolvedItem` refuses anything that is not an edition, with a good reason:

```ts
// Only editions currently resolve to seller-owned generated PDFs. Refuse
// any catalog reference without a concrete, secure delivery implementation.
```

Correct in code, and the product contradicts it. A seller can generate a sticker pack spec in Pack
Studio, set a price, publish it, enable it on Shop catalog, see it listed with an entitlement badge — and
no buyer can ever buy it. That is D84's shape again: a control whose only outcome is that nothing
happens.

**The fix — the cheap half now.** Mark which item types are purchasable in one place, and have the
storefront and the catalog page read it. An item type without delivery is not offered for sale and says
so where a seller would otherwise price it.

**The real half, scheduled.** Decide delivery per type. Sticker packs are the obvious next one — they are
the cheapest repeat purchase in the catalog and the studio for them already exists — but they need the
Wave 6 pixel work behind them and a zip or manifest to deliver. Do not add a type to checkout until its
delivery path is as concrete as the edition path is.

**Done when:** a seller cannot price or publish something the storefront will not sell, and the
purchasable set is defined in exactly one place.

---

## Step 4 — Retire the product/edition alias while it is cheap

**The defect (D119).** Wave 8 shimmed D38 rather than fixing it:

```ts
function canonicalType(itemType: string): string {
  return itemType === "product" ? "edition" : itemType;
}
// …and the enabled-check accepts either spelling
inArray(storeCatalogTable.itemType, [requested.itemType, canonical])
```

That was the pragmatic call and it does make the Related products tab purchasable. But the alias has now
reached money movement, and every week it stays there raises the cost of removing it: deleting the shim
later breaks checkout rather than a list.

**The fix, one commit.** Normalise `store_catalog` rows from `product` to `edition` in a migration, drop
the alias from `CATALOG_TABLES`, remove the Related products tab from `ShopCatalog.tsx`, and delete
`canonicalType` and the `inArray` widening. The unique index on `(store_id, item_type, item_id)` means the
normalisation may collide where an edition was enabled under both spellings — resolve those to one row in
the same migration.

**Done when:** no code path maps `product` to `edition`, no store has both spellings enabled for one
item, and the tab is gone.

---

## Step 5 — Two migration and runtime corrections

**`0019` reassigns the house store's owner unconditionally (D120).**

```sql
UPDATE "stores" SET "name" = …, "slug" = …, "owner_user_id" = 'user-platform-system'
WHERE "id" = 'store-house';
```

On an existing database this silently takes the house shop from the real super admin and gives it to a
synthetic account that cannot sign in. Access survives through `store_members`, which is what makes it
easy to miss — and because D33 correctly made `ownerUserId` non-editable by owners, there is no
in-product way to hand it back.

Fix forward in a new migration: restore `owner_user_id` to a real super admin where it currently points
at `user-platform-system`, preferring the oldest super-admin account. Then narrow the `0019` statement to
`name` and `slug` so a fresh install does not repeat it, and only set the owner when it is null.

**The guest rate limiter is process-local.** `guestAttempts` is an in-memory `Map`, so it resets on every
deploy and gives each server instance its own allowance. Fine on one instance today; move it to the
database or a shared store before running two, and note it next to the constant so the next reader knows
which it is.

**Done when:** the house store is owned by an account that can sign in, re-running migrations does not
change ownership, and the limiter's scope is either shared or documented.

---

## Two things not to do

**Do not raise the item cap to fit the metadata limit.** Twenty items is a reasonable cart; 500
characters is a Stripe constraint that should not shape the product. Move the cart, not the cap.

**Do not treat a `checkout_intent` as an order.** It records what a buyer *asked* to pay for. Only a
Stripe event that says the money moved may create an order — that separation is the whole reason
`POST /orders` was deleted.

---

## After this

Commerce is complete and correct. From `handoff/DAYBOOK-FIX-PLAN.md`:

- **Phase 6 — the Cricut criticals** (D41, D42): a bordered sticker is cut as a rectangle, and multi-part
  artwork has one component traced while the machine slices the rest. Also unblocks the sticker help
  articles, which should not be written before it — and it is a prerequisite for selling sticker packs
  (step 3).
- **D109** — give name dedup the constraint that interior versions got.
- **D110** — one query: confirm `planner_interior_versions_interior_version_uq` exists on the running
  database.
- **Redemption and the loyalty ledger** — now genuinely unblocked: orders are trustworthy, links are
  issued on demand, and the seller path is idempotent.
