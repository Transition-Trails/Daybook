---
name: WorldSmith Context Snapshot repository
description: Records the agreed GitHub destination and repository-boundary rationale for generated WorldSmith Markdown context.
---

WorldSmith Context Snapshots belong in the private `Transition-Trails/Daybook` repository on the dedicated `context-snapshots` branch. World-owned records live under `worlds/**/context/**`; shared production profiles and punch templates live under `global/context/**`. The archived `worldsmith-foundation` repository is not the snapshot destination.

**Why:** The user wants Daybook application code and generated WorldSmith context combined in one repository and accepts that tools granted repository access can also read the Daybook source. Publishing snapshots directly to `main` caused the Replit workspace and GitHub histories to diverge.

**How to apply:** Keep application code on `main`; create and update generated context only on `context-snapshots`. Keep world-owned records beneath `worlds/`, use `global/context/` only for records without a world owner, and prefix generated commit subjects with `context:`.

All Context Snapshot GitHub writes must pass through one process-wide queue, including bulk refreshes and save-triggered auto-sync. Retry transient HTTP 409 branch-update races after re-reading the branch.

Canon removal archives the final Markdown under `worlds/**/context/archive/canon/**` and removes the live snapshot path in one Git tree commit before deleting the database row. A GitHub archive failure must block deletion, and the operation must hold the same per-world advisory lock as snapshot publishing.

**Why:** Removed Canon must leave an auditable repository history without remaining in active context, and concurrent snapshot refreshes must not recreate the live file after archival.
