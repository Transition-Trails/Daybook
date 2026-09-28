import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** A client-authored summary, not a transcript or an automatically verified audit trail. */
export const wsSessionReportsTable = pgTable("ws_session_reports", {
  id: text("id").primaryKey(),
  authorUserId: text("author_user_id").notNull(),
  clientId: text("client_id").notNull(),
  sessionKey: text("session_key").notNull(),
  worldId: text("world_id"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  workDone: jsonb("work_done").$type<string[]>().notNull().default([]),
  decisions: jsonb("decisions").$type<string[]>().notNull().default([]),
  openQuestions: jsonb("open_questions").$type<string[]>().notNull().default([]),
  nextSteps: jsonb("next_steps").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("ws_session_reports_session_unique").on(t.authorUserId, t.clientId, t.sessionKey),
  index("ws_session_reports_created_idx").on(t.createdAt),
  index("ws_session_reports_world_idx").on(t.worldId),
]);

export type WsSessionReport = typeof wsSessionReportsTable.$inferSelect;