---
name: Cross-store guard pattern for owned-catalog routes
description: Why owned-catalog routes need an explicit assertSameStore() check and how it works
---

## The Rule
Every handler in `routes/owned-catalog.ts` must call `assertSameStore(actor, urlStoreId, res)` immediately after extracting `storeId` from `req.params`.

**Why:** Express Router middleware (`requireStoreAccess`) resolves the store context from `req.params.storeId ?? x-store-id header`. When params aren't populated in the middleware phase (a known Express sub-router quirk), the middleware falls back to the `x-store-id` request header — so a store-delta owner sending `x-store-id: store-delta` to `/stores/store-alpha/owned` would be validated against *delta* (passes) but the handler then queries *alpha* data using the URL param.

**How to apply:**
```typescript
function assertSameStore(actor: ActorContext, urlStoreId: string, res: Response): boolean {
  // Use platformRole, not isSuperAdmin — store owners also have isSuperAdmin=true via legacy role==="owner" (fixed, but be cautious)
  if (actor.platformRole === "super_admin") return true;
  if (actor.storeId !== urlStoreId) {
    res.status(403).json({ error: "Forbidden: cross-store access denied" });
    return false;
  }
  return true;
}
```

Call it at the top of every handler: `if (!assertSameStore(actor, storeId, res)) return;`

All 10 handlers in owned-catalog.ts (4 POST, 2 GET, 4 PATCH, shared DELETE helper) have this guard as of the initial implementation.
