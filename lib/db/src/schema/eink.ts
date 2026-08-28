import { pgTable, real, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export type EinkLinkSupport = "full" | "partial" | "poor";

/** Platform-owned device profiles used by export generation and operator tooling. */
export const einkDevicePresetsTable = pgTable("eink_device_presets", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  pixelWidth: integer("pixel_width").notNull(),
  pixelHeight: integer("pixel_height").notNull(),
  trimWidth: real("trim_width").notNull(),
  trimHeight: real("trim_height").notNull(),
  linkSupport: text("link_support").notNull().$type<EinkLinkSupport>(),
  safeInset: real("safe_inset").notNull().default(0),
  sellGuidance: text("sell_guidance").notNull(),
  caveat: text("caveat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EinkDevicePreset = typeof einkDevicePresetsTable.$inferSelect;
export type InsertEinkDevicePreset = typeof einkDevicePresetsTable.$inferInsert;

/** Editable safety rules read by the checker and the e-ink renderer. */
export const einkEnforcementRulesTable = pgTable("eink_enforcement_rules", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  threshold: real("threshold"),
  unit: text("unit"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EinkEnforcementRule = typeof einkEnforcementRulesTable.$inferSelect;
export type InsertEinkEnforcementRule = typeof einkEnforcementRulesTable.$inferInsert;