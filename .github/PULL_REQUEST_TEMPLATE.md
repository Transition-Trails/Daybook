## Summary
<!-- One or two sentences describing what this PR does and why. -->

## What changed
<!-- List the key changes. Keep it brief — the diff speaks for itself. -->

-
-

## Test plan
<!-- How did you verify this works? Check all that apply: -->

- [ ] TypeScript passes (`pnpm run typecheck`)
- [ ] Unit tests pass (`pnpm --filter @workspace/api-server run test`)
- [ ] Smoke-tested in the Replit preview
- [ ] Playwright E2E passes locally (`pnpm --filter @workspace/e2e run test`)
- [ ] Manually tested the happy path in the affected UI surface

## DB changes?
<!-- If you added or changed a migration, describe what it does and confirm it's been run in dev. -->
- [ ] No migration changes
- [ ] Migration added — `node lib/db/migrate-<name>.mjs` applied to dev DB ✓

## Screenshots / recordings
<!-- Delete this section if no UI changes. -->

## Checklist
- [ ] No console.log left in production code paths
- [ ] No hardcoded secrets, test credentials, or `localhost` URLs committed
- [ ] New API endpoints have auth guards (requireAuth / requireStoreAccess / requireSuperAdmin)
