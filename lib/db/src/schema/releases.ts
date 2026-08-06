import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Platform release tracking — one row per semver release.
 * Draft releases have is_published = false and release_date = null.
 * Publishing sets release_date = NOW() and is_published = true (immutable after).
 */
export const releasesTable = pgTable("releases", {
  id:          serial("id").primaryKey(),
  version:     text("version").notNull().unique(),   // semver e.g. "1.0.0"
  versionType: text("version_type").notNull(),        // "major" | "minor" | "bugfix"
  title:       text("title").notNull(),
  releaseDate: timestamp("release_date"),             // null until published
  githubSha:   text("github_sha"),                   // branch/ref returned by gitPush
  isPublished: boolean("is_published").notNull().default(false),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Release note bullets — ordered list of changes for a given release.
 */
export const releaseNotesTable = pgTable("release_notes", {
  id:        serial("id").primaryKey(),
  releaseId: integer("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  note:      text("note").notNull(),
});

export type Release       = typeof releasesTable.$inferSelect;
export type InsertRelease = typeof releasesTable.$inferInsert;
export type ReleaseNote       = typeof releaseNotesTable.$inferSelect;
export type InsertReleaseNote = typeof releaseNotesTable.$inferInsert;

/** Full release shape with eager-joined notes, returned by the API. */
export interface ReleaseWithNotes extends Release {
  notes: ReleaseNote[];
}
