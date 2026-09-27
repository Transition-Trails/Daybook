---
name: Canon vocabulary governance
description: Editorially scoped picklist configuration for MCP Canon metadata writes.
---

Configure Canon metadata picklists as reviewed world-scoped choices by default. A bulk import of display-only fallbacks is appropriate only when the user explicitly requests that convenience.

**Why:** UI fallback values are display-only; without active database options an MCP client cannot write enumerated metadata. The user later explicitly asked to import all built-in API and editor choices rather than set up hundreds of values manually. That request authorizes broad activation, but an automatic overwrite of curated sets would still undo editorial decisions.

**How to apply:** Outside an explicit bulk-import request, check the target world's vocabulary state before adding options, use the exact field and option keys from the metadata contract, and leave unreviewed fields unset. Bulk imports may add missing typed sets from the visible/API defaults, but must leave every existing typed set unchanged, including empty and inactive sets. Verify both vocabulary and option are active in the same world before telling clients to refresh field options. Do not populate Canon record values as part of vocabulary setup.

Record-type-specific sets supersede older shared sets for that type, even when the specific set is inactive. Untyped legacy sets remain fallback for types that have not been configured separately.

**Why:** The user chose independent choices for shared fields (such as Object and Location Condition). Falling back when a typed set is inactive would silently re-enable choices the editor intended to disable; converting old shared rows would discard their existing role in other types.

**How to apply:** Resolve the effective vocabulary for the target Canon type before showing or validating choices. Keep legacy rows intact and never interpret a field key alone as proof of its record type.

When importing a new typed set that replaces a shared legacy set, carry forward shared custom choices and their availability alongside the built-in defaults. Do not interpret “legacy rows remain in storage” as proof that their choices remain usable.

**Why:** A typed set takes precedence immediately; creating it from built-in choices alone would hide a previously permitted shared custom value and could reject existing Canon values on the next save.

**How to apply:** Merge effective legacy choices only when creating a missing typed set, respect inactive choices and sets, and never add defaults to an already-curated typed set.