---
name: Storyline chronology
description: Editorial sequencing semantics for simultaneous WorldSmith storylines
---

Storyline chronology is a sequence of moments, not a ranking of individual stories. Multiple stories at the same positive sequence position are explicitly simultaneous; older records with no assigned sequence are independent moments, even if they have the same default zero value. Cross-era umbrella accounts belong in an explicit reference lane, not an arbitrary numbered moment.

**Why:** Reusing the existing order field avoids a second grouping schema, but interpreting all legacy zeroes as simultaneous would invent a narrative relationship nobody approved. A cross-era origin account cannot honestly be assigned one point in time.

**How to apply:** Any chronology reader or editor should preserve positive ties as intentional simultaneity, distinguish default zeroes, and exclude reference accounts from numbered moments without deleting them or their acts. Sequence edits should save the full world-scoped layout together and reject stale edits via the world revision rather than writing individual stories one at a time; all chronology writers must advance that revision.