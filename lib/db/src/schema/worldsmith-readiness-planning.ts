import { check, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const READINESS_LANES = ["backlog", "in_progress", "review", "ready"] as const;
export type ReadinessLane = (typeof READINESS_LANES)[number];
export const READINESS_ENTITY_TYPES = ["canon_record", "storyline", "beat"] as const;
export type ReadinessEntityType = (typeof READINESS_ENTITY_TYPES)[number];

export const wsReadinessAssignmentsTable = pgTable("ws_readiness_assignments", {
  worldId: text("world_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  lane: text("lane").notNull().default("backlog"),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.entityType, table.entityId] }),
  index("ws_readiness_assignments_world_idx").on(table.worldId, table.entityType),
  check("ws_readiness_assignments_lane_check", sql`${table.lane} IN ('backlog', 'in_progress', 'review', 'ready')`),
  check("ws_readiness_assignments_entity_type_check", sql`${table.entityType} IN ('canon_record', 'storyline', 'beat')`),
]);

export type WsReadinessAssignment = typeof wsReadinessAssignmentsTable.$inferSelect;