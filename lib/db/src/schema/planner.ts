import { pgTable, text, integer, timestamp, jsonb, unique } from "drizzle-orm/pg-core";

// ── SETUP (locked after first generation) ─────────────────────────────────────
export type PlannerSetup = {
  weekStart: "sun" | "mon";
  orientation: "landscape" | "vertical";
  startMonth: number; // 0-11
  startYear: number;
  monthCount: number; // 1-24
  /** Set-up-once: determines whether date links are emitted. */
  datingMode?: "dated" | "undated" | "perpetual";
};

// ── STYLE (re-exportable) ──────────────────────────────────────────────────────
export type PlannerBinding = {
  type: "coil" | "twin-loop" | "discs" | "3-ring" | "none";
  finish: "gold" | "rose gold" | "silver" | "matte black" | "white";
};

/** One tab rail on a planner page edge.  Items are navigation target keys. */
export interface TabGroup {
  /** Navigation target identifiers in visual order (top → bottom or left → right). */
  items: string[];
  /** Optional display labels (parallel to items; falls back to auto-label from item key). */
  labels?: string[];
  /** Colour overrides for this rail; fallback to theme accent. */
  style?: { bgColor?: string; textColor?: string; accentColor?: string };
}

export type PlannerStyle = {
  cover?: string;
  texture?: "leather" | "linen" | "smooth";
  accent?: string;
  themeId?: string | null;
  /** Explicit palette selection within the theme — drives colors at generation time. */
  paletteId?: string | null;
  /** Explicit background selection within the theme — drawn as base layer at generation time. */
  backgroundId?: string | null;
  tabTheme?: "neutral" | "accent";
  tabPos?: "right" | "top" | "bottom" | "none";
  fonts?: { heading: string; subheading: string; script: string };
  notePaper?: "dot" | "graph" | "lined" | "mixed";
  sections?: string[]; // 0-10 section names
  includedItems?: string[]; // pack/insert/product ids
  // ── Planner Studio style fields (re-exportable) ──────────────────────────
  /** Realistic bakes ring art + grain + gutter shading as reusable PDF XObjects. Flat is current behaviour. */
  renderStyle?: "realistic" | "flat";
  /** Physical page size — affects aspect ratio in exported PDF. */
  size?: "A5" | "B6" | "Personal" | "Half letter" | "Letter" | "iPad 4:3";
  /** Binding type + finish — only rendered on two-page landscape spreads. */
  binding?: PlannerBinding;
  /** Paper colour key — drives background fill colour. Contrast warning fires for slate/kraft. */
  paperColour?: "cream" | "white" | "ivory" | "kraft" | "slate";
  /** Tab shape — free text slug (e.g. "rounded", "chevron", "square"). */
  tabShape?: string;
  /** Cover art type. */
  coverType?: "texture" | "photo" | "pattern" | "solid";
  /** Cover title, subtitle, year. */
  coverTitle?: string;
  coverSubtitle?: string;
  coverYear?: number;
  /**
   * Tab groups — explicit multi-edge navigation rails (Item 6).
   * When present, overrides `tabPos`.  Each group is an independent tab rail
   * at the specified edge, listing navigation targets in display order.
   *
   * Standard items: 'todo' | 'notes' | 'year' | 'month-divider' | 'weekly' |
   *                 'daily' | 'cover' | 'home' | 'section:{n}'
   * The generator stamps each tab group as a coloured strip of clickable zones.
   */
  tabGroups?: {
    /** Tab rail on the right edge of portrait pages (replaces tabPos:'right'). */
    right?: TabGroup;
    /** Tab rail across the top of pages. */
    top?: TabGroup;
    /** Tab rail across the bottom of pages. */
    bottom?: TabGroup;
    /**
     * Spine/gutter strip — centre column on landscape spreads.
     * Useful for disc-bound planners where the spine is accessible.
     */
    spine?: TabGroup;
  };
};

// ── OUTPUT ────────────────────────────────────────────────────────────────────
export type PlannerOutput = {
  calMode: "link" | "overlay" | "none";
  eventMins: 30 | 60 | 90;
  aiInPdf: boolean;
  /** When true the generator produces both a colour PDF and an ink-friendly B&W line-art PDF. */
  inkFriendly?: boolean;
  /** Drive file ID for the ink-friendly variant; populated only when inkFriendly=true. */
  inkFriendlyPdfFileId?: string | null;
  /**
   * E-ink device preset key ("remarkable" | "supernote" | "boox" | "kindle_scribe" | null).
   * When set, the generator forces inkFriendly=true, overrides the page trim to the device
   * dimensions, enforces min 0.75 pt line weights, and runs the e-ink safety check.
   */
  einkDevice?: string | null;
};

// ── DRIVE REFERENCES ──────────────────────────────────────────────────────────
export type PlannerDrive = {
  folderId?: string;
  pdfFileId?: string | null;
  configFileId?: string | null;
};

export const plannerConfigsTable = pgTable("planner_configs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  /** Nullable — set for store-owned planners; null for personal/legacy planners. */
  storeId: text("store_id"),
  editionId: text("edition_id"),
  year: integer("year"),
  /**
   * Mirrors editions.productType — drives which builder sections are offered.
   * Defaults to 'planner' for all existing rows.
   */
  productType: text("product_type").notNull().default("planner"),
  setup: jsonb("setup").notNull().$type<PlannerSetup>(),
  style: jsonb("style").notNull().default({}).$type<PlannerStyle>(),
  output: jsonb("output")
    .notNull()
    .default({ calMode: "none", eventMins: 60, aiInPdf: false })
    .$type<PlannerOutput>(),
  drive: jsonb("drive")
    .notNull()
    .default({ pdfFileId: null, configFileId: null })
    .$type<PlannerDrive>(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PlannerConfig = typeof plannerConfigsTable.$inferSelect;
export type InsertPlannerConfig = typeof plannerConfigsTable.$inferInsert;

// ── PLATFORM PLANNER TEMPLATES ────────────────────────────────────────────────
// Platform-scoped planner templates that become catalog assets.
// No storeId or userId — owned by the platform, publishable to all stores.

export const platformPlannerTemplatesTable = pgTable("platform_planner_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  /** draft → published → archived */
  status: text("status").notNull().default("draft"),
  editionId: text("edition_id"),
  productType: text("product_type").notNull().default("planner"),
  setup: jsonb("setup")
    .notNull()
    .default({ weekStart: "mon", orientation: "vertical", startMonth: 0, startYear: 2027, monthCount: 12, datingMode: "dated" })
    .$type<PlannerSetup>(),
  style: jsonb("style").notNull().default({}).$type<PlannerStyle>(),
  output: jsonb("output")
    .notNull()
    .default({ calMode: "none", eventMins: 60, aiInPdf: false })
    .$type<PlannerOutput>(),
  drive: jsonb("drive")
    .notNull()
    .default({ pdfFileId: null, configFileId: null })
    .$type<PlannerDrive>(),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  publishedAt:  timestamp("published_at",  { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PlatformPlannerTemplate = typeof platformPlannerTemplatesTable.$inferSelect;
export type InsertPlatformPlannerTemplate = typeof platformPlannerTemplatesTable.$inferInsert;

export const generationJobsTable = pgTable("generation_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  plannerId: text("planner_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | complete | failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type GenerationJob = typeof generationJobsTable.$inferSelect;
export type InsertGenerationJob = typeof generationJobsTable.$inferInsert;

// ── Ink annotation types ───────────────────────────────────────────────────────

export type InkPoint = { x: number; y: number; p: number };

export type InkStroke = {
  id: string;
  /** v1: "pen"|"highlighter"|"eraser"  v2: also fineliner/fountain/marker + shape kinds */
  tool: string;
  color: string;
  baseWidth: number;
  points: InkPoint[];
  /** v2 optional — line style; undefined / "solid" = solid */
  variant?: "solid" | "dashed" | "dotted";
  /** v2 optional — shape geometry; undefined = freehand stroke */
  shape?: { kind: "line" | "rect" | "ellipse" | "arrow"; x1: number; y1: number; x2: number; y2: number };
};

export type InkObject = {
  id: string;
  kind: "sticker";
  ref: string;   // emoji glyph or catalog sticker id
  x: number;    // normalized 0..1
  y: number;    // normalized 0..1
  scale: number;
  z: number;
};

// ── annotation_layers ─────────────────────────────────────────────────────────

export const annotationLayersTable = pgTable(
  "annotation_layers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    plannerId: text("planner_id").notNull(),
    pageId: text("page_id").notNull(),
    userId: text("user_id").notNull(),
    strokes: jsonb("strokes").notNull().default([]).$type<InkStroke[]>(),
    objects: jsonb("objects").notNull().default([]).$type<InkObject[]>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    schemaVersion: integer("schema_version").notNull().default(1),
  },
  (t) => ({
    uniqueLayer: unique().on(t.plannerId, t.pageId, t.userId),
  }),
);

export type AnnotationLayer = typeof annotationLayersTable.$inferSelect;
export type InsertAnnotationLayer = typeof annotationLayersTable.$inferInsert;
