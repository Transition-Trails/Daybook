---
name: Postgres lock-chain tests
description: How to observe blocked concurrent database requests in this environment.
---

In database-backed concurrency tests, identify waiters through `pg_blocking_pids` chains rooted at the test's held lock. A second waiter may queue behind the first rather than directly behind the holder. Do not identify waiting statements by filtering `pg_stat_activity.query`.

**Why:** In this environment, `pg_stat_activity.query` was empty for the waiting request connections despite visible `Lock` events and blocker PIDs; query-text filtering falsely reported zero waiters.

**How to apply:** Hold the target row lock on a dedicated connection, start both requests, poll for a two-waiter chain rooted at the holder's backend PID, then release the lock in a `finally` block before checking the outcomes.