---
name: WorldSmith MCP authorization boundary
description: External canon clients use user-granted permissions and cannot perform editorial approval.
---

External canon clients must act with the signed-in person's current permissions, not a shared administrator credential. A Character attribute edit must remain distinct from accepting or rejecting proposed Canon.

**Why:** A third-party client may suggest or save ordinary attributes without being entrusted with the editorial approval decision; using a shared token would obscure who made the change and bypass later role changes.

**How to apply:** When adding MCP tools or other external-client operations, check the user's current role on each request, use separately consented write access, audit mutations, and keep status transitions behind their existing editorial workflow.

External MCP hosts may send JSON-RPC with a nonstandard or absent Content-Type. Authenticate first, then parse a bounded body as JSON-RPC rather than rejecting the media type before the OAuth challenge.

**Why:** Production connection attempts reached OAuth but repeatedly received HTTP 415 from the MCP endpoint, including after token exchange; the strict media-type gate prevented tool discovery.

**How to apply:** Keep the bearer and read/write-scope checks, size limit, and JSON-RPC validation when adjusting MCP transport compatibility. A 401 challenge should not depend on the request media type.