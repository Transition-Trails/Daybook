---
name: Spec-driven backend rebuild
description: Key decisions and gotchas from the Daybook backend rebuild to the new spec
---

# Spec-driven backend rebuild

## Rules to stay consistent with

**Text PKs everywhere:** All entity IDs are `text` (not serial integers). Seeded rows use human IDs (`t1`-`t6`, `p1`-`p3`, `i1`-`i6`, `r1`-`r4`, `e1`-`e4`, `yearly`, `lifetime`). New rows get `crypto.randomUUID()` via `$defaultFn`.

**JSONB arrays replace junction tables:** `editions.themes/packs/inserts/products` are JSONB `string[]`. `sticker_packs.planners` and `inserts.planners` are JSONB `string[]` (values = edition IDs or `["all"]`). No junction tables exist.

**Catalog soft-delete:** DELETE endpoints set `status = "deleted"` — never hard-delete catalog rows. Admin list/get exclude deleted rows. Public reads already exclude non-live rows.

**Stripe raw body:** The `/webhooks/stripe` route must receive the raw request body for signature verification. `express.raw({ type: 'application/json' })` is applied as inline middleware on that route BEFORE the global `express.json()` parses it.

**User absorbs three old tables:** `ai_settings`, `sync_status`, and `user_purchases` are gone. Their data lives in `users.aiEnabled`, `users.aiProvider`, `users.connections` (JSONB), and `users.owned` (JSONB string[]).

**Catalog visibility rule:** Unauthenticated requests receive only `status='live'` rows. Staff/owner see all draft+live statuses (but NOT deleted).

**Route path changes:** `/sticker-packs` → `/packs`; `/generation` → `/planners`; `/ai/chat` → `/ai/complete`; `/billing/checkout` → `/checkout`; `/auth/me` → `/me`.

**eq() needs string casts:** Express `req.params.id` can resolve as `string | string[]` in TypeScript. Use `req.params.id as string` before passing to Drizzle `eq()`.

**Why:** Spec required clean break from integer IDs to support human-readable IDs in PDF link scheme.

**How to apply:** Any new catalog entity follows the same JSONB-array + soft-delete pattern.
