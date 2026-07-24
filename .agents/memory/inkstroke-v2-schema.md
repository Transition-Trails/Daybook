---
name: InkStroke v2 schema
description: DB schema change for tool-depth ink editor; InkStroke widened with optional v2 fields
---

## Rule
`lib/db/src/schema/planner.ts` → `InkStroke.tool` is now `string` (was `"pen"|"highlighter"|"eraser"`).
Two optional v2 fields were added:
- `variant?: "solid" | "dashed" | "dotted"`
- `shape?: { kind: "line"|"rect"|"ellipse"|"arrow"; x1; y1; x2; y2 }`

After editing the schema, always run `npx tsc -b lib/db` before api-server typecheck.

**Why:** v2 tool-depth adds fineliner/fountain/marker pen variants and shape tools (line/rect/ellipse/arrow). The DB column is JSONB so no migration needed — old rows read fine; new fields are optional so v1 layers render identically.

**How to apply:** When adding new tool types or stroke metadata, add optional fields here first (never required), rebuild lib/db, then update api-server and admin references.
