import { pgTable, text, integer, timestamp, jsonb, unique } from "drizzle-orm/pg-core";

// ── SETUP (locked after first generation) ─────────────────────────────────────
export type PlannerSetup = {
  weekStart: "sun" | "mon";
  orientation: "landscape" | "vertical";
  startMonth: number; // 0-11
  startYear: number;
  monthCount: number; // 1-24
};

// ── STYLE (re-exportable) ──────────────────────────────────────────────────────
export type PlannerStyle = {
  cover?: string;
  texture?: "leather" | "linen" | "smooth";
  accent?: string;
  themeId?: string | null;
  tabTheme?: "neutral" | "accent";
  tabPos?: "right" | "top" | "bottom" | "none";
  fonts?: { heading: string; subheading: string; script: string };
  notePaper?: "dot" | "graph" | "lined" | "mixed";
  sections?: string[]; // 0-10 section names
  includedItems?: string[]; // pack/insert/product ids
};

// ── OUTPUT ────────────────────────────────────────────────────────────────────
export type PlannerOutput = {
  calMode: "link" | "overlay" | "none";
  eventMins: 30 | 60 | 90;
  aiInPdf: boolean;
};

// ── DRIVE REFERENCES ──────────────────────────────────────────────────────────
export type PlannerDrive = {
  folderId?: string;
  pdfFileId?: string | null;
  configFileId?: string | null;
};

export const plannerConfigsTable = pgTable("planner_configs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  editionId: text("edition_id"),
  year: integer("year"),
  setup: jsonb("setup").notNull().$type<PlannerSetup>(),
  style: jsonb("style").notNull().default({}).$type<PlannerStyle>(),
  output: jsonb("output")
    .notNull()
    .default({ calMode: "none", eventMins: 60, aiInPdf: false })
    .$type<PlannerOutput>(),
  drive: jsonb("drive")
    .notNull()
    .default({ pdfFileId: null, configFileId: null })
    .$type<PlannerDrive>(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PlannerConfig = typeof plannerConfigsTable.$inferSelect;
export type InsertPlannerConfig = typeof plannerConfigsTable.$inferInsert;

export const generationJobsTable = pgTable("generation_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  plannerId: text("planner_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | complete | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type GenerationJob = typeof generationJobsTable.$inferSelect;
export type InsertGenerationJob = typeof generationJobsTable.$inferInsert;

// ── Ink annotation types ───────────────────────────────────────────────────────

export type InkPoint = { x: number; y: number; p: number };

export type InkStroke = {
  id: string;
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  baseWidth: number;
  points: InkPoint[];
};

export type InkObject = {
  id: string;
  kind: "sticker";
  ref: string;   // emoji glyph or catalog sticker id
  x: number;    // normalized 0..1
  y: number;    // normalized 0..1
  scale: number;
  z: number;
};

// ── annotation_layers ─────────────────────────────────────────────────────────

export const annotationLayersTable = pgTable(
  "annotation_layers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    plannerId: text("planner_id").notNull(),
    pageId: text("page_id").notNull(),
    userId: text("user_id").notNull(),
    strokes: jsonb("strokes").notNull().default([]).$type<InkStroke[]>(),
    objects: jsonb("objects").notNull().default([]).$type<InkObject[]>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    schemaVersion: integer("schema_version").notNull().default(1),
  },
  (t) => ({
    uniqueLayer: unique().on(t.plannerId, t.pageId, t.userId),
  }),
);

export type AnnotationLayer = typeof annotationLayersTable.$inferSelect;
export type InsertAnnotationLayer = typeof annotationLayersTable.$inferInsert;
