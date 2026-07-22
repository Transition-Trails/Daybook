---
name: Daybook seed credentials
description: Default owner login created by the seed script and how to re-run it
---

## Owner credentials (dev)
- Email: `owner@daybook.app`
- Password: `daybook-owner-2025`
- Configurable via env vars: `OWNER_EMAIL` / `OWNER_PASSWORD`

## Re-seeding
```
pnpm --filter @workspace/scripts run seed
```
The seed is idempotent (`onConflictDoNothing`) for all entities except the owner user row — if the email already exists it silently skips.

**Why:** Future agents need this to test the admin console login without searching the seed file.
