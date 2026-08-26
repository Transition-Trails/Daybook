---
name: Realistic planner blank pages
description: Why diagnostics must not serialize an empty pdf-lib planner document before modeled pages exist.
---

Do not call `save()` on the production planner PDF document before its modeled
pages have been added. Measure source buffers or use a separate throw-away
document for diagnostics instead.

**Why:** pdf-lib serializing an empty document mutates it by inserting a blank
page. The realistic-overlay size logger did this before page creation, leaving
every realistic planner with an untracked leading blank while the page map and
reported page count still looked correct.

**How to apply:** Any pre-page PDF validation, sizing, or diagnostics must avoid
serializing the production document. Proof harnesses should require the
serialized page count to equal the flattened page-ID count exactly.