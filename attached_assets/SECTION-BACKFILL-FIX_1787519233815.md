# Worldsmith — one-line correction to the section backfill

The step 19 follow-up landed correctly. One defect remains, and it came from my instructions rather
than the implementation — the guard I specified does not do what I claimed it did.

## The problem

In `scripts/src/worldsmith-editorial-migration.mjs`, the backfill runs on **every** Editorial
migration run:

```js
await client.query(`
  UPDATE ws_prompt_modules
  SET section = CASE
    WHEN LOWER(name) LIKE '%style%' OR LOWER(name) LIKE '%aesthetic%' THEN 'style'
    WHEN LOWER(name) LIKE '%world%' THEN 'world'
    ELSE 'general'
  END
  WHERE section = 'general';
`);
```

I said `WHERE section = 'general'` made this safe to re-run. It does not. `'general'` is both the
column default **and** a legitimate value an author can choose. So an author who deliberately sets a
module named "World Materials" to `general` — because it should not be routed into the world section —
gets it silently flipped back to `world` on the next migration run.

The guard cannot tell "never set" from "set to general on purpose", which is exactly the distinction
it needs to make.

## The fix

Run the backfill only in the same pass that creates the column — it is a one-time data repair, not a
recurring reconciliation:

```js
const sectionColumn = await client.query(`
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = $1
    AND table_name = 'ws_prompt_modules'
    AND column_name = 'section'
`, [schema]);

if (sectionColumn.rowCount === 0) {
  await client.query(`
    ALTER TABLE ws_prompt_modules
    ADD COLUMN section TEXT NOT NULL DEFAULT 'general'
    CHECK (section IN ('world', 'style', 'general'));
  `);

  // One-time repair of pre-existing rows, in the same pass that adds the column.
  // Reproduces legacyPromptModuleSection() so no prompt changes on upgrade.
  // Deliberately NOT re-run: 'general' is a valid author choice, not only a default.
  await client.query(`
    UPDATE ws_prompt_modules
    SET section = CASE
      WHEN LOWER(name) LIKE '%style%' OR LOWER(name) LIKE '%aesthetic%' THEN 'style'
      WHEN LOWER(name) LIKE '%world%' THEN 'world'
      ELSE 'general'
    END;
  `);
}
```

Two notes:

- Drop the `WHERE section = 'general'` clause once the `UPDATE` is inside the block — every row is new
  to the column at that point, so the guard is redundant and its presence implies a re-run safety it
  does not provide.
- The `CHECK` constraint on the `ALTER` should match the one in the `CREATE TABLE` above it. It
  currently does — keep them in step if either changes.

**Done when:** setting a module named "World Materials" to `general`, then running the Editorial
migration twice, leaves it as `general`.

## While you are in the file

The existing migration test covers the backfill's correctness. Add one case for this: set a
`world`-named module to `general`, run the migration, assert it is still `general`.
