---
name: Drizzle PostgreSQL error wrapping
description: How to recognize PostgreSQL constraint errors returned through Drizzle.
---

Constraint failures may expose PostgreSQL fields such as `code` and `constraint` on the error itself or on its `cause`.

**Why:** Drizzle can wrap a PostgreSQL `23505` in a query error, and checking only the outer error misclassifies a uniqueness conflict as an ordinary validation failure.

**How to apply:** When translating database constraint failures into HTTP conflicts, inspect both the outer error and one wrapped `cause`, then match the exact expected constraint name.