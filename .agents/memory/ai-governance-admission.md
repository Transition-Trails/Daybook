---
name: AI governance admission
description: Durable rules for provider ownership, quota admission, duplicate prevention, and usage accounting.
---

AI calls must resolve the credential owner before provider execution. Store credentials take precedence; platform credentials are a configuration fallback only when the store explicitly permits it. Provider network failures are never retried against a different credential because calls may not be idempotent.

**Why:** Funding attribution and quota scope must follow the credential actually used. Caller-supplied funding labels, process-local locks, and post-call counting allow cross-tenant misattribution or concurrent overspend.

**How to apply:** Admit text and image calls through a database transaction and an advisory lock keyed by quota owner, not model. Reserve conservative cost from current effective pricing, keep unaudited spend counted as unaccounted, and fail closed when a monthly limit has no trustworthy active price.