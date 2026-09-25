import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const mcpCanonHistoryTable = pgTable("mcp_canon_history", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  changeType: text("change_type").notNull(),
  before: jsonb("before").$type<Record<string, unknown>>().notNull().default({}),
  after: jsonb("after").$type<Record<string, unknown>>().notNull().default({}),
  diff: jsonb("diff").$type<Record<string, { before: unknown; after: unknown }>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("mcp_canon_history_record_idx").on(t.recordId, t.createdAt)]);

export type McpCanonHistory = typeof mcpCanonHistoryTable.$inferSelect;