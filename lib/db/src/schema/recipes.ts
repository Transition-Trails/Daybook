import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Product Recipes — platform-wide product blueprints.
 *
 * A recipe is a named arrangement of engines the platform already has.
 * Defining one makes a new product type available in a studio without new code.
 * Status lifecycle: draft → live → retired  (retired never removes existing artifacts).
 */
export const productRecipesTable = pgTable("product_recipes", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  /** Studio label: "Planner Studio" | "Sticker Studio" | "Journal Studio" | "Theme Studio" | string */
  category:      text("category").notNull(),
  /**
   * The either/or choice the buyer answers first.
   * { prompt: string; optionA: { label: string; consequence: string };
   *   optionB: { label: string; consequence: string } }
   */
  decisionCard:  jsonb("decision_card"),
  /** Engine capability slugs this recipe composes. */
  parts:         text("parts").array().notNull().default([]),
  /**
   * Physical production details.
   * { prints: boolean; impositionSheet?: string; templates?: string[] }
   */
  physicalPath:  jsonb("physical_path"),
  /**
   * Claude assistant grounding for this recipe.
   * { asks: string[]; generates: string }
   */
  claudeBrief:   jsonb("claude_brief"),
  /**
   * Release metadata.
   * { planTiers: string[]; month: number; year: number }
   */
  release:       jsonb("release"),
  /** "draft" | "live" | "retired" */
  status:        text("status").notNull().default("draft"),
  buildCount:    integer("build_count").notNull().default(0),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
  updatedAt:     timestamp("updated_at").defaultNow().notNull(),
});

export type ProductRecipe          = typeof productRecipesTable.$inferSelect;
export type InsertProductRecipe    = typeof productRecipesTable.$inferInsert;
