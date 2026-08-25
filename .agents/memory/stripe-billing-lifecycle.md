---
name: Stripe billing lifecycle
description: Durable fulfillment and entitlement rules for Daybook's yearly and lifetime billing plans.
---

Yearly and lifetime purchases have different persistence and entitlement rules:

- A lifetime purchase is an append-only ownership grant and remains valid after subscription cancellation, failed payments, or refunds.
- Yearly lifecycle mutations must never write the ownership ledger. Lifetime grants append in the database so they survive concurrent yearly webhook updates.
- Yearly access is valid only while its subscription state is active and its current period has not expired; it must never be added to the permanent ownership ledger.
- Only fulfill Checkout after Stripe confirms payment. Asynchronous Checkout requires the separate success event.
- Lifecycle events must match the currently stored Stripe subscription or payment identity before they can change status. Ignore unmatched/late events rather than revoking a newer entitlement.
- Record the Stripe event creation time alongside the active yearly subscription. A successful invoice cannot replace a different active subscription; newer confirmed Checkout and asynchronous Checkout events may replace it. Ignore matched negative events that predate the active success.
- Evaluate correlation and event ordering in the database mutation itself, not against a previously read row. Persist the accepted timestamp for both positive and negative lifecycle events. Stripe `created` timestamps are second-granularity; equal timestamps are deterministic no-ops, so the first accepted lifecycle event wins.
- Invoice payloads use Stripe's Basil-style nested subscription reference when present; retain compatibility with legacy top-level references.

**Why:** Stripe deliveries can be asynchronous, retried, or arrive out of order. Treating yearly access as permanent or applying an old event solely by customer ID can grant access after expiry or revoke an active replacement subscription. Even a delayed successful renewal must not overwrite a newer subscription's correlation record.

**How to apply:** Keep future buyer-only resource gates on the centralized expiry-aware entitlement predicate. When adding more webhook handlers, persist and compare the relevant Stripe object identity before updating lifecycle status.