# Daybook — Wave 12: one authorization ladder

Phase 7, and the last structural defect in the platform. The server currently runs **two authorization
models side by side**, and which one a route obeys depends on which import its author happened to reach
for.

- `users.platformRole` — the real model. `super_admin`.
- `store_members.role` — the real per-store model. `store_owner`, `store_staff`, `support`.
- `users.role` — undocumented legacy. Holds `owner` and `staff`, and **`roles.ts` knows neither value.**

The consequence is not theoretical: a legacy `owner` passes `requireOwner` and `requireStaff` but fails
`requireSuperAdmin`, while a real super admin with no legacy role **fails both legacy guards**.

**Read this before planning the work.** `users.role` is not merely consulted by stray guards — it gates
authentication. `seed.ts` sets `role: "owner"` and `role: "staff"` with a comment saying it does so *"so
the /api/auth/staff/login endpoint accepts them"*. **Delete the column first and you lock every staff
user out.** That single fact sets the order of this wave.

---

## Step 0 — Write the inventory before changing anything

Two lists, both short, both worth having in the PR description:

1. **Every reader of `users.role`.** Grep for `user.role`, `usersTable.role`, `role: "owner"`,
   `role: "staff"`, and `platformRole`. `auth-middleware.ts` exports `requireStaff`, `requireOwner` and
   `isAdmin` on it; `isPublicCaller` consults it (D29); `seed.ts` writes it; the staff login route reads
   it; `google-sync.ts` reports it as `actorRole` (D60).
2. **Every page-level role comparison in the admin client.** Grep `role ===` and `role !==`. The three
   known ones disagree with each other (step 1).

**Done when:** both lists exist and every entry is marked *port*, *delete*, or *keep*.

---

## Step 1 — Close the fail-open page guards (D83)

Independent of everything else, and the most dangerous item here. Three pages decide the same question
three ways:

```ts
// StoreHelp.tsx — allowlist. Fails CLOSED. Correct.
const canWrite = role === "store_owner" || role === "store_staff" || role === "super_admin";

// ShopCatalog.tsx — denylist. Fails OPEN.
const isReadOnly = role === "support";

// Dashboard.tsx — denylist. Fails OPEN.
members.filter((m) => m.role !== "customer")
```

The denylists grant write access to **every role that is not literally the one named** — including any
role added next year, and including a typo. That is the bug; the allowlist is the pattern.

**The fix.** One shared helper, allowlist-only, used by every page:

```ts
// lib/permissions.ts
export function canWrite(role: string | undefined): boolean;
export function canPublish(role: string | undefined): boolean;
export function isStaffRole(role: string | undefined): boolean;
```

Then replace all three call sites and anything else step 0 found. An unrecognised role must get nothing.

**Done when:** no admin page compares a role with `!==`, an unknown role string grants no write access
anywhere, and a test asserts that for a made-up role name.

---

## Step 2 — Move staff login off the legacy column

**This is the gate.** Until it lands, nothing else can remove `users.role`.

The staff login route accepts a user because `role` is `owner` or `staff`. But the real question it is
trying to ask is *"is this person staff of any store?"* — and `store_members` already answers it exactly,
with a better answer, because it also says *which* store and *what* role.

**The fix.** Authenticate the credential, then authorise on membership: the login succeeds if the user has
any `store_members` row, or `platformRole = 'super_admin'`. Return the membership list the client already
needs for store selection.

**Watch the seeded accounts.** `seed.ts` creates store owners and staff with `role` set for this exact
reason, and its comment says so. Once login reads membership, drop `role` from those inserts in the same
change — and confirm the seeded users do have `store_members` rows. They do today, but verify rather than
assume.

**Done when:** a user with a `store_members` row and no `users.role` can sign in; a user with `role` set
but no membership cannot; and the seed no longer writes `role`.

---

## Step 3 — Delete the second ladder (D40, D29)

`auth-middleware.ts` exports three guards built entirely on the legacy field:

```ts
requireStaff   // admits "staff" and "owner"
requireOwner   // admits "owner"
isAdmin        // reads user.role
```

Port every caller:

- A route that means *platform authority* → `requireSuperAdmin`.
- A route that means *authority within a store* → `requireStoreAccess` / `assertStoreScope`. Note that
  `assertStoreScope` works precisely because it also requires `actor.storeRole` — that is the property
  that makes it the safest thing in the commerce layer, so do not loosen it to fit an awkward caller.
- **`isPublicCaller` (D29)** — consulting a role field to decide *publicness* is the wrong question
  entirely. It should ask whether the request is authenticated and scoped, not what the user's legacy
  label is.

Then **delete all three guards.** A deprecated-but-exported guard is the same bug with a comment on it —
the same argument that applied to `hexToRgba` in Wave 6.

**Done when:** `auth-middleware.ts` exports no role-based guard, nothing imports the deleted three, and
`isPublicCaller` no longer reads a role.

---

## Step 4 — Drop the column

Only after steps 2 and 3. A new numbered migration:

```sql
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
```

Search the whole repo once more first — including tests and the admin client — because a column drop
fails loudly at runtime and quietly in a type check if anything still selects `*`.

**Done when:** the column is gone, the suite is green, and staff login still works on a migrated database.

---

## Step 5 — Give audit rows a real actor and a real scope (D60)

Six routes in `google-sync.ts` write audit rows, and all six hardcode:

```ts
{ scope: "platform", actorRole: user.role }
```

So a store customer pushing their own planner blocks to their own calendar is recorded in the same scope
as a super admin editing the platform catalog — with no store id on the row and no way to filter them out.
And `actorRole` is the legacy column, which after step 4 will not exist.

**The fix.** Scope these rows to the user's store where one exists, and take `actorRole` from the RBAC
model — `platformRole` or the `store_members` role, whichever applies. The router is mounted under
`/sync` behind `requireAuth` and every query scopes by user id, which is correct for personal data; the
gap is only that the audit log cannot say which store the person belonged to.

**Done when:** a sync action by a store member records that store's id, and no audit row carries a role
string that no longer exists.

---

## Step 6 — Two debts, ten minutes, stop carrying them

**D110.** One query against the **running** database:

```sql
SELECT 1 FROM pg_indexes WHERE indexname = 'planner_interior_versions_interior_version_uq';
```

The index lives in `0016`, the migration that created the table. If `0016` was applied before that line
was added, production has no constraint and Wave 6's retry logic has nothing authoritative behind it.
This has now been carried through three waves. If it is missing, add it in a **new** migration — never by
editing `0016` again. Write the answer down either way.

**D122.** Decide what a zero-priced edition means. `isPurchasableCatalogItem` accepts
`digitalPriceCents: 0` and its own test asserts that, but Stripe will not create a payment-mode session
below its minimum charge — so a free edition shows a buy affordance and then fails with the generic 502
that Wave 9 was written to eliminate. Either treat zero as not purchasable and say so where the seller
sets the price, or give free items a claim path that skips Stripe and writes the order directly. A free
planner is a plausible lead magnet; it deserves a real path, not a broken checkout.

**Done when:** the index question has a written answer, and zero has a defined meaning.

---

## Three things not to do

**Do not drop `users.role` before step 2.** It gates staff login. This is the one ordering mistake in this
wave that locks people out of production.

**Do not add a fourth role concept.** There are already three and one is being removed. Anything that
looks like it needs a new one is a question about `store_members.role`.

**Do not keep the legacy guards as deprecated exports.** If they exist, a future route will import one,
and the coin flip continues.

---

## After this

The platform has one authorization model. Remaining on `handoff/DAYBOOK-FIX-PLAN.md`:

- **Phase 9 — stop lying to the store owner** (D90, D91, D85, D86/D39, D92, D88): a priced empty pack, a
  junk price that becomes $0.00, a dashboard tile that counts the wrong thing, an owner who cannot see
  their own licence state, and a Publish button that greys out without saying why.
- **Phase 10 — consolidation** (D63 → D65 → D64), the throughput multiplier: three implementations per
  studio is why a fix applied once stays live in two other paths.
- **D124** — cut one sheet of vinyl and prove the cut line, before the sticker help articles ship.
- **D118** — selling sticker packs, now that a delivery format exists.
- **Help pass B** — `PlannerStudio.tsx`, the edition/storefront screens, and `StaffRoles.tsx` (which
  article 9 was written from three pages' guards rather than the page that assigns them — and step 1 above
  changes those guards, so write it after this wave).
