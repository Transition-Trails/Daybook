---
name: WorldSmith typography migration
description: Rules for safely migrating prose font references into structured WorldSmith typography.
---

Structured typography is catalog-backed and intentionally separate from editorial prose. Migration may extract a legacy font block only once when the typography column is introduced; an empty selection is a valid author decision and must never trigger later reconciliation.

**Why:** Historical font prose can include human-facing variant counts and source notes that are useful for editorial review but unsafe and irrelevant in image prompts. Unmatched families cannot be safely converted, so deleting them would lose context.

**How to apply:** Preserve unmatched legacy blocks for editorial review, but strip them from all inherited prose when compiling; structured catalog choices are the only font data permitted in image prompts.