---
name: Local spec board integrity
description: Reliability rules for locally generated WorldSmith Specification Boards.
---

Local Specification Board generation must fail explicitly when concept-image generation or compositing fails; it must not persist a placeholder board with a successful status. An explicit “Generate new board” action must bypass the idempotent cached preview.

**Why:** A cached placeholder looked like a successful board and kept being reopened even after the rendering pipeline was repaired, hiding both compiled content and the intended hero artwork.

**How to apply:** Preserve idempotency for ordinary reloads, but send a force-new request for an operator-initiated regeneration. Only persist success after the generated image has been composited into the rendered board.

Specification Board font resolution must work from both the source module directory and the bundled server directory.

**Why:** Source-level glyph tests passed while the built server emitted nearly blank boards because the build copied fonts beside the bundle, not into the source-relative location.

**How to apply:** Resolve the existing source font directory during tests/development and the bundle-local font directory in production; verify one board through the built workflow, not only through source-level renderer tests.

Final Specification Boards must curate inherited prose rather than reproduce compiler records verbatim. Local previews must composite the same real detail crops as Notion-backed previews.

**Why:** A structurally correct board still felt database-generated when it repeated field prefixes, collapsed QA into prose, and left local detail frames empty.

**How to apply:** Summarize complete thoughts without ellipses, prioritize asset-specific instructions, render review criteria as separate checks, suppress empty supporting states, deduplicate constraints, and verify the built local path visually.