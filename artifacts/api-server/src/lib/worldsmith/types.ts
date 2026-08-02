/** Shared TypeScript types for the WorldSmith Prompt Compiler. */

// ── Notion-resolved records ───────────────────────────────────────────────────

export interface ProductionSpec {
  notionPageId: string;
  // Core identity
  productionItem: string;
  specId: string;
  componentType: string;
  componentSet?: string;
  heroFamily?: string;
  world: string;
  volume?: string;
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
  notionPageId: string;
  name: string;
  content: string;
}

export interface ComponentSpec {
  notionPageId: string;
  name: string;
  content: string;
  componentType: string;
}

export interface PromptModule {
  notionPageId: string;
  name: string;
  content: string;
  dependencies: string[];
}

export interface CanonRecord {
  notionPageId: string;
  name: string;
  status: string;
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
}

// ── PP-1.0 Payload ────────────────────────────────────────────────────────────

export interface ParsedPayload {
  // Required keys
  asset_role: string;
  composition: string;
  materials: string;
  visual_hierarchy: string;
  text_rule: string;
  canon_rule: string;
  print_rule: string;
  negative_constraints: string;
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
  // Journal cards
  card_role?: string;
  front_layout?: string;
  back_layout?: string;
  front_prompt?: string;
  // Ephemera sheets
  featured_artifact?: string;
  document_type?: string;
  scale_mix?: string;
  cutting_rule?: string;
  // Additional component-specific keys
  [key: string]: string | undefined;
}

export const PP1_REQUIRED_KEYS: ReadonlyArray<keyof ParsedPayload> = [
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
}

export interface CompiledPrompt {
  sections: CompiledPromptSections;
  fullPrompt: string;
  negativePrompt?: string;
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
  notion_production_spec_id: string;
  operation: "validate_and_compile" | "preview";
  dry_run?: boolean;
}

export interface CompileAndGenerateRequest {
  notion_production_spec_id: string;
  operation: "compile_and_generate";
  provider: string;
  model: string;
  generation_settings?: Record<string, unknown>;
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
