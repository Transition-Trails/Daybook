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
