---
name: WorldSmith board approval
description: Product-state boundaries for approving Specification Boards and unlocking final artwork.
---

Specification Board approval must be an intentional, repeat-safe, server-validated transition on the Production Spec record. It requires a completed record, a compiled board, payload readiness, and canon clearance. Board approval only unlocks final-artwork generation; it never approves the resulting artwork.

**Why:** Board review and artwork review represent different operator decisions. Conflating them could release unreviewed imagery, while deriving approval from a readiness score would turn data completeness into an unintended editorial decision.

**How to apply:** Preserve `approved` as a durable Production Spec state across refreshes and ordinary record edits. Keep local approvals local even when a local record has a linked Notion page; existing Notion-backed approval behavior remains its own source-bound workflow.

For local records, a successful non-dry compilation must also persist `compiledPromptStatus = "Compiled"` on the Production Spec itself, not only on the run. The record editor should mirror that transition immediately after board generation while refreshing authoritative data in the background.

**Why:** Approval eligibility reads the Production Spec record. A compiled run or generated board alone cannot unlock approval if the record remains marked `Not Compiled`, and a background query refresh can lag behind the operator's completed action.

**How to apply:** Keep run provenance and record workflow state synchronized on successful local compilation. Never infer compilation from a mere image placeholder or failed preview attempt.