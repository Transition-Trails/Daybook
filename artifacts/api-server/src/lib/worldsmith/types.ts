/** Shared TypeScript types for the WorldSmith Prompt Compiler. */

// ── Notion-resolved records ───────────────────────────────────────────────────

export interface ProductionSpec {
  /** Stable source identity: a Notion page ID for legacy chains or local spec ID for local chains. */
  sourceId?: string;
  /** Publication target when the record has been synchronized to Notion. */
  notionPageId?: string;
  // Core identity
  productionItem: string;
  specId: string;
  componentType: string;
  componentSet?: string;
  heroFamily?: string;
  world: string;
  worldId?: string;       // Notion page ID of the linked World record
  collection?: string;
  collectionId?: string;  // Notion page ID of the linked Collection record
  volume?: string;
  volumeId?: string;      // Notion page ID of the linked Volume record
  currentVersion: string;
  // Creative definition
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  reviewCriteria: string;
  // Print spec
  writingSpacePercent?: number;
  orientation?: string;
  frontBackStyle?: string;
  // Prompt governance
  payloadVersion: string;
  promptPayload: string;
  promptPayloadId?: string;  // relation ID of the linked Prompt Payload record
  componentSpecificationId?: string;
  styleGuideId?: string;
  promptModuleIds: string[];
  canonDependency: "None" | "Supports Canon" | "Canon Reference" | "Canon Defining" | string;
  canonRecordIds: string[];
  // Workflow
  status: string;
  compiledPromptStatus: string;
  nextAction?: string;
  existingVisualAssetId?: string;
  googleDriveLink?: string;
}

export interface StyleGuide {
  sourceId?: string;
  notionPageId?: string;
  name: string;
  content: string;
  typography?: TypographyChoice[];
}

export interface ComponentSpec {
  sourceId?: string;
  notionPageId?: string;
  name: string;
  content: string;
  componentType: string;
}

export interface PromptModule {
  sourceId?: string;
  notionPageId?: string;
  name: string;
  /** Explicit compiler routing for local modules and normalized legacy modules. */
  section?: PromptModuleSection;
  content: string;
  dependencies: string[];
}

export const PROMPT_MODULE_SECTIONS = ["world", "style", "general"] as const;
export type PromptModuleSection = typeof PROMPT_MODULE_SECTIONS[number];

export function isPromptModuleSection(value: unknown): value is PromptModuleSection {
  return typeof value === "string" && (PROMPT_MODULE_SECTIONS as readonly string[]).includes(value);
}

export interface CanonRecord {
  sourceId?: string;
  notionPageId?: string;
  name: string;
  status: string;
  narrativeDetails?: string;
  historicalContext?: string;
  visualNotes?: string;
  emotionalRegister?: string | null;
  sensoryClauses?: string;
  notes?: string;
  typography?: TypographyChoice[];
}

/** A catalog-backed typeface selection safe to include in image-generation prompts. */
export interface TypographyChoice {
  fontId: string;
  family: string;
  roles: Array<{ role: string; weight?: string }>;
}

/** World Bible fields fetched from the local DB for the world that owns this spec. */
export interface WorldBible {
  visualPalette?: string | null;    // dominant hues, light quality, tonal range
  proseVoice?: string | null;       // tense, person, sentence rhythm, register
  atmosphericNotes?: string | null; // ambient mood, emotional texture
  materialWorld?: string | null;    // textures, surfaces, physical substances
  worldRules?: string[];            // hard negatives compiled last onto every prompt
  typography?: TypographyChoice[];
}

export interface InheritanceChain {
  productionSpec: ProductionSpec;
  styleGuide?: StyleGuide;
  componentSpec?: ComponentSpec;
  promptModules: PromptModule[];
  canonRecords: CanonRecord[];
  resolvedSourceIds: Record<string, string | string[]>;
  /** Non-fatal warnings collected during inheritance resolution (e.g. dropped module dependencies). */
  warnings: ValidationError[];
  /** World Bible aesthetic identity fields injected into every generation prompt. */
  worldBible?: WorldBible;
}

// ── PP-1.0 Payload ────────────────────────────────────────────────────────────

export interface ParsedPayload {
  // ── PP-2.0 structured section keys ────────────────────────────────────────
  // Presence of shared_prompt signals the new section-based format.
  shared_prompt?: string;
  front_prompt?: string;
  back_prompt?: string;
  inside_prompt?: string;
  outside_prompt?: string;
  assembly_prompt?: string;
  negative_prompt?: string;

  // ── PP-1.0 legacy flat keys (kept for backward compat) ────────────────────
  asset_role?: string;
  composition?: string;
  materials?: string;
  visual_hierarchy?: string;
  text_rule?: string;
  canon_rule?: string;
  print_rule?: string;
  negative_constraints?: string;
  // Optional common
  lighting?: string;
  writing_space?: string;
  crop_rule?: string;
  object_rule?: string;
  color_rule?: string;
  derivative_rule?: string;
  approved_text?: string;
  // Decorative / coordinating papers
  paper_role?: string;
  pattern_behavior?: string;
  repeat_rule?: string;
  // Hero papers
  primary_focal_area?: string;
  secondary_narrative_cluster?: string;
  supporting_objects?: string;
  story_signal?: string;
  // Journal cards (legacy)
  card_role?: string;
  front_layout?: string;
  back_layout?: string;
  // Ephemera sheets
  featured_artifact?: string;
  document_type?: string;
  scale_mix?: string;
  cutting_rule?: string;
  // Additional component-specific keys
  [key: string]: string | undefined;
}

// ── PP-2.0 section contract ───────────────────────────────────────────────────

/** Ordered list of payload section keys for compilation and display. */
export const PROMPT_SECTION_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "shared_prompt",   label: "Shared Prompt" },
  { key: "front_prompt",    label: "Front Prompt" },
  { key: "back_prompt",     label: "Back Prompt" },
  { key: "inside_prompt",   label: "Inside Prompt" },
  { key: "outside_prompt",  label: "Outside Prompt" },
  { key: "assembly_prompt", label: "Assembly Prompt" },
  { key: "negative_prompt", label: "Negative Prompt" },
] as const;

export interface SectionContract {
  required: string[];
  optional: string[];
}

/** Per-component required and optional payload sections. */
export const COMPONENT_SECTION_CONTRACT: Record<string, SectionContract> = {
  "Journal Card":       { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt"] },
  "Hero Paper":         { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt"] },
  "Coordinating Paper": { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt"] },
  "Decorative Paper":   { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt"] },
  "Ephemera Sheet":     { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt", "assembly_prompt"] },
  "Pocket":             { required: ["shared_prompt", "front_prompt", "assembly_prompt", "negative_prompt"], optional: ["inside_prompt", "outside_prompt"] },
  "Envelope":           { required: ["shared_prompt", "front_prompt", "assembly_prompt", "negative_prompt"], optional: ["inside_prompt", "outside_prompt", "back_prompt"] },
  "Tag":                { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt"] },
  "Tab":                { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt"] },
  "Label":              { required: ["shared_prompt", "front_prompt", "negative_prompt"], optional: ["back_prompt"] },
};

/** Fallback contract for component types not yet listed. */
export const DEFAULT_SECTION_CONTRACT: SectionContract = {
  required: ["shared_prompt", "negative_prompt"],
  optional: ["front_prompt", "back_prompt"],
};

// ── PP-1.0 legacy constants (still used for legacy payload validation) ─────────

export const PP1_REQUIRED_KEYS: ReadonlyArray<string> = [
  "asset_role",
  "composition",
  "materials",
  "visual_hierarchy",
  "text_rule",
  "canon_rule",
  "print_rule",
  "negative_constraints",
] as const;

export const PP1_OPTIONAL_KEYS: ReadonlyArray<string> = [
  "lighting",
  "writing_space",
  "crop_rule",
  "object_rule",
  "color_rule",
  "derivative_rule",
  "approved_text",
];

export const COMPONENT_KEY_MAP: Record<string, string[]> = {
  "Decorative Paper": ["paper_role", "pattern_behavior", "repeat_rule"],
  "Coordinating Paper": ["paper_role", "pattern_behavior", "repeat_rule"],
  "Hero Paper": ["primary_focal_area", "secondary_narrative_cluster", "supporting_objects", "story_signal"],
  "Journal Card": ["card_role", "front_layout", "back_layout", "front_prompt"],
  "Ephemera Sheet": ["featured_artifact", "document_type", "supporting_objects", "scale_mix", "cutting_rule"],
};

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationError {
  code: string;
  field: string;
  governing_rule: string;
  message: string;
  recommended_action: string;
}

export interface ValidationResult {
  production_spec_id: string;
  payload_version: string;
  valid: boolean;
  compiled_prompt_status: string;
  errors: ValidationError[];
  warnings: ValidationError[];
  payload?: Partial<ParsedPayload>;
}

export type CompiledPromptStatus =
  | "Not Compiled"
  | "Ready to Compile"
  | "Compiled"
  | "Validation Failed"
  | "Requires Canon Review";

// ── Compiled Prompt ───────────────────────────────────────────────────────────

export interface CompiledPromptSections {
  creative_task: string;
  world_and_collection_context: string;
  style_system: string;
  component_requirements: string;
  asset_specific_intent: string;
  composition_and_content: string;
  materials_and_lighting: string;
  text_policy: string;
  canon_policy: string;
  negative_constraints: string;
  print_and_output_requirements: string;
  /** Structured typography is emitted as a prompt section, never folded into prose. */
  typography: string;
  /**
   * PP-2.0 content is deliberately exposed under its own section names.
   * The legacy composition/materials keys remain for PP-1.0 callers only.
   */
  shared_prompt?: string;
  front_prompt?: string;
}

/** A single labeled section in the structured compiled prompt (PP-2.0+). */
export interface CompiledSectionRecord {
  /** Machine key, e.g. "shared_prompt", "front_prompt", "world_and_collection_context" */
  key: string;
  /** Human-readable label shown in the viewer */
  label: string;
  /** Full assembled text content of this section */
  content: string;
  /** Human description of where this content originated */
  source: string;
}

/** Compilation provenance — the full resolution chain that produced a compiled prompt. */
export interface ProvenanceRecord {
  // ── Human-readable names ─────────────────────────────────────────────────
  production_spec_title: string;
  component_type: string;
  component_set?: string;
  world: string;
  world_notion_id?: string;
  collection?: string;
  collection_notion_id?: string;
  volume?: string;
  volume_notion_id?: string;
  style_guide?: string;
  component_specification?: string;
  prompt_modules: string[];
  canon_records: string[];
  // ── Run context ───────────────────────────────────────────────────────────
  run_id: string;
  compilation_timestamp: string;
  // ── Notion IDs for deep-linking (raw — never shown in primary UI) ─────────
  production_spec_notion_id?: string;
  style_guide_notion_id?: string;
  component_spec_notion_id?: string;
  prompt_payload_notion_id?: string;
  prompt_module_notion_ids: string[];
  canon_record_notion_ids: string[];
  prompt_payload_type: "linked" | "inline";
  // ── Payload governance ────────────────────────────────────────────────────
  prompt_hash: string;
  payload_version: string;
  /** "legacy" for PP-1.0 flat format, "2.0" for PP-2.0 section-based format */
  payload_format: "legacy" | "2.0";
  compiler_version: string;
}

export interface CompiledPrompt {
  /** Legacy flat sections map — populated for all compiles for backward compat */
  sections: CompiledPromptSections;
  /** Structured per-section records for the viewer (PP-2.0 new format gives richer entries) */
  sectionRecords: CompiledSectionRecord[];
  fullPrompt: string;
  negativePrompt?: string;
  isLegacyFormat: boolean;
}

// ── Provider adapter contract ─────────────────────────────────────────────────

export interface GenerationRequest {
  compiled_prompt: string;
  negative_prompt?: string;
  model_name: string;
  model_version?: string;
  settings: Record<string, unknown>;
  seed?: string;
}

export interface GenerationResult {
  binary: Buffer;
  mime_type: string;
  provider: string;
  model_name: string;
  model_version?: string;
  settings: Record<string, unknown>;
  seed?: string;
  provider_request_id?: string;
  cost_usd?: number;
  width: number;
  height: number;
  metadata: Record<string, unknown>;
}

// ── Daybook adapter contract ──────────────────────────────────────────────────

export interface DaybookAssetPayload {
  asset_id: string;
  filename: string;
  version: string;
  world: string;
  volume?: string;
  component_type: string;
  production_specification_id: string;
  visual_asset_id?: string;
  google_drive_file_id?: string;
  google_drive_url?: string;
  prompt_hash?: string;
  generation_provider?: string;
  model_name?: string;
  provider_request_id?: string;
  readiness_state: string;
  updated_at: string;
}

export interface DaybookResult {
  asset_id: string;
  created: boolean;
}

// ── API shapes ────────────────────────────────────────────────────────────────

export interface CompileRequest {
  /** Local Editorial Suite spec ID. Preferred when USE_LOCAL_RESOLVER is enabled. */
  production_spec_id?: string;
  /** Legacy Notion Production Specification page ID. */
  notion_production_spec_id?: string;
  operation: "validate_and_compile" | "preview" | "compile_and_generate";
  generation_settings?: {
    quality?: "low" | "medium" | "high" | "standard" | "hd";
  };
  dry_run?: boolean;
}

export interface CompileAndGenerateRequest {
  production_spec_id?: string;
  notion_production_spec_id?: string;
  operation: "compile_and_generate";
  /** The server resolves the provider and model from trusted image configuration. */
  provider?: string;
  model?: string;
  generation_settings?: {
    quality?: "low" | "medium" | "high" | "standard" | "hd";
  };
  dry_run?: boolean;
}

export interface CompileResponse {
  status: "compiled" | "validation_failed" | "requires_canon_review" | "failed";
  run_id: string;
  production_spec_id: string;
  payload_version: string;
  compiled_prompt_status: string;
  prompt_hash?: string;
  compiled_prompt?: string;
  /** Structured per-section records for the prompt viewer */
  compiled_sections?: CompiledSectionRecord[];
  /** Full resolution provenance for the compilation */
  provenance?: ProvenanceRecord;
  visual_asset_id?: string;
  warnings: ValidationError[];
  next_action?: string;
  errors?: ValidationError[];
  failed_stage?: string;
  error_code?: string;
  message?: string;
  retry_safe?: boolean;
  created_resources?: {
    visual_asset_id: string | null;
    drive_file_id: string | null;
  };
  production_package?: ProductionPackageResult;
}

export interface ProductionPackageResult {
  id: string;
  status: "dry_run" | "in_progress" | "generation_failed" | "upload_failed" | "uploaded_status_pending" | "success";
  production_art_status: "not_started" | "artwork_review";
  idempotent: boolean;
  filename: string;
  notion_upload_id?: string;
  visual_asset_id?: string;
  provider: string;
  model: string;
  model_version?: string;
  effective_size: string;
  quality: string;
  target: {
    dpi: number;
    print_width_in: number;
    print_height_in: number;
    orientation: "landscape" | "portrait" | "square";
  };
  estimated_cost_usd: number | null;
  estimate_note?: string;
  error?: string;
}

// ── Spec Preview ──────────────────────────────────────────────────────────────

export interface SpecBoardData {
  // Identity
  specPageId: string;
  productionItem: string;
  specId: string;
  world: string;
  volume?: string;
  componentType: string;
  orientation?: string;
  payloadVersion: string;
  currentVersion: string;
  status: string;
  // Creative
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  reviewCriteria: string;
  // Parsed payload keys
  assetRole: string;
  composition: string;
  materials: string;
  visualHierarchy: string;
  textRule: string;
  canonRule: string;
  printRule: string;
  negativeConstraints: string;
  // Related records
  componentSpecName?: string;
  componentSpecContent?: string;
  styleGuideName?: string;
  styleGuideContent?: string;
  promptModuleCount: number;
  canonDependency: string;
  canonRecordCount: number;
  // Colors from style guide (if available)
  colorSwatches?: Array<{ name: string; hex: string }>;
  // Prompt hash passthrough (for DALL-E prompt derivation)
  promptHash: string;
  // Enriched fields populated async by spec-preview-service
  collection?: string;           // Collection / sub-world name (may require relation fetch)
  canonNames?: string[];         // Resolved display names of linked Canon Records (up to 5)
  illustratedNarrative?: string; // Scene description for Section 3 (from front_prompt / world_and_collection_context)
  /** Up to 4 focal-hierarchy labels derived from the prompt payload (used as detail-crop captions). */
  focalHierarchy?: string[];
  /** Required grounding for local Editorial Suite previews. */
  worldBible?: WorldBible;
  /** Local board content came from persisted compiler section records. */
  usesCompiledSections?: boolean;
  /** Actual capped render target shown on the review board. */
  generationTarget?: {
    size: string;
    dpi: number;
    printWidthIn: number;
    printHeightIn: number;
  };
}

export interface SpecPreviewResult {
  status: "success" | "dry_run" | "upload_success_status_failed" | "failed";
  production_item: string;
  spec_page_id: string;
  notion_page_id?: string;
  notion_page_url?: string;
  /** Identifies whether the preview was resolved from Editorial Suite or Notion. */
  source?: "local" | "notion";
  preview_filename?: string;
  /** App Storage object path for an Editorial Suite board. */
  preview_object_path?: string;
  /** Protected API URL that serves preview_object_path. */
  preview_url?: string;
  provider?: string;
  model?: string;
  prompt_hash: string;
  previous_status?: string;
  new_status?: string;
  upload_status?: "success" | "failed" | "skipped";
  notion_upload_id?: string;
  /** Dry-run only: text payload that would populate the spec board. */
  dry_run_payload?: Record<string, string>;
  proposed_status_change?: { from: string; to: string };
  error?: string;
  /** true when the central concept image placeholder was kept (DALL-E was skipped or failed) */
  dalle_skipped?: boolean;
  /** The DALL-E error message when dalle_skipped is true and a call was attempted */
  dalle_error?: string;
}

export interface SpecPreviewRequest {
  /** Local Editorial Suite Production Specification ID. */
  production_spec_id?: string;
  /** Legacy Notion Production Specification page ID. */
  spec_page_id?: string;
  prompt_hash: string;
  force_new?: boolean;
  dry_run?: boolean;
}

export interface RunStatusResponse {
  run_id: string;
  status: string;
  production_spec_id: string;
  compiled_prompt_status?: string;
  prompt_hash?: string;
  asset_id?: string;
  asset_version?: string;
  visual_asset_id?: string;
  drive_file_id?: string;
  drive_url?: string;
  errors?: ValidationError[];
  warnings?: ValidationError[];
  failed_stage?: string;
  error_code?: string;
  started_at: string;
  completed_at?: string;
  retry_count: number;
}
