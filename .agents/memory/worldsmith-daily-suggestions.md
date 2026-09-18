---
name: WorldSmith daily suggestions
description: Governs model-call frequency for world-aware Canon and storyline suggestion panels.
---

Canon gap suggestions and storyline suggestions each refresh at most once per 24 hours for a world. Canon record-type filters reuse and filter the one daily Canon result rather than generating separate sets.

**Why:** These panels mount automatically and previously called the model on every visit and again for Canon filter changes, creating avoidable usage.

**How to apply:** Persist generated results and their timestamps server-side. Repeated visits and browsers receive the cached result until the 24-hour window expires; the UI must show that the daily refresh has been used.