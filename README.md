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
