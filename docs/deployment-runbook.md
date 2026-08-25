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

The tracked migration set also includes the WorldSmith production-package
schema, including the final-artwork fields on `worldsmith_runs`. A clean
deployment applies the complete tracked set before the API starts; do not
replace this with an ad-hoc `push` command. The production-package compatibility
script remains available for an older database that needs a one-off repair:

```bash
pnpm --filter @workspace/scripts run migrate-worldsmith-production-packages
```

### WorldSmith image-target policy

The image-generation service defaults to GPT Image 2 through the Replit AI
proxy. The normal provider-safe budget is 3,686,400 pixels, equivalent to
2560 × 1440; the experimental budget is 8,294,400 pixels, equivalent to
3840 × 2160. Both modes require dimensions divisible by 16 and an aspect ratio
between 1:3 and 3:1. A verified 1920 × 1920 request is accepted by the
GPT Image 2 proxy because it uses the same normal pixel budget as 2560 × 1440.

WorldSmith resolves each component's target from the managed print-size
catalog. Portrait and landscape records may have different physical
dimensions, and the selected target is recorded with the generation audit
metadata and prompt identity hash. Specification boards report the actual
pixel target and physical print reference rather than presenting a derived DPI
claim after capping.

### Startup and ledger recovery

Deployment startup verifies the tracked migration ledger before serving
requests. Known legacy ordering is normalized only when it matches the
documented safe sequence. Unknown, duplicated, missing, or reordered histories
are rejected without modifying the database. Damaged ledger tables or corrupted
ledger metadata also stop migration before any write.

When verification reports a damaged or unfamiliar ledger:

1. stop the deployment;
2. take a database backup;
3. run `pnpm --filter @workspace/db run verify-migration` to identify the
   failure;
4. repair or restore the ledger through the documented recovery process; and
5. rerun `pnpm --filter @workspace/db run migrate` followed by
   `pnpm --filter @workspace/db run verify-migration`.

Never insert, delete, reorder, or type-cast migration-ledger rows by hand.