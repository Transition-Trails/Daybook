# Deployment runbook

## Database migrations

Run database migrations against the same database used by the deployment before
running the post-deploy smoke checks. The migration commands are idempotent and
safe to re-run.

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