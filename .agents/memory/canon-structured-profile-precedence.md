---
name: Canon structured profile precedence
description: Which source wins when legacy typed profiles and canonical metadata both contain structured fields.
---

Treat the Canon record's structured metadata as authoritative when both it and a legacy typed profile provide the same field. A legacy profile may fill only fields absent from the Canon record.

**Why:** MCP metadata updates persist to the Canon record, while an older typed profile can remain empty or stale. Preferring that separate profile hides successful MCP writes in the editor and risks overwriting them on the next save.

**How to apply:** Merge structured fields with Canon values taking precedence wherever the editor hydrates a record. Preserve profile-only fields for backward compatibility, and cover fresh-read display plus subsequent save with a regression test.