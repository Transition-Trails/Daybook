# Daybook — D110: confirm the interior version constraint

One question, then one fix if the answer is bad. This is the last unanswered item in the review, and it
cannot be answered from the repository — only the running database knows.

## Background

`planner_interior_versions` is meant to guarantee reproducible history: every version row is immutable and
an edition pins one. Wave 6 made `createInteriorVersion` allocate a version number inside a transaction
and **retry once on a unique-violation**, with a comment stating that the unique index is authoritative
and the retry is only ergonomics. That reasoning is correct — but only if the index exists.

The index is declared in `0016_planner_interiors.sql`, **the migration that created the table**. If `0016`
had already been applied before that line was added, the migration is recorded as run and the index was
never created. In that case the retry has nothing behind it and two concurrent saves can both claim the
same version number.

## What to do

**1. Check both databases** — development and production. Report the index names for that table:

```sql
SELECT i.relname AS index_name, ix.indisunique AS is_unique,
       array_agg(a.attname ORDER BY a.attname) AS columns
FROM pg_class t
JOIN pg_index ix   ON ix.indrelid = t.oid
JOIN pg_class i    ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'planner_interior_versions'
GROUP BY i.relname, ix.indisunique;
```

We need a **unique** index covering exactly `interior_id` and `version`. Match on the columns, not the
name — an equivalent constraint under a different name is fine; a same-named index on the wrong columns is
not.

**2. If it is present on both:** report that and stop. Nothing to fix.

**3. If it is missing on either**, first check for rows that would block it:

```sql
SELECT interior_id, version, count(*)
FROM planner_interior_versions
GROUP BY interior_id, version HAVING count(*) > 1;
```

Resolve any duplicates by renumbering the later row of each pair, then add the index in a **new numbered
migration** — do not edit `0016` again, because editing an applied migration only ever fixes fresh
installs:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "planner_interior_versions_interior_version_uq"
  ON "planner_interior_versions" ("interior_id", "version");
```

## Report back

- The index names and columns found on **each** database.
- Whether any duplicate `(interior_id, version)` pairs existed.
- Whether a new migration was added, and its number.

## While you are in there

Four more things only the live database can answer. Report each as present/absent — fix only if trivial:

1. Does `users` still have a `role` column? (Migration `0023` should have dropped it. If it is still
   there, `0023` has not been applied.)
2. Is `stores.owner_user_id` for `store-house` pointing at `user-platform-system`? That is a synthetic
   account that cannot sign in; it should be a real super admin.
3. Are there any rows in `orders` whose `store_id` does not match a row in `stores`?
4. How many rows in `checkout_intents` have `expires_at` in the past? They are never swept.
