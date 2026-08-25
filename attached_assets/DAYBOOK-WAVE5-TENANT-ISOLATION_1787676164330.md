# Daybook — Wave 5: tenant isolation

Wave 3 closed the sellability blockers and delivered the payments ledger. This wave is the other half of
being able to trade: **right now one store can read another store's customers, and a store owner can
switch their own licence back on.**

Wave 3 raised the stakes on the first of those without changing it. Subscription payments are now
recorded as orders under `storeId: "platform"`, so the same broken guard that leaks a seller's buyers
also leaks the platform's own subscriber list.

**Step 0 first, and it is a five-minute check** — its answer changes what step 1 means.

---

## Step 0 — Find out whether platform orders are being written at all

**The question.** `recordSuccessfulPayment` inserts into `ordersTable` with a literal store id:

```ts
storeId: "platform",
```

No seed creates a store with that id. So either:

- **`orders.storeId` has a foreign key to `stores`** → every insert throws, the webhook returns 500,
  Stripe retries forever, and **no payment has ever been recorded.** This would be silent until someone
  subscribes, and it would look like a webhook problem rather than a schema one.
- **It does not** → the rows land, and step 1 becomes urgent for a second reason: `GET
  /store/platform/orders` is reachable.

**What to do.** Check the column definition in `lib/db/src/schema/orders.ts`. Report which it is before
starting step 1. If there is an FK, add a real platform store row in the seed — not a nullable
`storeId`, because every read path assumes it is present.

**Done when:** you can state, from the schema, whether a subscription payment currently produces an
order row — and a test covers it either way.

---

## Step 1 — Fix the store-scope guard that cannot fire

**The defect (D32).** `GET /store/:storeId/orders` guards like this:

```ts
if (!actor.isSuperAdmin && actor.storeId !== storeId) { … }
```

`actor.storeId` was built by `buildActor` **from `req.params.storeId`** — the same path segment the
handler is comparing it against. The two are the same string by construction, so the condition can
never be true and the guard cannot fire. `storeRole` is resolved on the line above and then never
consulted.

Any authenticated account — a member of no store at all — can walk store ids and read every buyer
email, buyer name, line item, order total, download link and resend token in the platform. With Wave 3's
change, `platform` is now one of those ids, and it holds your subscriber list.

**The fix.** The correct helper already exists and `stores.ts` calls it on all twelve of its routes:

```ts
if (!assertStoreScope(actor, storeId, res)) return;
```

It works precisely because it also requires `actor.storeRole` to be set, which the hand-rolled
comparison does not.

**Then find the rest.** Grep for the shape, not the symptom:

```
actor.storeId !== req.params.storeId
actor.storeId !== storeId
```

Any comparison between a value derived from a path parameter and that same path parameter is a
tautology, not a guard. Enumerate every `resolveStoreActor` call site and confirm none scopes data by
`actor.storeId` without a membership check.

**Done when:** a logged-in user who is not a member of store X gets 403 from
`/store/X/orders`; a `store_staff` member of X gets 200; `/store/platform/orders` is reachable only by a
super admin; and a test covers all three.

---

## Step 2 — Turn the store PATCH blocklist into an allowlist

**The defect (D33).** `PATCH /stores/:storeId` protects sensitive fields by deleting them for
non-super-admins, then writing whatever is left:

```ts
delete body.status;
delete body.ownerUserId;
delete body.plan;
// … then .set(body)
```

`subscriptionActive` is not on that list. It is the licence gate — the single boolean deciding whether
every licensed-origin item stays usable — and this same file gives it a dedicated
`PATCH /stores/:storeId/entitlement` route behind `requireSuperAdmin` two hundred lines below. So a
store owner whose subscription has lapsed can `PATCH` their own store with
`{ subscriptionActive: true }` and restore the entire licensed catalog to their storefront and their
generation path.

`slug`, `domain`, `defaultMode` and `createdAt` are equally settable, so a store can also take another
store's intended slug or rewrite its own creation date.

**The fix.** Name what an owner may change, and reject the rest:

```ts
const OWNER_EDITABLE = ["name", "domain", "defaultMode"] as const;
```

Build the update from that list only. **Reject unknown keys with a 400** rather than silently dropping
them — a settings screen that appears to save a field it ignored is worse than an error.

**Done when:** an owner PATCHing `subscriptionActive`, `plan`, `status`, `slug` or `ownerUserId` gets
400 and the row is unchanged; a super admin can still set entitlement through its own route; and
`name`/`domain`/`defaultMode` still work.

---

## Step 3 — Scope the help list on the server

**The defect (D81).** `StoreHelp.tsx` fetches the whole table and sorts it in the browser:

```ts
const { data: articles = [] } = useQuery({ queryFn: () => helpApi.list() });
const platformArticles = articles.filter((a) => a.scope === "platform");
const storeArticles    = articles.filter((a) => a.scope === storeId);
```

So the response body carries every article belonging to every store, **including unpublished drafts**,
and the browser discards the ones it doesn't display. Any store owner can read a competitor's draft help
content from the network tab.

**The fix.** The correct pattern is in the sibling file — `HelpCenter.tsx` passes
`{ scope: "platform" }` and the server filters. Give the store page the same treatment: a scope
argument that returns platform articles plus this store's, and have the **server** enforce that a caller
can only ask for a store they belong to. Client-side filtering is presentation, never authorization.

**While you are in these two files:** they contain two copies of the same `makeId` and two near-identical
article forms. Extract both. The duplication is how the store form ends up missing a fix the platform
form gets (D82's other half).

**Done when:** the `/help` response for a store contains only platform and own-store rows, requesting
another store's scope returns 403, and no draft belonging to another store appears in any payload.

---

## Step 4 — Bound the refund fallback

**The defect (D96).** `recordLifecyclePaymentEvent` tries Stripe identities narrowest-first, which is
right, and the comment explains exactly why. The last branch is the problem:

```ts
correlation.subscriptionId ? eq(paymentsTable.stripeSubscriptionId, correlation.subscriptionId) : undefined
```

No user filter, no limit. A refund arriving with neither a payment intent nor an invoice therefore sets
**every historical payment row for that subscription** to `refunded` in one statement. A customer in
year three has all three renewals rewritten by a refund of one.

**The fix.** Either bound the fallback to the most recent payment for that subscription, or decline to
annotate anything when the narrow identities are absent and log it for a human. An unattributed refund
is better logged than mis-attributed.

**Done when:** a refund carrying only a subscription id annotates at most one payment row, and a test
with three renewal payments proves the other two are untouched.

---

## Step 5 — The two small things Wave 3 left behind

**D98 — the boot check.** The Wave 3 brief asked for it and it was skipped. `lib/stripe-price.ts` says
in its own header that it exists so "startup diagnostics, public catalog visibility, and checkout all
agree on what sellable means" — two of those three callers were built. Add the third: at server start,
count plans with a configured price id and `logger.error` when it is zero. A misconfigured deploy should
announce itself in the first ten lines of the log, not in a support ticket.

**D97 — is `owned` read by anything?** `UserPlanEntitlement` declares `owned?: string[] | null` and
`hasUserPlanEntitlement` never consults it. Grep the server for readers. If there are none, per-item
entitlement is unenforced and the ledger is write-only — say so, and either wire it into an item-level
check or drop it from the interface. A contract that implies a rule nobody applies is worse than no
contract.

**Done when:** an unset `STRIPE_YEARLY_PRICE_ID` produces an error line at boot, and the `owned`
question has a written answer.

---

## Three things not to do

**Do not fix the leak in the client.** D81's shape is that authorization was done where the user can
see it. Filtering harder in the browser is not a fix.

**Do not make `orders.storeId` nullable** to accommodate the platform pseudo-store. Every read path
assumes it is present; a real row is cheaper than auditing them all.

**Do not widen `assertStoreScope`.** It is the safest thing in the commerce layer *because* it requires
`actor.storeRole`. If a route seems to need a looser version, that route is the thing to change.

---

## After this

Phase 3 of `handoff/DAYBOOK-FIX-PLAN.md` is next: **D34** — `POST /orders` is unauthenticated, takes
its prices from the request body, and mails caller-supplied download links from the store's sender.
Wave 3's webhook now writes orders directly, which strengthens the case for deleting the public route
outright rather than guarding it.

Then **Phase 4**, which is the one to protect: five shared helpers that the Wave 4 planner-geometry
build all depend on. Writing them before Wave 4 is the difference between that build inheriting
correctness and copying a known bug a sixth time.
