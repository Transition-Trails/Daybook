---
name: Orval Zod compatibility
description: Prevent generated Zod schemas from using Zod 4-only APIs in the Zod 3 workspace.
---

When regenerating API schemas, explicitly configure Orval's Zod output for version 3 while the workspace dependency remains on Zod 3.

**Why:** Orval can fail to infer the output package's Zod version and then defaults to Zod 4 syntax, such as `zod.int()`, which does not compile against Zod 3.

**How to apply:** Keep the explicit Zod version setting in the API-spec generator configuration. Reconsider it only as part of an intentional workspace-wide Zod 4 migration.