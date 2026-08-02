/**
 * PROTOTYPE_DATA — Concept 2: WorldSmith World Gallery.
 * Visual, World-first portfolio view. Clicking a World transforms the page
 * into a focused World overview.
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  Sparkles, Plus, LayoutGrid, List, Search, X, ChevronLeft,
  ArrowRight, BookOpen, Layers, Clock, Settings, Filter,
} from "lucide-react";
import {
  WORLDS, PRODUCTION_SPECS, REVIEW_ITEMS, ACTIVITY,
  getFilteredAlerts, getFilteredActivity, getWorldIntegrations,
  timeAgo, ROLE_LABELS,
} from "../seed-data";
import type { World } from "../seed-data";
import { usePrototype } from "../prototype-context";
import { WorldHealthChip } from "../components/WorldHealthChip";
import { ProductionProgressBar, ReviewQueueItem, ActivityStream, SpecRow, EmptyState } from "../components/Shared";
import { WorldSelector } from "../components/WorldSelector";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { IntegrationPanel } from "../components/IntegrationStatusRow";
import { ActionCenter } from "../components/ActionItem";
import { ProductionBadge } from "../components/StatusBadge";
import { FeedbackPanel } from "../FeedbackPanel";
import { CreateWorldWizard } from "../wizard/CreateWorldWizard";

type SortKey = "activity" | "health" | "progress" | "name";

export default function WorldGallery() {
  const { role, worldFilter, setWorldFilter, worlds, wizardOpen, openWizard } = usePrototype();
  const [viewMode, setViewMode] = useState<"gallery" | "list">("gallery");
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // If a world is selected in the global filter, show focused view
  const focusedWorld = worldFilter ? worlds.find(w => w.id === worldFilter) ?? null : null;

  const filteredWorlds = worlds.filter(w => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && w.health !== statusFilter) return false;
    return true;
  });

  const sortedWorlds = [...filteredWorlds].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "progress") return b.productionCompletion - a.productionCompletion;
    if (sortBy === "health") {
      const ord = { blocked: 0, needs_attention: 1, in_setup: 2, healthy: 3, inactive: 4 };
      return (ord[a.health] ?? 5) - (ord[b.health] ?? 5);
    }
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
  });

  return (
    <div className="min-h-screen" style={{ background: "hsl(35 52% 94%)" }}>
      {wizardOpen && <CreateWorldWizard />}

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-13 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "hsl(221 46% 20%)" }}>
              <Sparkles className="w-3.5 h-3.5 text-[#C87560]" />
            </div>
            <p className="font-display font-semibold text-sm text-foreground">WorldSmith</p>
            <span className="text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 font-mono">
              World Gallery
            </span>
          </div>
          <div className="flex-1" />
          <RoleSwitcher mode="dropdown" label={false} />
          <div className="w-px h-4 bg-border" />
          <button
            onClick={openWizard}
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
          // ── Focused World view ─────────────────────────────────
          <FocusedWorldView
            world={focusedWorld}
            role={role}
            onBack={() => setWorldFilter(null)}
          />
        ) : (
          // ── Gallery view ───────────────────────────────────────
          <>
            {/* Gallery header */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="font-display font-semibold text-xl text-foreground">All Worlds</h1>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">{worlds.length} worlds · {ROLE_LABELS[role]} view</p>
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
                  aria-label="Filter by health status"
                >
                  <option value="all">All health</option>
                  <option value="healthy">Healthy</option>
                  <option value="needs_attention">Needs attention</option>
                  <option value="blocked">Blocked</option>
                  <option value="in_setup">In setup</option>
                </select>
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none"
                  aria-label="Sort worlds by"
                >
                  <option value="activity">Recent activity</option>
                  <option value="health">Health</option>
                  <option value="progress">Progress</option>
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

            {sortedWorlds.length === 0 ? (
              <EmptyState
                title="No worlds found"
                description={search ? `No worlds match "${search}"` : "No worlds match the current filters."}
                action="Clear filters"
                onAction={() => { setSearch(""); setStatusFilter("all"); }}
              />
            ) : viewMode === "gallery" ? (
              <GalleryGrid worlds={sortedWorlds} role={role} />
            ) : (
              <ListView worlds={sortedWorlds} role={role} />
            )}

            {/* First-use CTA */}
            <div className="mt-8 rounded-xl border-2 border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground mb-1">Start a new World</p>
              <p className="text-[12.5px] text-muted-foreground mb-3">Create a new creative world with guided setup.</p>
              <button
                onClick={openWizard}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
                style={{ background: "#C87560" }}
              >
                Create New World
              </button>
            </div>
          </>
        )}

        <div className="mt-8 space-y-4">
          <FeedbackPanel conceptKey="world-gallery" conceptName="World Gallery" />
          <div className="flex items-center justify-between pt-1">
            <Link href="/super/worldsmith/concepts">
              <span className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer">
                ← All concepts
              </span>
            </Link>
            <p className="text-[11px] text-muted-foreground">PROTOTYPE · Not production</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Gallery grid ──────────────────────────────────────────────────────────────

function GalleryGrid({ worlds, role }: { worlds: World[]; role: string }) {
  const { setWorldFilter } = usePrototype();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {worlds.map(w => (
        <WorldCard key={w.id} world={w} role={role} onSelect={() => setWorldFilter(w.id)} />
      ))}
    </div>
  );
}

function WorldCard({ world, role, onSelect }: { world: World; role: string; onSelect: () => void }) {
  const specs = PRODUCTION_SPECS.filter(s => s.worldId === world.id);
  const integrations = getWorldIntegrations(world.id);
  const issueCount = integrations.filter(i => i.status !== "connected" && i.status !== "not_required").length;

  return (
    <article
      className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onSelect}
      aria-label={`Open ${world.name}`}
    >
      {/* Cover art area */}
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
          <WorldHealthChip health={world.health} />
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">{world.description}</p>

        {/* Key info by role */}
        {role === "creative_director" && (
          <div className="space-y-1.5">
            {world.currentVolume && (
              <p className="text-[11.5px] text-foreground font-medium">{world.currentCollection} · {world.currentVolume}</p>
            )}
            {world.awaitingReview > 0 && (
              <p className="text-[11px] text-amber-700">{world.awaitingReview} item{world.awaitingReview !== 1 ? "s" : ""} awaiting review</p>
            )}
            {world.blockers > 0 && (
              <p className="text-[11px] text-red-600">{world.blockers} blocker{world.blockers !== 1 ? "s" : ""}</p>
            )}
          </div>
        )}
        {role === "store_end_user" && (
          <div className="space-y-1.5">
            {world.currentVolume && (
              <p className="text-[11.5px] text-foreground font-medium">{world.currentVolume}</p>
            )}
            <ProductionProgressBar completion={world.productionCompletion} label="Production complete" />
          </div>
        )}
        {role === "daybook_admin" && (
          <div className="space-y-1.5">
            {issueCount > 0 ? (
              <p className="text-[11px] text-amber-700">{issueCount} integration issue{issueCount !== 1 ? "s" : ""}</p>
            ) : (
              <p className="text-[11px] text-green-700">All integrations healthy</p>
            )}
            {world.status === "in_setup" && (
              <p className="text-[11px] text-[#C87560] font-medium">Setup incomplete</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10.5px] text-muted-foreground">{timeAgo(world.lastActivity)}</span>
          <span className="text-[11.5px] font-medium text-[#C87560] flex items-center gap-1 group-hover:gap-1.5 transition-all">
            Open <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </article>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ worlds, role }: { worlds: World[]; role: string }) {
  const { setWorldFilter } = usePrototype();
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            {["World", "Health", "Progress", "Last activity", ""].map(h => (
              <th key={h} className="px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {worlds.map(w => (
            <tr key={w.id} className="hover:bg-muted/10 cursor-pointer transition-colors" onClick={() => setWorldFilter(w.id)}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: w.coverColor }} />
                  <div>
                    <p className="text-[13px] font-semibold">{w.name}</p>
                    <p className="text-[10.5px] text-muted-foreground">{w.code}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3"><WorldHealthChip health={w.health} /></td>
              <td className="px-4 py-3 w-32">
                {w.status !== "in_setup" ? <ProductionProgressBar completion={w.productionCompletion} /> : <span className="text-[11px] text-muted-foreground">Not started</span>}
              </td>
              <td className="px-4 py-3"><span className="text-[11.5px] text-muted-foreground">{timeAgo(w.lastActivity)}</span></td>
              <td className="px-4 py-3"><span className="text-[11.5px] font-medium text-[#C87560]">Open →</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Focused World view ────────────────────────────────────────────────────────

function FocusedWorldView({ world, role, onBack }: { world: World; role: string; onBack: () => void }) {
  const [activeSection, setActiveSection] = useState<"overview" | "production" | "review" | "integrations">("overview");
  const specs = PRODUCTION_SPECS.filter(s => s.worldId === world.id);
  const reviews = REVIEW_ITEMS.filter(r => r.worldId === world.id);
  const integrations = getWorldIntegrations(world.id);
  const activity = getFilteredActivity(world.id);
  const alerts = getFilteredAlerts(world.id, role as any);

  const SECTIONS = [
    { id: "overview",      label: "Overview" },
    { id: "production",    label: `Production (${specs.length})` },
    { id: "review",        label: `Review (${reviews.filter(r => r.status === "awaiting").length})` },
    { id: "integrations",  label: "Integrations" },
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
              <WorldHealthChip health={world.health} />
              {world.currentVolume && (
                <span className="text-[11.5px] text-white/80 bg-white/10 rounded-full px-2.5 py-0.5">
                  {world.currentCollection} · {world.currentVolume}
                </span>
              )}
              {world.status !== "in_setup" && (
                <span className="text-[11.5px] text-white/80 bg-white/10 rounded-full px-2.5 py-0.5">
                  {world.productionCompletion}% complete
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/20 text-white hover:bg-white/30 transition-colors"
            >
              Open workspace
            </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ActionCenter alerts={alerts} role={role as any} title="Action items" />
          <ActivityStream events={activity} maxItems={6} />
          {world.healthReasons.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 md:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800 mb-2">Health notes</p>
              <ul className="space-y-1">
                {world.healthReasons.map((r, i) => (
                  <li key={i} className="text-[12.5px] text-amber-800 flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {activeSection === "production" && (
        <div className="rounded-xl border border-border bg-card">
          {specs.length === 0 ? (
            <EmptyState title="No production specifications" description="No specs found for this world." />
          ) : (
            <div className="divide-y divide-border/50 px-4">
              {specs.map(s => <SpecRow key={s.id} spec={s} />)}
            </div>
          )}
        </div>
      )}
      {activeSection === "review" && (
        <div className="rounded-xl border border-border bg-card">
          {reviews.length === 0 ? (
            <EmptyState title="No review items" description="Nothing is awaiting review for this world." />
          ) : (
            <div className="divide-y divide-border/50 px-4">
              {reviews.map(r => <ReviewQueueItem key={r.id} item={r} />)}
            </div>
          )}
        </div>
      )}
      {activeSection === "integrations" && (
        <IntegrationPanel integrations={integrations} title={`${world.name} integrations`} />
      )}
    </div>
  );
}
