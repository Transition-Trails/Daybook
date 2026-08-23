---
name: WorldSmith local preview grounding
description: Local Editorial Suite compilation and spec-preview grounding contract.
---

# WorldSmith local preview grounding

Local Editorial Suite Production Specifications must resolve through the shared
local inheritance entry point that attaches the World Bible. If the linked Bible
is absent or cannot be read, block the operation rather than creating a preview
or prompt with ungrounded aesthetic direction.

**Why:** Editorial records can exist before Notion publication, so falling back
to Notion would either fail unexpectedly or silently lose the world’s creative
constraints.

**How to apply:** Any new local generation, preview, or validation flow should
use the shared local resolver and treat unpublished records as local-only: do
not attach files or transition workflow state in Notion until a Notion page is
available. Persist rendered local previews in the protected App Storage
namespace so operators can reopen them without publication.