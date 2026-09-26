---
name: WorldSmith MCP editorial coverage
description: Product meaning of stories and consent boundaries for external editorial tools
---

For WorldSmith's external editorial access, “stories” includes **individual scenes and the world-level Story Map**, while **storylines** are a separate editorial area. When checking whether a ChatGPT connection can edit the complete product, cover worlds, Canon records of every type, Story Maps, storylines, and scenes rather than treating a storyline as sufficient story coverage.

**Why:** The user explicitly distinguished these areas before creating a replacement ChatGPT app, because that app's tool snapshot may remain frozen after server-side additions.

**How to apply:** Audit tool discovery with a grant containing every relevant scope before suggesting another app creation. Keep new generic Canon editorial writes and scene access behind their own explicit OAuth consents; existing grants must not silently acquire a new write domain. Content updates preserve workflow status and use expected revisions, audit trails, and same-world validation.

MCP Canon metadata writes must fail closed against the active world/global vocabulary. Editor fallback labels are useful for explaining fields but are not evidence that a choice is valid in production; metadata edits should target individual keys and preserve unrelated values.

**Why:** The user explicitly rejected guessed production Location values, and an opaque JSON replacement could erase existing metadata.

**How to apply:** For new metadata-edit surfaces, distinguish stored values from allowed choices, use current vocabulary for write validation, and retain version checks and separate editorial-write consent.

For connector debugging, an HTTP 200 on an MCP `tools/call` can still carry `isError: true`, and a generic `/mcp` access log cannot identify which tool ran.

**Why:** A client-reported blocked call could not be attributed from status-only production logs, even though the target record existed and its payload was small.

**How to apply:** Compare tool-specific outcomes and response sizes before attributing failures to the server or client. Diagnostic logs may include tool names, scope names, error codes, and byte counts, but never request arguments, returned editorial content, credentials, or tokens.