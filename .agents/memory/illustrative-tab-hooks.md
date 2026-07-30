---
name: IllustrativeTab hooks fix
description: IllustrativeTab had a React hooks violation — useMutation after early return
---

## Rule
In `StoreStudioPage.tsx`, the `IllustrativeTab` component previously declared `useMutation` **after** an `if (!aiEnabled) return …` guard, violating the Rules of Hooks. Fixed by moving all hook declarations (including the new `generateImage` and `saveSticker` mutations) before the conditional return.

**Why:** React requires hooks to be called in the same order on every render. An early return before a hook is a violation that can cause subtle runtime errors or stale closures, even when `aiEnabled` rarely changes.

**How to apply:**
- In any component with an `AiDisabledState` early return, declare ALL hooks (useState, useMutation, useQuery, useRef) first, then the `if (!aiEnabled) return` guard.
- The correct comment pattern: `// All hooks declared above — safe to return early now`.
