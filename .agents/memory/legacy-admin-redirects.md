---
name: Legacy admin redirects
description: Why old platform-admin URLs canonicalize before protected route loading
---

Legacy platform-admin redirects must run in the top-level router before protected page auth and data loading.

**Why:** When canonicalization was placed inside the protected console router, direct deep links could mount or retain legacy page state before the redirect completed, leaving the old URL visible even though canonical content appeared.

**How to apply:** Add future `/daybook/...` compatibility redirects ahead of the authenticated console catch-all, then let the canonical destination enforce its normal authorization guard.