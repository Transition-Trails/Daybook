---
name: WorldSmith PP-2.0 Payload Contract
description: Section-based payload format (PP-2.0) — architecture, detection, backward compat rules
---

## Rule
PP-2.0 uses structured sections: shared_prompt, front_prompt, back_prompt, inside_prompt,
outside_prompt, assembly_prompt, negative_prompt. Detection: `shared_prompt` key present = new format.

## Files changed
- `types.ts` — ParsedPayload has both section keys + legacy flat keys; COMPONENT_SECTION_CONTRACT,
  DEFAULT_SECTION_CONTRACT, PROMPT_SECTION_ORDER; CompiledSectionRecord, ProvenanceRecord interfaces;
  CompileResponse.compiled_sections + .provenance added.
- `validator.ts` — PP-2.0 path uses COMPONENT_SECTION_CONTRACT; PP-1.0 path keeps flat-key checks
  + adds LEGACY_PAYLOAD_FORMAT migration warning. Both paths coexist.
- `prompt-compiler.ts` — compileNewFormat() for PP-2.0; compileLegacyFormat() for PP-1.0 (unchanged logic).
  Both return sectionRecords[] + isLegacyFormat flag.
- `orchestrator.ts` — builds ProvenanceRecord after compile; adds compiled_sections + provenance to response.
- `WorldSmithCompiler.tsx` — SuccessScreen has 3-tab view: Summary / Sections (accordion) / Provenance.

## Backward compat guarantee
Any payload WITHOUT shared_prompt compiles via the legacy path. Alias normalisation
(card_role→asset_role, paper_and_materials→materials, front_layout+back_layout→composition)
only fires in legacy mode.

**Why:** PP-1.0 flat keys are semantically ambiguous across component types; sections make
front/back/assembly explicit, enabling multi-surface and paper-engineering assets.

**How to apply:** When adding a new component type, add its contract to COMPONENT_SECTION_CONTRACT
in types.ts. Required sections get hard errors; optional get placeholder warnings only.
