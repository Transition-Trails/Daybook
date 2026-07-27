import { pgTable, text, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── TICKETS ──────────────────────────────────────────────────────────────────
// Issue reports from store owners (→ platform queue) and buyers (→ store queue).
//
// recipientScope = "platform"  → super-admin handles it (store-owner ticket)
// recipientScope = <storeId>   → that store's owner/staff handles it (buyer ticket)
//
// storeId always carries the store context so cross-store guards can fire.

export const ticketsTable = pgTable("tickets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => `tkt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`),
  /** Null allows future anonymous/unauthenticated filing. */
  reporterUserId: text("reporter_user_id").references(() => usersTable.id),
  /** "store_owner" | "store_staff" | "buyer" | "super_admin" */
  reporterRole: text("reporter_role").notNull().default("buyer"),
  /** "platform" for owner → super-admin; storeId for buyer → store. */
  recipientScope: text("recipient_scope").notNull(),
  /** Store context — present on both buyer and owner tickets. */
  storeId: text("store_id"),
  area: text("area").notNull(),
  /** Array of symptom keys selected by the reporter. */
  symptoms: jsonb("symptoms").$type<string[]>().notNull().default([]),
  body: text("body"),
  /** Object-storage paths — never base64. */
  screenshotRefs: jsonb("screenshot_refs").$type<string[]>().notNull().default([]),
  /** Assembled server-side from plannerConfig + generation job. */
  diagnostics: jsonb("diagnostics").$type<Record<string, unknown>>().notNull().default({}),
  /** "open" | "replied" | "fixed" | "closed" */
  status: text("status").notNull().default("open"),
  /** plannerConfig id or pack id for the build this ticket is about. */
  buildRef: text("build_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Ticket = typeof ticketsTable.$inferSelect;
export type InsertTicket = typeof ticketsTable.$inferInsert;

// ─── TICKET REPLIES ────────────────────────────────────────────────────────────
// Threaded replies on a ticket. Email is notification-only; this thread is canon.

export const ticketRepliesTable = pgTable("ticket_replies", {
  id: serial("id").primaryKey(),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => ticketsTable.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").references(() => usersTable.id),
  /** Role at time of writing. */
  authorRole: text("author_role").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TicketReply = typeof ticketRepliesTable.$inferSelect;
export type InsertTicketReply = typeof ticketRepliesTable.$inferInsert;
