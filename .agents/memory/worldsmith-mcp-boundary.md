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

Canon OAuth consent does not grant WorldSmith editorial authority. Expanded editorial tools require their own read/write grants, with write separately approved; existing Canon clients retain their original tools but gain no implicit editorial access.

**Why:** A client previously approved to edit Canon attributes must not silently gain the ability to edit World Bible prose, storyline chronology, or relationship links when the MCP server grows.

**How to apply:** When adding a new class of MCP mutation, make its consent language and per-tool scope checks match the actual authority. Do not reinterpret older grants as broader permission.

Beat and reveal edits need their own opt-in grant, even when a client already has editorial write access.

**Why:** Previously issued editorial write grants covered storyline-level fields; extending that scope to child-record edits would silently enlarge old consent.

**How to apply:** For further child-record mutation classes, check whether existing scopes accurately describe the new authority before exposing tools to previously authorized clients.

For editorial records without an application-wide version counter, compare a revision derived from the current content immediately before a row-locked write rather than introducing an MCP-only version field.

**Why:** Existing editor routes can update those rows without incrementing an MCP-specific counter; such a counter would miss out-of-band edits and let stale clients overwrite current content.

**How to apply:** Include the latest revision in read results, require it on partial edits, and serialize writes against the affected rows before checking it. For virtual views, lock the world and affected stories and validate full ordering membership.