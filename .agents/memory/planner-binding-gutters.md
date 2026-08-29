---
name: Planner binding gutters
description: The page-side-aware containment rule for planner widget artwork near a physical binding.
---

Widget artwork must reserve a larger inset on the physical binding edge than on the outer page edge. The first physical page is right-hand and therefore binds on the left; subsequent pages alternate binding sides.

**Why:** A symmetric trim-safe margin still lets large widget artwork crowd the seam or disappear beneath realistic gutter and spine treatments.

**How to apply:** Any editor, preview, or export path that resolves planner placement geometry must apply the same alternating binding-edge containment. Existing geometry already inside the protected area should remain unchanged.