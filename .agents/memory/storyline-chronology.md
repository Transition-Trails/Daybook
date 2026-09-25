---
name: Storyline chronology
description: Editorial sequencing semantics for simultaneous WorldSmith storylines
---

Storyline chronology is a sequence of moments, not a ranking of individual stories. Multiple stories at the same positive sequence position are explicitly simultaneous; older records with no assigned sequence are independent moments, even if they have the same default zero value.

**Why:** Reusing the existing order field avoids a second grouping schema, but interpreting all legacy zeroes as simultaneous would invent a narrative relationship nobody approved.

**How to apply:** Any chronology reader or editor should preserve positive ties as intentional simultaneity and distinguish default zeroes. Sequence edits should save the full world-scoped layout together and reject stale edits rather than writing individual stories one at a time.