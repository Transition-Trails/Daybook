import { pgTable, text, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { plansTable } from "./plans";
import { usersTable } from "./users";

/**
 * The local billing ledger deliberately keeps Stripe identifiers separate from
 * the user row's "current billing identity" fields. A user can have many
 * successful invoice payments over the life of a subscription, and each one
 * must remain traceable to the order it produced.
 */
export const paymentsTable = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plansTable.id),
    source: text("source").notNull(), // checkout | async_checkout | invoice
    status: text("status").notNull().default("succeeded"), // succeeded | failed | refunded | cancelled
    stripeEventId: text("stripe_event_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeInvoiceId: text("stripe_invoice_id"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    lastLifecycleEventId: text("last_lifecycle_event_id"),
    lastLifecycleEventType: text("last_lifecycle_event_type"),
    lastLifecycleEventAt: timestamp("last_lifecycle_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("payments_stripe_event_id_uq").on(t.stripeEventId),
    unique("payments_stripe_payment_intent_id_uq").on(t.stripePaymentIntentId),
    index("payments_order_id_idx").on(t.orderId),
    index("payments_user_id_idx").on(t.userId),
    index("payments_subscription_id_idx").on(t.stripeSubscriptionId),
    index("payments_invoice_id_idx").on(t.stripeInvoiceId),
  ],
);

export type Payment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;