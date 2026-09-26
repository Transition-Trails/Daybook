import { pgTable, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type UserConnections = {
  googleDrive: boolean;
  googleCalendar: boolean;
  googleTasks: boolean;
  googleDocs: boolean;
  notion: boolean;
  calendarLastSynced?: string;
  tasksLastSynced?: string;
  docsLastSynced?: string;
  driveLastSynced?: string;
};

export const usersTable = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  provider: text("provider").notNull().default("google"), // google | notion
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  plan: text("plan"), // "yearly" | null
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
  googleTokenExpiry: timestamp("google_token_expiry", { withTimezone: true }),
  /** Advances on each fresh OAuth consent to fence stale refresh responses. */
  googleTokenVersion: integer("google_token_version").notNull().default(0),
  /** Set only when Google explicitly rejects the refresh grant. */
  googleDisconnectedAt: timestamp("google_disconnected_at", { withTimezone: true }),
  googleDisconnectReason: text("google_disconnect_reason"),
  /** Stable, user-owned root-level Daybook folder resolved on first Drive use. */
  googleDriveFolderId: text("google_drive_folder_id"),
  notionToken: text("notion_token"),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  passwordCredentialVersion: integer("password_credential_version").notNull().default(0),
  // Platform-level role. null = no platform privilege.
  // super_admin: full platform access, bypasses all store scoping.
  platformRole: text("platform_role"), // "super_admin" | null
  stripeCustomerId: text("stripe_customer_id"),
  // These fields represent the revocable subscription lifecycle.
  planCurrentPeriodEnd: timestamp("plan_current_period_end", { withTimezone: true }),
  planStatus: text("plan_status"), // active | inactive | payment_failed | refunded
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSubscriptionEventCreatedAt: timestamp("stripe_subscription_event_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** One-use invitation records. Only a digest of the bearer token is stored. */
export const userInvitationsTable = pgTable("user_invitations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull(),
  role: text("role").notNull(),
  storeId: text("store_id"),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("user_invitations_email_idx").on(table.email),
  expiresAtIdx: index("user_invitations_expires_at_idx").on(table.expiresAt),
  roleStoreCheck: check(
    "user_invitations_role_store_ck",
    sql`(${table.role} = 'super_admin' AND ${table.storeId} IS NULL) OR (${table.role} IN ('store_owner', 'store_staff', 'support') AND ${table.storeId} IS NOT NULL)`,
  ),
}));

/** One-use customer verification and password-reset credentials. Only a digest
 * of each bearer token is stored; purpose and expiry are checked on consumption. */
export const userAuthTokensTable = pgTable("user_auth_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  storeId: text("store_id"),
  purpose: text("purpose").notNull(), // email_verification | password_reset
  tokenHash: text("token_hash").notNull().unique(),
  credentialHash: text("credential_hash"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userPurposeIdx: index("user_auth_tokens_user_purpose_idx").on(table.userId, table.purpose),
  expiresAtIdx: index("user_auth_tokens_expires_at_idx").on(table.expiresAt),
  purposeCheck: check(
    "user_auth_tokens_purpose_ck",
    sql`${table.purpose} IN ('email_verification', 'password_reset')`,
  ),
}));

/**
 * The runtime row always includes these nullable columns. Keep them optional in
 * the app-facing type while older focused tests and session fixtures migrate
 * without unrelated boilerplate.
 */
export type User = Omit<
  typeof usersTable.$inferSelect,
  "googleTokenVersion" | "googleDisconnectedAt" | "googleDisconnectReason" | "googleDriveFolderId" | "emailVerifiedAt" | "passwordCredentialVersion"
> & {
  googleTokenVersion?: number;
  googleDisconnectedAt?: Date | null;
  googleDisconnectReason?: string | null;
  googleDriveFolderId?: string | null;
  emailVerifiedAt?: Date | null;
  passwordCredentialVersion?: number;
};
export type InsertUser = typeof usersTable.$inferInsert;
