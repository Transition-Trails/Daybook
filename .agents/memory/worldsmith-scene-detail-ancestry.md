---
name: WorldSmith scene detail ancestry
description: How to handle nullable storyline ownership on legacy detail rows linked to scene containers.
---

Detail rows predate strict scene-container ancestry and may lack a storyline even when the linked scene, movement, and world are valid. Treat a null detail storyline as missing metadata when the world matches, not as evidence the scene belongs elsewhere. Reject a non-null conflicting storyline or world, and derive the storyline from the parent scene when details are edited or created.

**Why:** Newly created, correctly placed scene containers became unreadable through external scene tools because their detail rows had no storyline ID; deleting and recreating the scenes would not resolve the creation path and would discard intended containers.

**How to apply:** Preserve existing scenes and their detail content. For reads, validate actual parent conflicts without requiring a populated legacy detail storyline. For writes, set the detail storyline from the authoritative scene and guard against cross-world or cross-story reparenting. Do not bulk-rewrite unrelated standalone detail rows.