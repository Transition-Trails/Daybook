# Daybook Studio

Config-driven digital planner SaaS — admin console and API for building, publishing, and generating personalised PDF planners.

## Setup / Required Secrets

See **[SETUP.md](./SETUP.md)** for the full setup guide. Quick reference:

| Secret | Status | What it unlocks |
|---|---|---|
| `ANTHROPIC_API_KEY` | Add to activate | AI studios, trend research, planner assistant |
| `OPENAI_API_KEY` | Optional | Alternative AI provider |
| `GEMINI_API_KEY` | Optional | Alternative AI provider |
| `GOOGLE_CLIENT_ID` | Already set | Google sign-in for admin console |
| `GOOGLE_CLIENT_SECRET` | Already set | Google sign-in for admin console |
| `SESSION_SECRET` | Already set | Session cookie signing |
| `STRIPE_SECRET_KEY` | Later phase | Billing / checkout |
| `STRIPE_WEBHOOK_SECRET` | Later phase | Stripe webhook verification |

Callback URL to register in Google Cloud Console (logged at server startup):
```
https://<replit-dev-domain>/api/auth/callback
```

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
