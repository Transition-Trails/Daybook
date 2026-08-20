---
name: Editorial browser verification
description: How to safely run authenticated Editorial Studio checks when no normal administrator session is available.
---

Use the existing test-only login route and deterministic CI persona for authenticated Editorial Studio browser checks. Run the API in `NODE_ENV=test` on a temporary local port, seed the CI fixtures, and use `super@ci.test`; never change a real user, manufacture a cookie, or enable the route in development/production.

**Why:** The browser-testing sandbox cannot reach an ephemeral server started from a shell, while the repository's local Playwright runner can share that server's network namespace. Local Chromium may also require its downloaded browser binary and Nix runtime libraries before it launches.

**How to apply:** Prefer the repository's Playwright runner for these checks. Reuse or remove clearly labelled CI fixtures, restore any existing record changed during a round trip, and keep the normal managed development workflow unchanged.