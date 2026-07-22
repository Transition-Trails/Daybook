import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const assetsTable = pgTable("assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  driveFileId: text("drive_file_id").notNull(),
  kind: text("kind").notNull().default("png"), // png | pdf
  transparent: boolean("transparent").notNull().default(true),
  tags: text("tags").array().notNull().default([]),
  source: text("source").notNull().default("upload"), // upload | canva
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Asset = typeof assetsTable.$inferSelect;
export type InsertAsset = typeof assetsTable.$inferInsert;
