import {
  pgTable,
  text,
  boolean,
  integer,
  serial,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── STORES ───────────────────────────────────────────────────────────────────
// A store is a white-label reseller that curates a subset of the central catalog.

export const storesTable = pgTable("stores", {
  id: text("id").primaryKey(), // stable slug e.g. "store-alpha"
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domain: text("domain"), // custom domain, nullable
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => usersTable.id),
  plan: text("plan").notNull().default("starter"), // starter | pro
  status: text("status").notNull().default("trial"), // active | trial | suspended
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Store = typeof storesTable.$inferSelect;
export type InsertStore = typeof storesTable.$inferInsert;

// ─── STORE MEMBERS ────────────────────────────────────────────────────────────
// A user can be a member of multiple stores, each with a scoped role.
// Roles (most → least privilege): store_owner | store_staff | support | customer

export const storeMembersTable = pgTable(
  "store_members",
  {
    id: serial("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // store_owner | store_staff | support | customer
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    storeUserUniq: unique("store_members_store_user_uq").on(t.storeId, t.userId),
  }),
);

export type StoreMember = typeof storeMembersTable.$inferSelect;
export type InsertStoreMember = typeof storeMembersTable.$inferInsert;

// ─── STORE CATALOG ────────────────────────────────────────────────────────────
// Which central catalog items a store has opted to show in its shop.
// A store may only enable items where globalAvailable = true.

export const storeCatalogTable = pgTable(
  "store_catalog",
  {
    id: serial("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull(), // theme | pack | insert | product | edition
    itemId: text("item_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    storeTypeItemUniq: unique("store_catalog_store_type_item_uq").on(
      t.storeId,
      t.itemType,
      t.itemId,
    ),
  }),
);

export type StoreCatalogItem = typeof storeCatalogTable.$inferSelect;
export type InsertStoreCatalogItem = typeof storeCatalogTable.$inferInsert;

// ─── STORE FLAGS ──────────────────────────────────────────────────────────────
// Feature flags and limits per store. Set by super_admin only.

export const storeFlagsTable = pgTable("store_flags", {
  storeId: text("store_id")
    .primaryKey()
    .references(() => storesTable.id, { onDelete: "cascade" }),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  customDomain: boolean("custom_domain").notNull().default(false),
  editionsCap: integer("editions_cap").notNull().default(5),
  storageQuota: integer("storage_quota").notNull().default(1024), // MB
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StoreFlags = typeof storeFlagsTable.$inferSelect;
export type InsertStoreFlags = typeof storeFlagsTable.$inferInsert;

// ─── HELP CONTENT ─────────────────────────────────────────────────────────────
// Articles and FAQs. scope = "platform" for central content, or a storeId.
// Platform-scoped: managed by super_admin, visible to all authenticated users.
// Store-scoped: managed by that store's owner/staff, visible to store members.

export const helpContentTable = pgTable("help_content", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull(),
  kind: text("kind").notNull().default("article"), // article | faq
  scope: text("scope").notNull().default("platform"), // "platform" | storeId
  status: text("status").notNull().default("draft"), // draft | live
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type HelpContent = typeof helpContentTable.$inferSelect;
export type InsertHelpContent = typeof helpContentTable.$inferInsert;

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
// Immutable record of every admin mutation.
// scope = "platform" for super_admin actions, or storeId for store-scoped actions.

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  actorRole: text("actor_role").notNull(),
  scope: text("scope").notNull(), // "platform" | storeId
  action: text("action").notNull(), // e.g. "store.create", "member.assign"
  targetType: text("target_type"), // "store" | "user" | "catalog_item" | "help" etc.
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
export type InsertAuditLog = typeof auditLogTable.$inferInsert;
