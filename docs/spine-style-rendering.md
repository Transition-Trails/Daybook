# Spine style rendering

- `vertical` assets tile along the **left page edge**.
- `horizontal` assets tile along the **top page edge**.
- `tabPos` does not move the binding edge; it only controls navigation tabs.
- A page renders at most one selected spine style. A null `spineStyleId` renders none.
- Tiles keep `unitAspect` intact. The final full-size tile is clipped by the PDF
  media box instead of being stretched to fit.
- Images without alpha emit a warning and render opaquely.

The horizontal starter asset’s dark rectangles read as authored page-edge
shadow/clamp blocks beneath each ring pair in generated proofs; they are part of
the source image, not renderer masking.