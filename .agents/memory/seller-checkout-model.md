---
name: Seller checkout model
description: Merchant-of-record, payment-isolation, and secure-delivery rules for seller commerce.
---

Seller storefront purchases use Stripe Connect direct charges. The connected seller is the merchant of record; the platform does not collect seller funds or apply an application fee by default. A connected account ID is insufficient: only Stripe's `charges_enabled` makes a store sellable.

**Why:** Seller revenue must remain separate from platform subscriptions, avoiding platform tax, payout, and chargeback liability. Checkout requests and durable links are untrusted capability boundaries.

**How to apply:** Resolve catalog prices, availability, and entitlement on the server from item references only. Fulfill seller Checkout Sessions separately from subscription lifecycle handlers so seller purchases never mutate subscription fields. Persist purchased item references, generate order-scoped signed download links only at delivery time, and make receipt recovery email-only, rate-limited, and privacy-preserving. Every receipt must enumerate every purchased download link; the Drive credential must belong to the selected generated planner config, not necessarily the store owner. Subscription ledger rows belong to the platform seller, not the house storefront.