---
name: Planner PDF import resume
description: Persistence and visual-fidelity expectations for uploaded planner PDF review projects.
---

An analyzed planner PDF is an autosaved review project, not a transient upload. Unfinished imports must remain discoverable and resumable after navigation or reload, and completed imports must stay protected from accidental source deletion.

**Why:** Import records and page mappings were persisted, but the interface discarded the record ID when it unmounted, forcing repeated uploads even though the original work still existed.

**How to apply:** Any planner-import workflow change must preserve a visible saved-import history, refresh it after mutations, support reopening unfinished reviews, and clearly communicate autosave. Review thumbnails should preserve the source PDF's actual color; black-and-white output is only appropriate when the source itself is monochrome.