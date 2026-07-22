---
name: DB build requirement
description: lib/db uses composite TypeScript project references and must be built before api-server typecheck works
---

## Problem
`@workspace/db` has `composite: true` in its tsconfig. When new schema files are added, the api-server typecheck will report "Module '@workspace/db' has no exported member 'X'" until the db lib is rebuilt.

## Fix
```bash
npx tsc -b lib/db
```
Run this after any changes to `lib/db/src/schema/` before running `pnpm --filter @workspace/api-server run typecheck`.

**How to apply:** Any time you add new tables to lib/db/src/schema/, rebuild lib/db first.

**Why:** The api-server tsconfig uses TypeScript project references pointing to lib/db. Without a build, TypeScript reads stale declaration files and doesn't see new exports.
