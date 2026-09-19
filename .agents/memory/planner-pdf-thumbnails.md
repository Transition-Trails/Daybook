---
name: Planner PDF thumbnails
description: Deployment requirement for rasterizing imported planner PDF pages.
---

Imported planner page thumbnails are rendered with Poppler's `pdftoppm`. Poppler must remain declared in the project's system dependencies rather than relying on the development shell to provide the executable.

**Why:** The development runtime included `pdftoppm` implicitly, but published deployments did not. Imports succeeded while every review thumbnail failed with `spawn pdftoppm ENOENT`.

**How to apply:** Keep the Poppler system package configured whenever the planner PDF thumbnail route uses `pdftoppm`, and verify a real authenticated thumbnail request returns an `image/png` response after environment changes.