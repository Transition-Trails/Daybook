---
name: Canon partial metadata retries
description: Version safety when Canon profile and related metadata writes complete separately.
---

An acknowledged Character profile update can advance the Canon version even when a later metadata collection write fails. Retrying those later writes must preserve the profile response's new version rather than issuing the profile update again.

**Why:** A retry against the pre-profile version produces an avoidable conflict; repeating a versioned profile write can also replace a concurrent editor's work.

**How to apply:** At multi-step save boundaries, distinguish acknowledged writes from failed steps and compare the stored post-write version against a fresh server read before any remaining retry writes.