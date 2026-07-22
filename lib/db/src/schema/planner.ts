import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const plannerConfigsTable = pgTable("planner_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  editionId: integer("edition_id"),
  name: text("name"),
  // Setup fields — locked after first generation
  weekStart: text("week_start").notNull().default("sunday"), // sunday | monday
  layout: text("layout").notNull().default("vertical"), // 2page-landscape | vertical
  rangeType: text("range_type").notNull().default("12month"), // 90day | 12month | monthly | custom
  startMonth: integer("start_month"),
  startYear: integer("start_year"),
  monthCount: integer("month_count"),
  // Style fields — re-exportable
  coverColor: text("cover_color"),
  coverTexture: text("cover_texture"),
  accentColor: text("accent_color"),
  headingFont: text("heading_font"),
  subheadingFont: text("subheading_font"),
  scriptFont: text("script_font"),
  notesSections: text("notes_sections").array().notNull().default([]),
  notePaperStyle: text("note_paper_style"),
  tabPosition: text("tab_position"),
  calendarLinkType: text("calendar_link_type").default("none"),
  aiPromptBlocks: boolean("ai_prompt_blocks").notNull().default(false),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  driveUrl: text("drive_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPlannerConfigSchema = createInsertSchema(
  plannerConfigsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlannerConfig = z.infer<typeof insertPlannerConfigSchema>;
export type PlannerConfig = typeof plannerConfigsTable.$inferSelect;

export const generationJobsTable = pgTable("generation_jobs", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().unique(),
  userId: integer("user_id").notNull(),
  configId: integer("config_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | complete | failed
  pdfUrl: text("pdf_url"),
  configJsonUrl: text("config_json_url"),
  driveFileId: text("drive_file_id"),
  errorMessage: text("error_message"),
  pageCount: integer("page_count"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertGenerationJobSchema = createInsertSchema(
  generationJobsTable,
).omit({ id: true, createdAt: true });
export type InsertGenerationJob = z.infer<typeof insertGenerationJobSchema>;
export type GenerationJob = typeof generationJobsTable.$inferSelect;
