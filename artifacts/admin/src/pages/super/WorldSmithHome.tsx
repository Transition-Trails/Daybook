/**
 * WorldSmith Home — production landing page.
 * Based on the approved World Gallery concept; all data sourced from real API calls.
 * Role switcher removed — only super_admins reach /super/worldsmith.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles, Plus, LayoutGrid, List, Search, X, ChevronLeft,
  ArrowRight, BookOpen, Loader2, CheckCircle2, XCircle,
  AlertCircle, ExternalLink, Clock, Wrench,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
  driveFolderId?: string | null;
  imageProvider?: string | null;
  createdAt: string;
  updatedAt: string;
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
          {world.currentCollection && (
            <p className="text-[11.5px] text-foreground font-medium">
              {world.currentCollection}{world.currentVolume ? ` · ${world.currentVolume}` : ""}
            </p>
          )}
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
            {["World", "Status", "Collection", "Assets", "Updated", ""].map(h => (
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
              <td className="px-4 py-3">
                <p className="text-[12.5px] text-foreground">{w.currentCollection ?? "—"}</p>
                {w.currentVolume && <p className="text-[10.5px] text-muted-foreground">{w.currentVolume}</p>}
              </td>
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
  const [activeSection, setActiveSection] = useState<"overview" | "production" | "review" | "integrations">("overview");

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
    { id: "production",   label: `Runs (${runs.length})` },
    { id: "review",       label: `Review (${reviewQueue.length})` },
    { id: "integrations", label: "Integrations" },
  ];

  return (
    <div className="space-y-6">
      {/* World hero */}
      <div
        className="rounded-2xl overflow-hidden border border-border relative"
        style={{ background: world.coverColor }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" aria-hidden="true" />
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
              {world.currentVolume && (
                <span className="text-[11.5px] text-white/80 bg-white/10 rounded-full px-2.5 py-0.5">
                  {world.currentCollection} · {world.currentVolume}
                </span>
              )}
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
          <div className="flex flex-col items-end gap-2">
            <Link href="/super/worldsmith/compiler">
              <span className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/20 text-white hover:bg-white/30 transition-colors cursor-pointer">
                Open Compiler
              </span>
            </Link>
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
      {activeSection === "overview" && (
        <OverviewSection
          world={world}
          assets={worldAssets}
          runs={runs}
          runsLoading={runsLoading}
        />
      )}

      {activeSection === "production" && (
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
            <div className="divide-y divide-border/50">
              {runs.map(r => <RunRow key={r.run_id} run={r} />)}
            </div>
          )}
        </div>
      )}

      {activeSection === "review" && (
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
      )}

      {activeSection === "integrations" && (
        <IntegrationsSection world={world} integrations={integrations} />
      )}
    </div>
  );
}

// ── Overview section ──────────────────────────────────────────────────────────

function OverviewSection({
  world,
  assets,
  runs,
  runsLoading,
}: {
  world: WsWorld;
  assets: WsAsset[];
  runs: WsRun[];
  runsLoading: boolean;
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

      {/* Recent runs (last 3) */}
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

function IntegrationsSection({ world, integrations }: { world: WsWorld; integrations: HealthStatus[] }) {
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

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Per-world DB check — shown first so admins see it prominently */}
      {worldDbRow ? (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2">
            {world.name} — Notion database
          </p>
          <HealthRow integration={worldDbRow} />
          {world.notionProductionDbId && (
            <p className="text-[10.5px] text-muted-foreground font-mono mt-1.5 pl-1">
              {world.notionProductionDbId}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2">
            {world.name} — Notion database
          </p>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-border bg-muted/10">
            <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[12px] text-muted-foreground">
              No Notion Production DB ID configured for this world. Add one in world settings to enable per-world health checks.
            </p>
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
                Collection
              </label>
              <input
                value={form.currentCollection}
                onChange={e => setForm(f => ({ ...f, currentCollection: e.target.value }))}
                placeholder="Victorian Garden Journals"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-foreground/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground block mb-1">
                Volume
              </label>
              <input
                value={form.currentVolume}
                onChange={e => setForm(f => ({ ...f, currentVolume: e.target.value }))}
                placeholder="Volume I"
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
