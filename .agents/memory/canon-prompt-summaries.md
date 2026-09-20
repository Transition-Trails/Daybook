---
name: Canon prompt summaries
description: Governs compact Canon projections used by WorldSmith prompt consumers.
---

Each Canon record may carry an editable Prompt Summary, and characters may also carry an Identity Summary. These are derived projections, never substitutes for authoritative Canon.

Only a summary whose stored source hash matches the current normalized Canon source may enter image prompts, Field Architecture, or Context Snapshots. Source edits make the summary stale; generation must fall back to authoritative bounded fields until an editor regenerates or deliberately edits and saves the summary.

**Why:** Compact summaries reduce prompt size and improve consistency, but stale or silently regenerated summaries can contradict current Canon.

**How to apply:** Keep regeneration explicit, retain generated timestamps and source hashes, expose Missing/Current/Stale status, and never regenerate on every downstream AI request.