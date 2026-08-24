# Deployment runbook

## Database migrations

Run the tracked database migrations against the same database used by the
deployment before running the post-deploy smoke checks. This command is
non-interactive, applies only checked-in migration files, and records applied
migrations in Drizzle's migration table. It does not inspect or modify unrelated
schema differences. Databases created with the previous schema-push workflow
are automatically baselined against the known consolidated schema before later
migrations are applied, but only after a complete table, column, constraint,
and index fingerprint matches that consolidated schema. If a prior schema push
already applied one of the checked-in additions, its matching migration history
is recorded before Drizzle runs so it is not applied twice.

```bash
pnpm --filter @workspace/db run migrate
```

Then run any required one-off data or legacy migrations. Those commands are
idempotent and safe to re-run.

### Recovering a partial pre-ledger database

If the command reports that it cannot safely baseline a partial pre-ledger
schema, stop there: do not run `push`, `push-force`, or add rows directly to
Drizzle's migration table. Take a backup, then restore or repair the database
until it matches the consolidated `0000` schema, and run `migrate` again. If a
complete legacy schema cannot be recovered, apply the tracked migrations to a
clean database before restoring its application data through an audited
recovery process.

### Recovering the known older ledger order

Older shared development databases can contain the complete tracked migration
history in the historical order that migrations were introduced, rather than
the checked-in journal order. Run the normal command below before retrying a
deployment check:

```bash
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/db run verify-migration
```

The preparation step recognizes only that exact historical sequence (plus a
contiguous current suffix) and normalizes it transactionally. It does not
accept an unknown, duplicate, missing, or otherwise reordered ledger; the
strict verifier continues to reject those histories. Do not insert, delete, or
reorder migration-ledger rows by hand. If the normal command does not report
that it normalized the known order, use the partial-database recovery process
above instead.

For the edition catalog's world filter and WorldSmith's current schema, run:

```bash
pnpm --filter @workspace/scripts run migrate-edition-world
pnpm --filter @workspace/scripts run migrate-worldsmith
```

This executes the checked-in `scripts/migrate-edition-world.mjs` entry and
ensures `editions.world` exists before the API serves `GET /editions` requests.
The WorldSmith migration is also idempotent and creates its required tables plus
the `worldsmith_worlds.cover_image_url` column before world list/select queries
can read it on an existing deployment.