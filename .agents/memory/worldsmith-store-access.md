---
name: WorldSmith store access
description: Store-scoped WorldSmith feature boundaries and authorization rules.
---

Enabled store owners and staff may access the WorldSmith home to create, list, update, and edit the World Bible for worlds owned by their store. Every store-facing WorldSmith API must require verified store access, enforce the store feature flag, and apply the current store to every world query and mutation.

Compiler, preflight, run history/detail, portfolio assets, payload generation, and the Editorial Studio are platform-admin-only until their underlying records have a complete store ownership model.

**Why:** WorldSmith compilation and portfolio records include cross-tenant creative data and Drive/Notion metadata. Hiding platform controls in the UI is not an authorization boundary.

**How to apply:** New WorldSmith routes must be explicitly classified as store-facing or platform-only. Store-facing routes use both store access and the WorldSmith feature gate; platform portfolio routes require super-admin access. Keep world identifiers globally unique while retaining the human-readable world code.