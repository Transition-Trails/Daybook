---
name: Tracked migration baseline
description: How Daybook transitions pre-ledger databases to non-interactive tracked migrations.
---

Use the tracked database migration command for schema updates; do not use schema
push as the normal update path. Databases created before the migration ledger
are baselined only after they match the known consolidated base schema. Any
tracked changes already present from an earlier schema push are recorded first;
remaining tracked migrations then run normally.

Record only a contiguous migration prefix when relying on Drizzle to replay
missing history. Drizzle advances from the latest recorded migration timestamp,
so a later recorded entry causes older missing entries to be skipped. A known
legacy gap therefore needs a later idempotent repair migration that restores
every skipped dependency; unknown gaps must remain blocked by the fingerprint.

**Why:** Schema push evaluates every current schema difference and can block a
safe catalog update interactively. Existing Daybook databases predate Drizzle's
ledger, so attempting the consolidated base migration again would recreate
tables that already exist.

**How to apply:** Add each new schema update as a checked-in Drizzle migration
and run the workspace database migration command in development, CI, and
deployment. Preserve the legacy fingerprint check when changing the
consolidated base migration or its replacement. Before recording an existing
legacy migration, confirm that it cannot cause earlier unapplied migrations to
be skipped.

When a checked-in migration must be corrected after it has reached shared
development, the preparation step may repair only its exact old checksum after
verifying the complete post-migration contract, then replace the ledger hash
with the revised journal hash.

**Why:** Editing a historical SQL migration otherwise makes a healthy
long-lived database appear drifted, while blindly accepting a prior checksum
could conceal a partial or unrelated schema state.

**How to apply:** Keep each checksum repair opt-in, narrowly keyed to one known
old hash and migration timestamp, and prove every relevant table, column, and
data-normalization invariant before rewriting the ledger row. Never use this
mechanism as a general drift bypass.

The legacy WorldSmith baseline can lack the final-art run audit fields even
when the application schema expects them. The tracked production-package repair
migration now adds those fields and its table/indexes automatically; its
idempotent SQL also safely covers databases that still use the standalone repair
script.

**Why:** `worldsmith_runs.generated_filename` and `notion_upload_id` were
introduced outside the old consolidated baseline; a missing field blocks even
dry-run compilation before the artwork workflow can be tested. Keeping the
repair in the ledger prevents fresh environments from depending on a manual
script.

**How to apply:** Treat the migration as a required additive schema repair for
legacy development databases, and run the database migration command twice when
diagnosing drift to confirm its idempotency. Keep the standalone script only as
a compatibility fallback for environments that cannot yet use the tracked
ledger.

The migration preparation step classifies every existing tracked ledger before
it creates baseline records or reaches Drizzle. The known older
shared-development order is normalized only there, not accepted by the
verifier. Its historical seven-row core is matched exactly; any later rows must
form a contiguous journal suffix. Unknown, duplicate, missing, and differently
ordered rows must abort preparation before schema changes.

**Why:** Drizzle uses the ledger's row sequence for deployment verification,
while long-lived development environments recorded several existing migrations
in their historical introduction order. Automatically repairing only that
provable sequence restores trustworthy deployment checks without allowing a
corrupt ledger to apply new schema changes before it is diagnosed.

**How to apply:** Keep the recognition sequence narrowly scoped when adding
migrations, and let new migrations extend only the canonical suffix. Recovery
is diagnosis and restoration to the checked-in journal order, followed by the
normal `@workspace/db migrate` command and verification; never prescribe
hand-editing the Drizzle ledger.

Planner interiors may already be physically present in a legacy shared
development database while their tracked migration row is absent. The
preparation step may record that migration only after it verifies the complete
contract: both tables, every required column and foreign key, all indexes, and
the immutable-version trigger. Any partial state must remain blocked.

**Why:** Replaying a non-idempotent historical migration against an existing
interior schema fails, while inserting a ledger row based on a table-name check
could hide missing ownership or immutability guarantees.

**How to apply:** Keep this recognition path specific to the exact historic
contract. For new migrations, add normal checked-in SQL and let Drizzle apply
it; do not broaden the recovery to infer partially applied work.

WorldSmith schema additions must be recorded in the Drizzle ledger and deployed
through `@workspace/db migrate`; standalone WorldSmith scripts are compatibility
repairs, not deployment prerequisites. The migration verifier checks the full
API-facing WorldSmith column contract on a clean database.

**Why:** CI sequencing separate editorial scripts let a deployment pass its
tracked migration step while starting the API without newer editorial fields.

**How to apply:** Add future WorldSmith DDL to a checked-in tracked migration
and expand the contract verifier in the same change. Do not add a new required
WorldSmith script to the deployment workflow.