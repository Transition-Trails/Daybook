---
name: Planner PDF thumbnails
description: Production-safe rasterization for imported planner PDF pages.
---

Imported planner page thumbnails must use a renderer bundled with the API artifact rather than an executable supplied by the development shell.

**Why:** Workspace-level Nix packages were available in development but absent from the published artifact runtime. A Poppler-based implementation passed development checks yet still failed every production thumbnail with `spawn pdftoppm ENOENT`.

**How to apply:** Keep thumbnail rendering self-contained in the Node artifact, and verify the built server has no external executable dependency. Test concurrent authenticated thumbnail requests and confirm valid `image/png` responses before publishing.