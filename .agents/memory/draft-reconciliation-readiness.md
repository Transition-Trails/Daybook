---
name: Draft reconciliation readiness
description: Prevent transiently missing query inputs from erasing cached operator drafts during route remounts.
---

When operator drafts survive route remounts in a session cache, reconcile them only after every authoritative server query needed to build the rows has loaded.

**Why:** A cached response for one query can arrive before a companion query. Treating the missing query as an empty list can reconcile the draft cache to empty and permanently discard unsaved work.

**How to apply:** Gate reconciliation on the actual query data being present rather than defaulted empty arrays. Keep hard browser reload behavior separate from in-session route/refetch persistence.