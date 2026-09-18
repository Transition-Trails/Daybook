---
name: Production Spec review images
description: Output and reliability rules for WorldSmith Production Spec review images.
---

Production Spec compilation must save and display the generated image itself. Do not composite it into the legacy 2400×2500 review-board template, surround it with repeated specification text, or derive duplicate detail crops.

**Why:** The wrapper repeated information already available in the editor, made the result hard to read, and reduced the generated image to one panel when that image is the only review artifact needed.

**How to apply:** Both local and Notion-backed preview paths should encode, store, upload, and display the generated image directly at its generated composition.

Generation must fail explicitly when image generation fails; it must not persist a placeholder with a successful status. An explicit regeneration action must bypass the idempotent cached preview.

**Why:** A cached placeholder can look successful and keep reopening after the generation pipeline is repaired.

**How to apply:** Preserve idempotency for ordinary reloads, force a fresh generation for operator-initiated retries, and record success only after a real image has been stored or uploaded.