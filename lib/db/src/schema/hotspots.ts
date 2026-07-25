/**
 * Planner Hotspot Map — seller-defined normalized-rect link overlays.
 *
 * A hotspot belongs to a PAGE TEMPLATE (identified by storeId + templateKey),
 * NOT to a generated page instance. This is the core of "template memory":
 * saving a map once makes every future regeneration (different year, theme,
 * palette, paper colour) reuse it automatically with zero re-mapping.
 *
 * Coordinate system: x, y, w, h are 0.0–1.0 fractions of the page's live
 * width/height so the map survives any size, scale or orientation change.
 *
 * targetType values (resolved at stamp time against the live page map):
 *   Static navigation  : 'home' | 'cover' | 'year' | 'todo' | 'notes'
 *   Relative navigation: 'next-week' | 'prev-week' | 'next-day' | 'prev-day'
 *                        'next-month' | 'prev-month'
 *   Contextual         : 'month-for-week' | 'month-for-day'
 *                        'month-divider'   (current month's mdiv)
 *                        'month-calendar'  (current month's calendar)
 *   Section            : 'section-n'  (targetRef = 0-based section index as string)
 *   External URL       : 'url'        (targetRef = full https:// href)
 *
 * source: 'auto'   → Claude vision proposed; confidence 0–1 set
 *         'manual' → seller drew or edited; confidence null
 */
import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

export const plannerHotspotsTable = pgTable("planner_hotspots", {
  id: text("id").primaryKey(),
  /** Store that owns this hotspot map. */
  storeId: text("store_id").notNull(),
  /**
   * PageRole string — 'cover'|'home'|'year'|'monthly-divider'|'monthly-calendar'|
   * 'weekly'|'daily'|'todo'|'notes'|'section-divider'|'note-paper'.
   * This IS the template key; one set of hotspots per (storeId, templateKey).
   */
  templateKey: text("template_key").notNull(),
  /** Normalized left edge  (0.0 = left  of page, 1.0 = right of page). */
  x: real("x").notNull(),
  /** Normalized bottom edge (0.0 = bottom of page, 1.0 = top of page — PDF origin). */
  y: real("y").notNull(),
  /** Normalized width  (fraction of page width). */
  w: real("w").notNull(),
  /** Normalized height (fraction of page height). */
  h: real("h").notNull(),
  targetType: text("target_type").notNull(),
  /** URL for 'url' type; section index (as string) for 'section-n'; null otherwise. */
  targetRef: text("target_ref"),
  /** 0.0–1.0 from Claude vision; null for manual hotspots. */
  confidence: real("confidence"),
  /** 'auto' | 'manual' */
  source: text("source").notNull().default("manual"),
  /** Optional display label drawn beside the hotspot (seller-facing). */
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PlannerHotspot = typeof plannerHotspotsTable.$inferSelect;
export type InsertPlannerHotspot = typeof plannerHotspotsTable.$inferInsert;
