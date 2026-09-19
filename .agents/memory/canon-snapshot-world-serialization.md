---
name: Canon snapshot world serialization
description: Why Canon image snapshot publication must lock before rebuilding a world's export
---

Canon image snapshot generation and manual backfills must serialize the complete read-build-publish-status sequence per world, across application instances.

**Why:** The central manifest and world asset set are rebuilt together. Serializing only the Git write allows a slow request to publish source state it read before a newer request, reverting newer same-path assets and manifest entries.

**How to apply:** Acquire the shared world-scoped publication lock before reading Canon records, hold it through the atomic Git update and snapshot-status persistence, and use the same lock for operational backfills.