---
name: Tracked migration baseline
description: How Daybook transitions pre-ledger databases to non-interactive tracked migrations.
---

Use the tracked database migration command for schema updates; do not use schema
push as the normal update path. Databases created before the migration ledger
are baselined only after they match the known consolidated base schema. Any
tracked changes already present from an earlier schema push are recorded first;
remaining tracked migrations then run normally.

**Why:** Schema push evaluates every current schema difference and can block a
safe catalog update interactively. Existing Daybook databases predate Drizzle's
ledger, so attempting the consolidated base migration again would recreate
tables that already exist.

**How to apply:** Add each new schema update as a checked-in Drizzle migration
and run the workspace database migration command in development, CI, and
deployment. Preserve the legacy fingerprint check when changing the
consolidated base migration or its replacement.