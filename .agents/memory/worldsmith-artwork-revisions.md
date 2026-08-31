---
name: WorldSmith artwork revisions
description: Durable rules for revising generated artwork without weakening governance or duplicating provider charges.
---

Final-artwork revisions are transient operator directions layered onto the compiled provider prompt. They must not mutate the Production Spec or overwrite prior successful artwork, and they must pass the same readable-text, rendering, canon, and negative-constraint boundaries immediately before provider use.

**Why:** Appending unconstrained prose can contradict inherited rules even when the canonical governance sections remain present. Literal negative matching is also unsafe: it misses article/singular/plural variants, while matching generic isolated nouns creates false positives.

**How to apply:** Normalize enforceable prohibited concepts across articles and common inflections, reject affirmative contradictions before reserving a package or calling a provider, and keep generic one-word negatives conservative. Key revised packages by the effective prompt hash so identical retries reuse one billable request; retain random identities only for deliberate same-prompt regenerations.