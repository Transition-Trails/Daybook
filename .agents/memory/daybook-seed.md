---
name: Daybook seed script
description: How to repopulate the Daybook database with canonical seed data
---

# Daybook seed script

## Rule
To repopulate the database, run:
```
pnpm --filter @workspace/scripts run seed
```

This seeds 6 themes (t1-t6), 3 packs (p1-p3), 6 inserts (i1-i6), 4 products (r1-r4), 4 editions (e1-e4), 2 plans (yearly/lifetime), and an owner user.

**Why:** Seed data matches `spec/seed-data.json` exactly. Staff/owner login credentials are stored in environment secrets and in the app's users table — never in memory files.

**How to apply:** After any schema wipe (`push --force`), run seed again. Uses `onConflictDoNothing` so safe to run multiple times.
