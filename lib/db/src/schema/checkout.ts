import { pgTable, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";
import type { OrderItem } from "./orders";

/** A server-resolved cart awaiting a Stripe payment event. */
export const checkoutIntentsTable = pgTable(
  "checkout_intents",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    buyerUserId: text("buyer_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    items: jsonb("items").$type<OrderItem[]>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    expiresAtIdx: index("checkout_intents_expires_at_idx").on(table.expiresAt),
  }),
);

export type CheckoutIntent = typeof checkoutIntentsTable.$inferSelect;
export type InsertCheckoutIntent = typeof checkoutIntentsTable.$inferInsert;