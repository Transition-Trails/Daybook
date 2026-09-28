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

Storyline and movement creation is a distinct external-client authority from editing existing prose or rearranging a Story Map. Creation can optionally attach same-world Canon records atomically, but old editorial write grants should not silently acquire it.

**Why:** A previously authorized client had consent for editing existing editorial records; allowing it to create new narrative structure and links without fresh consent would broaden that grant.

**How to apply:** Require a separate opt-in creation grant in addition to editorial read/write, keep current-user role checks, parent locks, same-world Canon validation, draft defaults, and an audit trail. Existing Story Map link edits and Canon-to-Canon relation creation remain separately scoped operations.

Scene creation needs its own explicit consent beyond scene read/write and beyond storyline/movement creation. A scene is anchored to an existing movement and must link at least one same-world Canon character; creating one must not automatically produce a planned set of other scenes.

**Why:** Granting scene creation to older scene-edit or storyline-create tokens would silently expand their authority, and creating empty scenes would violate the editor's character requirement and the user's constraint against generating unrequested placeholders.

**How to apply:** Preserve older grants as edit-only, require the distinct scene-create grant together with scene read/write, and create only the explicitly requested scene under a validated movement.