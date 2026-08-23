---
name: WorldSmith local preview grounding
description: Local Editorial Suite compilation and spec-preview grounding contract.
---

# WorldSmith local preview grounding

Local Editorial Suite compilation must resolve through the full local inheritance
entry point that attaches the World Bible. Local spec previews must resolve only
the specification identity plus the required World Bible, then render authored
board content exclusively from persisted compiled section records. If the linked
Bible is absent or cannot be read, block either operation rather than creating an
ungrounded prompt or preview.

**Why:** Editorial records can exist before Notion publication, so falling back
to Notion would either fail unexpectedly or silently lose the world’s creative
constraints.

**How to apply:** New local compilation or validation flows should use the full
local resolver; preview flows must not re-resolve mutable style, component,
module, or canon links after compilation. Treat unpublished records as local-only:
do not attach files or transition workflow state in Notion until a Notion page is
available. Persist rendered local previews in the protected App Storage namespace
so operators can reopen them without publication. Missing persisted board content
must render an explicit empty state instead of prompt-like default prose.