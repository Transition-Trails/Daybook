import { pgTable, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { platformPlannerTemplatesTable } from "./planner";

export const PLANNER_PDF_IMPORT_SECTION_TYPES = [
  "cover", "front-matter", "year", "month", "monthly-divider", "week",
  "day", "notes", "reference", "dashboard", "other",
] as const;
export type PlannerPdfImportSectionType = typeof PLANNER_PDF_IMPORT_SECTION_TYPES[number];

export const PLANNER_PDF_IMPORT_BEHAVIORS = ["unique", "template", "repeating"] as const;
export type PlannerPdfImportBehavior = typeof PLANNER_PDF_IMPORT_BEHAVIORS[number];

export const plannerPdfImportsTable = pgTable("planner_pdf_imports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceObjectPath: text("source_object_path").notNull(),
  originalFileName: text("original_file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  pageCount: integer("page_count").notNull(),
  status: text("status").notNull().default("review"),
  createdByUserId: text("created_by_user_id").notNull(),
  plannerTemplateId: text("planner_template_id").references(() => platformPlannerTemplatesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  sourcePathIdx: index("planner_pdf_imports_source_path_idx").on(t.sourceObjectPath),
  creatorIdx: index("planner_pdf_imports_creator_idx").on(t.createdByUserId),
}));

export const plannerPdfImportPagesTable = pgTable("planner_pdf_import_pages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  importId: text("import_id").notNull().references(() => plannerPdfImportsTable.id, { onDelete: "cascade" }),
  sourcePageNumber: integer("source_page_number").notNull(),
  widthPoints: integer("width_points").notNull(),
  heightPoints: integer("height_points").notNull(),
  sectionType: text("section_type").notNull().default("other"),
  behavior: text("behavior").notNull().default("unique"),
  templateKey: text("template_key"),
  label: text("label"),
  orderIndex: integer("order_index").notNull(),
  hidden: boolean("hidden").notNull().default(false),
  overlay: jsonb("overlay").notNull().default({ elements: [] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  importOrderIdx: index("planner_pdf_import_pages_import_order_idx").on(t.importId, t.orderIndex),
}));

export type PlannerPdfImport = typeof plannerPdfImportsTable.$inferSelect;
export type PlannerPdfImportPage = typeof plannerPdfImportPagesTable.$inferSelect;