---
name: Canon partial metadata retries
description: Version safety when Canon profile and related metadata writes complete separately.
---

An acknowledged Character profile update can advance the Canon version even when a later metadata collection write fails. Retrying those later writes must preserve the profile response's new version rather than issuing the profile update again.

**Why:** A retry against the pre-profile version produces an avoidable conflict; repeating a versioned profile write can also replace a concurrent editor's work.

**How to apply:** At multi-step save boundaries, distinguish acknowledged writes from failed steps and compare the stored post-write version against a fresh server read before any remaining retry writes.

For an unacknowledged Character profile write, version comparison alone cannot distinguish its commit from another editor's update. Use a stable per-attempt request ID recorded atomically with the profile change history; reconciliation must match that ID, actor, payload, and the immediate resulting Canon version before treating a retry as completed.

**Why:** A lost HTTP response leaves the client at the pre-profile version even though the transaction may have committed. Matching only the profile content or a one-step version advance could incorrectly attribute another editor's work to the retry.

**How to apply:** Preserve the request ID across retries of the same profile PUT; never assign a new one until starting a new Canon save. If the version advances beyond that write, stop and require reload rather than continuing related metadata writes.

Character collection replacements must each compare and advance the Canon version atomically with their row replacement, and the next save step must use the returned version. A client preflight read alone cannot protect the interval before a write.

**Why:** Another editor can commit after a retry's preflight read, and a collection PUT that only checks the earlier read silently replaces the concurrent work.

**How to apply:** For future multi-step Character metadata writes, use one transaction for the conditional Canon version advance and the associated row mutations; carry the acknowledged version forward after each step. Do not infer success from a missing version response.
