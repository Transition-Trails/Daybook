# Daybook — Wave 1: the billing criticals

Four defects in `artifacts/api-server/src/routes/billing.ts`, a 4 KB file. Each one independently
means a customer can pay and not get what they paid for, or get it without paying.

Nothing is live yet, which is the only reason this is a morning's work instead of a reconciliation
project. Do it before anything else in Daybook.

**Order matters.** Step 1 first — until the webhook can fail loudly, you cannot tell whether the other
three fixes worked.

---

## Step 1 — Stop the webhook lying to Stripe

**The defect.** The handler opens by checking its own configuration and answering 200:

```ts
router.post("/webhooks/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    res.sendStatus(200);          // ← "handled successfully"
    return;
  }
```

To Stripe a 2xx means the event was processed. It is marked complete and **never retried**. So if
`STRIPE_WEBHOOK_SECRET` is absent, misspelled, or belongs to a different Stripe environment, every
payment succeeds, no entitlement is granted, nothing is logged, and there is no queue of failures to
replay. You would find out from a customer, not from the system.

**The fix.**

```ts
if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
  logger.error(
    { hasWebhookSecret: !!webhookSecret, hasApiKey: !!process.env.STRIPE_SECRET_KEY },
    "Stripe webhook received but billing is not configured — returning 503 so Stripe retries",
  );
  res.status(503).json({ error: "Billing not configured" });
  return;
}
```

503 puts the event on Stripe's retry schedule, so fixing the secret recovers the backlog
automatically.

**Also fix the catch, in the same pass.** One `try` currently wraps both signature verification and
all the database work, and its `catch` returns 400. That is correct for a forged signature — Stripe
should not retry garbage — and wrong for a database error, because a 4xx stops the retry and drops
that customer's entitlement permanently. Split them:

```ts
let event;
try {
  event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
} catch (err) {
  logger.warn({ err }, "Stripe signature verification failed");
  res.status(400).json({ error: "Invalid signature" });   // do not retry
  return;
}

try {
  // … handle the event …
  res.sendStatus(200);
} catch (err) {
  logger.error({ err, eventId: event.id }, "Stripe webhook processing failed");
  res.status(500).json({ error: "Processing failed" });   // do retry
}
```

**Done when:** with `STRIPE_WEBHOOK_SECRET` unset, a webhook POST returns 503 and logs at error
level; with a bad signature it returns 400; and a forced database error returns 500.

---

## Step 2 — Two prices, and never a free one

**The defect.** One column feeds both checkout modes:

```ts
unit_amount: Math.round((planRow.oneTimePrice ?? 0) * 100),
...(isYearly ? { recurring: { interval: "year" } } : {}),
```

For lifetime that is right. For yearly it attaches the *one-time* figure to a recurring line item, so
a subscriber is charged the one-time price every year — a large overcharge or undercharge depending
on which number that column holds, with nothing in the code marking the ambiguity.

And `?? 0` does not fail safe. A plan row with a null price produces a valid Stripe session for
**$0.00**. The customer completes checkout, the webhook fires with real metadata, and full entitlement
is granted for nothing.

**The fix.** Add a recurring price to the plans table, select by mode, and refuse to build a session
without an amount:

```ts
const amount = isYearly ? planRow.yearlyPrice : planRow.oneTimePrice;
if (amount == null || amount <= 0) {
  logger.error({ plan, amount }, "Plan has no usable price for this mode");
  res.status(500).json({ error: "Plan is not purchasable — contact support" });
  return;
}
// … unit_amount: Math.round(amount * 100)
```

Migration: add `yearly_price` to `plans`, and backfill it deliberately rather than copying
`one_time_price` across — the whole point is that they are different numbers.

**Done when:** a plan with a null price for the requested mode returns 500 instead of a checkout URL,
and a test asserts the yearly and lifetime sessions carry different `unit_amount` values.

---

## Step 3 — Make renewals resolve the customer

**The defect.** The handler accepts two event types and reads `metadata.userId` from both. That
metadata is set on the Checkout Session. Stripe does **not** copy it onto the invoices generated for
later subscription cycles — an invoice carries its own metadata, which here is empty. So on every
renewal `userId` is `undefined`, the `if (userId && plan)` guard falls through, nothing is written, and
the handler returns 200. The branch that exists specifically to handle recurring payments cannot do
anything.

It is invisible today only because entitlement never expires (step 4). Fix step 4 without this one and
every renewing subscriber loses access.

**The fix.** Fall back to the Stripe customer id, which is already stored on the user row for exactly
this purpose:

```ts
let userRow;
if (meta.userId) {
  [userRow] = await db.select().from(usersTable).where(eq(usersTable.id, meta.userId));
} else if (session.customer) {
  [userRow] = await db.select().from(usersTable)
    .where(eq(usersTable.stripeCustomerId, session.customer as string));
}
if (!userRow) {
  logger.error({ eventId: event.id, customer: session.customer }, "Webhook could not resolve a user");
  res.status(500).json({ error: "Unresolved customer" });   // retry — do not silently drop
  return;
}
```

Note the failure mode change: an unresolvable customer is now a logged 500 rather than a silent
success.

**Done when:** an `invoice.payment_succeeded` event with empty metadata and a known `customer` updates
the right user, and one with neither returns 500.

---

## Step 4 — Give entitlement an end date

**The defect.** Access is a `plan` string plus an append-only `owned` array. There is no period end, no
renewal timestamp, and no handler for `customer.subscription.deleted`, `invoice.payment_failed`, or
`charge.refunded` — the webhook listens for two success events and nothing else. So a subscriber who
cancels, lets a card lapse, or charges back keeps `plan: "yearly"` forever. **Nothing in the system
can downgrade anyone.** The recurring product is functionally a one-time sale.

**The fix, in three parts.**

1. **Schema.** Add `plan_current_period_end timestamptz` and `plan_status text` to `users`. Follow the
   existing `lib/db/drizzle/` numbered-migration convention — note the repo runs *two* migration
   systems (`scripts/src/migrate-*.ts` and `lib/db/drizzle/*.sql`); use the Drizzle one, it is where
   the recent work landed.

2. **Write the period end** from `session.subscription` / the invoice's `lines.data[0].period.end` on
   every successful event.

3. **Handle the negative events:**

```ts
case "customer.subscription.deleted":
case "invoice.payment_failed":
  // set plan_status; do NOT strip `owned` — a lifetime purchase in that array stays valid
```

**Keep `owned` append-only.** It legitimately records one-time purchases that never expire. Expiry
belongs on the subscription fields, and the entitlement read should be *"lifetime id in `owned`, OR an
active plan whose period has not ended."*

**Done when:** a subscription-deleted event marks the plan inactive, an entitlement check honours
`plan_current_period_end`, and a lifetime purchase is unaffected by both.

---

## Two things not to do

**Do not strip `owned` on cancellation.** It holds permanent purchases as well as the plan id. Removing
entries there would revoke things the customer genuinely bought.

**Do not add webhook event-id deduplication as part of this.** Stripe can redeliver, but the current
grant is already idempotent (`if (!owned.includes(plan)) owned.push(plan)`), and step 4 changes the
shape of what gets written. Revisit dedup once the new fields exist — it is a real concern, just not
this pass's.

---

## After this

The rest of pass 3 is still unread — `orders.ts`, entitlement, `shop.ts`, `stores.ts`. Two findings
from this pass are waiting on that reading rather than on a fix:

- **D29** — `isPublicCaller` grants admin catalog visibility on `user.role === "staff"`, a field
  `roles.ts` does not define. Decide whether that column is live or dead before changing the branch.
- **D31** — `resolveStoreActor` attaches a caller-supplied `storeId` without enforcing membership.
  Enumerate its call sites and confirm none scope data by `req.actor.storeId` unguarded.
