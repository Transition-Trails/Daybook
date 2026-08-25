# Daybook — Wave 8: seller checkout

Wave 7 deleted the only route that could record a sale, which was right — a browser must never author
prices or delivery links. It also means **the storefront cannot take money today** (D113). This wave
builds the path properly, and it is the last thing standing between Daybook and its own store selling.

Both channel decisions depend on it. Etsy and Amazon KDP each hand us a buyer whose only proof of
purchase is an order row, and the redemption flow that turns those buyers into customers reads exactly
that row.

**Order matters.** Step 0 is a decision, not code, and everything else is shaped by it. Step 1 is cheap
and the order-writing path needs it to be right.

---

## Step 0 — Decide who is the merchant of record

**The question.** When a buyer pays a store for a planner, whose Stripe account receives the money?

**Platform-collected.** Daybook's account takes the payment and pays sellers out later. Simplest to
build, and the worst answer on every other axis: it makes *us* the merchant of record for every seller's
sales, which means our VAT and sales-tax obligation, our chargebacks, our refund liability, and our
problem when a seller disappears owing money. It also turns the deferred tax question into a blocking
one immediately.

**Stripe Connect — recommended.** Each store connects its own Stripe account. The seller is the merchant
of record, so tax, chargebacks and refunds are theirs; we create the checkout session on their behalf
and can take an application fee if we ever want one. Stores already pay a yearly subscription, so the
honest default is **no application fee** — they pay for the tool, they keep their revenue.

Connect also settles the question we deferred: **VAT stops being our exposure for seller sales.** It
remains ours for the subscription, which is a single product in a single account and much easier to
handle.

**What this costs.** Onboarding friction — a seller cannot sell until they finish Stripe onboarding — and
a new state to model: `stores.stripeAccountId`, plus whether onboarding is complete. `charges_enabled`
from the account object is the flag that matters; do not infer readiness from the id existing.

**Done when:** the decision is written down, and if Connect is chosen, a store row can hold an account id
and a readiness flag.

---

## Step 1 — Separate the platform seller from the house store

**The defect (D112).** Wave 7 satisfied the foreign key by pointing subscription orders at `store-house`.
But `store-house` is the platform's *shop* — `promote.ts` treats it as the source of promotable content
and super admins build products there. So `GET /store/store-house/orders` now returns subscription
revenue mixed into that shop's product sales, and any revenue figure for it sums two unrelated ledgers.
That gets worse the moment the house store sells anything through this wave's work.

There is also a straight collision. The migrations insert `store-house` as **"Daybook Platform"** with
slug `daybook-platform`, owned by a synthetic system user. `seed.ts` inserts the same id as **"Pixel
Perfect Plans"** with slug `pixel-perfect-plans`, owned by the real owner. Both use
`ON CONFLICT DO NOTHING`, and the seed's upsert only refreshes `defaultMode` and `subscriptionActive` —
so on a fresh install the migration wins and the storefront slug is not the one the seed intended.

**The fix.** A separate `store-platform` row for subscription revenue, in a new numbered migration, with
the existing billing orders moved onto it. Then make the seed and the migrations agree on exactly one
name, slug and owner for `store-house` — two files asserting different identities for one id is a bug
waiting for whichever runs first.

**Done when:** subscription orders carry a store id that is not the house store; `GET
/store/store-house/orders` returns only that shop's sales; and seeding a fresh database twice produces
the same store name and slug as a migrated existing one.

---

## Step 2 — Create the checkout session, priced server-side

**The rule Wave 7 established:** nothing about money or delivery is readable from the request.

The client sends **item ids and quantities only**. The server resolves each item from the catalog,
computes `priceCents` and the total, and builds the line items. There is no `totalCents` in the request
body, no `currency`, no `downloadLinks` — the same reason `POST /orders` was deleted.

```ts
// POST /store/:storeId/checkout   { items: [{ itemType, itemId, quantity }] }
```

Three checks before a session is created, in this order:

1. **`assertStoreScope`** if the caller is authenticated; a guest checkout is allowed (the schema permits
   a null `buyerUserId`) but must be rate limited.
2. **The store is ready to sell** — `charges_enabled`, not merely an account id present.
3. **`assertEntitled` per line item**, with the store's *real* entitlement context and no super-admin
   bypass. This is where Wave 7 step 2 belongs: it had no route left to put it in. A store whose
   subscription has lapsed must not be able to sell a licensed item, and an `owned` item belonging to
   another store must fail by name.

Put `metadata` on the session carrying `storeId` and the resolved line items, so the webhook can write
the order without trusting anything from the browser.

**Done when:** a tampered price produces a session at the catalog price; a lapsed store cannot sell a
licensed item and the error names it; and a store that has not finished Stripe onboarding gets a clear
"not ready to sell" response rather than a Stripe error.

---

## Step 3 — Write the order in the webhook, not the browser

**Reuse the shape that already works.** `recordSuccessfulPayment` is idempotent on Stripe identity,
handles the checkout-before-invoice ordering, and repairs on retry. Seller orders should follow it.

**One trap to avoid.** Do **not** route seller payments through `processSuccessfulPayment`. That function
sets `users.plan`, `planStatus` and `planCurrentPeriodEnd` — a product purchase must never grant a
subscription. Branch on the session's mode and metadata at the top of the webhook and keep the two paths
separate, sharing only the payment-ledger write.

**Done when:** a completed seller checkout produces exactly one order and one payment row, a redelivered
event produces no duplicates, and buying a planner never changes the buyer's `plan`.

---

## Step 4 — Generate download links at delivery, not at purchase

**The gap Wave 7 left.** `orders.downloadLinks` is a stored array of URLs, and the receipt email carries
them. Wave 7 gave the *resend token* a 48-hour expiry — but the links inside the email it sends do not
expire at all. So bounding the resend bounds nothing: whoever holds the email holds permanent access,
and forwarding it forwards the product.

**The fix.** Store item references, not URLs. Mint a **signed, expiring** link when the receipt is sent
and when the buyer downloads, scoped to the order. The stored row then says *what* was bought; the link
says *who may fetch it, until when*.

This also makes the annual-refresh offer possible later: entitlement decides what a buyer may generate,
and a link is issued on demand rather than baked into an email from two years ago.

**Done when:** no permanent object URL appears in an order row or a receipt email, and an expired link
returns a clear message with a way to request a new one.

---

## Step 5 — Make a lost receipt recoverable (D114)

48 hours is right for a capability token and wrong for the product — people re-download a planner next
January on a new iPad, and a marketplace buyer has no account until they redeem.

Add a **request-a-new-link** path keyed on the email address alone: rate limited, and revealing nothing
to someone who does not already control the inbox — the response is identical whether or not the address
has orders. Then count only *successful* sends against the lifetime cap; right now `resendCount`
increments on failures too, so a provider outage can quietly eat a buyer's allowance of fifty.

**Done when:** a buyer whose token expired can recover access without support, and a request for an
unknown address is indistinguishable from one for a known address.

---

## Three things not to do

**Do not build platform-collected payments as a shortcut.** Becoming merchant of record for every
seller's sales is a tax and liability decision disguised as an implementation detail, and it is very
hard to reverse once sellers have transacted.

**Do not let the browser send a price, a currency, a download URL, or a store id it is not scoped to.**
That is the whole reason the previous route no longer exists.

**Do not store durable download URLs to fix a delivery bug.** Every permanent link is a product given
away with the first forwarded email.

---

## After this

The commerce layer is complete and the storefront can sell. Then, from
`handoff/DAYBOOK-FIX-PLAN.md`:

- **Phase 6 — the Cricut criticals** (D41, D42): a bordered sticker is cut as a rectangle and multi-part
  artwork has one component traced. Also unblocks the sticker help articles, which should not be written
  before it.
- **D109** — give name dedup the constraint that versions got.
- **D110** — one query: confirm `planner_interior_versions_interior_version_uq` exists on the running
  database.
- **Redemption** — with orders trustworthy and links issued on demand, the Etsy/KDP claim path and the
  loyalty ledger become buildable.
