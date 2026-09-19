import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { storesTable } from "./stores";

/** Encrypted tenant/platform provider credentials. The API never returns secret material. */
export const aiProviderConfigsTable = pgTable(
  "ai_provider_configs",
  {
    id: serial("id").primaryKey(),
    storeId: text("store_id").references(() => storesTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // claude | chatgpt | gemini
    encryptedCredential: text("encrypted_credential"),
    credentialIv: text("credential_iv"),
    credentialTag: text("credential_tag"),
    enabled: boolean("enabled").notNull().default(true),
    allowPlatformFallback: boolean("allow_platform_fallback").notNull().default(true),
    allowedModels: text("allowed_models").array().notNull().default([]),
    requestsPerDay: integer("requests_per_day"),
    estimatedCentsPerMonth: integer("estimated_cents_per_month"),
    createdBy: text("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    // PostgreSQL UNIQUE permits multiple NULLs; coalesce makes the platform
    // (NULL store_id) scope a true singleton per provider.
    tenantProviderScopeUnique: uniqueIndex("ai_provider_configs_scope_provider_uq")
      .on(sql`coalesce(${t.storeId}, '__platform__')`, t.provider),
  }),
);

export const aiPricingTable = pgTable(
  "ai_pricing",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    version: integer("version").notNull().default(1),
    inputCentsPerMillion: integer("input_cents_per_million").notNull().default(0),
    outputCentsPerMillion: integer("output_cents_per_million").notNull().default(0),
    imageCents: integer("image_cents"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => ({ pricingVersionUnique: unique("ai_pricing_provider_model_version_uq").on(t.provider, t.model, t.version) }),
);

export const aiUsageRecordsTable = pgTable("ai_usage_records", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  storeId: text("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  feature: text("feature").notNull().default("unattributed"),
  provider: text("provider").notNull(),
  model: text("model"),
  promptHash: text("prompt_hash").notNull(),
  status: text("status").notNull(), // success | error | duplicate | quota_exceeded
  errorCategory: text("error_category"),
  providerRequestId: text("provider_request_id"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  estimatedCostCents: integer("estimated_cost_cents"),
  costUnavailableReason: text("cost_unavailable_reason"),
  fundingSource: text("funding_source").notNull().default("platform"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiCallReservationsTable = pgTable("ai_call_reservations", {
  id: serial("id").primaryKey(),
  dedupeKey: text("dedupe_key").notNull(),
  configId: integer("config_id").references(() => aiProviderConfigsTable.id, { onDelete: "set null" }),
  scopeStoreId: text("scope_store_id").references(() => storesTable.id, { onDelete: "set null" }),
  fundingSource: text("funding_source").notNull(),
  estimatedReservedCents: integer("estimated_reserved_cents").notNull().default(0),
  status: text("status").notNull(), // pending | completed | failed
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  pendingDedupeUnique: uniqueIndex("ai_call_reservations_pending_dedupe_uq")
    .on(t.dedupeKey)
    .where(sql`${t.status} = 'pending'`),
}));

export type AiProviderConfig = typeof aiProviderConfigsTable.$inferSelect;
export type InsertAiProviderConfig = typeof aiProviderConfigsTable.$inferInsert;
export type AiPricing = typeof aiPricingTable.$inferSelect;
export type InsertAiPricing = typeof aiPricingTable.$inferInsert;
export type AiUsageRecord = typeof aiUsageRecordsTable.$inferSelect;
export type InsertAiUsageRecord = typeof aiUsageRecordsTable.$inferInsert;
export type AiCallReservation = typeof aiCallReservationsTable.$inferSelect;
export type InsertAiCallReservation = typeof aiCallReservationsTable.$inferInsert;