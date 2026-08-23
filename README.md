# Daybook Studio

Daybook Studio is a white-label platform for creating, selling, and delivering
digital planners. Platform administrators manage the catalog and creator
tooling; sellers build branded shops and products; buyers configure and receive
their finished PDFs.

## Workspace

The project is a pnpm TypeScript monorepo:

- `artifacts/api-server/` — Express API and generation services
- `artifacts/admin/` — React/Vite administration console
- `lib/db/` — PostgreSQL schema and shared database package
- `scripts/` — migrations, seeds, and maintenance scripts

See [replit.md](replit.md) for setup, required secrets, commands, architecture
decisions, and contributor guardrails.

## WorldSmith local workflow

WorldSmith lets editorial teams author production specifications, compile
creative prompts, and generate preview boards. Editorial Suite records can be
worked on before they are published to Notion:

1. Compile using the local `production_spec_id`.
2. In development, the local resolver is enabled by default. In production, it
   stays off unless `USE_LOCAL_RESOLVER=true` is explicitly set.
3. The linked World Bible is resolved by the production spec's local world ID.
   A missing or unreadable World Bible blocks compilation and preview rendering
   so no ungrounded creative direction is produced.
4. Unpublished local records do not write status, files, or relations to
   Notion. Their rendered preview boards are retained in protected App Storage
   and are available again from Editorial Suite.
5. Once a real Notion publication ID exists, the established Notion writeback
   and publication behavior remains available.

The legacy Notion resolver remains in place during this transition, so existing
published WorldSmith records continue to compile and preview normally.
