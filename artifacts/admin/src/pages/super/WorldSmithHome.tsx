/**
 * WorldSmith Home — production landing page.
 * Based on the approved World Gallery concept; all data sourced from real API calls.
 * Role switcher removed — only super_admins reach /super/worldsmith.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles, Plus, LayoutGrid, List, Search, X, ChevronLeft,
  ArrowRight, BookOpen, Loader2, CheckCircle2, XCircle,
  AlertCircle, ExternalLink, Clock, Wrench, Pencil, Save, ImageUp, Trash2,
} from "lucide-react";
import { apiFetch, storageApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { CopilotPanel } from "@/components/CopilotPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WsWorld {
  id: string;
  name: string;
  code: string;
  description: string;
  status: "active" | "in_setup" | "archived";
  coverColor: string;
  coverAccent: string;
  currentCollection?: string | null;
  currentVolume?: string | null;
  owner: string;
  tags: string[];
  notionProductionDbId?: string | null;
  notionCanonDbId?: string | null;
  driveFolderId?: string | null;
  imageProvider?: string | null;
  worldRules?: string[] | null;
  // World Bible — aesthetic identity fields
  visualPalette?: string | null;
  proseVoice?: string | null;
  atmosphericNotes?: string | null;
  materialWorld?: string | null;
  createdAt: string;
  updatedAt: string;
  // Hero background image
  coverImageUrl?: string | null;
  // Computed fields from the server
  assetCount: number;
  reviewCount: number;
}

interface WsRun {
  run_id: string;
  status: string;
  production_spec_id: string;
  operation: string;
  failed_stage?: string;
  error_code?: string;
  initiated_by?: string;
  asset_id?: string;
  started_at: string;
  completed_at?: string;
}

interface WsAsset {
  id: string;
  assetName: string;
  assetType: string;
  world: string;
  volume?: string;
  componentType: string;
  currentVersion: string;
  readinessState: string;
  productionSpecNotionId?: string;
  driveUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface HealthStatus {
  service: string;
  label: string;
  status: "connected" | "warning" | "failed" | "unknown" | "not_configured";
  message?: string;
  checkedAt: string;
  worldId?: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const wsApi = {
  worlds: () => apiFetch<{ worlds: WsWorld[] }>("/v1/worldsmith/worlds"),
  createWorld: (body: Partial<WsWorld>) =>
    apiFetch<WsWorld>("/v1/worldsmith/worlds", { method: "POST", body: JSON.stringify(body) }),
  updateWorld: (id: string, body: Partial<Pick<WsWorld, "notionProductionDbId" | "notionCanonDbId" | "driveFolderId" | "imageProvider" | "status" | "currentCollection" | "currentVolume" | "worldRules" | "visualPalette" | "proseVoice" | "atmosphericNotes" | "materialWorld" | "coverImageUrl">>) =>
    apiFetch<WsWorld>(`/v1/worldsmith/worlds/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  runs: (worldId?: string) =>
    apiFetch<{ runs: WsRun[] }>(`/v1/worldsmith/runs${worldId ? `?world_id=${encodeURIComponent(worldId)}` : ""}`),
  assets: () => apiFetch<{ assets: WsAsset[] }>("/v1/worldsmith/assets"),
  health: () => apiFetch<{ integrations: HealthStatus[] }>("/v1/worldsmith/health"),
};

// ── Sort key ──────────────────────────────────────────────────────────────────

type SortKey = "activity" | "status" | "name";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorldSmithHome() {
  const [focusedWorldId, setFocusedWorldId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"gallery" | "list">("gallery");
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const qc = useQueryClient();

  const { data: worldsData, isLoading: worldsLoading, error: worldsError } = useQuery({
    queryKey: ["worldsmith/worlds"],
    queryFn: wsApi.worlds,
    staleTime: 30_000,
  });
  const { data: assetsData } = useQuery({
    queryKey: ["worldsmith/assets"],
    queryFn: wsApi.assets,
    staleTime: 30_000,
  });
  const { data: healthData } = useQuery({
    queryKey: ["worldsmith/health"],
    queryFn: wsApi.health,
    staleTime: 60_000,
  });

  const worlds = worldsData?.worlds ?? [];
  const assets = assetsData?.assets ?? [];
  const integrations = healthData?.integrations ?? [];

  const focusedWorld = focusedWorldId ? worlds.find(w => w.id === focusedWorldId) ?? null : null;

  const filteredWorlds = worlds.filter(w => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase()) &&
        !w.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && w.status !== statusFilter) return false;
    return true;
  });

  const sortedWorlds = [...filteredWorlds].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "status") {
      const ord: Record<string, number> = { active: 0, in_setup: 1, archived: 2 };
      return (ord[a.status] ?? 5) - (ord[b.status] ?? 5);
    }
    // default: activity = updatedAt desc
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="min-h-screen" style={{ background: "hsl(35 52% 94%)" }}>
      {wizardOpen && (
        <CreateWorldModal
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["worldsmith/worlds"] });
            setWizardOpen(false);
          }}
        />
      )}

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-2.5 h-13 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "hsl(221 46% 20%)" }}>
              <Sparkles className="w-3.5 h-3.5 text-[#C87560]" />
            </div>
            <p className="font-display font-semibold text-sm text-foreground">WorldSmith</p>
          </div>
          <div className="flex-1" />
          <Link href="/super/worldsmith/editorial">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors cursor-pointer">
              <BookOpen className="w-3 h-3" />
              <span className="hidden sm:inline">Editorial</span>
            </span>
          </Link>
          <Link href="/super/worldsmith/compiler">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors cursor-pointer">
              <Sparkles className="w-3 h-3 text-[#C87560]" />
              <span className="hidden sm:inline">Compiler</span>
            </span>
          </Link>
          <div className="w-px h-4 bg-border" />
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#C87560" }}
          >
            <Plus className="w-3.5 h-3.5" />
            New World
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {focusedWorld ? (
          <FocusedWorldView
            world={focusedWorld}
            assets={assets}
            integrations={integrations}
            onBack={() => setFocusedWorldId(null)}
          />
        ) : (
          <>
            {/* Gallery header */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="font-display font-semibold text-xl text-foreground">All Worlds</h1>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">
                  {worldsLoading ? "Loading…" : `${worlds.length} world${worlds.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search worlds…"
                    className="pl-8 pr-3 h-8 rounded-lg border border-border bg-card text-[12.5px] outline-none focus:border-foreground/30 transition-colors"
                  />
                </div>
                {/* Status filter */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none"
                  aria-label="Filter by status"
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="in_setup">In setup</option>
                  <option value="archived">Archived</option>
                </select>
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none"
                  aria-label="Sort worlds by"
                >
                  <option value="activity">Recent activity</option>
                  <option value="status">Status</option>
                  <option value="name">Name</option>
                </select>
                {/* View toggle */}
                <div className="flex rounded-lg border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setViewMode("gallery")}
                    className={`p-1.5 transition-colors ${viewMode === "gallery" ? "bg-muted/50" : "hover:bg-muted/30"}`}
                    aria-pressed={viewMode === "gallery"}
                    aria-label="Gallery view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-muted/50" : "hover:bg-muted/30"}`}
                    aria-pressed={viewMode === "list"}
                    aria-label="List view"
                  >
                    <List className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Gallery / list */}
            {worldsLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : worldsError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
                <p className="text-sm font-medium text-red-700">Failed to load worlds</p>
                <button
                  onClick={() => qc.invalidateQueries({ queryKey: ["worldsmith/worlds"] })}
                  className="mt-2 text-[12px] font-medium text-red-600 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : sortedWorlds.length === 0 ? (
              worlds.length === 0 ? (
                <EmptyWorldsState onNew={() => setWizardOpen(true)} />
              ) : (
                <div className="rounded-xl border border-border bg-card p-10 text-center">
                  <p className="text-sm font-medium text-foreground mb-1">No worlds match your filters</p>
                  <button
                    onClick={() => { setSearch(""); setStatusFilter("all"); }}
                    className="text-[12px] text-[#C87560] hover:underline mt-1"
                  >
                    Clear filters
                  </button>
                </div>
              )
            ) : viewMode === "gallery" ? (
              <GalleryGrid worlds={sortedWorlds} assets={assets} onSelect={setFocusedWorldId} />
            ) : (
              <WorldListView worlds={sortedWorlds} onSelect={setFocusedWorldId} />
            )}

            {/* New world CTA */}
            {worlds.length > 0 && (
              <div className="mt-8 rounded-xl border-2 border-dashed border-border p-6 text-center">
                <p className="text-sm font-medium text-foreground mb-1">Add a new World</p>
                <p className="text-[12.5px] text-muted-foreground mb-3">Register a new creative world with guided setup.</p>
                <button
                  onClick={() => setWizardOpen(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
                  style={{ background: "#C87560" }}
                >
                  Create New World
                </button>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between pt-4 border-t border-border">
          <p className="text-[11px] text-muted-foreground">WorldSmith · Production</p>
          <Link href="/super/worldsmith/compiler">
            <span className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer">
              Open Compiler <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Gallery grid ──────────────────────────────────────────────────────────────

function GalleryGrid({
  worlds,
  assets,
  onSelect,
}: {
  worlds: WsWorld[];
  assets: WsAsset[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {worlds.map(w => (
        <WorldCard key={w.id} world={w} assets={assets} onSelect={() => onSelect(w.id)} />
      ))}
    </div>
  );
}

function WorldCard({
  world,
  assets,
  onSelect,
}: {
  world: WsWorld;
  assets: WsAsset[];
  onSelect: () => void;
}) {
  const worldAssets = assets.filter(
    a => a.world.toUpperCase() === world.code.toUpperCase() || a.world === world.id,
  );
  const reviewCount = worldAssets.filter(a => a.readinessState === "Under Review").length;
  const approvedCount = worldAssets.filter(a => a.readinessState === "Approved").length;

  return (
    <article
      className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onSelect}
      aria-label={`Open ${world.name}`}
    >
      {/* Cover */}
      <div
        className="h-32 w-full relative flex items-end p-4"
        style={{ background: world.coverColor }}
      >
        {world.coverImageUrl && (
          <img
            src={`/api/storage${world.coverImageUrl}`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" aria-hidden="true" />
        <div className="relative z-10 flex items-end justify-between w-full">
          <div>
            <p className="font-display font-semibold text-white text-base leading-tight">{world.name}</p>
            <p className="text-[10.5px] text-white/70 mt-0.5">{world.code}</p>
          </div>
          <WorldStatusBadge status={world.status} />
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">{world.description}</p>

        <div className="space-y-1.5">
          {reviewCount > 0 && (
            <p className="text-[11px] text-amber-700">{reviewCount} asset{reviewCount !== 1 ? "s" : ""} awaiting review</p>
          )}
          {approvedCount > 0 && (
            <p className="text-[11px] text-green-700">{approvedCount} asset{approvedCount !== 1 ? "s" : ""} approved</p>
          )}
          {world.status === "in_setup" && reviewCount === 0 && approvedCount === 0 && (
            <p className="text-[11px] text-[#C87560] font-medium">Setup in progress</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10.5px] text-muted-foreground">{timeAgo(world.updatedAt)}</span>
          <span className="text-[11.5px] font-medium text-[#C87560] flex items-center gap-1 group-hover:gap-1.5 transition-all">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </article>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function WorldListView({ worlds, onSelect }: { worlds: WsWorld[]; onSelect: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            {["World", "Status", "Assets", "Updated", ""].map(h => (
              <th key={h} className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {worlds.map(w => (
            <tr key={w.id} className="hover:bg-muted/10 cursor-pointer transition-colors" onClick={() => onSelect(w.id)}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: w.coverColor }} />
                  <div>
                    <p className="text-[13px] font-semibold">{w.name}</p>
                    <p className="text-[10.5px] text-muted-foreground">{w.code}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3"><WorldStatusBadge status={w.status} /></td>
              <td className="px-4 py-3 text-center">
                <span className="text-[12.5px] text-foreground">{w.assetCount}</span>
                {w.reviewCount > 0 && (
                  <p className="text-[10px] text-amber-700">{w.reviewCount} in review</p>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-[11.5px] text-muted-foreground">{timeAgo(w.updatedAt)}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-[11.5px] font-medium text-[#C87560]">Open →</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Focused World view ────────────────────────────────────────────────────────

function FocusedWorldView({
  world,
  assets,
  integrations,
  onBack,
}: {
  world: WsWorld;
  assets: WsAsset[];
  integrations: HealthStatus[];
  onBack: () => void;
}) {
  const [activeSection, setActiveSection] = useState<"overview" | "production" | "review" | "integrations" | "stories" | "bible">("overview");
  // When the user clicks "Edit" on the World Bible card in Overview, jump to Settings
  // and tell IntegrationsSection to open in edit mode immediately.
  const [openSettingsEditing, setOpenSettingsEditing] = useState(false);

  const goToSettings = () => {
    setOpenSettingsEditing(true);
    setActiveSection("integrations");
  };
  // Reset the flag once IntegrationsSection has consumed it
  const clearOpenSettingsEditing = () => setOpenSettingsEditing(false);

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["worldsmith/runs", world.id],
    queryFn: () => wsApi.runs(world.id),
    staleTime: 15_000,
  });

  const worldAssets = assets.filter(
    a => a.world.toUpperCase() === world.code.toUpperCase() || a.world === world.id,
  );
  const reviewQueue = worldAssets.filter(a => a.readinessState === "Under Review");
  const approvedAssets = worldAssets.filter(a => a.readinessState === "Approved");
  const runs = runsData?.runs ?? [];
  const failedRuns = runs.filter(r => r.status === "failed");

  const SECTIONS = [
    { id: "overview",     label: "Overview" },
    { id: "stories",      label: "Stories" },
    { id: "bible",        label: "World Bible" },
    { id: "production",   label: `Runs (${runs.length})` },
    { id: "review",       label: `Review (${reviewQueue.length})` },
    { id: "integrations", label: "Settings" },
  ];

  const coverUploadRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  async function handleCoverUpload(file: File) {
    if (!file.type.startsWith("image/")) return;
    setCoverUploading(true);
    try {
      // Request presigned URL using the established storageApi contract
      const { uploadURL, objectPath } = await storageApi.requestUploadUrl(file.name, file.size, file.type);
      // Upload directly to the presigned URL
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed: ${putRes.status}`);
      }
      // Delete the old image from storage (best-effort — don't block on failure)
      if (world.coverImageUrl) {
        storageApi.deleteObject(world.coverImageUrl).catch(() => {});
      }
      // Save the new object path to the world
      await apiFetch(`/v1/worldsmith/worlds/${world.id}`, {
        method: "PATCH",
        body: JSON.stringify({ coverImageUrl: objectPath }),
      });
      queryClient.invalidateQueries({ queryKey: ["worldsmith/worlds"] });
    } catch {
      toast({ title: "Cover upload failed", description: "The image could not be saved. Please try again.", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleCoverRemove() {
    const oldUrl = world.coverImageUrl;
    setCoverUploading(true);
    try {
      // Clear the cover URL on the world first so the UI reverts immediately
      await apiFetch(`/v1/worldsmith/worlds/${world.id}`, {
        method: "PATCH",
        body: JSON.stringify({ coverImageUrl: null }),
      });
      queryClient.invalidateQueries({ queryKey: ["worldsmith/worlds"] });
      // Then delete the file from storage (best-effort)
      if (oldUrl) {
        storageApi.deleteObject(oldUrl).catch(() => {});
      }
    } catch {
      toast({ title: "Remove failed", description: "Could not remove the cover image. Please try again.", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* World hero */}
      <div
        className="rounded-2xl overflow-hidden border border-border relative group/hero"
        style={{ background: world.coverColor }}
      >
        {world.coverImageUrl && (
          <img
            src={`/api/storage${world.coverImageUrl}`}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" aria-hidden="true" />
        {/* Cover actions — visible on hover */}
        <div className="absolute bottom-4 right-4 z-20 opacity-0 group-hover/hero:opacity-100 transition-opacity flex items-center gap-1.5">
          {world.coverImageUrl && (
            <button
              onClick={handleCoverRemove}
              disabled={coverUploading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/40 hover:bg-red-600/70 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
              aria-label="Remove cover image"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove cover
            </button>
          )}
          <button
            onClick={() => coverUploadRef.current?.click()}
            disabled={coverUploading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
            aria-label="Upload cover image"
          >
            {coverUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImageUp className="w-3.5 h-3.5" />
            )}
            {coverUploading ? "Uploading…" : (world.coverImageUrl ? "Change cover" : "Add cover")}
          </button>
          <input
            ref={coverUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="cover-file-input"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleCoverUpload(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="relative z-10 p-6 flex items-start gap-4">
          <button
            onClick={onBack}
            className="mt-0.5 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
            aria-label="Back to all worlds"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/60 mb-1">{world.code}</p>
            <h1 className="font-display font-semibold text-2xl text-white leading-tight">{world.name}</h1>
            <p className="text-sm text-white/70 mt-1 max-w-lg">{world.description}</p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <WorldStatusBadge status={world.status} invert />
              {world.assetCount > 0 && (
                <span className="text-[11.5px] text-white/80 bg-white/10 rounded-full px-2.5 py-0.5">
                  {world.assetCount} asset{world.assetCount !== 1 ? "s" : ""}
                </span>
              )}
              {failedRuns.length > 0 && (
                <span className="text-[11.5px] text-red-200 bg-red-500/30 rounded-full px-2.5 py-0.5">
                  {failedRuns.length} failed run{failedRuns.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id as typeof activeSection)}
            className={[
              "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
              activeSection === s.id
                ? "border-[#1B2A4A] text-[#1B2A4A]"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
            aria-selected={activeSection === s.id}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      {/* Each tab is always mounted so form state survives tab switches */}

      <div style={{ display: activeSection === "overview" ? undefined : "none" }}>
        <OverviewSection
          world={world}
          assets={worldAssets}
          runs={runs}
          runsLoading={runsLoading}
          onGoToSettings={goToSettings}
        />
      </div>

      <div style={{ display: activeSection === "production" ? undefined : "none" }}>
        <div className="rounded-xl border border-border bg-card">
          {runsLoading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : runs.length === 0 ? (
            <div className="p-10 text-center">
              <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No runs yet</p>
              <p className="text-[12.5px] text-muted-foreground mb-3">Start a compile run from the WorldSmith Compiler.</p>
              <Link href="/super/worldsmith/compiler">
                <span className="text-[12px] font-medium text-[#C87560] hover:underline cursor-pointer flex items-center gap-1 justify-center">
                  Open Compiler <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>
          ) : (
            <div>
              {groupRunsByDay(runs).map(group => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-border/40" />
                    <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap">
                      {group.runs.length} run{group.runs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="divide-y divide-border/50 px-2 pb-2">
                    {group.runs.map(r => <RunRow key={r.run_id} run={r} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: activeSection === "review" ? undefined : "none" }}>
        <div className="rounded-xl border border-border bg-card">
          {reviewQueue.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nothing awaiting review for {world.name}.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50 px-4">
              {reviewQueue.map(a => <AssetReviewRow key={a.id} asset={a} />)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: activeSection === "stories" ? undefined : "none" }}>
        <StoriesSection world={world} />
      </div>

      <div style={{ display: activeSection === "bible" ? undefined : "none" }}>
        <WorldBibleSection world={world} />
      </div>

      {/* IntegrationsSection must stay mounted so its form state survives tab switches.
          Unmounting and remounting it (conditional render) resets useState to world prop,
          discarding any unsaved edits the user had in progress. */}
      <div style={{ display: activeSection === "integrations" ? undefined : "none" }}>
        <IntegrationsSection
          world={world}
          integrations={integrations}
          defaultEditing={openSettingsEditing}
          onDefaultEditingConsumed={clearOpenSettingsEditing}
        />
      </div>
    </div>
  );
}

// ── Overview section ──────────────────────────────────────────────────────────

function OverviewSection({
  world,
  assets,
  runs,
  runsLoading,
  onGoToSettings,
}: {
  world: WsWorld;
  assets: WsAsset[];
  runs: WsRun[];
  runsLoading: boolean;
  onGoToSettings: () => void;
}) {
  const byState = {
    total: assets.length,
    underReview: assets.filter(a => a.readinessState === "Under Review").length,
    approved: assets.filter(a => a.readinessState === "Approved").length,
    rejected: assets.filter(a => a.readinessState === "Rejected").length,
  };
  const runStats = {
    total: runs.length,
    failed: runs.filter(r => r.status === "failed").length,
    compiled: runs.filter(r => r.status === "compiled" || r.status === "complete").length,
    inProgress: runs.filter(r => r.status === "pending" || r.status === "compiling").length,
  };

  const { data: storiesData, isLoading: storiesLoading } = useQuery({
    queryKey: ["ws-stories", world.id],
    queryFn: () => apiFetch<{ stories: unknown[] }>(`/v1/editorial/stories?world_id=${encodeURIComponent(world.id)}`),
    staleTime: 30_000,
  });
  const { data: canonData, isLoading: canonLoading } = useQuery({
    queryKey: ["editorial-canon-library", world.id],
    queryFn: () => apiFetch<{ canon_records: unknown[] }>(`/v1/editorial/canon-records?world_id=${encodeURIComponent(world.id)}&limit=500`),
    staleTime: 30_000,
  });
  const { data: editionsData, isLoading: editionsLoading } = useQuery({
    queryKey: ["editions-by-world", world.code],
    queryFn: () => apiFetch<EditionRow[]>(`/v1/catalog/editions?world=${encodeURIComponent(world.code.toUpperCase())}`),
    staleTime: 30_000,
  });

  const contentLoading = storiesLoading || canonLoading || editionsLoading;
  const storyCount   = storiesData?.stories?.length ?? 0;
  const canonCount   = canonData?.canon_records?.length ?? 0;
  const productCount = (Array.isArray(editionsData) ? editionsData : []).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Asset summary */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-4">Asset summary</p>
        {assets.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground py-4 text-center">No assets registered for {world.name} yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total" value={byState.total} color="hsl(221 46% 20%)" />
            <StatTile label="Under review" value={byState.underReview} color="#f59e0b" alert={byState.underReview > 0} />
            <StatTile label="Approved" value={byState.approved} color="#10b981" />
            <StatTile label="Rejected" value={byState.rejected} color="#ef4444" alert={byState.rejected > 0} />
          </div>
        )}
      </div>

      {/* Run summary */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-4">Run summary</p>
        {runsLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : runs.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-[12.5px] text-muted-foreground mb-2">No runs yet.</p>
            <Link href="/super/worldsmith/compiler">
              <span className="text-[11.5px] font-medium text-[#C87560] hover:underline cursor-pointer">
                Open Compiler →
              </span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Total" value={runStats.total} color="hsl(221 46% 20%)" />
            <StatTile label="In progress" value={runStats.inProgress} color="#8b5cf6" />
            <StatTile label="Compiled" value={runStats.compiled} color="#10b981" />
            <StatTile label="Failed" value={runStats.failed} color="#ef4444" alert={runStats.failed > 0} />
          </div>
        )}
      </div>

      {/* World content counts — stories / products / canon records */}
      <div className="md:col-span-2 rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-4">World content</p>
        {contentLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Stories" value={storyCount} color="hsl(221 46% 20%)" />
            <StatTile label="Products" value={productCount} color="#0d9488" />
            <StatTile label="Canon records" value={canonCount} color="#7c3aed" />
          </div>
        )}
      </div>

      {/* World Bible — always visible; shows Edit button to jump to Settings */}
      <div className="md:col-span-2 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">World Bible &amp; Rules</p>
          <button
            onClick={onGoToSettings}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </div>

        {/* Empty state */}
        {!world.worldRules?.length && !world.visualPalette && !world.proseVoice && !world.atmosphericNotes && !world.materialWorld ? (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
            <p className="text-[13px] font-medium text-foreground">No World Bible set yet</p>
            <p className="text-[12px] text-muted-foreground max-w-sm">
              Add Visual Palette, Prose Voice, Atmospheric Notes, Material World, and World Rules — they're injected into every generation prompt for this world.
            </p>
            <button
              onClick={onGoToSettings}
              className="mt-2 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#1B2A4A] text-white hover:bg-[#2a3d6b] transition-colors"
            >
              Set up World Bible
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {world.visualPalette && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">Visual Palette</p>
                <p className="text-[13px] text-foreground leading-relaxed">{world.visualPalette}</p>
              </div>
            )}
            {world.proseVoice && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">Prose Voice</p>
                <p className="text-[13px] text-foreground leading-relaxed">{world.proseVoice}</p>
              </div>
            )}
            {world.atmosphericNotes && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">Atmospheric Notes</p>
                <p className="text-[13px] text-foreground leading-relaxed">{world.atmosphericNotes}</p>
              </div>
            )}
            {world.materialWorld && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">Material World</p>
                <p className="text-[13px] text-foreground leading-relaxed">{world.materialWorld}</p>
              </div>
            )}
            {world.worldRules && world.worldRules.length > 0 && (
              <div className="md:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">World Rules</p>
                <ul className="space-y-1">
                  {world.worldRules.map((rule, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-foreground">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent runs (last 5) */}
      {runs.length > 0 && (
        <div className="md:col-span-2 rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Recent runs</p>
          <div className="divide-y divide-border/50">
            {runs.slice(0, 5).map(r => <RunRow key={r.run_id} run={r} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stories section ───────────────────────────────────────────────────────────

interface WsStoryWithActs {
  id: string; worldId: string; title: string; summary: string;
  status: string; sortOrder: number; createdAt: string; updatedAt: string;
  acts: { id: string; storyId: string; actNumber: number; title: string; tagline: string }[];
}

function StoriesSection({ world }: { world: WsWorld }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [addingStory, setAddingStory] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [newStoryStatus, setNewStoryStatus] = useState("draft");
  const [summaryDraft, setSummaryDraft] = useState<Record<string, string>>({});
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [brainstormOpen, setBrainstormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ws-stories", world.id],
    queryFn: () => apiFetch<{ stories: WsStoryWithActs[] }>(`/v1/editorial/stories?world_id=${encodeURIComponent(world.id)}`),
    staleTime: 30_000,
  });
  const stories = data?.stories ?? [];
  const selectedStory = stories.find(s => s.id === selectedStoryId) ?? stories[0] ?? null;

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/v1/editorial/stories`, {
        method: "POST",
        body: JSON.stringify({ world_id: world.id, title: newStoryTitle.trim(), status: newStoryStatus }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ws-stories", world.id] });
      setAddingStory(false); setNewStoryTitle(""); toast({ title: "Story created" });
    },
    onError: () => toast({ title: "Failed to create story", variant: "destructive" }),
  });

  const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    active:   { bg: "#D1FAE5", color: "#065F46" },
    draft:    { bg: "#F3F4F6", color: "#6B7280" },
    planned:  { bg: "#EDE9FE", color: "#6D28D9" },
    archived: { bg: "#F3F4F6", color: "#9CA3AF" },
  };

  return (
    <div className="space-y-5">
      {/* Story picker row */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : stories.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground italic">No stories yet for {world.name}</p>
          ) : (
            stories.map(s => {
              const sm = STATUS_COLORS[s.status] ?? STATUS_COLORS.draft;
              return (
                <button key={s.id} onClick={() => setSelectedStoryId(s.id)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium border transition-all"
                  style={selectedStory?.id === s.id
                    ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
                    : { background: "white", color: "#374151", borderColor: "#E5E7EB" }}>
                  {s.title}
                  <span className="ml-1.5 text-[10px] rounded-full px-1.5 py-0.5" style={sm}>{s.status}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setBrainstormOpen(o => !o); setAddingStory(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors"
            style={brainstormOpen
              ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
              : { background: "transparent", color: "#1B2A4A", borderColor: "#1B2A4A" }}
          >
            <Sparkles className="w-3 h-3" style={{ color: brainstormOpen ? "#C87560" : "#C87560" }} />
            Co-write
          </button>
          <button onClick={() => setAddingStory(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-dashed border-[#C87560] text-[#C87560] hover:bg-[#C87560]/5">
            <Plus className="w-3 h-3" /> New Story
          </button>
        </div>
      </div>

      {/* Story creation area — form + optional brainstorm panel side by side */}
      {addingStory && (
        <div className="flex gap-4 items-stretch">
          {/* Form */}
          <div className="flex-1 rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: "#DDD4C4", background: "#FDFAF7" }}>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>New Story</p>
              {brainstormOpen && newStoryTitle && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#EFE9E1", color: "#1B2A4A" }}>
                  Title suggested by Co-write ✦
                </span>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>Title</label>
              <input
                value={newStoryTitle}
                onChange={e => setNewStoryTitle(e.target.value)}
                placeholder="The Wychcombe Inheritance…"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid #DDD4C4", background: "white", color: "#1B2A4A" }}
                onKeyDown={e => e.key === "Enter" && newStoryTitle.trim() && createMutation.mutate()}
              />
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>Status</label>
                <select value={newStoryStatus} onChange={e => setNewStoryStatus(e.target.value)}
                  className="rounded-lg px-2 py-2 text-sm outline-none"
                  style={{ border: "1px solid #DDD4C4", background: "white" }}>
                  {["draft", "active", "planned", "archived"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newStoryTitle.trim() || createMutation.isPending}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "#1B2A4A" }}
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => { setAddingStory(false); setBrainstormOpen(false); setNewStoryTitle(""); }}
                className="p-2"
                style={{ color: "#9CA3AF" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Brainstorm panel */}
          {brainstormOpen && (
            <CopilotPanel
              isOpen
              onClose={() => setBrainstormOpen(false)}
              title="Story Brainstorm"
              activeFieldLabel="Title"
              greeting={`Let's develop a story idea for ${world.name}. Tell me anything — a character, a mood, a conflict, a single image. I'll help you shape it into a story concept and suggest a title.`}
              onSend={async (message, history) =>
                apiFetch<{ reply: string }>("/v1/worldsmith/copilot", {
                  method: "POST",
                  body: JSON.stringify({
                    surface: "story",
                    worldId: world.id,
                    field: "title",
                    fieldLabel: "Title",
                    message,
                    history,
                    context: { worldName: world.name, brainstorm: true },
                  }),
                })
              }
              onCaptureTarget={() => ({ key: "title", label: "Title" })}
              onApply={(text) => {
                // Strip leading punctuation / quotes if AI wrapped it
                const clean = text.replace(/^["'«»\s]+|["'»«\s]+$/g, "").split("\n")[0]?.trim() ?? text;
                setNewStoryTitle(clean);
              }}
              className="shrink-0"
              panelStyle={{ width: 340, minHeight: 320, maxHeight: 480, position: "relative", top: 0 }}
            />
          )}
        </div>
      )}

      {/* Selected story detail */}
      {selectedStory ? (
        <div className="flex gap-5 items-start">
          <div className="flex-1 min-w-0">
            {/* Title + Co-write */}
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display font-semibold text-lg flex-1">{selectedStory.title}</h2>
              <button
                onClick={() => setCopilotOpen(o => !o)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-semibold border transition-colors ${
                  copilotOpen ? "text-white border-transparent" : "text-foreground border-border hover:border-foreground/30"
                }`}
                style={copilotOpen ? { background: "#1B2A4A" } : undefined}
              >
                <Sparkles className="w-3.5 h-3.5" /> Co-write
              </button>
            </div>
            {/* Editable summary */}
            <textarea
              value={summaryDraft[selectedStory.id] ?? selectedStory.summary ?? ""}
              onChange={e => setSummaryDraft(d => ({ ...d, [selectedStory.id]: e.target.value }))}
              onBlur={() => {
                const val = summaryDraft[selectedStory.id];
                if (val === undefined || val === selectedStory.summary) return;
                apiFetch(`/v1/editorial/stories/${selectedStory.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ summary: val }),
                }).then(() => qc.invalidateQueries({ queryKey: ["ws-stories", world.id] }));
              }}
              rows={3}
              placeholder="What is this story about? A summary grounded in the world…"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm leading-relaxed resize-y min-h-[72px] outline-none focus:border-foreground/30 mb-4"
              style={{ fontFamily: "'Spectral', Georgia, serif" }}
            />
            {selectedStory.acts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">No acts yet</p>
                <p className="text-[12.5px] text-muted-foreground mb-3">Acts divide the story into movements. Add Act I to get started.</p>
                <Link href="/super/worldsmith/editorial/canon">
                  <span className="text-[12px] font-medium text-[#C87560] hover:underline cursor-pointer">
                    Link canon records to this story →
                  </span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {selectedStory.acts.map(act => (
                  <div key={act.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Act {act.actNumber}</p>
                    <p className="font-semibold text-[14px] text-foreground mb-1">{act.title}</p>
                    {act.tagline && <p className="text-[12px] text-muted-foreground italic">{act.tagline}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <CopilotPanel
            isOpen={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            title="Story Copilot"
            activeFieldLabel="Summary"
            greeting={`I'm here to help you write the story for ${world.name}. What's the core premise of "${selectedStory.title}" — who are the main characters and what's at stake?`}
            onSend={async (message, history) =>
              apiFetch<{ reply: string }>("/v1/worldsmith/copilot", {
                method: "POST",
                body: JSON.stringify({
                  surface: "story",
                  worldId: world.id,
                  field: "summary",
                  fieldLabel: "Summary",
                  message,
                  history,
                  context: {
                    storyTitle: selectedStory.title,
                    storyActs: selectedStory.acts,
                    draft: { summary: summaryDraft[selectedStory.id] ?? selectedStory.summary ?? "" },
                  },
                }),
              })
            }
            onCaptureTarget={() => ({ key: selectedStory.id, label: selectedStory.title })}
            onApply={(_text, storyId) => {
              const applied = _text.trim();
              setSummaryDraft(d => ({ ...d, [storyId]: applied }));
              apiFetch(`/v1/editorial/stories/${storyId}`, {
                method: "PATCH",
                body: JSON.stringify({ summary: applied }),
              }).then(() => qc.invalidateQueries({ queryKey: ["ws-stories", world.id] }));
            }}
          />
        </div>
      ) : !isLoading && stories.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No stories for {world.name} yet</p>
          <p className="text-[12.5px] text-muted-foreground mb-4">
            A story gives your canon records narrative purpose — characters to encounter, locations to explore, objects to uncover.
          </p>
          <button onClick={() => setAddingStory(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#1B2A4A" }}>
            Create first story
          </button>
        </div>
      )}

      {/* Products strip — real editions linked to this world */}
      <WorldEditionsStrip world={world} />
    </div>
  );
}

// ── World editions strip ──────────────────────────────────────────────────────

interface EditionRow {
  id: string;
  name: string;
  status: string;
  productType: string;
  world: string | null;
}

const EDITION_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  live:    { bg: "#D1FAE5", color: "#065F46" },
  draft:   { bg: "#F3F4F6", color: "#6B7280" },
  deleted: { bg: "#FEE2E2", color: "#991B1B" },
};

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  planner:        "#8B5CF6",
  notebook:       "#C87560",
  journal:        "#F59E0B",
  "memory-keeping": "#10B981",
};

function WorldEditionsStrip({ world }: { world: WsWorld }) {
  const { data, isLoading } = useQuery({
    queryKey: ["editions-by-world", world.code],
    queryFn: () =>
      apiFetch<EditionRow[]>(`/v1/catalog/editions?world=${encodeURIComponent(world.code.toUpperCase())}`),
    staleTime: 0,
  });

  const editions = Array.isArray(data) ? data : [];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Products from {world.name}
        </p>
        <Link href="/editions">
          <span className="text-[11.5px] font-medium text-[#C87560] hover:underline cursor-pointer flex items-center gap-1">
            All editions <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : editions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium text-foreground mb-1">No editions linked to {world.name} yet</p>
          <p className="text-[12px] text-muted-foreground mb-3">
            Set the <code className="bg-muted px-1 py-0.5 rounded text-[11px]">world</code> field on an edition to{" "}
            <span className="font-mono font-semibold">{world.code.toUpperCase()}</span> to surface it here.
          </p>
          <Link href="/editions/new">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer hover:opacity-90 transition-opacity"
              style={{ background: "#1B2A4A" }}>
              <Plus className="w-3 h-3" />
              Add first edition
            </span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {editions.map(ed => {
            const statusStyle = EDITION_STATUS_STYLES[ed.status] ?? EDITION_STATUS_STYLES.draft;
            const dotColor    = PRODUCT_TYPE_COLORS[ed.productType] ?? "#9CA3AF";
            return (
              <Link key={ed.id} href={`/editions/${ed.id}`}>
                <div className="rounded-lg border border-border p-3 hover:shadow-sm hover:border-foreground/20 transition-all cursor-pointer group">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                    <span className="text-[11px] font-semibold text-foreground leading-tight line-clamp-1 group-hover:text-[#C87560] transition-colors">
                      {ed.name}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground mb-2 capitalize">{ed.productType.replace("-", " ")}</p>
                  <span
                    className="text-[9.5px] font-medium rounded-full px-2 py-0.5 capitalize"
                    style={statusStyle}
                  >
                    {ed.status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── World Bible section ───────────────────────────────────────────────────────

type BibleTextField = "visualPalette" | "proseVoice" | "atmosphericNotes" | "materialWorld";

const BIBLE_FIELD_LABELS: Record<BibleTextField, string> = {
  visualPalette: "Visual Palette",
  proseVoice: "Prose Voice",
  atmosphericNotes: "Atmospheric Notes",
  materialWorld: "Material World",
};

function WorldBibleSection({ world }: { world: WsWorld }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    visualPalette: world.visualPalette ?? "",
    proseVoice: world.proseVoice ?? "",
    atmosphericNotes: world.atmosphericNotes ?? "",
    materialWorld: world.materialWorld ?? "",
    worldRules: world.worldRules ?? [] as string[],
  });
  const [newRule, setNewRule] = useState("");
  const [dirty, setDirty] = useState(false);

  // ── Copilot ────────────────────────────────────────────────────────────────
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeField, setActiveField] = useState<BibleTextField>("visualPalette");
  const [undoBuffer, setUndoBuffer] = useState<{ field: BibleTextField; prev: string; applied: string } | null>(null);
  // Use refs so the onSend closure always reads the current field + draft
  const activeFieldRef = useRef<BibleTextField>("visualPalette");
  const formRef = useRef(form);
  activeFieldRef.current = activeField;
  formRef.current = form;

  const handleCopilotSend = useCallback(async (
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ) => {
    return apiFetch<{ reply: string }>(`/v1/worldsmith/worlds/${encodeURIComponent(world.id)}/bible-copilot`, {
      method: "POST",
      body: JSON.stringify({
        field: activeFieldRef.current,
        message,
        history,
        draft: {
          visualPalette: formRef.current.visualPalette,
          proseVoice: formRef.current.proseVoice,
          atmosphericNotes: formRef.current.atmosphericNotes,
          materialWorld: formRef.current.materialWorld,
        },
      }),
    });
  }, [world.id]);

  const bibleGreeting = (() => {
    const bibleEmpty = !form.visualPalette.trim() && !form.proseVoice.trim()
      && !form.atmosphericNotes.trim() && !form.materialWorld.trim();
    return bibleEmpty
      ? `Welcome — I'm here to help you write the World Bible for ${world.name}. Tell me a little about the world you're building: what does it feel like when you imagine standing inside it? Even a few loose words are enough to start.`
      : `I've read what you have so far for ${world.name}. Click into any field and tell me what you'd like to develop — I can suggest phrases, push a direction further, or draft a paragraph you can drop straight in.`;
  })();

  const applyToField = (text: string, targetKey: string) => {
    const field = (targetKey as BibleTextField) || activeFieldRef.current;
    const applied = text.trim();
    setUndoBuffer({ field, prev: formRef.current[field], applied });
    setForm(f => ({ ...f, [field]: applied }));
    setDirty(true);
    toast({ title: `Applied to ${BIBLE_FIELD_LABELS[field]}` });
  };

  const undoApply = () => {
    if (!undoBuffer) return;
    if (form[undoBuffer.field] === undoBuffer.applied) {
      setForm(f => ({ ...f, [undoBuffer.field]: undoBuffer.prev }));
      setDirty(true);
    }
    setUndoBuffer(null);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<WsWorld>(`/v1/worldsmith/worlds/${encodeURIComponent(world.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          visualPalette: form.visualPalette.trim() || null,
          proseVoice: form.proseVoice.trim() || null,
          atmosphericNotes: form.atmosphericNotes.trim() || null,
          materialWorld: form.materialWorld.trim() || null,
          worldRules: form.worldRules,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worldsmith/worlds"] });
      toast({ title: "World Bible saved" });
      setDirty(false);
      setUndoBuffer(null);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const set = (field: keyof typeof form, value: string) => {
    setForm(f => ({ ...f, [field]: value })); setDirty(true);
    // A manual edit invalidates any pending undo for that field
    setUndoBuffer(u => (u && u.field === field ? null : u));
  };

  const QUESTIONS: { field: keyof typeof form; label: string; q: string; hint: string }[] = [
    { field: "visualPalette",   label: "Visual Palette",    q: "What does this world look like?",            hint: "Colours, lighting, textures…" },
    { field: "proseVoice",      label: "Prose Voice",       q: "How does this world speak?",                 hint: "Register, rhythm, vocabulary…" },
    { field: "atmosphericNotes", label: "Atmospheric Notes", q: "What does this world feel like?",            hint: "Temperature, sound, smell, mood…" },
    { field: "materialWorld",   label: "Material World",    q: "What does this world smell, sound, touch like?", hint: "Tactile qualities, sensory anchors…" },
  ];

  return (
    <div className="flex gap-6 items-start">
    <div className="max-w-2xl flex-1 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground mb-1">{world.name} — World Bible</h2>
          <p className="text-[12.5px] text-muted-foreground">
            These fields are injected into every generation prompt for {world.name}.
            Write freely — this is the voice of your world, not a form to fill.
          </p>
        </div>
        <button
          onClick={() => setCopilotOpen(o => !o)}
          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${
            copilotOpen
              ? "text-white border-transparent"
              : "text-foreground border-border hover:border-foreground/30"
          }`}
          style={copilotOpen ? { background: "#1B2A4A" } : undefined}
        >
          <Sparkles className="w-3.5 h-3.5" /> Co-write
        </button>
      </div>

      <div className="space-y-5">
        {QUESTIONS.map(({ field, label, q, hint }) => (
          <div key={field}>
            <label className="block text-sm font-semibold text-foreground mb-0.5">{q}</label>
            <p className="text-[11.5px] text-muted-foreground mb-2">{hint}</p>
            <textarea
              value={form[field] as string}
              onChange={e => set(field, e.target.value)}
              onFocus={() => setActiveField(field as BibleTextField)}
              rows={3}
              placeholder={`${label}…`}
              className={`w-full min-h-[84px] rounded-xl border px-4 py-3 text-sm leading-relaxed resize-y outline-none focus:border-foreground/30 ${
                copilotOpen && activeField === field ? "border-[#1B2A4A]/40" : "border-border"
              }`}
              style={{ fontFamily: "'Spectral', Georgia, serif" }}
            />
          </div>
        ))}

        {/* World Rules */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-0.5">What rules does this world follow?</label>
          <p className="text-[11.5px] text-muted-foreground mb-2">Rules that constrain or define what's possible — never break these in any output</p>
          <div className="space-y-2 mb-2">
            {form.worldRules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card text-sm">
                <span className="flex-1 text-foreground">{rule}</span>
                <button onClick={() => { setForm(f => ({ ...f, worldRules: f.worldRules.filter((_, j) => j !== i) })); setDirty(true); }}
                  className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newRule} onChange={e => setNewRule(e.target.value)}
              placeholder="Add a rule…"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
              onKeyDown={e => {
                if (e.key === "Enter" && newRule.trim()) {
                  setForm(f => ({ ...f, worldRules: [...f.worldRules, newRule.trim()] }));
                  setNewRule(""); setDirty(true);
                }
              }} />
            <button onClick={() => { if (!newRule.trim()) return; setForm(f => ({ ...f, worldRules: [...f.worldRules, newRule.trim()] })); setNewRule(""); setDirty(true); }}
              className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="pt-2 flex items-center gap-3">
        <button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "#1B2A4A" }}>
          {saveMutation.isPending ? "Saving…" : dirty ? "Save World Bible" : "Saved"}
        </button>
        {!dirty && !saveMutation.isPending && (
          <span className="text-[12px] text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        {undoBuffer && (
          <button onClick={undoApply} className="text-[12px] text-muted-foreground underline hover:text-foreground">
            Undo apply to {BIBLE_FIELD_LABELS[undoBuffer.field]}
          </button>
        )}
      </div>
    </div>

    <CopilotPanel
      isOpen={copilotOpen}
      onClose={() => setCopilotOpen(false)}
      title="Bible Copilot"
      activeFieldLabel={BIBLE_FIELD_LABELS[activeField]}
      onSend={handleCopilotSend}
      onCaptureTarget={() => ({ key: activeFieldRef.current, label: BIBLE_FIELD_LABELS[activeFieldRef.current] })}
      onApply={(text, key) => applyToField(text, key)}
      greeting={bibleGreeting}
    />
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatTile({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className={["rounded-lg border px-3 py-2.5", alert ? "border-orange-300 bg-orange-50" : "border-border bg-muted/10"].join(" ")}>
      <p className="text-[10.5px] text-muted-foreground font-medium">{label}</p>
      <p className="text-2xl font-display font-semibold leading-none mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function RunRow({ run }: { run: WsRun }) {
  const statusCfg: Record<string, { icon: React.ReactNode; color: string }> = {
    compiled:          { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "#10b981" },
    complete:          { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "#10b981" },
    failed:            { icon: <XCircle className="w-3.5 h-3.5" />,      color: "#ef4444" },
    pending:           { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: "#6b7280" },
    compiling:         { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: "#8b5cf6" },
    validation_failed: { icon: <AlertCircle className="w-3.5 h-3.5" />,  color: "#f59e0b" },
  };
  const cfg = statusCfg[run.status] ?? { icon: <Clock className="w-3.5 h-3.5" />, color: "#9ca3af" };
  const specShort = run.production_spec_id.length > 16
    ? run.production_spec_id.slice(0, 8) + "…" + run.production_spec_id.slice(-4)
    : run.production_spec_id;

  return (
    <div className="flex items-center gap-2.5 py-2.5 px-1">
      <span style={{ color: cfg.color }} className="shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-mono text-foreground truncate">{specShort}</p>
        <p className="text-[10.5px] text-muted-foreground">{run.operation}</p>
      </div>
      <span className="text-[10.5px] text-muted-foreground whitespace-nowrap shrink-0">
        {timeAgo(run.started_at)}
      </span>
    </div>
  );
}

function AssetReviewRow({ asset }: { asset: WsAsset }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-7 h-7 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
        <BookOpen className="w-3.5 h-3.5 text-amber-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-foreground truncate">{asset.assetName}</p>
        <p className="text-[10.5px] text-muted-foreground">
          {asset.componentType} · {asset.currentVersion}
        </p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
          Under Review
        </span>
        {asset.productionSpecNotionId && (
          <a
            href={`https://notion.so/${asset.productionSpecNotionId.replace(/-/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Open in Notion"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function IntegrationsSection({
  world,
  integrations,
  defaultEditing = false,
  onDefaultEditingConsumed,
}: {
  world: WsWorld;
  integrations: HealthStatus[];
  defaultEditing?: boolean;
  onDefaultEditingConsumed?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(defaultEditing);
  // If we were opened with defaultEditing=true, notify parent so it doesn't
  // force-open again if the user navigates away and back.
  const consumedRef = useRef(false);
  useEffect(() => {
    if (defaultEditing && !consumedRef.current) {
      consumedRef.current = true;
      onDefaultEditingConsumed?.();
    }
  }, [defaultEditing, onDefaultEditingConsumed]);
  const [form, setForm] = useState({
    notionProductionDbId: world.notionProductionDbId ?? "",
    notionCanonDbId: world.notionCanonDbId ?? "",
    driveFolderId: world.driveFolderId ?? "",
    imageProvider: world.imageProvider ?? "",
    status: world.status,
    currentCollection: world.currentCollection ?? "",
    currentVolume: world.currentVolume ?? "",
    worldRules: world.worldRules ?? [] as string[],
    visualPalette: world.visualPalette ?? "",
    proseVoice: world.proseVoice ?? "",
    atmosphericNotes: world.atmosphericNotes ?? "",
    materialWorld: world.materialWorld ?? "",
  });
  const [newRule, setNewRule] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      wsApi.updateWorld(world.id, {
        notionProductionDbId: form.notionProductionDbId.trim() || null,
        notionCanonDbId: form.notionCanonDbId.trim() || null,
        driveFolderId: form.driveFolderId.trim() || null,
        imageProvider: form.imageProvider.trim() || null,
        status: form.status as WsWorld["status"],
        currentCollection: form.currentCollection.trim() || null,
        currentVolume: form.currentVolume.trim() || null,
        worldRules: form.worldRules,
        visualPalette: form.visualPalette.trim() || null,
        proseVoice: form.proseVoice.trim() || null,
        atmosphericNotes: form.atmosphericNotes.trim() || null,
        materialWorld: form.materialWorld.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Settings saved", description: `${world.name} has been updated.` });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["worldsmith/worlds"] });
      qc.invalidateQueries({ queryKey: ["worldsmith/health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
    },
  });

  // Global checks have no worldId; per-world checks carry their worldId
  const globalChecks = integrations.filter(i => !i.worldId);
  const worldDbEntry = integrations.find(i => i.worldId === world.id);

  // If the world has a configured DB but we don't have a health result yet,
  // show a placeholder so admins know it exists but wasn't probed.
  const worldDbRow: HealthStatus | null = worldDbEntry ?? (
    world.notionProductionDbId
      ? {
          service: `notion_db_${world.id}`,
          label: `${world.name} — Production DB`,
          status: "unknown",
          message: "Not yet checked — health check may still be loading",
          checkedAt: new Date().toISOString(),
          worldId: world.id,
        }
      : null
  );

  // Determine whether to show an edit nudge (warning/failed status or no DB configured)
  const needsAttention =
    !world.notionProductionDbId ||
    worldDbEntry?.status === "warning" ||
    worldDbEntry?.status === "failed";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      {/* Per-world DB check — shown first so admins see it prominently */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {world.name} — Notion database
          </p>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className={[
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-colors",
                needsAttention
                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60",
              ].join(" ")}
            >
              <Pencil className="w-3 h-3" />
              Edit settings
            </button>
          )}
        </div>

        {worldDbRow ? (
          <>
            <HealthRow integration={worldDbRow} />
            {world.notionProductionDbId && (
              <p className="text-[10.5px] text-muted-foreground font-mono mt-1.5 pl-1 break-all">
                {world.notionProductionDbId}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border bg-muted/10">
            <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[12px] text-muted-foreground">
              No Notion Production DB ID configured for this world. Use <strong>Edit settings</strong> above to add one.
            </p>
          </div>
        )}
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Edit world settings</p>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Notion Production DB ID
              </label>
              <input
                value={form.notionProductionDbId}
                onChange={e => setForm(f => ({ ...f, notionProductionDbId: e.target.value }))}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 font-mono"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                32-character Notion database ID. The integration must have share access to this DB.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Notion Canon DB ID
              </label>
              <input
                value={form.notionCanonDbId}
                onChange={e => setForm(f => ({ ...f, notionCanonDbId: e.target.value }))}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Notion database that holds your canon records. Used by the Canon Library "Sync from Notion" button.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Google Drive Folder ID
              </label>
              <input
                value={form.driveFolderId}
                onChange={e => setForm(f => ({ ...f, driveFolderId: e.target.value }))}
                placeholder="Google Drive folder ID"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Current collection</label>
                <input
                  value={form.currentCollection}
                  onChange={e => setForm(f => ({ ...f, currentCollection: e.target.value }))}
                  placeholder="e.g. Thornvale Journals"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Current volume</label>
                <input
                  value={form.currentVolume}
                  onChange={e => setForm(f => ({ ...f, currentVolume: e.target.value }))}
                  placeholder="e.g. Vol. 1"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Image provider</label>
                <select
                  value={form.imageProvider}
                  onChange={e => setForm(f => ({ ...f, imageProvider: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none"
                >
                  <option value="">None</option>
                  <option value="dalle3">DALL-E 3 (OpenAI)</option>
                  <option value="stability">Stability AI</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1">World status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as WsWorld["status"] }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none"
                >
                  <option value="in_setup">In setup</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {/* World Rules list editor */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                World Rules
              </label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Authorial constraints injected into every prompt for this world (e.g. "Never name the protagonist directly").
              </p>
              <div className="space-y-1.5 mb-2">
                {form.worldRules.map((rule, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <input
                      value={rule}
                      onChange={e => {
                        const next = [...form.worldRules];
                        next[idx] = e.target.value;
                        setForm(f => ({ ...f, worldRules: next }));
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
                    />
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, worldRules: f.worldRules.filter((_, i) => i !== idx) }))}
                      className="mt-0.5 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove rule"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={newRule}
                  onChange={e => setNewRule(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newRule.trim()) {
                      e.preventDefault();
                      setForm(f => ({ ...f, worldRules: [...f.worldRules, newRule.trim()] }));
                      setNewRule("");
                    }
                  }}
                  placeholder="Add a rule and press Enter…"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-dashed border-border bg-background text-sm outline-none focus:border-foreground/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newRule.trim()) return;
                    setForm(f => ({ ...f, worldRules: [...f.worldRules, newRule.trim()] }));
                    setNewRule("");
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* World Bible — aesthetic identity */}
            <div className="pt-2 border-t border-border">
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground block mb-0.5">
                World Bible
              </label>
              <p className="text-[10px] text-muted-foreground mb-3">
                Aesthetic identity injected into every generation prompt alongside the World Rules.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Visual Palette
                  </label>
                  <textarea
                    value={form.visualPalette}
                    onChange={e => setForm(f => ({ ...f, visualPalette: e.target.value }))}
                    rows={2}
                    placeholder="e.g. muted earth tones, aged parchment whites, soft moss greens — lighting always diffuse, no harsh shadows"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Dominant hues, light quality, and tonal range.</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Prose Voice
                  </label>
                  <textarea
                    value={form.proseVoice}
                    onChange={e => setForm(f => ({ ...f, proseVoice: e.target.value }))}
                    rows={2}
                    placeholder="e.g. intimate third-person limited, past tense, long descriptive sentences with sensory weight, no em-dashes"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Tense, person, sentence rhythm, and narrative register.</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Atmospheric Notes
                  </label>
                  <textarea
                    value={form.atmosphericNotes}
                    onChange={e => setForm(f => ({ ...f, atmosphericNotes: e.target.value }))}
                    rows={2}
                    placeholder="e.g. melancholy beauty — things decaying but still loved, quiet tension beneath every surface courtesy"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Ambient mood and emotional texture of the world.</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Material World
                  </label>
                  <textarea
                    value={form.materialWorld}
                    onChange={e => setForm(f => ({ ...f, materialWorld: e.target.value }))}
                    rows={2}
                    placeholder="e.g. worn leather, cracked porcelain, dry stone walls, pressed flowers — nothing synthetic or mass-produced"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Textures, surfaces, and physical substances that define the setting.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => {
                setEditing(false);
                setNewRule("");
                setForm({
                  notionProductionDbId: world.notionProductionDbId ?? "",
                  notionCanonDbId: world.notionCanonDbId ?? "",
                  driveFolderId: world.driveFolderId ?? "",
                  imageProvider: world.imageProvider ?? "",
                  status: world.status,
                  currentCollection: world.currentCollection ?? "",
                  currentVolume: world.currentVolume ?? "",
                  worldRules: world.worldRules ?? [],
                  visualPalette: world.visualPalette ?? "",
                  proseVoice: world.proseVoice ?? "",
                  atmosphericNotes: world.atmosphericNotes ?? "",
                  materialWorld: world.materialWorld ?? "",
                });
              }}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "#1B2A4A" }}
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save settings
            </button>
          </div>
        </div>
      )}

      {/* Global integration checks */}
      {globalChecks.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2">
            Global integrations
          </p>
          <div className="space-y-2">
            {globalChecks.map(i => <HealthRow key={i.service} integration={i} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthRow({ integration }: { integration: HealthStatus }) {
  const cfg: Record<string, { icon: React.ReactNode; color: string }> = {
    connected:      { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "#10b981" },
    warning:        { icon: <AlertCircle className="w-3.5 h-3.5" />,  color: "#f59e0b" },
    failed:         { icon: <XCircle className="w-3.5 h-3.5" />,      color: "#ef4444" },
    not_configured: { icon: <Wrench className="w-3.5 h-3.5" />,       color: "#9ca3af" },
    unknown:        { icon: <AlertCircle className="w-3.5 h-3.5" />,  color: "#9ca3af" },
  };
  const c = cfg[integration.status] ?? cfg.unknown;
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-muted/10">
      <span style={{ color: c.color }} className="mt-0.5 shrink-0">{c.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-foreground">{integration.label}</p>
        {integration.message && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{integration.message}</p>
        )}
      </div>
    </div>
  );
}

function WorldStatusBadge({ status, invert }: { status: string; invert?: boolean }) {
  const cfg: Record<string, { label: string; bg: string; text: string }> = {
    active:    { label: "Active",   bg: "#dcfce7", text: "#15803d" },
    in_setup:  { label: "In setup", bg: "#fef9c3", text: "#854d0e" },
    archived:  { label: "Archived", bg: "#f3f4f6", text: "#6b7280" },
  };
  const c = cfg[status] ?? { label: status, bg: "#f3f4f6", text: "#6b7280" };
  const bg = invert ? "rgba(255,255,255,0.15)" : c.bg;
  const text = invert ? "#ffffff" : c.text;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: bg, color: text }}
    >
      {c.label}
    </span>
  );
}

function EmptyWorldsState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border p-16 text-center">
      <div
        className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
        style={{ background: "hsl(221 46% 20%)" }}
      >
        <Sparkles className="w-6 h-6 text-[#C87560]" />
      </div>
      <p className="text-base font-semibold text-foreground mb-1">No worlds yet</p>
      <p className="text-[12.5px] text-muted-foreground mb-5">
        Create your first creative world to begin production planning.
      </p>
      <button
        onClick={onNew}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        style={{ background: "#C87560" }}
      >
        Create New World
      </button>
    </div>
  );
}

// ── Create World Modal ─────────────────────────────────────────────────────────

const COVER_PRESETS = [
  { label: "Forest",  color: "linear-gradient(135deg, #2D4A2A 0%, #4A6B3A 50%, #7A9B6A 100%)", accent: "#A8C880" },
  { label: "Ocean",   color: "linear-gradient(135deg, #1A3A4A 0%, #2A5A6A 50%, #4A8A9A 100%)", accent: "#7ABCCC" },
  { label: "Autumn",  color: "linear-gradient(135deg, #3A2A1A 0%, #6A4A2A 50%, #9A7A4A 100%)", accent: "#C8A870" },
  { label: "Ink",     color: "linear-gradient(135deg, #1B2A4A 0%, #2A4A6A 100%)",               accent: "#C87560" },
  { label: "Dusk",    color: "linear-gradient(135deg, #2A1A3A 0%, #4A2A6A 50%, #7A4A9A 100%)", accent: "#C870C8" },
  { label: "Sand",    color: "linear-gradient(135deg, #4A3A2A 0%, #6A5A4A 50%, #9A8A7A 100%)", accent: "#D4B896" },
];

function CreateWorldModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", code: "", description: "", owner: "",
    coverColor: COVER_PRESETS[3].color, coverAccent: COVER_PRESETS[3].accent,
    currentCollection: "", currentVolume: "", imageProvider: "",
    notionProductionDbId: "", driveFolderId: "",
  });

  const mutation = useMutation({
    mutationFn: () => wsApi.createWorld({
      id: form.code.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
      owner: form.owner.trim(),
      coverColor: form.coverColor,
      coverAccent: form.coverAccent,
      currentCollection: form.currentCollection.trim() || undefined,
      currentVolume: form.currentVolume.trim() || undefined,
      imageProvider: form.imageProvider.trim() || undefined,
      notionProductionDbId: form.notionProductionDbId.trim() || undefined,
      driveFolderId: form.driveFolderId.trim() || undefined,
      status: "in_setup",
      tags: [],
    } as Partial<WsWorld>),
    onSuccess: () => {
      toast({ title: "World created", description: `${form.name} has been added to the registry.` });
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create world", description: err.message, variant: "destructive" });
    },
  });

  const valid = form.name.trim().length > 0 && form.code.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="font-display font-semibold text-base text-foreground">Create New World</p>
            <p className="text-[12px] text-muted-foreground">Register a new creative world in WorldSmith</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Cover preview */}
          <div
            className="rounded-xl h-20 flex items-end p-4 relative overflow-hidden"
            style={{ background: form.coverColor }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="relative z-10">
              <p className="font-display font-semibold text-white text-base">{form.name || "World Name"}</p>
              <p className="text-[10.5px] text-white/70">{form.code || "CODE"}</p>
            </div>
          </div>

          {/* Cover presets */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">Cover</p>
            <div className="flex gap-2 flex-wrap">
              {COVER_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setForm(f => ({ ...f, coverColor: p.color, coverAccent: p.accent }))}
                  className={["w-7 h-7 rounded-full border-2 transition-all", form.coverColor === p.color ? "border-foreground scale-110" : "border-transparent"].join(" ")}
                  style={{ background: p.color }}
                  aria-label={p.label}
                  title={p.label}
                />
              ))}
            </div>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground block mb-1">
                World name *
              </label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Wychcombe"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground block mb-1">
                Code *
              </label>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().slice(0, 6) }))}
                placeholder="WYC"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground block mb-1">
                Owner
              </label>
              <input
                value={form.owner}
                onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                placeholder="Sophie Calloway"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground block mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What is this world about?"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30 resize-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground block mb-1">
                Current collection
              </label>
              <input
                value={form.currentCollection}
                onChange={e => setForm(f => ({ ...f, currentCollection: e.target.value }))}
                placeholder="e.g. Thornvale Journals"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground block mb-1">
                Current volume
              </label>
              <input
                value={form.currentVolume}
                onChange={e => setForm(f => ({ ...f, currentVolume: e.target.value }))}
                placeholder="e.g. Vol. 1"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
              />
            </div>
          </div>

          {/* Optional integration settings */}
          <details className="group">
            <summary className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Integration settings (optional)
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Image provider</label>
                <select
                  value={form.imageProvider}
                  onChange={e => setForm(f => ({ ...f, imageProvider: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none"
                >
                  <option value="">None</option>
                  <option value="dalle3">DALL-E 3 (OpenAI)</option>
                  <option value="stability">Stability AI</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Notion Production DB ID</label>
                <input
                  value={form.notionProductionDbId}
                  onChange={e => setForm(f => ({ ...f, notionProductionDbId: e.target.value }))}
                  placeholder="Notion database ID"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Google Drive Folder ID</label>
                <input
                  value={form.driveFolderId}
                  onChange={e => setForm(f => ({ ...f, driveFolderId: e.target.value }))}
                  placeholder="Google Drive folder ID"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none font-mono"
                />
              </div>
            </div>
          </details>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            style={{ background: "#1B2A4A" }}
          >
            {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create World
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dayLabel(iso: string): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  const today = new Date();
  const toMidnight = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((toMidnight(today) - toMidnight(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function groupRunsByDay(runs: WsRun[]): { label: string; runs: WsRun[] }[] {
  const groups: { label: string; runs: WsRun[] }[] = [];
  const seen = new Map<string, WsRun[]>();
  for (const run of runs) {
    const label = dayLabel(run.started_at);
    if (!seen.has(label)) { seen.set(label, []); groups.push({ label, runs: seen.get(label)! }); }
    seen.get(label)!.push(run);
  }
  return groups;
}
