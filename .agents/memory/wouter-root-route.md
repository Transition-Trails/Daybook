---
name: Wouter root-path routing
description: Wouter v3 wildcard limitations and query-string handling
---

## Rule
Never use `/:rest*` as a catch-all in Wouter v3. Use `/(.*)`  instead.

## Why
Wouter 3 uses regexparam 3.0.0. Its wildcard patterns are severely limited:

| Pattern | Generated regex | Matches |
|---------|----------------|---------|
| `/:rest*` | `/^\/([^/]+?)\/?$/i` | Only bare `/` — NO (returns null), `/foo` — YES, `/foo/bar` — **NO** |
| `/base/:rest*` | `/^\/base\/([^/]+?)\/?$/i` | `/base/foo` — YES, `/base/foo/bar` — **NO** |
| `/(.*)`  | `/^\/(.*)\/?$/i` | `/` — YES, `/foo` — YES, `/foo/bar/baz` — YES |
| `/base/(.*)` | `/^\/base\/(.*)\/?$/i` | `/base/` — YES, `/base/foo/bar` — YES, bare `/base` — **NO** |

So `/:rest*` only matches single-segment paths. Any multi-segment path like `/super/stores`
silently falls through the Switch and renders blank — no error, no warning.

## How to apply
- **Top-level catch-all**: Use `<Route path="/(.*)" component={RootRouter} />` — matches
  everything including `/`, `/foo`, and `/foo/bar/baz`.
- **Section catch-all** (e.g. daybook): Use **two** routes:
  ```jsx
  <Route path="/daybook">...</Route>        {/* bare /daybook */}
  <Route path="/daybook/(.*)">...</Route>   {/* all sub-paths */}
  ```
  Because `/daybook/(.*)` requires the trailing slash, bare `/daybook` needs its own explicit route.
- **Never use `/:rest*` or `/base/:rest*`** for catch-alls — they silently miss deep paths.

## Query-string rule
Read query parameters with `useSearch()`, not by splitting the value from `useLocation()`.

**Why:** In this Wouter version, `useLocation()` exposes the pathname while `useSearch()` owns the query string. A control can write `?mode=...` to the browser URL while the component keeps rendering its fallback mode if it parses only the location value.

**How to apply:** Build `URLSearchParams` from `useSearch()`, and use the pathname from `useLocation()` only when constructing the next navigation target.
