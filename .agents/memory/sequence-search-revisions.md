---
name: Sequence search revisions
description: Keep paged chronology reads compatible with full reads and optimistic writes
---

Paged chronology reads need the same world-wide revision as full chronology reads and updates. Hash all stored story fields, not merely the paged group metadata or last update time. Page selection, selected stories, references, and revision must share one repeatable-read snapshot.

**Why:** Search results carry an expected revision for complete-layout writes. A page-only revision could allow stale edits or reject a valid update, while reading all full story records just to hash them defeats bounded page materialization. Changing the hash algorithm also invalidates outstanding revision tokens, which should fail closed. Separate read-committed statements can mix page membership from before an edit with story content and revision from after it.

**How to apply:** When changing chronology search or story fields, verify full reads, paged reads, and writes calculate the same revision and that edits to fields outside the current page invalidate it. Use one connection and repeatable-read transaction for multi-statement paged searches; a transaction at default read-committed isolation is insufficient.

Sequence page continuations must carry the first page's revision; an optional check does not protect callers that omit it.

**Why:** A legacy cursor-only caller can silently join pages from two different world states even when each page individually has a consistent snapshot. Requiring the revision on continuation fails closed.

**How to apply:** Preserve the conditional input contract whenever pagination changes, and update every continuation caller, including integration fixtures and benchmarking scripts. An edit between pages should return a stale-page error rather than a partial result.