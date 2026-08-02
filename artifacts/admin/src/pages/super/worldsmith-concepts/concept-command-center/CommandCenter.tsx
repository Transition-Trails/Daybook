/**
 * PROTOTYPE_DATA — Concept 1: WorldSmith Command Center.
 * Dense operational cockpit for maximum system visibility.
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  Sparkles, Plus, Bell, Search, Globe, BookOpen, BarChart2,
  Layers, Settings, Clock, ChevronRight, ArrowRight, RefreshCw,
} from "lucide-react";
import {
  WORLDS, PRODUCTION_SPECS, INTEGRATIONS, REVIEW_ITEMS, ACTIVITY,
  getMetrics, getFilteredAlerts, getFilteredActivity, getWorldIntegrations,
  timeAgo, ROLE_LABELS,
} from "../seed-data";
import type { Role } from "../seed-data";
import { usePrototype } from "../prototype-context";
import { MetricCard } from "../components/MetricCard";
import { WorldHealthChip } from "../components/WorldHealthChip";
import { ActionCenter } from "../components/ActionItem";
import { IntegrationPanel } from "../components/IntegrationStatusRow";
import { WorldSelector } from "../components/WorldSelector";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { ProductionProgressBar, SpecRow, ActivityStream, ReviewQueueItem, EmptyState } from "../components/Shared";
import { ProductionBadge } from "../components/StatusBadge";
import { FeedbackPanel } from "../FeedbackPanel";
import { CreateWorldWizard } from "../wizard/CreateWorldWizard";

const NAV_ITEMS = [
  { label: "Worlds",      icon: Globe,      href: "#worlds" },
  { label: "Production",  icon: Layers,     href: "#production" },
  { label: "Reviews",     icon: BookOpen,   href: "#reviews" },
  { label: "Assets",      icon: BarChart2,  href: "#assets" },
  { label: "Runs",        icon: Clock,      href: "#runs" },
  { label: "Integrations",icon: Settings,   href: "#integrations" },
];

export default function CommandCenter() {
  const { role, worldFilter, worlds, wizardOpen, openWizard, closeWizard } = usePrototype();
  const [notifOpen, setNotifOpen] = useState(false);

  const metrics = getMetrics(worldFilter);
  const alerts = getFilteredAlerts(worldFilter, role);
  const activity = getFilteredActivity(worldFilter);

  const displayWorlds = worldFilter ? worlds.filter(w => w.id === worldFilter) : worlds;
  const specs = worldFilter
    ? PRODUCTION_SPECS.filter(s => s.worldId === worldFilter)
    : PRODUCTION_SPECS;
  const reviewItems = worldFilter
    ? REVIEW_ITEMS.filter(r => r.worldId === worldFilter)
    : REVIEW_ITEMS;
  const integrations = worldFilter
    ? getWorldIntegrations(worldFilter)
    : INTEGRATIONS;

  // Role-aware metric ordering
  const metricRows = getMetricRows(role, metrics);

  return (
    <div className="min-h-screen" style={{ background: "hsl(35 52% 94%)" }}>
      {wizardOpen && <CreateWorldWizard />}

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "hsl(221 46% 20%)" }}>
              <Sparkles className="w-3.5 h-3.5 text-[#C87560]" />
            </div>
            <p className="font-display font-semibold text-sm text-foreground">WorldSmith</p>
            <span className="text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 font-mono">
              Command Center
            </span>
          </div>

          <div className="w-px h-4 bg-border mx-1" />

          {/* World selector */}
          <WorldSelector compact />

          {/* Concept nav */}
          <nav className="flex items-center gap-0.5 ml-2 hidden md:flex" aria-label="Section navigation">
            {NAV_ITEMS.map(n => (
              <a
                key={n.href}
                href={n.href}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <n.icon className="w-3 h-3" />
                <span className="hidden lg:inline">{n.label}</span>
              </a>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-2">
            <RoleSwitcher mode="dropdown" label={false} />
            <div className="w-px h-4 bg-border" />
            <button
              onClick={openWizard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#C87560" }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New World</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative"
                aria-label={`${alerts.length} notifications`}
              >
                <Bell className="w-4 h-4" />
                {alerts.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: "#C87560" }}>
                    {alerts.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">

        {/* ── Role context banner ───────────────────────────────────── */}
        <RoleBanner role={role} worldName={worldFilter ? worlds.find(w => w.id === worldFilter)?.name : null} />

        {/* ── Row 1: Key metrics ────────────────────────────────────── */}
        <section aria-label="Key metrics">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {metricRows.map(m => (
              <MetricCard
                key={m.label}
                label={m.label}
                value={m.value}
                accent={m.accent}
                alert={m.alert}
              />
            ))}
          </div>
        </section>

        {/* ── Row 2: Action center + Integration health ──────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ActionCenter alerts={alerts} role={role} />
          <IntegrationPanel integrations={integrations} />
        </section>

        {/* ── Row 3: World health table ─────────────────────────────── */}
        <section id="worlds" aria-label="World health overview">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">World health</p>
              <span className="text-[11px] text-muted-foreground">{displayWorlds.length} world{displayWorlds.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/20">
                    {["World", "Health", "Collection / Volume", "Progress", "Awaiting review", "Blockers", "Last activity", ""].map(h => (
                      <th key={h} className="px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {displayWorlds.map(w => (
                    <WorldRow key={w.id} world={w} role={role} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Row 4: Production + Reviews + Activity ────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4" id="production">
          {/* Production specs */}
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Production</p>
              <span className="text-[11px] text-muted-foreground">{specs.length} specs</span>
            </div>
            {specs.length === 0 ? (
              <EmptyState title="No active production" description="No specifications match the current filter." />
            ) : (
              <div className="divide-y divide-border/50">
                {specs.slice(0, 7).map(s => <SpecRow key={s.id} spec={s} />)}
              </div>
            )}
          </div>

          {/* Reviews */}
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5" id="reviews">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Review queue</p>
              <span className="text-[11px] text-muted-foreground">{reviewItems.length}</span>
            </div>
            {reviewItems.length === 0 ? (
              <EmptyState title="No items awaiting review" />
            ) : (
              <div className="divide-y divide-border/50">
                {reviewItems.map(r => <ReviewQueueItem key={r.id} item={r} />)}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="lg:col-span-1" id="activity">
            <ActivityStream events={activity} maxItems={8} />
          </div>
        </section>

        {/* ── Pipeline visualization ────────────────────────────────── */}
        <section>
          <PipelineViz worldFilter={worldFilter} />
        </section>

        {/* ── Feedback panel ────────────────────────────────────────── */}
        <FeedbackPanel conceptKey="command-center" conceptName="Command Center" />

        {/* ── Navigation footer ─────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 pb-6 border-t border-border">
          <Link href="/super/worldsmith/concepts">
            <span className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer">
              ← All concepts
            </span>
          </Link>
          <p className="text-[11px] text-muted-foreground">PROTOTYPE · Not production</p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RoleBanner({ role, worldName }: { role: Role; worldName: string | null | undefined }) {
  const BANNERS: Record<Role, string> = {
    creative_director: "Showing reviews, blockers, and production progress.",
    store_end_user: "Showing products, release readiness, and approved assets.",
    daybook_admin: "Showing integrations, failed runs, and configuration issues.",
  };
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2 border"
      style={{ background: "hsl(35 40% 97%)", borderColor: "hsl(37 37% 85%)" }}
    >
      <span className="text-[11.5px] font-semibold text-foreground">{ROLE_LABELS[role]}</span>
      <span className="w-1 h-1 rounded-full bg-muted-foreground/40" aria-hidden="true" />
      <span className="text-[11.5px] text-muted-foreground">{BANNERS[role]}</span>
      {worldName && (
        <>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" aria-hidden="true" />
          <span className="text-[11.5px] text-muted-foreground">Filtered to <strong className="text-foreground">{worldName}</strong></span>
        </>
      )}
    </div>
  );
}

function WorldRow({ world, role }: { world: typeof WORLDS[number]; role: Role }) {
  const specs = PRODUCTION_SPECS.filter(s => s.worldId === world.id);
  const showIntegration = role === "daybook_admin";

  return (
    <tr className="hover:bg-muted/10 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: world.coverColor }}
            aria-hidden="true"
          />
          <div>
            <p className="text-[13px] font-semibold text-foreground">{world.name}</p>
            <p className="text-[10.5px] text-muted-foreground">{world.code}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <WorldHealthChip health={world.health} />
      </td>
      <td className="px-4 py-3">
        <p className="text-[12.5px] text-foreground">{world.currentCollection ?? "—"}</p>
        {world.currentVolume && <p className="text-[10.5px] text-muted-foreground">{world.currentVolume}</p>}
      </td>
      <td className="px-4 py-3 w-28">
        {world.status !== "in_setup" ? (
          <div className="space-y-1">
            <ProductionProgressBar completion={world.productionCompletion} total={specs.length} />
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">Not started</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {world.awaitingReview > 0 ? (
          <span className="font-semibold text-[13px] text-amber-700">{world.awaitingReview}</span>
        ) : (
          <span className="text-[12.5px] text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {world.blockers > 0 ? (
          <span className="font-semibold text-[13px] text-red-600">{world.blockers}</span>
        ) : (
          <span className="text-[12.5px] text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-[11.5px] text-muted-foreground">{timeAgo(world.lastActivity)}</span>
      </td>
      <td className="px-4 py-3">
        <button className="text-[11.5px] font-medium text-[#C87560] hover:underline flex items-center gap-0.5">
          Open <ChevronRight className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}

function PipelineViz({ worldFilter }: { worldFilter: string | null }) {
  const stages = [
    { label: "Not started", key: "not_started", color: "#9ca3af" },
    { label: "In progress",  key: "in_progress",  color: "#6b7280" },
    { label: "Ready to compile", key: "ready_to_compile", color: "#8b5cf6" },
    { label: "Compiled",    key: "compiled",    color: "#3b82f6" },
    { label: "Ready for review", key: "ready_for_review", color: "#f59e0b" },
    { label: "Approved",    key: "approved",    color: "#10b981" },
    { label: "Release ready", key: "release_ready", color: "#C87560" },
  ];

  const specs = worldFilter
    ? PRODUCTION_SPECS.filter(s => s.worldId === worldFilter)
    : PRODUCTION_SPECS;

  const counts: Record<string, number> = {};
  specs.forEach(s => { counts[s.status] = (counts[s.status] ?? 0) + 1; });
  const max = Math.max(...Object.values(counts), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-4" id="production-pipeline">
        Production pipeline
      </p>
      <div className="flex items-end gap-2" aria-labelledby="production-pipeline">
        {stages.map(s => {
          const count = counts[s.key] ?? 0;
          const height = count ? Math.max(24, (count / max) * 80) : 8;
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">{count > 0 ? count : ""}</span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{ height: height, background: count ? s.color : "hsl(var(--muted))", opacity: count ? 1 : 0.3 }}
                role="img"
                aria-label={`${s.label}: ${count} spec${count !== 1 ? "s" : ""}`}
              />
              <span className="text-[9.5px] text-muted-foreground text-center leading-tight hidden lg:block">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10.5px] text-muted-foreground mt-2 text-center">{specs.length} specifications across {stages.length} pipeline stages</p>
    </div>
  );
}

function getMetricRows(role: Role, metrics: ReturnType<typeof getMetrics>) {
  const base = [
    { label: "Active worlds",   value: metrics.activeWorlds,   accent: "hsl(221 46% 20%)" },
    { label: "In production",   value: metrics.inProduction,   accent: "hsl(221 46% 30%)" },
    { label: "Awaiting review", value: metrics.awaitingReview, accent: "#f59e0b", alert: metrics.awaitingReview > 0 },
    { label: "Blocked",         value: metrics.blocked,        accent: "#ef4444", alert: metrics.blocked > 0 },
    { label: "Release ready",   value: metrics.releaseReady,   accent: "#C87560" },
    { label: "Failed runs",     value: metrics.failedRuns,     accent: "#ef4444", alert: metrics.failedRuns > 0 },
  ];

  // Role-aware reorder: swap emphasis
  if (role === "store_end_user") {
    return [
      base[0], base[4],
      { label: "In production",   value: metrics.inProduction,   accent: "hsl(221 46% 30%)" },
      { label: "Awaiting review", value: metrics.awaitingReview, accent: "#f59e0b", alert: metrics.awaitingReview > 0 },
      base[3], base[5],
    ];
  }
  if (role === "daybook_admin") {
    return [
      base[0], base[5], base[3],
      { label: "In production",   value: metrics.inProduction,   accent: "hsl(221 46% 30%)" },
      base[2], base[4],
    ];
  }
  return base;
}
