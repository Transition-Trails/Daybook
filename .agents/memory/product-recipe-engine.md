---
name: Product Recipe Engine
description: Schema, API, seed data, and admin UI for platform-wide product recipes.
---

## The rule
Platform super-admins maintain a catalog of "product recipes" — structured definitions of what a product type is, what parts it ships with, and how it reaches market. These are reference data, not buyer-facing.

**Why:** Gives platform staff a single source of truth for product strategy without coupling it to any store or edition.

## Schema (`product_recipes` table)
Fields: `id` (nanoid text PK), `name`, `category`, `decisionCard` (jsonb), `parts` (text[]), `physicalPath` (jsonb), `claudeBrief` (jsonb), `release` (jsonb), `status` (`draft`/`live`/`retired`), `buildCount`, `createdAt`, `updatedAt`.

## API (`/api/platform/recipes`)
All routes behind `requireSuperAdmin`:
- `GET /` — list with optional `?status=` filter
- `GET /stats` — counts by status + total buildCount
- `GET /:id`
- `POST /` — create
- `PATCH /:id` — update
- `POST /:id/publish` — set status=live
- `POST /:id/retire` — set status=retired
- `POST /:id/increment-build` — bump buildCount
- `DELETE /:id` — hard delete

## Seed
Run `pnpm --filter @workspace/scripts run seed-recipes`. Seeds 11 recipes (9 live, 2 draft).

## Admin UI
Route: `/super/recipes` — `ProductRecipes` page in `artifacts/admin/src/pages/super/`.
- 4 stat tiles (Total / Live / Draft / Total builds)
- Recipe list with name, studio, parts count, tier, buildCount, status badge, Edit chip
- Slide-in `RecipeDrawer` for create/edit with name, category, parts, status fields
- Nav item "Product recipes" (FlaskConical icon) between Stores and Global catalog in `SuperAdminShell`.
