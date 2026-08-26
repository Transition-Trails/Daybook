# Daybook — authorization and checkout schema verification

Verification date: 2026-08-26

These checks were run read-only against both Replit managed database
environments after the production publish. The migration sources checked were
`lib/db/drizzle/0020_wave9_cart_integrity.sql` and
`lib/db/drizzle/0023_wave12_authorization.sql`.

## Development

| Check | Result |
| --- | --- |
| `public.users.role` | Absent |
| `public.checkout_intents` | Present |
| `checkout_intents` expiry index | Present as `checkout_intents_expires_at_idx` on `expires_at` |
| Unique planner-interior version index | Present as `planner_interior_versions_interior_version_uq` on `(interior_id, version)` |
| Duplicate `(interior_id, version)` pairs | 0 |
| Expired checkout intents | 0 |

## Production

| Check | Result |
| --- | --- |
| `public.users.role` | Absent |
| `public.checkout_intents` | Present |
| `checkout_intents` expiry index | Present as `checkout_intents_expires_at_idx` on `expires_at` |
| Unique planner-interior version index | Present as `planner_interior_versions_interior_version_uq` on `(interior_id, version)` |
| Duplicate `(interior_id, version)` pairs | 0 |
| Expired checkout intents | 0 |

## Outcome

Development and production are aligned for the current authorization and
checkout schema. The production audit findings for the legacy role column,
missing checkout-intent table/index, and planner-interior version uniqueness
are closed. No migration or data fix was needed.