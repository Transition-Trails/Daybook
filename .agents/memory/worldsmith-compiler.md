---
name: WorldSmith Prompt Compiler
description: Phase 1 compile-only pipeline wired into Daybook's API server — architecture, key files, and gotchas.
---

# WorldSmith Prompt Compiler

## Architecture
- **Compile-only (Phase 1)** — resolves Notion records, validates payload, assembles + hashes a deterministic prompt. No image generation yet.
- All state lives in Postgres (`worldsmith_runs`, `worldsmith_assets`) — no separate external service.
- Notion client is hand-rolled (`notion-client.ts`) using `NOTION_TOKEN`; no npm package.

## Key files
| File | Purpose |
|------|---------|
| `lib/db/src/schema/worldsmith.ts` | `worldsmithRunsTable` + `worldsmithAssetsTable` |
| `scripts/src/migrate-worldsmith.ts` | DDL migration — run via `pnpm --filter @workspace/scripts run migrate-worldsmith` |
| `artifacts/api-server/src/lib/worldsmith/types.ts` | All shared interfaces |
| `artifacts/api-server/src/lib/worldsmith/orchestrator.ts` | 22-stage pipeline |
| `artifacts/api-server/src/lib/worldsmith/inheritance-resolver.ts` | Notion fetch chain |
| `artifacts/api-server/src/routes/worldsmith.ts` | Mounted as `router.use(worldsmithRouter)` in routes/index.ts |
| `artifacts/admin/src/pages/super/WorldSmithCompiler.tsx` | Admin UI at `/super/worldsmith` |

## API endpoints
- `POST /api/v1/prompt-compilations` — `validate_and_compile` or `preview`; returns `CompileResponse`
- `GET  /api/v1/runs/:run_id` — run status
- `GET  /api/v1/worldsmith/runs?spec_id=…` — recent runs
- `GET  /api/v1/worldsmith/assets` — Daybook asset registry

## Phase 2 stub
`POST /api/v1/production-packages` returns 501. Generation (DALL-E → Drive → Notion Visual Asset image attach) lives here.

## Logger import
The api-server uses **named** `import { logger }` — never default. Applies to all new files in this server.

**Why:** `logger.ts` exports a named binding; using default import causes TS2613 and a runtime crash.

## Notion write-back
- `Compiled Prompt Status` → `selectProp("Compiled")` written on successful compile.
- `Next Action` → `selectProp("Generate image")` written after compile.
- Both are non-fatal if Notion is unreachable.
