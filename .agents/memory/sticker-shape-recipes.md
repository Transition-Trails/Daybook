---
name: Sticker shape recipes
description: Durable rules for deterministic functional sticker SVG rendering.
---

Functional sticker SVGs must render from authored shape recipes, not freehand AI output. A recipe refines an existing fixed function type and carries exactly one closed `data-name="cutline"` path used directly for machine cutting.

**Why:** Freehand rendering varied between runs and first-path extraction could drop multipart silhouettes such as ribbon tails.

**How to apply:** Keep AI assistance limited to proposing templates during authoring. Validate the approved placeholder vocabulary and vector contract on save and after substitution, and never contour-trace recipe cutlines.