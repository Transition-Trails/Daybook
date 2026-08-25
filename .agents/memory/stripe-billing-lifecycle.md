---
name: Stripe billing lifecycle
description: Durable fulfillment and entitlement rules for Daybook Stripe subscriptions.
---

Daybook's sellable subscriptions are data-driven:

- Checkout must use a nonblank environment-specific Stripe Price ID stored on a plan. Legacy numeric plan columns are not checkout authority.
- A configured plan may be sold and entitled without a route-level allow-list; the retired lifetime plan is never entitled.
- Startup diagnostics, catalog visibility, and checkout must share the same nonblank Price ID rule.
- Subscription lifecycle mutations must never write the item ownership ledger.
- Subscription access is valid only while its state is non-terminal and its current period has not expired. `payment_failed` retains access during the paid period; only `inactive` and `refunded` are terminal.
- Only fulfill Checkout after Stripe confirms payment. Asynchronous Checkout requires the separate success event.
- Lifecycle events must match the currently stored Stripe subscription or payment identity before they can change status. Ignore unmatched/late events rather than revoking a newer entitlement.
- Record the Stripe event creation time alongside the active subscription. A successful invoice cannot replace a different active subscription; newer confirmed Checkout and asynchronous Checkout events may replace it. Ignore matched negative events that predate the active success.
- Evaluate correlation and event ordering in the database mutation itself, not against a previously read row. Persist the accepted timestamp for both positive and negative lifecycle events. Stripe `created` timestamps are second-granularity; equal timestamps are deterministic no-ops, so the first accepted lifecycle event wins.
- Invoice payloads use Stripe's Basil-style nested subscription reference when present; retain compatibility with legacy top-level references.
- For modern Stripe API versions, resolve an invoice's paid PaymentIntent through the Invoice Payments API, then persist that identity so `charge.refunded` can correlate safely. If that enrichment fails, successful payment fulfillment remains non-fatal, but a later invoice-linked refund must resolve and match the invoice subscription; lookup failure must retry.
- Successful subscription payments have a local `payments` ledger row linked to the platform billing order it produced. This preserves each payment's Stripe event, invoice, payment-intent, and subscription identities independently from the user’s current billing state; negative events annotate the narrowest matching payment identity.

**Why:** Stripe deliveries can be asynchronous, retried, or arrive out of order. Treating subscription access as permanent or applying an old event solely by customer ID can grant access after expiry or revoke an active replacement subscription. Modern invoice objects no longer expose a reliable top-level PaymentIntent, so payment enrichment improves refund correlation—but a failed enrichment must not prevent a later refund from revoking the right subscription.

**How to apply:** Keep future buyer-only resource gates on the centralized expiry-aware entitlement predicate. When adding more webhook handlers, persist and compare the relevant Stripe object identity before updating lifecycle status, and use the payment ledger for order/reconciliation history rather than adding historical identifiers to `users`. Never restore inline price arithmetic or lifetime-plan branches.