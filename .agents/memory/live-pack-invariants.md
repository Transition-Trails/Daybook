---
name: Live pack invariants
description: Rules for preventing a live sticker pack from becoming incomplete through an edit.
---

Any write whose resulting sticker-pack status is live must validate the full
resulting pack state—not only an explicit publish transition. This includes
cover reference, positive whole-cent price, sticker membership, and a valid
commercial-rights attestation.

**Why:** A PATCH that omits `status` can still degrade an already-live pack,
and explicit `null` values must be treated as supplied values rather than
falling back to the current row.

**How to apply:** Resolve omitted fields from the current row, distinguish them
from supplied nulls, and check the resulting state in the same transaction
before changing the pack record or its sticker joins. `coverDriveFileId` is an
opaque external Drive reference with no local asset-ownership record, so only
format validation is locally enforceable until the asset model supplies an
authoritative ownership link.