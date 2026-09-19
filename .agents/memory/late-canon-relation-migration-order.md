---
name: Late Canon-relation migration order
description: Why the Canon-relation migration is intentionally ordered after later-numbered migrations in the tracked journal.
---

The Canon-relation metadata migration intentionally appears after the owner-discovery and story-scene migrations in the tracked journal. Keep the journal timestamps monotonic in that order; do not move it back based only on its numeric filename.

**Why:** Its original journal timestamp was accidentally swapped with the billing price migration timestamp. Existing databases therefore skipped it while applying the later migrations. Restoring the billing timestamp and placing the missing relation migration at the journal tail let the tracked migrator apply it safely and left a canonical ledger.

**How to apply:** When adding or auditing migrations, treat journal order and timestamps as authoritative. Preserve this late placement unless a dedicated, fail-closed ledger migration is designed for every existing database.