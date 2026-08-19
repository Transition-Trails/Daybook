# Deployment runbook

## Database migrations

Run database migrations against the same database used by the deployment before
running the post-deploy smoke checks. The migration commands are idempotent and
safe to re-run.

For the edition catalog's world filter, run:

```bash
pnpm --filter @workspace/scripts run migrate-edition-world
```

This executes the checked-in `scripts/migrate-edition-world.mjs` entry and
ensures `editions.world` exists before the API serves `GET /editions` requests.