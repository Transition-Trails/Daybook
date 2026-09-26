---
name: Sequence search revisions
description: Keep paged chronology reads compatible with full reads and optimistic writes
---

Paged chronology reads need the same world-wide revision as full chronology reads and updates. Hash all stored story fields, not merely the paged group metadata or last update time.

**Why:** Search results carry an expected revision for complete-layout writes. A page-only revision could allow stale edits or reject a valid update, while reading all full story records just to hash them defeats bounded page materialization. Changing the hash algorithm also invalidates outstanding revision tokens, which should fail closed.

**How to apply:** When changing chronology search or story fields, verify full reads, paged reads, and writes calculate the same revision and that edits to fields outside the current page invalidate it.