---
name: Google OAuth lifecycle fencing
description: Preventing concurrent Google refresh, reconnect, and revocation requests from restoring stale credentials.
---

Google OAuth lifecycle writes must be fenced by one monotonic connection version:
fresh consent advances it; refresh success and terminal `invalid_grant` writes
apply only when the version they read still matches; terminal disconnect also
advances it.

**Why:** A refresh response is asynchronous. Without a shared version, an old
success can restore credentials after a terminal revocation, or an old
`invalid_grant` can wipe newly-consented credentials.

**How to apply:** Any future Google credential mutation must either advance the
connection version (fresh consent/disconnect) or condition its update on the
version it read (refresh). Preserve other connection metadata with database-side
JSONB key updates rather than session-snapshot replacement.

A Google API 401 for an access token that is still within its normal expiry is
also terminal: provider-side revocation can invalidate that token before the
next refresh attempt.

**Why:** Waiting for expiry leaves a revoked user with a generic Drive or
Calendar failure instead of the reconnect state.

**How to apply:** Fence the disconnect by both lifecycle version and the exact
rejected access token, so a late 401 cannot clear a token supplied by a newer
refresh or consent.