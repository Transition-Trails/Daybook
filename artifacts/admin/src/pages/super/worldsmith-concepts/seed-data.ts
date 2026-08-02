/**
 * PROTOTYPE_DATA — seeded mock data for the WorldSmith landing page concepts.
 *
 * This is NOT production data. It exists solely to power the three design
 * concept prototypes at /super/worldsmith/concepts/*. None of these records
 * correspond to real database rows.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorldHealth = "healthy" | "needs_attention" | "blocked" | "in_setup" | "inactive";
export type IntegrationStatus = "connected" | "needs_configuration" | "warning" | "failed" | "not_required" | "unknown";
export type ProductionStatus =
  | "not_started" | "in_progress" | "ready_to_compile" | "compiled"
  | "ready_for_review" | "blocked" | "approved" | "release_ready" | "failed";
export type ReviewStatus = "awaiting" | "in_review" | "approved" | "returned";
export type Role = "creative_director" | "store_end_user" | "daybook_admin";

export interface World {
  id: string;
  name: string;
  code: string;
  description: string;
  status: "active" | "in_setup" | "archived";
  health: WorldHealth;
  healthReasons: string[];
  coverColor: string;   // CSS gradient or color
  coverAccent: string;
  currentCollection?: string;
  currentVolume?: string;
  productionCompletion: number; // 0–100
  awaitingReview: number;
  blockers: number;
  lastActivity: string; // ISO
  integrationHealth: IntegrationStatus;
  owner: string;
  tags: string[];
}

export interface ProductionSpec {
  id: string;
  worldId: string;
  title: string;
  componentType: string;
  status: ProductionStatus;
  volume?: string;
  collection?: string;
  compiledAt?: string;
  reviewStatus?: ReviewStatus;
  blockedReason?: string;
  assignee?: string;
  createdAt: string;
}

export interface IntegrationRecord {
  id: string;
  worldId: string | "global";
  service: "notion" | "google_drive" | "image_provider" | "daybook_sync" | "github";
  label: string;
  status: IntegrationStatus;
  lastCheck?: string;
  lastFailure?: string;
  errorMessage?: string;
  configureUrl?: string;
}

export interface ReviewItem {
  id: string;
  worldId: string;
  title: string;
  type: "spec_preview" | "artwork" | "canon" | "visual_direction";
  status: ReviewStatus;
  submittedAt: string;
  returnedReason?: string;
  notionUrl?: string;
  previewImageUrl?: string;
}

export interface Run {
  id: string;
  worldId: string;
  specId: string;
  specTitle: string;
  status: "success" | "failed" | "in_progress" | "queued";
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  retryCount: number;
}

export interface ActivityEvent {
  id: string;
  worldId: string;
  type: "compiled" | "review_submitted" | "review_approved" | "review_returned" |
        "world_created" | "integration_connected" | "integration_failed" |
        "spec_generated" | "run_failed" | "asset_approved";
  label: string;
  detail?: string;
  timestamp: string;
  actor?: string;
  actionLabel?: string;
  actionHref?: string;
}

export interface ActionAlert {
  id: string;
  worldId: string | "global";
  priority: 1 | 2 | 3;
  title: string;
  detail: string;
  type: "review" | "resolve" | "retry" | "configure" | "compile" | "open_world" | "view_batch";
  actionLabel: string;
  relatedRoles: Role[];
}

// ── Worlds ────────────────────────────────────────────────────────────────────

export const WORLDS: World[] = [
  {
    id: "world-wychcombe",
    name: "Wychcombe",
    code: "WYC",
    description: "Victorian Garden Journals — a lush editorial world rooted in botanical illustration, seasonal poetry, and archival garden records.",
    status: "active",
    health: "needs_attention",
    healthReasons: ["Canon dependency 'Heirloom Variety Register' awaiting governance approval", "4 specification previews pending review"],
    coverColor: "linear-gradient(135deg, #2D4A2A 0%, #4A6B3A 50%, #7A9B6A 100%)",
    coverAccent: "#A8C880",
    currentCollection: "Victorian Garden Journals",
    currentVolume: "Volume I",
    productionCompletion: 68,
    awaitingReview: 4,
    blockers: 1,
    lastActivity: "2026-08-01T14:23:00Z",
    integrationHealth: "connected",
    owner: "Sophie Calloway",
    tags: ["botanical", "editorial", "Victorian"],
  },
  {
    id: "world-thornwick",
    name: "Thornwick",
    code: "THW",
    description: "Coastal cartography journals — maritime charts, tide annotations, and sea-light watercolour studies.",
    status: "in_setup",
    health: "in_setup",
    healthReasons: ["Style Guide not configured", "Image provider not connected", "No active production specifications"],
    coverColor: "linear-gradient(135deg, #1A3A4A 0%, #2A5A6A 50%, #4A8A9A 100%)",
    coverAccent: "#7ABCCC",
    currentCollection: undefined,
    currentVolume: undefined,
    productionCompletion: 0,
    awaitingReview: 0,
    blockers: 2,
    lastActivity: "2026-07-28T09:15:00Z",
    integrationHealth: "needs_configuration",
    owner: "Marcus Alderton",
    tags: ["coastal", "cartography", "maritime"],
  },
  {
    id: "world-ashvale",
    name: "Ashvale",
    code: "ASH",
    description: "Autumn forager's almanac — mushroom field guides, hedgerow recipes, and preservation calendars.",
    status: "active",
    health: "healthy",
    healthReasons: [],
    coverColor: "linear-gradient(135deg, #3A2A1A 0%, #6A4A2A 50%, #9A7A4A 100%)",
    coverAccent: "#C8A870",
    currentCollection: "Forager's Almanac",
    currentVolume: "Volume II",
    productionCompletion: 91,
    awaitingReview: 2,
    blockers: 0,
    lastActivity: "2026-08-02T08:45:00Z",
    integrationHealth: "connected",
    owner: "Theodora Marsh",
    tags: ["foraging", "almanac", "autumn"],
  },
];

// ── Production Specs ──────────────────────────────────────────────────────────

export const PRODUCTION_SPECS: ProductionSpec[] = [
  // Wychcombe
  { id: "spec-wyc-001", worldId: "world-wychcombe", title: "Monthly Spread — March", componentType: "monthly_layout", status: "ready_for_review", volume: "Volume I", collection: "Victorian Garden Journals", compiledAt: "2026-07-30T10:00:00Z", reviewStatus: "awaiting", createdAt: "2026-07-25T08:00:00Z" },
  { id: "spec-wyc-002", worldId: "world-wychcombe", title: "Weekly Spread — Week 14", componentType: "weekly_layout", status: "approved", volume: "Volume I", collection: "Victorian Garden Journals", compiledAt: "2026-07-22T14:00:00Z", reviewStatus: "approved", createdAt: "2026-07-18T08:00:00Z" },
  { id: "spec-wyc-003", worldId: "world-wychcombe", title: "Botanical Illustration Plate", componentType: "illustration", status: "blocked", volume: "Volume I", blockedReason: "Canon dependency 'Heirloom Variety Register' not yet approved", createdAt: "2026-07-20T08:00:00Z" },
  { id: "spec-wyc-004", worldId: "world-wychcombe", title: "Cover Art — Spring", componentType: "cover", status: "ready_for_review", volume: "Volume I", collection: "Victorian Garden Journals", compiledAt: "2026-08-01T09:00:00Z", reviewStatus: "awaiting", createdAt: "2026-07-28T08:00:00Z" },
  { id: "spec-wyc-005", worldId: "world-wychcombe", title: "Section Divider — Sowing", componentType: "divider", status: "in_progress", volume: "Volume I", createdAt: "2026-08-01T14:00:00Z" },
  { id: "spec-wyc-006", worldId: "world-wychcombe", title: "Monthly Spread — April", componentType: "monthly_layout", status: "ready_to_compile", volume: "Volume I", createdAt: "2026-08-01T15:00:00Z" },
  { id: "spec-wyc-007", worldId: "world-wychcombe", title: "Monthly Spread — May", componentType: "monthly_layout", status: "ready_to_compile", volume: "Volume I", createdAt: "2026-08-01T15:30:00Z" },
  // Ashvale
  { id: "spec-ash-001", worldId: "world-ashvale", title: "October Field Guide — Fungi", componentType: "field_guide", status: "approved", volume: "Volume II", collection: "Forager's Almanac", compiledAt: "2026-07-28T10:00:00Z", reviewStatus: "approved", createdAt: "2026-07-20T08:00:00Z" },
  { id: "spec-ash-002", worldId: "world-ashvale", title: "Preservation Calendar", componentType: "calendar", status: "ready_for_review", volume: "Volume II", collection: "Forager's Almanac", compiledAt: "2026-08-01T11:00:00Z", reviewStatus: "awaiting", createdAt: "2026-07-30T08:00:00Z" },
  { id: "spec-ash-003", worldId: "world-ashvale", title: "November Cover Art", componentType: "cover", status: "release_ready", volume: "Volume II", collection: "Forager's Almanac", compiledAt: "2026-07-25T09:00:00Z", reviewStatus: "approved", createdAt: "2026-07-22T08:00:00Z" },
  { id: "spec-ash-004", worldId: "world-ashvale", title: "Hedgerow Recipe Index", componentType: "index", status: "approved", volume: "Volume II", createdAt: "2026-07-18T08:00:00Z" },
];

// ── Integrations ──────────────────────────────────────────────────────────────

export const INTEGRATIONS: IntegrationRecord[] = [
  // Global
  { id: "int-notion-global", worldId: "global", service: "notion", label: "Notion", status: "connected", lastCheck: "2026-08-02T08:00:00Z" },
  { id: "int-gdrive-global", worldId: "global", service: "google_drive", label: "Google Drive", status: "connected", lastCheck: "2026-08-02T08:00:00Z" },
  // Wychcombe
  { id: "int-imgprov-wyc", worldId: "world-wychcombe", service: "image_provider", label: "DALL-E 3 (OpenAI)", status: "connected", lastCheck: "2026-08-02T07:45:00Z" },
  { id: "int-sync-wyc", worldId: "world-wychcombe", service: "daybook_sync", label: "Daybook Asset Sync", status: "warning", lastCheck: "2026-08-01T18:00:00Z", lastFailure: "2026-08-01T16:30:00Z", errorMessage: "Sync latency elevated: 3 records took >30s" },
  // Thornwick
  { id: "int-imgprov-thw", worldId: "world-thornwick", service: "image_provider", label: "Image Provider", status: "needs_configuration", errorMessage: "No image generation provider configured for this World" },
  { id: "int-sync-thw", worldId: "world-thornwick", service: "daybook_sync", label: "Daybook Asset Sync", status: "not_required", lastCheck: undefined },
  // Ashvale
  { id: "int-imgprov-ash", worldId: "world-ashvale", service: "image_provider", label: "DALL-E 3 (OpenAI)", status: "connected", lastCheck: "2026-08-02T08:15:00Z" },
  { id: "int-sync-ash", worldId: "world-ashvale", service: "daybook_sync", label: "Daybook Asset Sync", status: "connected", lastCheck: "2026-08-02T08:00:00Z" },
];

// ── Review Items ──────────────────────────────────────────────────────────────

export const REVIEW_ITEMS: ReviewItem[] = [
  { id: "rev-001", worldId: "world-wychcombe", title: "Monthly Spread — March spec preview", type: "spec_preview", status: "awaiting", submittedAt: "2026-07-30T10:00:00Z" },
  { id: "rev-002", worldId: "world-wychcombe", title: "Cover Art — Spring spec preview", type: "spec_preview", status: "awaiting", submittedAt: "2026-08-01T09:00:00Z" },
  { id: "rev-003", worldId: "world-wychcombe", title: "Botanical Illustration — visual direction", type: "visual_direction", status: "returned", submittedAt: "2026-07-25T14:00:00Z", returnedReason: "Color palette needs adjustment to match Wedgwood reference" },
  { id: "rev-004", worldId: "world-wychcombe", title: "Volume I canon reference", type: "canon", status: "awaiting", submittedAt: "2026-07-29T11:00:00Z" },
  { id: "rev-005", worldId: "world-ashvale", title: "Preservation Calendar spec preview", type: "spec_preview", status: "awaiting", submittedAt: "2026-08-01T11:00:00Z" },
  { id: "rev-006", worldId: "world-ashvale", title: "October Field Guide artwork", type: "artwork", status: "approved", submittedAt: "2026-07-26T09:00:00Z" },
];

// ── Runs ──────────────────────────────────────────────────────────────────────

export const RUNS: Run[] = [
  { id: "run-001", worldId: "world-wychcombe", specId: "spec-wyc-001", specTitle: "Monthly Spread — March", status: "success", startedAt: "2026-07-30T09:55:00Z", completedAt: "2026-07-30T10:01:00Z", retryCount: 0 },
  { id: "run-002", worldId: "world-wychcombe", specId: "spec-wyc-003", specTitle: "Botanical Illustration Plate", status: "failed", startedAt: "2026-07-28T14:00:00Z", completedAt: "2026-07-28T14:02:00Z", errorMessage: "Canon dependency resolution failed: 'Heirloom Variety Register' not found", retryCount: 2 },
  { id: "run-003", worldId: "world-wychcombe", specId: "spec-wyc-004", specTitle: "Cover Art — Spring", status: "success", startedAt: "2026-08-01T08:58:00Z", completedAt: "2026-08-01T09:03:00Z", retryCount: 0 },
  { id: "run-004", worldId: "world-ashvale", specId: "spec-ash-002", specTitle: "Preservation Calendar", status: "success", startedAt: "2026-08-01T10:55:00Z", completedAt: "2026-08-01T11:02:00Z", retryCount: 0 },
  { id: "run-005", worldId: "world-wychcombe", specId: "spec-wyc-006", specTitle: "Monthly Spread — April", status: "queued", startedAt: "2026-08-02T09:00:00Z", retryCount: 0 },
];

// ── Activity ──────────────────────────────────────────────────────────────────

export const ACTIVITY: ActivityEvent[] = [
  { id: "act-001", worldId: "world-wychcombe", type: "compiled", label: "Cover Art — Spring compiled", detail: "Volume I", timestamp: "2026-08-01T09:03:00Z", actor: "Sophie Calloway", actionLabel: "View result" },
  { id: "act-002", worldId: "world-ashvale", type: "review_submitted", label: "Preservation Calendar submitted for review", detail: "Forager's Almanac, Vol. II", timestamp: "2026-08-01T11:05:00Z", actor: "Theodora Marsh", actionLabel: "Review" },
  { id: "act-003", worldId: "world-ashvale", type: "review_approved", label: "October Field Guide artwork approved", detail: "Forager's Almanac, Vol. II", timestamp: "2026-07-28T16:00:00Z", actor: "Sophie Calloway" },
  { id: "act-004", worldId: "world-wychcombe", type: "run_failed", label: "Botanical Illustration Plate run failed", detail: "Canon dependency unresolved", timestamp: "2026-07-28T14:02:00Z", actor: "System", actionLabel: "Resolve" },
  { id: "act-005", worldId: "world-thornwick", type: "world_created", label: "Thornwick world created", detail: "Setup in progress", timestamp: "2026-07-28T09:15:00Z", actor: "Marcus Alderton", actionLabel: "Continue setup" },
  { id: "act-006", worldId: "world-wychcombe", type: "review_submitted", label: "Monthly Spread — March submitted for review", timestamp: "2026-07-30T10:01:00Z", actor: "System", actionLabel: "Review" },
  { id: "act-007", worldId: "world-ashvale", type: "asset_approved", label: "November Cover Art marked release-ready", detail: "Forager's Almanac, Vol. II", timestamp: "2026-07-25T15:30:00Z", actor: "Sophie Calloway" },
  { id: "act-008", worldId: "world-wychcombe", type: "review_returned", label: "Botanical Illustration direction returned", detail: "Color palette adjustment needed", timestamp: "2026-07-25T14:30:00Z", actor: "Sophie Calloway", actionLabel: "View notes" },
];

// ── Action Alerts ─────────────────────────────────────────────────────────────

export const ACTION_ALERTS: ActionAlert[] = [
  {
    id: "alert-001",
    worldId: "world-wychcombe",
    priority: 1,
    title: "4 specification previews awaiting review",
    detail: "Wychcombe · Volume I",
    type: "review",
    actionLabel: "Review",
    relatedRoles: ["creative_director", "store_end_user"],
  },
  {
    id: "alert-002",
    worldId: "world-wychcombe",
    priority: 1,
    title: "1 artwork returned for revision",
    detail: "Botanical Illustration — color palette adjustment needed",
    type: "resolve",
    actionLabel: "View notes",
    relatedRoles: ["creative_director"],
  },
  {
    id: "alert-003",
    worldId: "world-wychcombe",
    priority: 1,
    title: "1 production item blocked by canon",
    detail: "'Heirloom Variety Register' requires governance approval",
    type: "resolve",
    actionLabel: "Resolve",
    relatedRoles: ["creative_director", "daybook_admin"],
  },
  {
    id: "alert-004",
    worldId: "world-thornwick",
    priority: 2,
    title: "Thornwick missing image provider",
    detail: "World cannot generate assets until a provider is configured",
    type: "configure",
    actionLabel: "Configure",
    relatedRoles: ["daybook_admin"],
  },
  {
    id: "alert-005",
    worldId: "world-thornwick",
    priority: 2,
    title: "Thornwick Style Guide not configured",
    detail: "Creative foundation is required before production begins",
    type: "configure",
    actionLabel: "Continue setup",
    relatedRoles: ["daybook_admin", "creative_director"],
  },
  {
    id: "alert-006",
    worldId: "world-wychcombe",
    priority: 2,
    title: "2 specifications ready to compile",
    detail: "Monthly Spread — April and May are ready",
    type: "compile",
    actionLabel: "Compile",
    relatedRoles: ["creative_director", "daybook_admin"],
  },
  {
    id: "alert-007",
    worldId: "world-ashvale",
    priority: 2,
    title: "Ashvale Volume II is 91% complete",
    detail: "2 items remaining before release readiness",
    type: "view_batch",
    actionLabel: "View progress",
    relatedRoles: ["creative_director", "store_end_user"],
  },
  {
    id: "alert-008",
    worldId: "world-wychcombe",
    priority: 3,
    title: "Daybook sync latency warning for Wychcombe",
    detail: "3 records took >30s — monitoring recommended",
    type: "resolve",
    actionLabel: "View logs",
    relatedRoles: ["daybook_admin"],
  },
  {
    id: "alert-009",
    worldId: "global",
    priority: 3,
    title: "1 canon reference awaiting approval",
    detail: "Wychcombe — Volume I canon reference",
    type: "review",
    actionLabel: "Review",
    relatedRoles: ["creative_director"],
  },
];

// ── Derived metric helpers ─────────────────────────────────────────────────────

export function getMetrics(worldFilter: string | null) {
  const worlds = worldFilter ? WORLDS.filter(w => w.id === worldFilter) : WORLDS;
  const worldIds = worlds.map(w => w.id);
  const specs = PRODUCTION_SPECS.filter(s => worldIds.includes(s.worldId));
  const runs = RUNS.filter(r => worldIds.includes(r.worldId));
  const reviews = REVIEW_ITEMS.filter(r => worldIds.includes(r.worldId) && r.status === "awaiting");

  return {
    activeWorlds: worlds.filter(w => w.status === "active").length,
    inProduction: specs.filter(s => ["in_progress","ready_to_compile","compiled"].includes(s.status)).length,
    awaitingReview: reviews.length,
    blocked: specs.filter(s => s.status === "blocked").length,
    releaseReady: specs.filter(s => s.status === "release_ready").length,
    failedRuns: runs.filter(r => r.status === "failed").length,
    totalWorlds: worlds.length,
  };
}

export function getFilteredAlerts(worldFilter: string | null, role: Role): ActionAlert[] {
  return ACTION_ALERTS
    .filter(a => (worldFilter ? a.worldId === worldFilter || a.worldId === "global" : true))
    .filter(a => a.relatedRoles.includes(role))
    .sort((a, b) => a.priority - b.priority);
}

export function getFilteredActivity(worldFilter: string | null): ActivityEvent[] {
  const events = worldFilter
    ? ACTIVITY.filter(e => e.worldId === worldFilter)
    : ACTIVITY;
  return [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getWorldIntegrations(worldId: string): IntegrationRecord[] {
  return INTEGRATIONS.filter(i => i.worldId === worldId || i.worldId === "global");
}

export function getWorldProductionStats(worldId: string): Record<ProductionStatus, number> {
  const specs = PRODUCTION_SPECS.filter(s => s.worldId === worldId);
  const counts: Record<string, number> = {};
  for (const s of specs) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return counts as Record<ProductionStatus, number>;
}

export function getPrimaryAction(role: Role, worldFilter: string | null): ActionAlert | null {
  const alerts = getFilteredAlerts(worldFilter, role);
  return alerts[0] ?? null;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const HEALTH_LABELS: Record<WorldHealth, string> = {
  healthy: "Healthy",
  needs_attention: "Needs attention",
  blocked: "Blocked",
  in_setup: "In setup",
  inactive: "Inactive",
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Connected",
  needs_configuration: "Needs configuration",
  warning: "Warning",
  failed: "Failed",
  not_required: "Not required",
  unknown: "Unknown",
};

export const ROLE_LABELS: Record<Role, string> = {
  creative_director: "Creative Director",
  store_end_user: "Store User",
  daybook_admin: "Daybook Admin",
};
