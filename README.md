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

## Billing and support operations

Daybook subscriptions are configured through Stripe rather than numeric prices
in application code:

1. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
   `STRIPE_YEARLY_PRICE_ID` to the environment used by the API and seed script.
2. Run `pnpm --filter @workspace/scripts run seed`. The yearly plan is
   upserted with the configured Stripe Price ID; if the ID is absent, the seed
   warns and leaves the plan unavailable for purchase.
3. Configure Stripe to deliver events to `POST /api/webhooks/stripe`.
4. Confirm the API startup log does not report missing billing configuration.

Only plans with a nonblank Stripe Price ID appear in the public plan catalog or
checkout. Stripe lifecycle events are retry-safe: confirmed payments activate
access, a failed payment retains access through the paid period, and
`inactive` or `refunded` states terminate access. Events that arrive before
checkout correlation return a retryable error; events belonging to an older or
different known payment are safely ignored. Invoice Payment lookups enrich
refund correlation but do not turn a successful renewal into a failed request.

Each accepted subscription payment is recorded in the payment ledger and
linked to a billing order. Super admins can view a customer's complete history
from the admin user detail page. The billing detail endpoints are:

- `GET /api/billing/users/:userId/payments`
- `GET /api/orders/:id`

The second endpoint is restricted to super admins because order details contain
customer billing information.

### Support tenant isolation

Support data is scoped by the API, not by client-side filtering:

- `GET /api/support/articles` returns public platform help by default. A
  `scope=storeId` request requires an authenticated member of that store;
  cross-store and unauthenticated scoped requests return `403`. Super admins
  may inspect any store scope.
- `GET /api/support/recent-activity?storeId=...` requires membership in the
  requested store before querying planner builds or tickets.
- `POST /api/support/tickets` derives the ticket's store and recipient scope
  from verified membership. A client cannot route a ticket to another store;
  such requests return `403`.

These boundaries are covered by the API RBAC integration suite in
`artifacts/api-server/src/test/rbac.test.ts`.

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

### WorldSmith image generation

WorldSmith uses GPT Image 2 through the Replit AI proxy by default
(`WS_IMAGE_MODEL=gpt-image-2`); `gpt-image-1` is the supported fallback. Image
requests are validated before they reach the provider:

- dimensions must be multiples of 16;
- the aspect ratio must stay between 1:3 and 3:1;
- normal requests must stay within a 3,686,400-pixel budget (the equivalent of
  2560 × 1440), while experimental sizes use the 8,294,400-pixel
  3840 × 2160 budget;
- effective provider, model, version, size, quality, and request metadata are
  persisted for auditability and included in generation identity hashes.

WorldSmith print targets come from the managed catalog, with separate
orientation-specific dimensions. Platform admins can update those dimensions
in the WorldSmith settings surface without a code change. Specification boards
show the resolved pixel target and physical print reference; they do not claim
that a capped render was produced at the requested print DPI.
