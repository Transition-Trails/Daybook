---
name: Support matcher test isolation
description: How to keep support-article authorization tests stable against shared development data.
---

Support article matcher integration tests should assert the authorization contract: a verified member can query their own store scope, while an unauthenticated or cross-store request is rejected. Do not assert that a particular article ID appears in a ranked response.

**Why:** The matcher ranks a bounded candidate set from the shared development database. Existing records and test concurrency can legitimately change which matching articles occupy the returned result slots, even when store isolation is correct.

**How to apply:** Use 200/403 assertions for the own-store, unauthenticated, and cross-store scope paths. Test ranking or article content separately with an isolated dataset if that behavior needs coverage.