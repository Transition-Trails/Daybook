---
name: WorldSmith MCP production consent
description: Scope and resource boundary for Make It Real MCP access
---

Make It Real access belongs behind a separately requested production read grant and an explicitly approved production write grant, not the older Canon or editorial grants. Current platform super-admin authority must be rechecked on each call.

**Why:** Existing client consent for Canon/storyline editing did not authorize global production assets or printer geometry. A previously authorized client must not silently acquire those capabilities.

**How to apply:** New production tools must be separately scope-gated at discovery and execution; preserve the current world's identity on world-owned records. Existing external clients must request the new scopes and obtain fresh consent.

The admin label “Print Targets” maps to the orientation-aware image-target catalog, not a standalone print-target table. Its component types are predefined; new dimensions may be configured for an unconfigured supported type, while updates to configured types require the current revision.

**Why:** Introducing a second print-target catalog would make the MCP and admin disagree about the same settings.

**How to apply:** Keep Print Targets MCP edits aligned with the catalog shown in the admin rather than treating it as arbitrary user-created component types.