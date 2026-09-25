---
name: MCP refresh-family serialization
description: Why OAuth refresh rotation and family revocation must be serialized
---

Refresh-token consumption, replacement issuance, replay-triggered family revocation, and explicit refresh-token revocation must serialize on the same database-wide family lock and use one transaction.

**Why:** A replay can otherwise revoke all currently stored credentials after the old token is consumed but before its replacement is inserted. The newly inserted access and long-lived refresh credentials then remain valid in a family that should have been revoked.

**How to apply:** Keep the family lock through replacement insertion, recheck the presented token after acquiring it, and include the refresh-token revocation endpoint in the same locking protocol. Exercise the interleaving in concurrent tests, not only sequential replays.