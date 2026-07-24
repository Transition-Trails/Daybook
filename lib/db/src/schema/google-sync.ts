import { pgTable, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";

// ── CALENDAR PUSH MAPPINGS ────────────────────────────────────────────────────
// Tracks planner block → Google Calendar event for idempotent pushes.
// localBlockKey = "<title>|<startDate>" (client-stable within a planner).

export const calendarPushMappingsTable = pgTable(
  "calendar_push_mappings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    plannerConfigId: text("planner_config_id").notNull(),
    localBlockKey: text("local_block_key").notNull(),
    googleEventId: text("google_event_id").notNull(),
    googleCalendarId: text("google_calendar_id").notNull().default("primary"),
    eventTitle: text("event_title").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    pushedAt: timestamp("pushed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueBlock: unique().on(t.userId, t.plannerConfigId, t.localBlockKey),
  }),
);

export type CalendarPushMapping = typeof calendarPushMappingsTable.$inferSelect;
export type InsertCalendarPushMapping = typeof calendarPushMappingsTable.$inferInsert;

// ── GOOGLE TASK SYNC ──────────────────────────────────────────────────────────
// Local mirror of Google Tasks for two-way sync tracking.

export const googleTaskSyncTable = pgTable(
  "google_task_sync",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    googleTaskId: text("google_task_id").notNull(),
    googleTaskListId: text("google_task_list_id").notNull().default("@default"),
    title: text("title").notNull(),
    notes: text("notes"),
    completed: boolean("completed").notNull().default(false),
    dueDate: text("due_date"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueTask: unique().on(t.userId, t.googleTaskId),
  }),
);

export type GoogleTaskSync = typeof googleTaskSyncTable.$inferSelect;
export type InsertGoogleTaskSync = typeof googleTaskSyncTable.$inferInsert;

// ── GOOGLE DOC LINKS ──────────────────────────────────────────────────────────
// Stores the Google Doc created from a note/brain-dump entry.

export const googleDocLinksTable = pgTable(
  "google_doc_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    noteKey: text("note_key").notNull(), // client-stable ID for the source note
    title: text("title").notNull(),
    docId: text("doc_id").notNull(),
    docUrl: text("doc_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueNote: unique().on(t.userId, t.noteKey),
  }),
);

export type GoogleDocLink = typeof googleDocLinksTable.$inferSelect;
export type InsertGoogleDocLink = typeof googleDocLinksTable.$inferInsert;
