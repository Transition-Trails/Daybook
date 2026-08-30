---
name: WorldSmith board approval
description: Product-state boundaries for approving Specification Boards and unlocking final artwork.
---

Specification Board approval must be an intentional, repeat-safe, server-validated transition on the Production Spec record. It requires a completed record, a compiled board, payload readiness, and canon clearance. Board approval only unlocks final-artwork generation; it never approves the resulting artwork.

**Why:** Board review and artwork review represent different operator decisions. Conflating them could release unreviewed imagery, while deriving approval from a readiness score would turn data completeness into an unintended editorial decision.

**How to apply:** Preserve `approved` as a durable Production Spec state across refreshes and ordinary record edits. Keep local approvals local even when a local record has a linked Notion page; existing Notion-backed approval behavior remains its own source-bound workflow.