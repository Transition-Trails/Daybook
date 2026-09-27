---
name: Canon vocabulary governance
description: Editorially scoped picklist configuration for MCP Canon metadata writes.
---

Canon record-type defaults shown in the editor are writable metadata choices even without stored vocabulary rows. World vocabularies customize these choices; bulk-importing built-ins into storage is optional, not a prerequisite for AI writes.

**Why:** The user explicitly requested that `get_canon_field_options` and `update_canon_metadata` accept the same record-type choices as the editor. The former display-only rule forced duplicate vocabulary setup for AI writes. Bulk import was separately requested for managing existing choices, but overwriting curated sets would undo editorial decisions.

**How to apply:** API field options, metadata write validation, and editor dropdowns must resolve the same effective set. Active managed choices override same-key defaults (including disabling an option) and add new keys; unmatched built-ins remain valid. An intentionally inactive managed set suppresses defaults for its field. Bulk imports may add missing typed sets, but leave existing typed sets unchanged, including empty and inactive sets. Do not populate Canon record values as part of vocabulary setup.

Record-type-specific sets supersede older shared sets for that type, even when the specific set is inactive. Untyped legacy sets remain fallback for types that have not been configured separately.

**Why:** The user chose independent choices for shared fields (such as Object and Location Condition). Falling back when a typed set is inactive would silently re-enable choices the editor intended to disable; converting old shared rows would discard their existing role in other types.

**How to apply:** Resolve the effective vocabulary for the target Canon type before showing or validating choices. Keep legacy rows intact and never interpret a field key alone as proof of its record type.

When importing a new typed set that replaces a shared legacy set, carry forward shared custom choices and their availability alongside the built-in defaults. Do not interpret “legacy rows remain in storage” as proof that their choices remain usable.

**Why:** A typed set takes precedence immediately; creating it from built-in choices alone would hide a previously permitted shared custom value and could reject existing Canon values on the next save.

**How to apply:** Merge effective legacy choices only when creating a missing typed set, respect inactive choices and sets, and never add defaults to an already-curated typed set.