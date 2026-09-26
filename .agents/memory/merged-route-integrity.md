---
name: Merged route integrity
description: Check semantic route integrity when a merged branch causes a publish build failure.
---

When a merged route file fails to build, inspect the surrounding handlers as well as the reported syntax location; compare against the last coherent version and retain only the intended feature changes.

**Why:** A merge left duplicate declarations and misplaced blocks, but also silently changed GET handlers into writes and pointed unrelated endpoints at the wrong request schemas. Fixing only the first compiler error would have left data-changing regressions.

**How to apply:** Compare the affected file against the last coherent parent, restore unrelated handlers, preserve intentional new behavior, then run the build, typecheck, and focused route tests before attempting to publish.