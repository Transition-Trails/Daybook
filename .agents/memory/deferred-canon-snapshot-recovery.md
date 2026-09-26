---
name: Deferred Canon snapshot recovery
description: Safe recovery boundary for Canon saves interrupted between record and asset writes
---

Treat a deferred Canon save as incomplete until its separate asset writes have had time to settle. An editor reopening the record may reconcile its persisted pending snapshot, but only when the full intended asset metadata agrees with committed asset rows, the current automatic-publishing policy permits it, and image export approval checks pass. If those checks do not pass, retain a reviewable state rather than silently publishing.

**Why:** The browser writes Canon content and image metadata in separate requests. A lost final request is not proof that every image write completed. Matching gallery URLs alone is unsafe: an existing approved image may still need a pending change to draft approval or role.

**How to apply:** Persist the editor's intended asset metadata with the deferred record save, compare it to stored assets before recovery, and keep recovery conditional on the current record version and policy. Missing expectations or incomplete asset sets remain pending for review. This is reopen-triggered recovery, not a server-side background worker for records nobody revisits.