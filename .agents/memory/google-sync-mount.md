---
name: Google sync router mount
description: The google-sync router must be mounted at /sync prefix in routes/index.ts, not at root.
---

The generated API client and OpenAPI spec both use `/sync/...` paths (e.g. `/sync/calendar/events`, `/sync/tasks`). The google-sync router registers routes without the `/sync` prefix internally (e.g. `router.get("/calendar/events", ...)`), so it must be mounted at `/sync` in `routes/index.ts`:

```typescript
router.use("/sync", googleSyncRouter);  // correct
router.use(googleSyncRouter);           // wrong — all routes 404
```

**Why:** The `routes/sync.ts` file is a dead stub ("superseded by google-sync.ts"). The active router is google-sync.ts, mounted at `/sync`. Without the prefix, all 10 sync routes return 404 despite passing TypeScript checks.

**How to apply:** Any time a new route is added to google-sync.ts, the path should NOT include `/sync/` — the mount point in index.ts handles that prefix.
