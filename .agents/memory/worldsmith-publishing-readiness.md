---
name: WorldSmith publishing readiness
description: Confirmed policy for publishing local WorldSmith Production Specifications.
---

# WorldSmith publishing readiness

Local WorldSmith Production Specifications must have at least one linked prompt
module before they can be published. The prompt-module readiness check remains a
blocking publish requirement.

**Why:** A specification without reusable prompt guidance is not considered
ready for production publication, even if other payload fields are complete.

**How to apply:** Preserve prompt-module participation in the `payloadReady`
publish gate. It may be surfaced as a visible readiness item, but it must not
be downgraded to a non-blocking warning without a new product decision.