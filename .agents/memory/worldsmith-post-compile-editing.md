---
name: WorldSmith post-compile editing
description: Versioning and stale-generation rules for editing Production Specs after compilation
---

Production Specs remain editable after compilation. Saving a changed compilation input moves the spec to Changes Pending / Recompile Required, removes approval for the stale board, and blocks final generation until an explicit successful recompile.

**Why:** Operators need to improve prompts without losing prior compiled payloads or artwork, and final generation must never silently use or replace stale work.

**How to apply:** Treat immutable WorldSmith run and production-package records as the history for each version under one Production Spec ID. Recompile advances the spec version; never delete or overwrite earlier runs or packages, and never let force-new generation bypass the stale-compilation gate.