---
name: WorldSmith payload alias normalisation
description: PP-1.0 required keys vs domain-specific author terminology — alias mapping added to validator
---

## Rule
The PP-1.0 spec requires `asset_role`, `composition`, and `materials` as universal keys.
Notion authors commonly use domain-specific alternatives: `card_role` (Journal Cards),
`paper_and_materials` (instead of `materials`), and `front_layout`/`back_layout` (instead of `composition`).

## Alias map (applied in `validator.ts` before required-key check)
| Author writes | Canonical key |
|---|---|
| `card_role` | `asset_role` |
| `paper_role` | `asset_role` |
| `paper_and_materials` | `materials` |
| `front_layout` + `back_layout` | `composition` (synthesised, joined with " / ") |
| `pattern_behavior` | `composition` (decorative/coordinating papers fallback) |

Aliases only fire when the canonical key is absent.

**Why:** The first live dry run used `card_role` and `paper_and_materials` — both semantically
correct but not matching the spec's canonical names. Rather than force Notion edits on every
author, normalise at validation time.

**How to apply:** Any time PP-1.0 validation adds a new required key, also consider whether a
natural domain-specific variant exists and add it to the alias block in
`artifacts/api-server/src/lib/worldsmith/validator.ts` (section 4a).
