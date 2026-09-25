import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, integer, index, primaryKey, check } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** OAuth clients registered by remote MCP clients. Redirects are exact HTTPS URLs. */
export const mcpOAuthClientsTable = pgTable("mcp_oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientName: text("client_name").notNull(),
  redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One-use authorization codes. Only a SHA-256 digest of the code is stored. */
export const mcpOAuthAuthorizationCodesTable = pgTable("mcp_oauth_authorization_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull().references(() => mcpOAuthClientsTable.clientId, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  resource: text("resource").notNull(),
  scopes: jsonb("scopes").notNull().$type<string[]>(),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expiryIdx: index("mcp_oauth_codes_expiry_idx").on(table.expiresAt),
  userIdx: index("mcp_oauth_codes_user_idx").on(table.userId),
}));

/**
 * Hash-only opaque access/refresh credentials. Refresh generations retain their
 * family ID so presentation of any old generation revokes the whole family.
 */
export const mcpOAuthTokensTable = pgTable("mcp_oauth_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  kind: text("kind").notNull(), // access | refresh
  familyId: text("family_id").notNull(),
  clientId: text("client_id").notNull().references(() => mcpOAuthClientsTable.clientId, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(),
  scopes: jsonb("scopes").notNull().$type<string[]>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedByHash: text("replaced_by_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  familyIdx: index("mcp_oauth_tokens_family_idx").on(table.familyId),
  userIdx: index("mcp_oauth_tokens_user_idx").on(table.userId),
  expiryIdx: index("mcp_oauth_tokens_expiry_idx").on(table.expiresAt),
}));

/** Shared limiter storage; keep this declaration aligned with migration 0059. */
export const mcpOAuthRegistrationLimitsTable = pgTable("mcp_oauth_registration_limits", {
  scope: text("scope").notNull(),
  subjectKey: text("subject_key").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scope, table.subjectKey, table.windowStartedAt] }),
  check("mcp_oauth_registration_limits_attempts_check", sql`${table.attempts} > 0`),
  index("mcp_oauth_registration_limits_window_idx").on(table.windowStartedAt),
]);

export type McpOAuthClient = typeof mcpOAuthClientsTable.$inferSelect;
export type McpOAuthAuthorizationCode = typeof mcpOAuthAuthorizationCodesTable.$inferSelect;
export type McpOAuthToken = typeof mcpOAuthTokensTable.$inferSelect;