import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  serial,
  unique,
} from "drizzle-orm/pg-core";
import { assetsTable } from "./assets";
import { storesTable } from "./stores";

// Origin of a catalog item — drives entitlement rules everywhere.
// starter  → always entitled; every store gets it regardless of subscription.
// licensed → platform catalog; entitled only while store.subscriptionActive is true.
// owned    → authored by a specific store; only that store (+ super_admin) can use/see it.
export type ItemOrigin = "starter" | "licensed" | "owned";

// ─── THEMES ──────────────────────────────────────────────────────────────────
// colors: [accent, accent-dark, secondary, tertiary, ink, paper]
// fontPairing: optional named fonts for heading/subheading/body/accent slots.

export interface ThemeFontPairing {
  heading?: string;
  subheading?: string;
  body?: string;
  accent?: string;
}

export const themesTable = pgTable("themes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  desc: text("desc"),
  colors: jsonb("colors").notNull().$type<string[]>(),
  price: real("price").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft | live
  createdBy: text("created_by").notNull().default("admin"), // seed | claude | admin
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Controls whether stores may enable this item in their shop.
  globalAvailable: boolean("global_available").notNull().default(true),
  // Entitlement origin — drives gating logic everywhere.
  origin: text("origin").notNull().default("licensed").$type<ItemOrigin>(),
  // Set only for owned items; the store that authored this item.
  authoredByStoreId: text("authored_by_store_id").references(() => storesTable.id, { onDelete: "set null" }),
  fontPairing: jsonb("font_pairing").$type<ThemeFontPairing>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Theme = typeof themesTable.$inferSelect;
export type InsertTheme = typeof themesTable.$inferInsert;

// ─── STICKER PACKS ───────────────────────────────────────────────────────────

export const stickerPacksTable = pgTable("sticker_packs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tags: text("tags").array().notNull().default([]),
  price: real("price").notNull().default(0),
  status: text("status").notNull().default("draft"), // draft | live
  coverDriveFileId: text("cover_drive_file_id"),
  planners: jsonb("planners").notNull().default(["all"]).$type<string[]>(), // edition ids or ["all"]
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  globalAvailable: boolean("global_available").notNull().default(true),
  origin: text("origin").notNull().default("licensed").$type<ItemOrigin>(),
  authoredByStoreId: text("authored_by_store_id").references(() => storesTable.id, { onDelete: "set null" }),
  // ── Commercial resale attestation (Sticker Studio §J) ─────────────────
  // Required before publishing. "own-or-licensed" | "ai-generated"
  attestation: text("attestation"),
  // Name of the AI tool used (only relevant when attestation = "ai-generated")
  attestingTool: text("attesting_tool"),
  // Optional seller-uploaded customer instruction PDF (base64 or ref)
  instructionSheetFileId: text("instruction_sheet_file_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StickerPack = typeof stickerPacksTable.$inferSelect;
export type InsertStickerPack = typeof stickerPacksTable.$inferInsert;

// ─── STICKERS (assets inside a pack) ─────────────────────────────────────────

export const stickersTable = pgTable("stickers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  packId: text("pack_id")
    .notNull()
    .references(() => stickerPacksTable.id, { onDelete: "cascade" }),
  assetId: text("asset_id")
    .notNull()
    .references(() => assetsTable.id, { onDelete: "cascade" }),
  name: text("name"),
  position: integer("position").notNull().default(0),
});

export type Sticker = typeof stickersTable.$inferSelect;
export type InsertSticker = typeof stickersTable.$inferInsert;

// ─── INSERTS ─────────────────────────────────────────────────────────────────

export const insertsTable = pgTable("inserts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cat: text("cat").notNull(), // Functional | Decorative | Trackers | Seasonal | Cover art
  collection: text("collection"),
  assetId: text("asset_id").references(() => assetsTable.id),
  planners: jsonb("planners").notNull().default(["all"]).$type<string[]>(), // edition ids or ["all"]
  status: text("status").notNull().default("draft"), // draft | live
  globalAvailable: boolean("global_available").notNull().default(true),
  origin: text("origin").notNull().default("licensed").$type<ItemOrigin>(),
  authoredByStoreId: text("authored_by_store_id").references(() => storesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Insert = typeof insertsTable.$inferSelect;
export type InsertInsert = typeof insertsTable.$inferInsert;

// ─── RELATED PRODUCTS ────────────────────────────────────────────────────────

export const relatedProductsTable = pgTable("related_products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // e.g. "Notebook · notes"
  status: text("status").notNull().default("draft"), // draft | live
  price: real("price").notNull().default(0),
  matches: jsonb("matches").notNull().default([]).$type<string[]>(), // edition ids
  globalAvailable: boolean("global_available").notNull().default(true),
  origin: text("origin").notNull().default("licensed").$type<ItemOrigin>(),
  authoredByStoreId: text("authored_by_store_id").references(() => storesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RelatedProduct = typeof relatedProductsTable.$inferSelect;
export type InsertRelatedProduct = typeof relatedProductsTable.$inferInsert;

// ─── STICKER LIBRARY ─────────────────────────────────────────────────────────
// Central sticker library — one row per image asset. A sticker can be assigned
// to many packs via the packStickersTable join (M:N).

export const STICKER_FUNCTION_TYPES = [
  "checkbox",
  "flag",
  "habit",
  "time-block",
  "tab",
  "date",
  "banner",
  "decorative",
] as const;

export type StickerFunctionType = (typeof STICKER_FUNCTION_TYPES)[number];

export interface StickerExportTargets {
  goodnotes: boolean;
  ink: boolean;
  cricut: boolean;
}

export const stickersLibraryTable = pgTable("stickers_library", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  tags: text("tags").array().notNull().default([]),
  // Validated against STICKER_FUNCTION_TYPES on write — reject unknown values.
  functionType: text("function_type").notNull(),
  status: text("status").notNull().default("draft"), // draft | live
  origin: text("origin").notNull().default("owned").$type<ItemOrigin>(),
  // Null for starter/licensed stickers; set for store-owned stickers.
  authoredByStoreId: text("authored_by_store_id").references(
    () => storesTable.id,
    { onDelete: "set null" },
  ),
  // ── Creation-pipeline fields ───────────────────────────────────────────
  borderStyle: text("border_style").notNull().default("none"), // none | thin | white
  borderWidth: real("border_width"),
  borderColor: text("border_color"),
  sizeInMm: real("size_in_mm"),
  exportTargets: jsonb("export_targets")
    .notNull()
    .default({ goodnotes: true, ink: true, cricut: false })
    .$type<StickerExportTargets>(),
  // ── Sticker Studio extended fields ────────────────────────────────────
  // How this sticker was created: upload through pipeline, Claude SVG, text render, or AI-prompted art.
  generationType: text("generation_type"), // upload | functional-svg | text-set | illustrative-prompt
  // Nature of the source art; drives export and pipeline decisions.
  sourceType: text("source_type"), // photo | flat-art | generated-text | generated-svg
  // Drop shadow baked into the PNG at export time.
  shadowStyle: text("shadow_style"), // flat | soft | lifted | cut-paper
  shadowLiftPx: real("shadow_lift_px"),
  // Gaussian alpha blur on the silhouette edge (photo stickers).
  edgeFeatherPx: real("edge_feather_px"),
  // Human-readable label within a set, e.g. "Monday" or "14" for text-set stickers.
  setLabel: text("set_label"),
  // Slug that drives download filename; default "set_function_label_size".
  fileNamePattern: text("file_name_pattern"),
  // ── Processed assets (stored as base64 data URLs) ──────────────────────
  // The cutout PNG with transparent background; produced by the pipeline.
  processedImageData: text("processed_image_data"),
  // SVG cut-path for Cricut/Silhouette; set only when exportTargets.cricut=true.
  cutlineSvg: text("cutline_svg"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StickerLibraryItem = typeof stickersLibraryTable.$inferSelect;
export type InsertStickerLibraryItem = typeof stickersLibraryTable.$inferInsert;

// ─── PACK ↔ STICKER JOIN (M:N) ────────────────────────────────────────────────
// One sticker can live in many packs without duplicating the image asset.

export const packStickersTable = pgTable(
  "pack_stickers",
  {
    id: serial("id").primaryKey(),
    packId: text("pack_id")
      .notNull()
      .references(() => stickerPacksTable.id, { onDelete: "cascade" }),
    stickerId: text("sticker_id")
      .notNull()
      .references(() => stickersLibraryTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    packStickerUniq: unique("pack_sticker_uq").on(t.packId, t.stickerId),
  }),
);

export type PackSticker = typeof packStickersTable.$inferSelect;
export type InsertPackSticker = typeof packStickersTable.$inferInsert;

// ─── PALETTES ─────────────────────────────────────────────────────────────────
// Reusable named color arrays: [accent, accent-dark, secondary, tertiary, ink, paper].
// One palette can be linked to many themes; one theme can carry many palettes.
// Buyer picks a theme, then picks a palette within that theme — palette.colors drives generation.

export const palettesTable = pgTable("palettes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  colors: jsonb("colors").notNull().$type<string[]>(),
  status: text("status").notNull().default("draft"),
  globalAvailable: boolean("global_available").notNull().default(true),
  origin: text("origin").notNull().default("licensed").$type<ItemOrigin>(),
  authoredByStoreId: text("authored_by_store_id").references(
    () => storesTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Palette = typeof palettesTable.$inferSelect;
export type InsertPalette = typeof palettesTable.$inferInsert;

// ─── BACKGROUNDS ─────────────────────────────────────────────────────────────
// Reusable background assets: solid color, named texture, or image ref.

export const backgroundsTable = pgTable("backgrounds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("color"), // color | texture | image
  assetRef: text("asset_ref"),                   // hex, texture key, or file ref
  status: text("status").notNull().default("draft"),
  globalAvailable: boolean("global_available").notNull().default(true),
  origin: text("origin").notNull().default("licensed").$type<ItemOrigin>(),
  authoredByStoreId: text("authored_by_store_id").references(
    () => storesTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Background = typeof backgroundsTable.$inferSelect;
export type InsertBackground = typeof backgroundsTable.$inferInsert;

// ─── THEME BUNDLE JOIN TABLES ─────────────────────────────────────────────────
// theme_palettes  : theme ↔ palette  (M:N, ordered by position)
// theme_backgrounds: theme ↔ background (M:N, ordered by position)
// theme_packs     : theme ↔ sticker_pack (M:N, ordered by position — theme-level grouping)

export const themePalettesTable = pgTable(
  "theme_palettes",
  {
    id: serial("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themesTable.id, { onDelete: "cascade" }),
    paletteId: text("palette_id")
      .notNull()
      .references(() => palettesTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    themePaletteUniq: unique("theme_palette_uq").on(t.themeId, t.paletteId),
  }),
);

export type ThemePaletteRow = typeof themePalettesTable.$inferSelect;
export type InsertThemePalette = typeof themePalettesTable.$inferInsert;

export const themeBackgroundsTable = pgTable(
  "theme_backgrounds",
  {
    id: serial("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themesTable.id, { onDelete: "cascade" }),
    backgroundId: text("background_id")
      .notNull()
      .references(() => backgroundsTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    themeBackgroundUniq: unique("theme_background_uq").on(t.themeId, t.backgroundId),
  }),
);

export type ThemeBackgroundRow = typeof themeBackgroundsTable.$inferSelect;
export type InsertThemeBackground = typeof themeBackgroundsTable.$inferInsert;

export const themePacksTable = pgTable(
  "theme_packs",
  {
    id: serial("id").primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themesTable.id, { onDelete: "cascade" }),
    packId: text("pack_id")
      .notNull()
      .references(() => stickerPacksTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    themePackUniq: unique("theme_pack_uq").on(t.themeId, t.packId),
  }),
);

export type ThemePackRow = typeof themePacksTable.$inferSelect;
export type InsertThemePack = typeof themePacksTable.$inferInsert;

// ─── STYLE PRESETS ────────────────────────────────────────────────────────────
// Reusable styling profiles for the Sticker Studio batch toolbar.
// Owned by a store; applied to selected stickers in a batch.

export interface StylePresetExportTargets {
  goodnotes: boolean;
  ink: boolean;
  cricut: boolean;
}

export const stylePresetsTable = pgTable("style_presets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  storeId: text("store_id")
    .notNull()
    .references(() => storesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  borderStyle: text("border_style").notNull().default("none"), // none | thin | white
  borderWidth: real("border_width"),
  borderColor: text("border_color"),
  sizeInMm: real("size_in_mm"),
  shadowStyle: text("shadow_style"), // flat | soft | lifted | cut-paper
  shadowLiftPx: real("shadow_lift_px"),
  exportTargets: jsonb("export_targets")
    .notNull()
    .default({ goodnotes: true, ink: true, cricut: false })
    .$type<StylePresetExportTargets>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StylePreset = typeof stylePresetsTable.$inferSelect;
export type InsertStylePreset = typeof stylePresetsTable.$inferInsert;

// ─── WIDGETS ──────────────────────────────────────────────────────────────────
// Widgets are functional placed overlays (e.g. 7-day tracker, 30-day habit grid)
// that accept the planner palette for recolouring. They are NOT sticker function
// types — they live in their own table and are generated as recolourable vector SVG.

export const widgetsTable = pgTable("widgets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  /** The store that owns this widget (null for platform-level widgets). */
  storeId: text("store_id").references(() => storesTable.id, { onDelete: "set null" }),
  /** Available size variants: e.g. ["7-day","30-day","month"]. */
  sizeVariants: jsonb("size_variants").notNull().default([]).$type<string[]>(),
  /** Raw SVG data with palette slot placeholders (e.g. {{slot:accent}}). */
  svgData: text("svg_data"),
  /** Named palette slot map: slot name → default hex. */
  paletteSlots: jsonb("palette_slots").$type<Record<string, string>>(),
  status: text("status").notNull().default("draft"), // draft | live
  origin: text("origin").notNull().default("owned").$type<ItemOrigin>(),
  authoredByStoreId: text("authored_by_store_id").references(
    () => storesTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Widget = typeof widgetsTable.$inferSelect;
export type InsertWidget = typeof widgetsTable.$inferInsert;
