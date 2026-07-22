import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── THEMES ─────────────────────────────────────────────────────────────────

export const themesTable = pgTable("themes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft | live
  category: text("category"),
  coverColor: text("cover_color"),
  accentColor: text("accent_color"),
  palette: jsonb("palette"),
  previewImageUrl: text("preview_image_url"),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertThemeSchema = createInsertSchema(themesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTheme = z.infer<typeof insertThemeSchema>;
export type Theme = typeof themesTable.$inferSelect;

// ─── STICKER PACKS ───────────────────────────────────────────────────────────

export const stickerPacksTable = pgTable("sticker_packs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  category: text("category"),
  previewImageUrl: text("preview_image_url"),
  stickerCount: integer("sticker_count"),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertStickerPackSchema = createInsertSchema(
  stickerPacksTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStickerPack = z.infer<typeof insertStickerPackSchema>;
export type StickerPack = typeof stickerPacksTable.$inferSelect;

// ─── INSERTS ─────────────────────────────────────────────────────────────────

export const insertsTable = pgTable("inserts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  category: text("category"),
  imageUrl: text("image_url"),
  isTransparent: boolean("is_transparent").notNull().default(true),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertInsertSchema = createInsertSchema(insertsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInsert = z.infer<typeof insertInsertSchema>;
export type Insert = typeof insertsTable.$inferSelect;

// ─── RELATED PRODUCTS ────────────────────────────────────────────────────────

export const relatedProductsTable = pgTable("related_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  type: text("type").notNull().default("notes-only"), // notes-only | to-do | tracker | mixed
  previewImageUrl: text("preview_image_url"),
  price: real("price"),
  driveFileId: text("drive_file_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertRelatedProductSchema = createInsertSchema(
  relatedProductsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRelatedProduct = z.infer<typeof insertRelatedProductSchema>;
export type RelatedProduct = typeof relatedProductsTable.$inferSelect;
