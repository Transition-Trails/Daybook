---
name: Canon vocabulary governance
description: Editorially scoped picklist configuration for MCP Canon metadata writes.
---

Configure Canon metadata picklists as a small, reviewed set of world-scoped active choices, not by making every UI fallback writable.

**Why:** UI fallback values are display-only; without active database options an MCP client cannot write enumerated metadata, but activating the entire fallback list would silently expand editorial vocabulary beyond the choices actually reviewed.

**How to apply:** Check the target world's production vocabulary state before adding options, use the exact field keys and option keys from the metadata contract, leave unreviewed fields unset, and verify both vocabulary and option are active in the same world before telling clients to refresh field options. Do not populate Canon record values as part of vocabulary setup.