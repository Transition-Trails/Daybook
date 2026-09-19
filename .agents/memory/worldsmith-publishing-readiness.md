---
name: WorldSmith publishing readiness
description: Confirmed policy for publishing local WorldSmith Production Specifications.
---

# WorldSmith publishing readiness

Local WorldSmith Production Specifications must have at least one linked prompt
module before they can be published. The prompt-module readiness check remains a
blocking publish requirement.

Publication is the explicit transition after Specification Board approval and a
successful final-art review candidate. The intermediate `approved` state belongs
in an Artwork Review board lane; it must never fall back to Draft merely because
the board has no matching status bucket.

**Why:** A specification without reusable prompt guidance is not considered
ready for production publication, even if other payload fields are complete.
Board approval previously used a real persisted status that the Readiness Board
did not recognize, so approved records appeared as drafts after artwork work.

**How to apply:** Preserve prompt-module participation in the `payloadReady`
publish gate. Require approval and selected successful final artwork for the
official publish action. Preserve `approved` and `published` across saves that
do not alter compilation inputs; real compilation-input edits may move them to
`changes_pending`.