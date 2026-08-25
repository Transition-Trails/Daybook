---
name: Cross-store guard pattern for owned-catalog routes
description: Why owned-catalog routes need an explicit assertSameStore() check and how it works
---

## The Rule
Every handler that uses a URL `storeId` after actor resolution must call the shared `assertStoreScope(actor, urlStoreId, res)` immediately after extracting it. The shared guard is used by the core stores and owned-catalog routes.

**Why:** Express Router middleware (`requireStoreAccess`) resolves the store context from `req.params.storeId ?? x-store-id header`. When params aren't populated in the middleware phase (a known Express sub-router quirk), the middleware falls back to the `x-store-id` request header — so a store-delta owner sending `x-store-id: store-delta` to `/stores/store-alpha/owned` could be validated against *delta* while the handler queries *alpha* data from the URL.

**How to apply:**
The guard allows only platform super admins or actors whose resolved membership is for the same store. Call it at the top of every handler: `if (!assertStoreScope(actor, storeId, res)) return;`
