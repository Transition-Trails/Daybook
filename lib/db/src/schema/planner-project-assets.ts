import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { plannerConfigsTable } from "./planner";
import { storesTable } from "./stores";

/** Daybook-owned copies of approved external artwork used by a planner project. */
export const plannerProjectAssetsTable = pgTable("planner_project_assets", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  plannerConfigId: text("planner_config_id").notNull().references(() => plannerConfigsTable.id, { onDelete: "cascade" }),
  managedObjectPath: text("managed_object_path").notNull(),
  displayName: text("display_name").notNull(),
  contentType: text("content_type").notNull().default("image/png"),
  byteSize: text("byte_size"),
  width: text("width"),
  height: text("height"),
  usageKind: text("usage_kind").notNull().default("artwork"),
  modified: boolean("modified").notNull().default(false),
  sourceSystem: text("source_system").notNull().default("worldsmith"),
  worldId: text("world_id"),
  collectionId: text("collection_id"),
  volumeId: text("volume_id"),
  productionSpecId: text("production_spec_id"),
  componentType: text("component_type"),
  sourceAssetId: text("source_asset_id").notNull(),
  sourceAssetVersion: text("source_asset_version").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  productionMetadata: jsonb("production_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("planner_project_assets_identity_idx").on(t.plannerConfigId, t.sourceAssetId, t.sourceAssetVersion),
  index("planner_project_assets_planner_idx").on(t.plannerConfigId),
  index("planner_project_assets_store_idx").on(t.storeId),
]);

export type PlannerProjectAsset = typeof plannerProjectAssetsTable.$inferSelect;
export type InsertPlannerProjectAsset = typeof plannerProjectAssetsTable.$inferInsert;