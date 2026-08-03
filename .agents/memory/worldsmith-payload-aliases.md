---
name: WorldSmith payload alias normalisation
description: PP-1.0 required keys vs domain-specific author terminology — alias mapping added to validator
---

## Rule
The PP-1.0 spec requires `asset_role`, `composition`, `materials`, `visual_hierarchy`,
`text_rule`, `canon_rule`, `print_rule`, and `negative_constraints` as universal keys.
Notion authors commonly use domain-specific alternatives.

## Alias map (applied in `validator.ts` before required-key check)
| Author writes | Canonical key |
|---|---|
| `card_role`, `paper_role`, `hero_role`, `role` | `asset_role` |
| `paper_and_materials`, `medium`, `substrate`, `paper_substrate` | `materials` |
| `front_layout` + `back_layout` | `composition` (synthesised, joined with " / ") |
| `pattern_behavior`, `layout` | `composition` (fallback) |
| `scene_hierarchy`, `visual_priority`, `compositional_structure`, `visual_structure`, `composition_hierarchy` | `visual_hierarchy` |
| `print_specifications`, `print_specification`, `technical_requirements`, `production_rule`, `technical_rule`, `print_notes` | `print_rule` |

Aliases only fire when the canonical key is absent.

**Why:** The first live dry run used `card_role` and `paper_and_materials`. `visual_hierarchy`
and `print_rule` had no aliases and caused false MISSING_REQUIRED_KEY failures when authors
used alternate naming (e.g. `scene_hierarchy`, `print_specifications`).

**How to apply:** Any time PP-1.0 validation adds a new required key, also consider whether a
natural domain-specific variant exists and add it to the alias block in
`artifacts/api-server/src/lib/worldsmith/validator.ts` (the alias normalisation section).
Each canonical key now also has a `PP1_KEY_HINTS` entry with a one-liner telling authors
exactly what value format is expected — update that map too.
