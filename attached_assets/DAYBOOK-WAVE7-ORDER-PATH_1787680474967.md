# Daybook — Wave 7: make the order path trustworthy

Phase 4 is closed and the geometry build has a clean base. This wave closes the last commerce critical.

`POST /orders` is unauthenticated, prices itself from the request body, and mails caller-supplied
download links from the store's sender identity. Everything downstream inherits that: a store owner's
revenue figures, the receipt that delivers the product, and — once redemption ships — the entitlement
grant that turns a marketplace buyer into a customer.

**Why now rather than later.** Three things we have already decided depend on orders being truthful.
The CRM reads them as customer history. The redemption path uses the receipt as its delivery mechanism.
And Etsy and KDP both hand us a buyer whose only proof of purchase is an order row. A forged order is
currently indistinguishable from a real one.

**Order matters.** Step 0 is a search, and its answer decides whether step 1 is a deletion or a rewrite.

---

## Step 0 — Find out who calls `POST /orders`

**The question.** The route exists, but Wave 3 taught us the webhook now writes orders directly for
subscription payments. So who creates a *storefront* order?

Search the admin and storefront clients for a POST to `/orders`, and check `shop.ts`,
`StorefrontHome.tsx`, `EditionDetail.tsx` and `StoreBuilder.tsx` for a checkout path. Three possible
answers, and they lead different places:

- **Nothing calls it.** It is a leftover. Delete the route in step 1 and stop.
- **The storefront calls it directly after a client-side payment.** Then the pricing and the download
  links are client-authored by design, and step 1 is a rewrite, not a guard.
- **Something else calls it** — a Make automation, a manual admin action, a test. Then find out what
  contract that caller depends on before changing the shape.

**Done when:** you can name every caller, or state that there are none. Write the answer at the top of
the PR.

---

## Step 1 — Stop accepting money facts from the client

**The defect (D34).** Every value on the order comes from the request body, and the only validation is
that two of them are present:

```ts
const { storeId, buyerEmail, items = [], totalCents = 0, currency = "usd", downloadLinks = [] } = req.body;
if (!storeId || !buyerEmail) { res.status(400)…; }
```

`resolveStoreActorOptional` means an unauthenticated request passes straight through. So anyone on the
internet can write a revenue row into any store's dashboard at any amount, and make the platform email
arbitrary item names and arbitrary download URLs to an arbitrary address from that store's sender
identity. That is an open mail relay wearing a merchant's domain, and the fallout lands on the sender
reputation of every store on the platform.

**The fix, if the route stays.** Three changes, none optional:

1. **Require authentication.** `resolveStoreActor`, not the optional variant. A guest checkout, if it is
   ever needed, is a deliberate separate route with its own rate limit — not the default.
2. **Resolve line items and prices server-side from the catalog.** The client sends item ids and
   quantities; the server looks up each item, computes `priceCents` and `totalCents`, and builds
   `downloadLinks` itself. Nothing about money or delivery is readable from the request.
3. **Verify the store exists**, the way `planner-interiors.ts` now does before its insert.

**If the route goes.** Delete it, and have the checkout webhook create seller orders the way it already
creates platform ones — `recordSuccessfulPayment` is the shape to copy, and it is idempotent on Stripe
identity, which a public POST can never be.

**Done when:** an unauthenticated `POST /orders` returns 401; an authenticated one with a tampered
`totalCents` produces an order at the catalog price; and `downloadLinks` cannot be influenced by the
request at all.

---

## Step 2 — Check entitlement before the receipt goes out

**The defect.** `orders.ts` never imports the entitlement engine. So an order can be created, and its
download links mailed, for items the store is not entitled to sell — a licensed item from a store whose
subscription has lapsed, or an `owned` item belonging to a different store entirely.

**The fix.** `assertEntitled` at the top of the order path, per line item, with the store's real
context — not a super-admin bypass. `entitlement.ts` documents this precisely: the storefront and
generation paths always pass the store's real entitlement, and the offboarding guarantee means
*already-generated* artifacts are never gated. An order is a new grant, so it gates.

**Done when:** a store with `subscriptionActive: false` cannot create an order containing a licensed
item, and the error names the item and the reason.

---

## Step 3 — Retire the permanent receipt token

**The defect (D36).** `resendToken` is a UUID with no expiry, no use count, and no rate limit on the
route, and possession of it is full authority to make the platform send an email. It is also handed out
freely: `POST /orders` returns the whole order row, and `GET /store/:storeId/orders` does a bare
`select()`, so every staff member sees the token for every order. The comparison is a plain string
equality on a secret.

**The fix.**

- **Stop returning it.** Neither the create response nor the order list should carry `resendToken`.
  Select explicit columns instead of `select()` — the list route is the one place it leaks widely.
- **Expire it and count uses.** Add `resendTokenExpiresAt` and `resendCount` in a new numbered
  migration. Refuse past the expiry or the cap.
- **Rate limit the route** per order and per hour.
- **Compare timing-safely** — one line, once the rest is done.

**Done when:** the token appears in no response body except the buyer's own receipt email; an expired
token returns 403; and the eleventh resend in an hour is refused.

---

## Step 4 — Make an unsent receipt a queryable state

**The defect (D37).** The receipt is fired and forgotten:

```ts
sendOrderReceipt({…})
  .then(async () => { await db.update(ordersTable).set({ receiptSentAt: new Date() })… })
  .catch((err) => { console.error("[orders] receipt send failed", err); });
```

On failure the only trace is a `console.error`, and `receiptSentAt` stays null — which is also its value
in the milliseconds before a successful send, and its value if the process died mid-flight. The buyer's
download links simply never arrive and nothing in the product knows. The 201 has already been returned,
so the client cannot report it either. Note also that a failure of the `update` inside the `.then()` is
not caught at all.

**The fix.** Record attempts on the row — `receiptAttempts`, `receiptLastError`, `receiptLastAttemptAt`
— so "receipt not delivered" is a query rather than a log search, and retry with backoff. Whatever the
retry story, the store owner's order list should be able to show it. Use `logger` rather than
`console.error`; every other route in the file's neighbourhood already does.

**Done when:** a forced send failure leaves a row whose state says so, the store order list can filter
on it, and a retry that succeeds clears it.

---

## Step 5 — Model the platform seller (D102)

`orders.storeId` is `notNull` with **no foreign key**, and subscription orders are written with the
literal string `"platform"` — a store no seed creates. The leak is closed (Wave 5), but every
store-scoped read still assumes that column names a real store, and the audit trail in
`pin-interior` falls back to the same magic value.

Add a real `store-house`-style platform row, or an explicit `is_platform` flag, and stop writing a bare
literal. While there, reconcile the two comments in `entitlement.ts` that disagree about whether the
`owned` ledger is read — one says it is excluded because nothing reads it, the other says ownership is
tracked in it. The second is the one a future reader will believe.

**Done when:** no route writes a store id that does not exist as a row, and `entitlement.ts` states the
`owned` situation once.

---

## Two things not to do

**Do not add a guard and keep client pricing.** Authentication stops strangers; it does not stop a
logged-in buyer sending `totalCents: 1`. Server-side pricing is the fix, and a guard without it is the
appearance of one.

**Do not delete `resendToken`.** Unauthenticated re-send is a genuinely good feature — a buyer who lost
the email should not need an account. It needs bounds, not removal.

---

## After this

Phase 3 is closed and the commerce layer is trustworthy end to end. Next on
`handoff/DAYBOOK-FIX-PLAN.md`:

- **Phase 6, the Cricut criticals** (D41, D42) — a bordered sticker is cut as a rectangle and multi-part
  art has one component traced. This also unblocks the sticker help articles, which should not be
  written before it.
- **D109**, carried from Wave 6: give name dedup the same treatment versions got — a unique constraint
  behind it rather than a select-then-filter.
- **D110**, one query: confirm `planner_interior_versions_interior_version_uq` exists on the running
  database.
