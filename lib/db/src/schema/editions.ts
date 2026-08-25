import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core";
import type { ItemOrigin } from "./catalog";
import { storesTable } from "./stores";

export type EditionArt = {
  cover: string | null;
  first: string | null;
  divider: string | null;
  weekly: string | null;
  daily: string | null;
  notes: string | null;
};

/**
 * What kind of bound product this edition represents.
 * Drives section availability in the planner studio and
 * the generator's page-set selection.
 *   planner        — standard dated/undated planner (default)
 *   notebook       — cover + dividers + note-paper only
 *   journal        — cover + dividers + lined/ruled note-paper
 *   memory-keeping — cover + dividers + photo-caption note-paper
 */
export type ProductType = "planner" | "notebook" | "journal" | "memory-keeping";

/**
 * Physical binding of the finished product — purely decorative in the PDF
 * (shows ring art in the realistic render pass); does not affect page geometry.
 */
export type EditionBinding = {
  type: "coil" | "twin-loop" | "discs" | "3-ring" | "none";
  finish: "gold" | "rose gold" | "silver" | "matte black" | "white";
};

export const editionsTable = pgTable("editions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // draft | live
  tier: text("tier").notNull().default("basic"), // basic | advanced
  sections: text("sections").array().notNull().default([]),
  priceLow: real("price_low"),
  priceHigh: real("price_high"),
  themes: jsonb("themes").notNull().default([]).$type<string[]>(),
  packs: jsonb("packs").notNull().default([]).$type<string[]>(),
  inserts: jsonb("inserts").notNull().default([]).$type<string[]>(),
  products: jsonb("products").notNull().default([]).$type<string[]>(),
  art: jsonb("art")
    .notNull()
    .default({
      cover: null,
      first: null,
      divider: null,
      weekly: null,
      daily: null,
      notes: null,
    })
    .$type<EditionArt>(),
  globalAvailable: boolean("global_available").notNull().default(true),
  origin: text("origin").notNull().default("licensed").$type<ItemOrigin>(),
  authoredByStoreId: text("authored_by_store_id").references(() => storesTable.id, { onDelete: "set null" }),
  revisionOf: text("revision_of"), // edition id | null
  year: integer("year"),
  /**
   * World code this edition belongs to (e.g. "VGJ", "WYC").
   * Null means the edition is not linked to a specific WorldSmith world.
   */
  world: text("world"),
  /**
   * Product type — drives studio section menu and generator page set.
   * Defaults to 'planner' for all existing rows.
   */
  productType: text("product_type").notNull().default("planner").$type<ProductType>(),
  /**
   * Physical binding spec — rendered as ring art in the realistic preview.
   * Null = no binding decoration.
   */
  binding: jsonb("binding").$type<EditionBinding>(),
  /**
   * Optional immutable authored-interior revision used when generating this
   * sellable edition. Existing editions continue on the legacy generator.
   */
  interiorVersionId: text("interior_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Edition = typeof editionsTable.$inferSelect;
export type InsertEdition = typeof editionsTable.$inferInsert;
