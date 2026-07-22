import { pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export type UserConnections = {
  googleDrive: boolean;
  googleCalendar: boolean;
  googleTasks: boolean;
  googleDocs: boolean;
  notion: boolean;
};

export const usersTable = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  provider: text("provider").notNull().default("google"), // google | notion
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("user"), // user | staff | owner
  plan: text("plan"), // "yearly" | "lifetime" | null
  owned: jsonb("owned").notNull().default([]).$type<string[]>(),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  aiProvider: text("ai_provider").notNull().default("claude"), // claude | chatgpt | gemini
  connections: jsonb("connections")
    .notNull()
    .default({
      googleDrive: false,
      googleCalendar: false,
      googleTasks: false,
      googleDocs: false,
      notion: false,
    })
    .$type<UserConnections>(),
  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  notionToken: text("notion_token"),
  passwordHash: text("password_hash"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
