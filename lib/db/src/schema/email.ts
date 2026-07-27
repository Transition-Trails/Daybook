import {
  pgTable,
  text,
  timestamp,
  serial,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

// ─── STORE EMAIL CONFIGURATION ───────────────────────────────────────────────
// One row per store (created on first save). Controls tier-1 display name and
// tier-2 custom domain config.

export const storeEmailConfigTable = pgTable("store_email_config", {
  storeId: text("store_id")
    .primaryKey()
    .references(() => storesTable.id, { onDelete: "cascade" }),

  // Tier-1: override display name shown in From (defaults to store name).
  fromDisplayName: text("from_display_name"),

  // Tier-2 custom domain fields
  fromDomain: text("from_domain"),         // e.g. "mail.sageleafco.com"
  fromLocalPart: text("from_local_part"),  // e.g. "hello"
  domainStatus: text("domain_status").notNull().default("not_started"),
  // not_started | pending | verified | failed

  // Resend-side domain id (returned by Resend Domains API on creation)
  resendDomainId: text("resend_domain_id"),

  // DNS records returned by Resend when the domain is created; shown in UI.
  dnsRecords: jsonb("dns_records").$type<Array<{
    type: string;   // "MX" | "TXT" | "CNAME"
    name: string;
    value: string;
    ttl: string | number;
    status: string; // "not_started" | "verified" | "failed" (per-record)
  }>>(),

  dkimVerifiedAt: timestamp("dkim_verified_at", { withTimezone: true }),
  spfVerifiedAt:  timestamp("spf_verified_at",  { withTimezone: true }),
  lastVerifyCheckAt: timestamp("last_verify_check_at", { withTimezone: true }),
  lastVerifyError: text("last_verify_error"),

  // Reputation tracking (rolling; updated via webhook)
  tier1Suspended:   boolean("tier1_suspended").notNull().default(false),
  suspendedReason:  text("suspended_reason"),
  monthlyVolume:    integer("monthly_volume").notNull().default(0),
  bounceCount:      integer("bounce_count").notNull().default(0),
  complaintCount:   integer("complaint_count").notNull().default(0),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StoreEmailConfig = typeof storeEmailConfigTable.$inferSelect;
export type InsertStoreEmailConfig = typeof storeEmailConfigTable.$inferInsert;

// ─── EMAIL LOG ────────────────────────────────────────────────────────────────
// Immutable record of every send attempt. Bodies are never stored here.

export const emailLogTable = pgTable("email_log", {
  id: serial("id").primaryKey(),

  // Caller-provided idempotency key; unique constraint prevents double-send.
  idempotencyKey: text("idempotency_key").unique(),

  storeId: text("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  recipientEmail: text("recipient_email").notNull(),
  template: text("template").notNull(),
  // ticket_received | ticket_reply | ticket_closed | buyer_reopened |
  // new_ticket_store | new_ticket_platform | order_receipt | auto_response

  tier: text("tier").notNull().default("platform"), // platform | custom
  fromAddress: text("from_address").notNull(),
  subject: text("subject").notNull(),

  providerMessageId: text("provider_message_id"),
  status: text("status").notNull().default("queued"),
  // queued | sent | delivered | bounced | complained | failed

  statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailLog = typeof emailLogTable.$inferSelect;

// ─── AUTO-RESPONSE DEDUPE ─────────────────────────────────────────────────────
// Ensures we send at most one auto-response per (thread, sender) per 24-hour window.

export const emailAutoResponseDedupeTable = pgTable("email_auto_response_dedupe", {
  id: serial("id").primaryKey(),
  threadRef:   text("thread_ref").notNull(),    // ticket id or other thread key
  senderEmail: text("sender_email").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailAutoResponseDedupe = typeof emailAutoResponseDedupeTable.$inferSelect;
