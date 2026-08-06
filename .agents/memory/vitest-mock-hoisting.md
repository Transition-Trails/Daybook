---
name: Vitest vi.mock hoisting — variable access before initialization
description: Variables used inside vi.mock() factory closures must be declared via vi.hoisted(), not as regular const/let.
---

## Rule
`vi.mock(modulePath, factory)` is hoisted to the **top** of the file by Vitest's transform, BEFORE any `const`/`let`/`var` declarations. Referencing a regular top-level variable inside the factory throws `ReferenceError: Cannot access '...' before initialization`.

**Why:** Vitest uses Babel/esbuild transforms that move `vi.mock` calls before imports and variable declarations so mocks are in place when modules load.

## How to apply
Declare every variable that a `vi.mock` factory needs inside `vi.hoisted()`:

```typescript
const { mockFoo, FAKE_DATA } = vi.hoisted(() => ({
  mockFoo:   vi.fn(),
  FAKE_DATA: "synthetic",
}));

vi.mock("../lib/foo.js", () => ({
  foo: mockFoo,   // ✓ hoisted, accessible
}));
```

Never do:
```typescript
const mockFoo = vi.fn();  // ✗ not hoisted — ReferenceError in factory
vi.mock("../lib/foo.js", () => ({ foo: mockFoo }));
```

This applies even when the variable is declared before the `vi.mock` call in source order.
