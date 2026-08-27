---
name: Express async scope binding
description: Durable trust-boundary rule for tenant impersonation scope
---

Tenant impersonation must bind each request to a single server-validated store scope; client-provided scope alone is never authorization.

**Why:** Request metadata can be missing or attacker-controlled, so trusting it without server-side scope validation can authorize cross-tenant or platform-wide access.

**How to apply:** Validate the requested store against the active server session, and independently verify that loaded resources belong to that validated store.