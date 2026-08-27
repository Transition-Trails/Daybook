---
name: Platform billing analytics
description: Trust rules for recurring revenue and trial-conversion reporting.
---

Platform MRR must use only active subscriptions on the explicitly annual yearly plan, backed by a successful USD ledger payment for the same subscription. Do not divide unknown billing intervals by 12.

**Why:** A subscription identifier and payment amount establish that billing occurred, but not its recurrence interval. Treating every subscription as annual creates a plausible but false MRR.

**How to apply:** If new billing intervals are introduced, add authoritative interval metadata before including them in MRR. Paid-revenue history may still include successful recurring payments regardless of interval.

Trial conversion uses UTC calendar-month cohorts of eligible store owners. A cohort is scored only after month-end plus the full 30-day conversion window; immature periods remain null and keep their original time-series position.

**Why:** Scoring only early-month signups biases the newest cohort upward or downward, while removing null periods visually shifts later points into the wrong months.

**How to apply:** Keep cohort maturity all-or-nothing, preserve null periods through API and UI contracts, and apply the same seed-owner population filter to MRR, revenue, and conversion.