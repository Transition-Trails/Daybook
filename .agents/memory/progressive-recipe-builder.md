---
name: Progressive recipe builder
description: Architecture of the /super/recipes/new full-page build center — why it's a route not a drawer, gating pattern, and sticky-rail layout approach.
---

## Rule
New authoring surfaces with 3+ progressive stages belong on their own route, not in a 420px drawer. Use `position: sticky` on the summary rail inside a CSS grid (`1.5fr 1fr`) whose scroll context is provided by the parent shell — not a nested overflow container.

**Why:** The old RecipeDrawer had two stacked scrollbars and showed all 40 engine chips at once. The design principle is: options appear only as a consequence of a prior decision. A drawer can't enforce that hierarchy spatially; a full page can.

## How to apply
- Route: `/super/recipes/new` registered in App.tsx BEFORE `/super/recipes` (wouter exact-matches, so order doesn't matter, but keeping new-first is conventional).
- The existing `/super/recipes` page keeps the `RecipeDrawer` for editing existing recipes only. The "New recipe" button navigates with `useLocation` instead of `setEditing(null)`.
- Steps 2 and 3 are conditionally rendered (`{!productType ? <DashedPlaceholder> : <> <Step2/> <Step3/> </>}`) — not disabled fields. This is deliberate.
- `typeConfig` is derived from `productType` via `.find()!` — TypeScript can't narrow it inside JSX branches, so use `typeConfig!.foo` rather than adding a redundant null check that duplicates the outer gate.
- `useEffect([productType])` resets `enabledParts`, decision card fields, name, and studio whenever type changes — so switching type always snaps to that type's sensible defaults.
- Rail numbers: `platformCount = defaultOn.length + available.length`, `storeOwnerCount = enabledParts.size`, `consumerCount = 3` (constant). Show `"—"` until a type is picked.
