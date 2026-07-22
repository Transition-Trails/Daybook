import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("user"), // user | staff | owner
  planId: integer("plan_id"),
  stripeCustomerId: text("stripe_customer_id"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  notionToken: text("notion_token"),
  passwordHash: text("password_hash"), // for staff/owner local login
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// Per-user AI settings
export const aiSettingsTable = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  provider: text("provider").notNull().default("claude"), // claude | chatgpt | gemini
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAiSettingsSchema = createInsertSchema(aiSettingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertAiSettings = z.infer<typeof insertAiSettingsSchema>;
export type AiSettings = typeof aiSettingsTable.$inferSelect;

// Sync status per user
export const syncStatusTable = pgTable("sync_status", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  connected: boolean("connected").notNull().default(false),
  calendarLastSynced: timestamp("calendar_last_synced", {
    withTimezone: true,
  }),
  tasksLastSynced: timestamp("tasks_last_synced", { withTimezone: true }),
  docsLastSynced: timestamp("docs_last_synced", { withTimezone: true }),
  driveLastSynced: timestamp("drive_last_synced", { withTimezone: true }),
  driveFolder: text("drive_folder"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type SyncStatus = typeof syncStatusTable.$inferSelect;

// User purchases (owned catalog items)
export const userPurchasesTable = pgTable("user_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityType: text("entity_type").notNull(), // theme | stickerPack | insert | product | edition
  entityId: integer("entity_id").notNull(),
  priceType: text("price_type"), // one-time | yearly | lifetime
  stripeSessionId: text("stripe_session_id"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserPurchase = typeof userPurchasesTable.$inferSelect;
