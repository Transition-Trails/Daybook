---
name: WorldSmith planner asset bridge
description: Boundary and lifecycle rules for using WorldSmith final artwork inside Daybook planners.
---

Daybook imports approved WorldSmith final artwork as a managed, project-owned private copy with lightweight provenance. Planner composition references these copies with reserved `project-asset:` IDs; source WorldSmith files remain private and are never hotlinked.

**Why:** WorldSmith owns production and versioning while Daybook owns placement and export. A managed copy keeps planners renderable during WorldSmith outages and prevents source updates from silently changing finished products.

**How to apply:** Browse only approved, successfully generated final artwork within the actor's store. Never overwrite an imported copy automatically; show version availability and require an explicit replacement. Resolve project asset IDs against the exact planner and store before preview or export.