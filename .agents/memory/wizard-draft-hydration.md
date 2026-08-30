---
name: Wizard draft hydration
description: Safe cache and refetch behavior for server-backed progressive forms.
---

On resume, apply authoritative server data only after the initial forced refetch completes. Do not treat cached query data as the restored draft, and do not continually re-hydrate local form state.

**Why:** A cached blank draft can mask later saved values, while unconditional focus/reconnect refetches can overwrite unsaved edits on the active screen.

**How to apply:** Force a mount refetch, wait until fetching finishes before the one-time hydration, disable automatic focus/reconnect refetch while editing, and refresh affected list queries after save-and-leave.