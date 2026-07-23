---
name: Wouter root-path routing
description: Why /:rest* does not match bare / in Wouter 3 + regexparam 3
---

## Rule
Always add an explicit `<Route path="/" component={...} />` alongside any `/:rest*` catch-all in Wouter v3.

## Why
Wouter 3 uses regexparam 3.0.0. For the pattern `/:rest*` it generates the regex
`/^\/([^/]+?)\/?$/i` — this requires **at least one segment after the slash** and returns
`null` when exec'd on `/`.

A `<Switch>` with only `/:rest*` renders **blank** at the root path — no error, no warning.

## How to apply
In every top-level Switch that uses `/:rest*` as a catch-all, precede it with:
```jsx
<Route path="/" component={SameComponent} />
<Route path="/:rest*" component={SameComponent} />
```
Or use a no-path Route `<Route component={SameComponent} />` as the last entry instead of `/:rest*`.
