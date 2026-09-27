---
name: Character repeater identity
description: Cross-surface invariant for preserving Character collection rows and their references
---

Treat Character knowledge, life-stage variants, and visual identity locks as versioned collections whose existing row IDs must survive a normal edit. Preserve variant active/default state too. A complete replacement may intentionally omit rows, but an unchanged editor-to-MCP round trip must not mint replacement identities for them.

**Why:** Locks and other linked assets can refer to a life-stage variant by its row ID. A version check prevents stale writes but cannot prevent a successful replacement from invalidating those references when the client forgets the ID. Dropping `active` also reactivates a retired variant through the database default.

**How to apply:** When adding a new client or editing either save path, send existing IDs and state, keep the record-version compare-and-swap, and check references before intentionally removing variants. New rows can receive new IDs.