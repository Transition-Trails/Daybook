import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export interface OrderItem {
  name: string;
  priceCents: number;
  downloadUrl?: string;
}

export const ordersTable = pgTable("orders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => `ord_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`),
  storeId: text("store_id").notNull(),
  /** May be null for guest checkouts */
  buyerUserId: text("buyer_user_id").references(() => usersTable.id),
  buyerEmail: text("buyer_email").notNull(),
  buyerName: text("buyer_name"),
  /** Line items with price and optional download URL per item */
  items: jsonb("items").$type<OrderItem[]>().notNull().default([]),
  totalCents: integer("total_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  /** Ordered array of { name, url } for the download bundle */
  downloadLinks: jsonb("download_links")
    .$type<Array<{ name: string; url: string }>>()
    .notNull()
    .default([]),
  /** Re-send link token — allows unauthenticated receipt re-send */
  resendToken: text("resend_token")
    .$defaultFn(() => crypto.randomUUID()),
  receiptSentAt: timestamp("receipt_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Order = typeof ordersTable.$inferSelect;
export type InsertOrder = typeof ordersTable.$inferInsert;
