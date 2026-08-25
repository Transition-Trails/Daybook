# Daybook — Wave 11: the Google token lifecycle

Phase 8. The sync layer has a genuinely good design — one documented token entry point with typed
reasons, one `resolveToken` helper giving every route the same reconnect payload, a Google 403 for a
missing scope deliberately mapped onto that same state, and a calendar push that treats a 404 or 410 as
"deleted upstream" and recreates rather than erroring. That last case is easy to miss and it is handled.

**Every defect in this wave is in the token lifecycle**, which is a small, bounded area — and two of them
compound into the worst failure on the whole list that nobody would notice: **one transient Google blip
disconnects an account permanently, and then the server hammers Google on its behalf forever.**

Drive sync is a headline feature — "saves the PDF and your setup to Drive." It is currently one bad
minute away from being broken for a user, with no self-repair.

**Order matters.** Step 1 is one function and it stops both the false disconnect and the retry storm.
Everything after it is independent.

---

## Step 1 — Stop treating a bad minute as a revoked grant (D52 + D53)

**Two defects, one function, and they multiply.**

**D52 — any non-2xx is read as revocation.**

```ts
if (!tokenRes.ok) { await markGoogleDisconnected(…) }
```

A 500, a 502, a 429 — all of them wipe the stored access token and flip `googleDrive`,
`googleCalendar`, `googleTasks` and `googleDocs` to false. Only `invalid_grant` actually means the user
revoked access. The response body that would say which is read into `errText` and used solely for the
exception message. The user gets a reconnect banner, their sync stops, and **nothing repairs it when
Google recovers** — someone has to notice and re-consent.

**D53 — the disconnect does not stick, so it becomes a loop.** `markGoogleDisconnected` clears the access
token and the flags, and **leaves the refresh token in place**. Every later call therefore passes the
not-connected guard — which requires *both* tokens to be absent — finds no valid access token, and posts
the same revoked refresh token to Google again. That fails, marks the user disconnected again, and
throws. No backoff, no attempt counter, and no state distinguishing *never connected* from *refresh is
dead*. One revoked grant becomes one outbound token request per sync call, for as long as the account
exists. Google rate-limits and eventually blocks clients that do this, which makes one user's revoked
grant a platform-wide problem.

**The fix.**

1. **Parse the error body and branch.** Only `invalid_grant` disconnects. Retry 5xx and 429 with
   exponential backoff and **leave the connection flags alone while retrying** — a transient failure must
   not be visible to the user at all.
2. **Make the disconnect terminal.** Clear the refresh token too, and record `googleDisconnectedAt` and a
   reason. The not-connected guard then fires immediately, the state is legible in the database, and
   **nothing re-attempts a refresh until the user has been through consent again.**
3. **Clear the stale expiry.** `googleTokenExpiry` is left behind today, and it is what `/drive/status`
   reports.

**Done when:** a mocked 500 from the token endpoint leaves the connection intact and retries; a mocked
`invalid_grant` clears both tokens and stamps a timestamp; and after an `invalid_grant`, no further token
request is made until a fresh consent.

---

## Step 2 — Make the status endpoint tell the truth (D54)

`google-auth.ts` opens with an instruction: all code needing a Google token must call
`getValidGoogleToken` rather than reading `googleAccessToken` from the user record. Ten routes obey it.
`GET /drive/status` does not — it reads the raw column, computes its own expiry, and reports
`tokenExpired` straight from it.

So the one surface whose entire job is telling the user whether Google is working is the only surface
that does not know about refresh. It shows an expired token and a reconnect link for a connection that
would have refreshed itself silently on the next real request.

**The fix.** Call `getValidGoogleToken` in a `try` and report from the outcome. With step 1 done, the
answer becomes genuinely trustworthy: connected, in-retry, or disconnected-with-a-reason.

**While here:** it also reports `driveFolder` from `conn.driveFolderId`, a key **nothing in the codebase
ever writes**. It is always null, which is why every upload re-searches Drive for the folder. Persist the
resolved id after the first lookup — that removes an API round-trip per upload — or drop the field.

**Done when:** a user with an expired access token and a healthy refresh token shows as connected, and
`driveFolder` either holds a real id or no longer exists.

---

## Step 3 — Stop overwriting the whole connections blob (D55)

Every route stamps its timestamp by spreading `req.user.connections` — deserialised from the session at
the *start* of the request — and writing the whole object back:

```ts
stampSynced(user.id, user.connections, key)
```

The column is one JSONB blob holding four connection booleans and four last-synced strings, so each write
is a last-writer-wins overwrite of all eight fields with values read before any of the work happened. The
client loads calendar and tasks together, so two concurrent stamps routinely discard one of the two
timestamps.

Worse, and this is the part that matters after step 1: if a refresh fails mid-request and the disconnect
sets the flags to false, **a stamp from a request already in flight writes the stale `true` values back
over it** — the account reports connected while holding no token.

**The fix.** Update the single key with a `jsonb_set` rather than spreading a snapshot. Better, since we
are already in this file: split the four connection flags and the four timestamps into their own columns.
They are different things with different lifetimes and they should not share a cell.

**Done when:** two concurrent syncs both keep their timestamps, and a stamp cannot resurrect a
disconnected flag.

---

## Step 4 — Two unowned paths

**D51 — `POST /drive/art` writes an asset row for a file it never looks at.** The route sits in the Google
sync router, is named after Drive, and never speaks to Google. It takes a `driveFileId` from the body and
inserts into `assetsTable` with **no user id, no store id, and no check** that the file exists or that the
caller can see it. So any authenticated account can add arbitrary entries to the asset library pointing at
any Drive file id, including ids belonging to other people. When `canvaFileId` is sent instead, the id is
fabricated from `Date.now()`, so two imports in the same millisecond collide. It is also the only mutating
route in the router with **no `writeAudit` call**.

Decide whether this endpoint is still wanted. If it is: resolve a token, verify the file with a Drive
metadata call, record the owner, and audit it. If it is a leftover from the Canva import experiment,
**delete it** — Wave 7 already established that deleting an unowned write path beats fencing one.

**D59 — the Daybook folder lookup will find someone else's Daybook folder.** The Drive query filters on
name, type and trashed, and nothing else:

```
q: name='Daybook' and mimeType=folder and trashed=false
```

Drive resolves that against everything the token can see, **including folders shared with the user**. If
anyone has ever shared a folder called Daybook with this account and it sorts first, the planner PDFs,
config backups and generated docs are written into it. `pageSize` is 1, so there is no detection of the
ambiguity and no way for the user to find out where their files went. There is no race guard either: two
uploads starting together both find nothing and both create a folder.

**The fix.** Add `'me' in owners` and `'root' in parents` to the query, and persist the resolved folder id
on the user (which also closes the `driveFolderId` gap from step 2, fixes the duplicate-creation race, and
removes an API call from every upload).

**Done when:** a shared folder named Daybook is never selected, and the folder search runs once per user
rather than once per upload.

---

## Step 5 — Answer the calendar question (D61)

Recorded as unconfirmed, not a defect. The event body sends date-only values, which is how Google encodes
an all-day event; a timed event needs `dateTime` with a `timeZone`. The `Block` type the route accepts has
no time fields, and the mapping table stores `startDate`/`endDate` as plain text — so the path is
date-shaped end to end. That reads oddly against a product whose Today view is built on time blocks and
whose own copy offers to time-block your day.

**Read the client that calls it.** If blocks carry times, switch to `dateTime` with the user's time zone.
If they genuinely do not, say so in the route header — because the next reader will ask this same
question.

**Done when:** the answer is written in the code, either way.

---

## Step 6 — Three small debts, carried long enough

- **D109** — name dedup is advisory. `findSameStoreName` selects every row for the store and filters in
  JS, with no unique constraint behind it, so two concurrent creates still produce the duplicate it exists
  to prevent. Give it what interior versions got: a normalised-name column with a unique index per store,
  and let the insert conflict. The retry pattern in `createInteriorVersion` is the model.
- **D110** — one query. Confirm `planner_interior_versions_interior_version_uq` exists on the **running**
  database. It lives in `0016`, the migration that created the table, so if `0016` was applied before that
  line was added, production has no constraint and the retry logic has nothing authoritative behind it.
- **D122** — decide what a zero-priced edition means. `isPurchasableCatalogItem` accepts
  `digitalPriceCents: 0`, but Stripe will not create a payment-mode session below its minimum charge, so a
  free edition shows a buy affordance and then fails. Either give free items a claim path that skips
  Stripe, or treat zero as not purchasable and say so where the seller sets the price.

**Done when:** dedup is enforced by a constraint, the index question has a written answer, and zero has a
defined meaning.

---

## Two things not to do

**Do not add a retry to the current disconnect logic.** Retrying a call that also marks the user
disconnected multiplies the damage. Step 1's branch has to come first.

**Do not widen the Drive folder query to "search harder".** The bug is that it searches at all. Persist
the id and stop looking.

---

## After this

Remaining on `handoff/DAYBOOK-FIX-PLAN.md`:

- **Phase 7 — role model unification** (D40, D29, D83, D60). One piece of work that retires a class: two
  authorization ladders run side by side, and the page-level guards that fail *open* are the dangerous
  half.
- **Phase 9 — stop lying to the store owner** (D90, D91, D85, D86/D39, D92, D88).
- **Phase 10 — consolidation** (D63 → D65 → D64), the throughput multiplier.
- **D124** — cut one sheet of vinyl and prove the cut line, before the sticker help articles ship.
- **D118** — selling sticker packs, now that there is a delivery format.
