#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/db run verify-migration
pnpm run typecheck:libs
