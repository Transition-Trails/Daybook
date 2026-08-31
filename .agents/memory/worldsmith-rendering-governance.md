---
name: WorldSmith rendering governance
description: Durable rules for enforcing Style Guide rendering media at the image-provider boundary.
---

WorldSmith must resolve one canonical provider prompt rather than treating inherited context as equally authoritative prose. A mandatory Style Guide medium is promoted first, contradictory lower-priority directions are removed across every source (including Canon), and negatives are atomized and deduplicated.

**Why:** A strong scene prompt can override passive Style Guide context and produce photorealistic output. Validation that checks only a synthesized lock is insufficient if contradictory payload, module, component, World Bible, or Canon prose still reaches the provider.

**How to apply:** Hash, persist, review, and submit the exact same canonical provider prompt. Revalidate its trusted resolved policy inside the private provider boundary, and fail before generation if a required rendering lock or photography negatives are absent.