---
name: WorldSmith empty AI ideas
description: Production evidence and policy for AI suggestion runs that return no visible items.
---

GPT-5 may consume an entire short completion budget on internal reasoning and return no visible JSON. Treat empty or unparseable suggestions as a failed attempt, not as a valid daily result.

**Why:** Production usage showed repeated successful calls at exactly the output cap while both Canon and storyline caches held empty arrays, leaving Discovery Review with no ideas. A zero-item cache suppressed subsequent non-forced attempts for 24 hours.

**How to apply:** Size structured multi-item output budgets explicitly, keep the AI spend reservation aligned with that budget, reject unusable output before refreshing the daily cache, and let legacy empty cache entries be retried. Distinguish manual generation from scheduled generation in the UI; there is currently no scheduler for this queue.