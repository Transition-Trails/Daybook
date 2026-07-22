import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const editionsTable = pgTable("editions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft | live
  tier: text("tier").notNull().default("basic"), // basic | advanced
  themeId: integer("theme_id"),
  oneTimePrice: real("one_time_price"),
  yearlyPrice: real("yearly_price"),
  lifetimePrice: real("lifetime_price"),
  stripeProductId: text("stripe_product_id"),
  previewImageUrl: text("preview_image_url"),
  perPageArtFileIds: jsonb("per_page_art_file_ids"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertEditionSchema = createInsertSchema(editionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEdition = z.infer<typeof insertEditionSchema>;
export type Edition = typeof editionsTable.$inferSelect;

// ─── JUNCTION TABLES ─────────────────────────────────────────────────────────

export const editionStickerPacksTable = pgTable("edition_sticker_packs", {
  id: serial("id").primaryKey(),
  editionId: integer("edition_id").notNull(),
  stickerPackId: integer("sticker_pack_id").notNull(),
});

export const editionInsertsTable = pgTable("edition_inserts", {
  id: serial("id").primaryKey(),
  editionId: integer("edition_id").notNull(),
  insertId: integer("insert_id").notNull(),
});

export const editionProductsTable = pgTable("edition_products", {
  id: serial("id").primaryKey(),
  editionId: integer("edition_id").notNull(),
  productId: integer("product_id").notNull(),
});

export const editionPlansTable = pgTable("edition_plans", {
  id: serial("id").primaryKey(),
  editionId: integer("edition_id").notNull(),
  planId: integer("plan_id").notNull(),
});
