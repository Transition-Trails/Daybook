---
name: Moore boundary tracer initial direction
description: Correct initial dir value for the Moore contour tracer in generateCutlineSvg
---

## Rule

In the Moore boundary tracer in `imageProcessing.ts`, initialise `dir = 3` (East), NOT `dir = 7` (West).

**Why:** The scan finds the topmost-leftmost filled pixel. The standard convention is to treat the imaginary "previous step" as having come from the pixel to the LEFT of the start (a background pixel), i.e., we stepped East (dir=3) to arrive at startX,startY. This makes `lookFrom = (3+6)%8 = 1` (North), so the first neighbor checked is North — which is guaranteed empty for the topmost pixel — then the search rotates clockwise. With `dir=7`, `lookFrom=5` (South), the tracer immediately steps INTO the blob interior on the first iteration, produces a tiny degenerate 4-point contour, and the RDP simplification collapses it to 2 points (< 3 minimum), causing `generateCutlineSvg` to return an empty `<svg>` with no `<path>`.

**How to apply:** Any time the Moore tracer is initialised or cloned, keep `let dir = 3` for the starting state. Never use `dir = 7` as the initial value.

## Bonus: extractChannel("alpha") is unreliable

`sharp(input).ensureAlpha().extractChannel("alpha").raw()` can silently return all-zero data on some sharp/libvips builds. The robust alternative: read the full RGBA buffer with `.ensureAlpha().raw()` and manually extract the alpha with `alpha[i] = rgba[i*4+3]`.
