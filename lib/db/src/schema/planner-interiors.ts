import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export type PlannerInteriorTrim = {
  w: number;
  h: number;
  unit: "mm";
};

export type PlannerInteriorRepeat = {
  over: "months" | "days";
  from: string;
  to: string;
};

export type PlannerInteriorPageRule = {
  template: string;
  once?: true;
  repeat?: PlannerInteriorRepeat;
};

/**
 * The manifest deliberately contains sequence and trim only. SVG assets remain
 * the single source of positions, typography, colours, and link-zone geometry.
 */
export type PlannerInteriorManifest = {
  trim: PlannerInteriorTrim;
  pages: PlannerInteriorPageRule[];
};

export type PlannerInteriorAssets = Record<string, string>;

export const plannerInteriorsTable = pgTable(
  "planner_interiors",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currentVersionId: text("current_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    storeIdx: index("planner_interiors_store_id_idx").on(table.storeId),
  }),
);

export const plannerInteriorVersionsTable = pgTable(
  "planner_interior_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    interiorId: text("interior_id").notNull().references(() => plannerInteriorsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    manifest: jsonb("manifest").notNull().$type<PlannerInteriorManifest>(),
    assets: jsonb("assets").notNull().$type<PlannerInteriorAssets>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    interiorVersionUnique: unique("planner_interior_versions_interior_version_uq").on(table.interiorId, table.version),
    interiorIdx: index("planner_interior_versions_interior_id_idx").on(table.interiorId),
  }),
);

export const insertPlannerInteriorSchema = createInsertSchema(plannerInteriorsTable)
  .omit({ id: true, currentVersionId: true, createdAt: true, updatedAt: true });

export type PlannerInterior = typeof plannerInteriorsTable.$inferSelect;
export type PlannerInteriorVersion = typeof plannerInteriorVersionsTable.$inferSelect;
export type InsertPlannerInterior = z.infer<typeof insertPlannerInteriorSchema>;