# Daybook Studio

White-label SaaS for digital planner creators. Platform admins author the constraint set (product recipes + catalog); store owners see only what the recipe enabled, pre-filled from a theme; buyers make two or three final choices. A store is a branded shop run by a "seller" on the platform.

## Setup / Required Secrets

| Secret | Status | What it unlocks |
|---|---|---|
| `ANTHROPIC_API_KEY` | Add to activate | AI studios, trend research, planner assistant, copilot |
| `GOOGLE_CLIENT_ID` | Already set | Google OAuth sign-in for admin console |
| `GOOGLE_CLIENT_SECRET` | Already set | Google OAuth sign-in |
| `SESSION_SECRET` | Already set | Session cookie signing |
| `RESEND_API_KEY` | Already set | Transactional email (support, order receipts) |
| `RESEND_WEBHOOK_SECRET` | Already set | Inbound webhook verification |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Already set | Object storage for uploaded assets |
| `PRIVATE_OBJECT_DIR` | Already set | Object storage private-directory prefix |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Already set | Object storage public-path patterns |

Register this callback URL in Google Cloud Console (logged at server startup):
```
https://<replit-dev-domain>/api/auth/callback
```

## Run & Operate

```bash
pnpm --filter @workspace/api-server run dev    # API server on $PORT (default 5000)
pnpm --filter @workspace/admin run dev         # Admin SPA
pnpm run typecheck                             # full workspace typecheck
pnpm run build                                 # typecheck + build all packages
npx tsc -b lib/db                             # REQUIRED before api-server typecheck (see Gotchas)
pnpm --filter @workspace/db run push          # push schema changes to DB (dev only)
pnpm --filter @workspace/scripts run seed     # standard seed
pnpm --filter @workspace/scripts run seed:ci  # CI persona + bad-fixture seed
pnpm --filter @workspace/scripts run seed-stickers
pnpm --filter @workspace/scripts run seed-recipes
pnpm --filter @workspace/scripts run seed-theme-catalog
```

## Stack

- **Monorepo**: pnpm workspaces, Node.js 24, TypeScript 5.9
- **API**: Express 5, mounted at `/api`, all routes in `artifacts/api-server/src/routes/`
- **DB**: PostgreSQL + Drizzle ORM; schema in `lib/db/src/schema/`
- **Admin SPA**: React + Vite in `artifacts/admin/`
- **Validation**: Zod v4, drizzle-zod
- **PDF engine**: jsPDF + custom rasteriser in `artifacts/api-server/src/lib/pdf-generator.ts`
- **Fonts**: WOFF bundles in `artifacts/api-server/dist/fonts/`; downloaded via `scripts/download-fonts.mjs`
- **Email**: Resend adapter in `artifacts/api-server/src/lib/email/`
- **Tests**: Playwright E2E in `tests/e2e/`; invariant suite in `tests/e2e/invariants/`

## Where things live

| Concern | Location |
|---|---|
| DB schema (source of truth) | `lib/db/src/schema/*.ts` |
| All API routes | `artifacts/api-server/src/routes/*.ts` |
| Route mounting | `artifacts/api-server/src/routes/index.ts` |
| Auth middleware / role guards | `artifacts/api-server/src/middleware/requireRole.ts` |
| PDF generator (buildPdf) | `artifacts/api-server/src/lib/pdf-generator.ts` |
| Entitlement engine | `artifacts/api-server/src/lib/entitlement.ts` |
| Audit log writer | `artifacts/api-server/src/lib/audit.ts` |
| Quality checker | `artifacts/api-server/src/lib/quality-checker.ts` |
| E-ink safety checker | `artifacts/api-server/src/lib/eink-checker.ts` |
| Font warmup + coverage | `artifacts/api-server/src/lib/font-warmup.ts` |
| Transactional email | `artifacts/api-server/src/lib/email/` |
| Owned-catalog routes (store-scoped) | `artifacts/api-server/src/routes/owned-catalog.ts` |
| Platform recipe routes | `artifacts/api-server/src/routes/platform-recipes.ts` |
| Support ticket routes | `artifacts/api-server/src/routes/support.ts` |
| CI seed (personas + bad fixtures) | `scripts/src/seed-ci.ts` |
| E2E invariant specs | `tests/e2e/invariants/` |
| Admin SPA pages | `artifacts/admin/src/pages/` |
| Slide deck (roadmap) | `artifacts/daybook-deck/src/` |

## Architecture decisions

**1. Choice narrows at every level.**
Platform admins author the full constraint set via product recipes (what parts are available, what engine capabilities are required). Store owners then see only what the recipe enabled, pre-filled from a theme they chose. Buyers make two or three final personalisation choices (palette, background, start month). The platform never exposes the full option space to a tier that doesn't need it.

**2. Never promise what the engine cannot produce.**
No silent substitution — if a requested font family has no bundled WOFF file, the substitution is recorded on the build and surfaced via `X-Font-Substitutions` response header; it is never applied silently. Preview must match export: they go through one shared `buildPdf` helper with identical parameters; they cannot drift. A recipe carrying a "Blocks release" engine gap returns 409 on publish regardless of who calls it.

**3. The artifact is sacred.**
Generation is the only gate point. Once a buyer's PDF is in their drive folder, it is never re-checked, re-validated, or mutated by subsequent catalog changes. Unpublishing a sticker pack, editing a theme, or revising a recipe has zero effect on existing generated files. The `drive.pdfFileId` stored on the planner config is the immutable record of what was delivered.

**4. A theme is a bundle, not a colour palette.**
A theme carries: palettes (several — one is_primary), backgrounds, a font pairing, sticker packs, inserts, cover art, widgets, hardware, and accessories. One theme can have many palettes; choosing a palette is a sub-choice within a theme. Confusing "theme" with "colour scheme" breaks the composer UI.

**5. Three asset types that are routinely confused.**
- **Sticker** — a small placed image (PNG with transparent background, SVG cutline for Cricut). Lives in a pack.
- **Widget** — a placed tracker/functional element (habit tracker, mood log). Has palette slots and size variants.
- **Insert** — a whole page that gets a tab and a contents-page entry. Typed separately from stickers and widgets.
Origin is `starter | licensed | owned`. Starter and licensed items are read-only; owned items are mutable by the store that created them.

**6. Store isolation is API-enforced, not UI-enforced.**
All owned-catalog routes (`/api/stores/:storeId/owned/...`) call `assertSameStore(actor, storeId, res)` before any DB write. A store owner whose `storeId` doesn't match the URL param gets 403 even if the button is visible. Super admins bypass this check. The Playwright invariant suite hits these routes directly to verify — a UI-only check would pass while the API is wide open.

**7. Audit every mutation.**
`writeAudit()` is called in every route that creates, modifies, publishes, or deletes a resource. It records actor, store scope, action, target type, and target ID. Audit failures are logged and swallowed (never block the primary request) but the invariant test suite uses the audit log as a secondary oracle for all permission tests.

## Product

Daybook Studio is a white-label digital-planner platform with three user tiers:

**Platform admin (super_admin):** Authors the catalog — themes (colour shells with 4+ real palette bundles), sticker packs, inserts, widgets, planner templates, and product recipes. Recipes define what a planner can contain and which engine capabilities are required. Also manages stores, feature flags, support inbox, and the quality-check dashboard.

**Store owner / staff:** Runs a branded shop. Can create owned themes, packs, editions, and palettes that layer on top of the platform catalog. Configures the storefront (branding, email domain, billing). Handles buyer support tickets. Staff can draft; only owners can publish, unpublish, or delete.

**Buyer:** Configures and purchases a personalised planner. Makes at most three choices: edition (what the planner contains), palette (colour scheme within the theme), and optional background. Receives a generated PDF in their drive. Can re-open a draft to generate a new version but the original artifact is never overwritten.

**Studios (seller tooling):**
- **Planner Studio** — compose a planner edition (sections, stickers, inserts, hardware)
- **Sticker Studio** — upload images, remove backgrounds, generate SVG cutlines, compose packs
- **Theme Studio** (Edition Studio) — bundle palettes, backgrounds, fonts, packs into a theme
- **Marketing Studio** — generate listing copy, social posts, and product mockups

A studio tab is a compose surface, never a data table. Data tables belong only in the super-admin oversight views.

## User preferences

- Keep all database migrations in `migrate-*.mjs` scripts using raw SQL via pool (not Drizzle operators) for safety.
- Run `npx tsc -b lib/db` before `pnpm run typecheck` — the DB package has `composite: true` in its tsconfig.
- Use `requireSuperAdmin` (from `middleware/requireRole`) for platform-admin-only routes, not the legacy `requireStaff` from `lib/auth-middleware`.
- Prefer `onConflictDoNothing()` in seed scripts for idempotency.
- When adding a new route file, import and mount it in `routes/index.ts`.

## Gotchas

**DB build prerequisite.** `lib/db` has `composite: true` in its tsconfig. Run `npx tsc -b lib/db` before running the api-server typecheck or any schema changes won't be picked up.

**isSuperAdmin legacy bug (fixed).** `roles.ts` previously had a `role === "owner"` fallback making all store owners bypass store scoping. Fixed to check `platformRole === "super_admin"` only. Never reintroduce the owner bypass.

**Cross-store guard.** Owned-catalog routes use `:storeId` in the URL path, not a header. `assertSameStore` compares `actor.storeId` (from the session) to `req.params.storeId`. The x-store-id header is used only in legacy middleware for routes that were not yet migrated to path params.

**Wouter root-path routing.** regexparam 3's `/:rest*` regex won't match bare `/`. Always add an explicit `<Route path="/" />` alongside any `/:rest*` catch-all in Wouter apps.

**Google sync mount.** The google-sync router must be mounted at `/sync` in `routes/index.ts`; without the prefix all its routes 404.

**pdfjs-dist + Vite.** Never npm-install `pdfjs-dist` — it silently corrupts Vite's dep graph. Use a CDN `/* @vite-ignore */` dynamic import instead.

**Bulk sticker routes before /:id.** In sticker routes, define any bulk endpoint (e.g. `POST /packs/bulk`) before `/:id` catch-all routes, or Express will treat the path segment as an ID param.

**Font coverage guard.** The server runs `warmFontCache()` at startup and logs any `UI_REACHABLE_FAMILIES` entries that have no bundled WOFF file. A gap here means the PDF generator will silently substitute — the quality checker and no-silent-substitution invariant test will catch it.

**Planner config sampleLinks.** The quality checker scans `output.sampleLinks[].href` for `.test` TLD domains (RFC-2606-reserved, never resolvable). The `ci_bad_planner_cfg` seed fixture uses this to test the checker. Do not confuse `sampleLinks` (quality-checked buyer-facing hyperlinks) with `calMode` / `eventMins` / `aiInPdf` (standard output options).

**Studio active-chip contrast.** `--primary` is clay `#C87560` (~3.5:1 on white, fails WCAG AA). Always use Ink Navy `#1B2A4A` for active chip/pill fills. Constants `CHIP_ACTIVE_BG` and `CHIP_ACTIVE_CLS` are defined in the studio primitives file.

**E-ink export profiles.** `buildPdf` takes `inkFriendly` (8th param) and `einkDevice` (9th param). These force minimum 0.75pt lines, suppress backgrounds, and enforce a contrast floor. Preview and export must use identical params — they share one helper call path; do not branch them.
