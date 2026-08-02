/**
 * PROTOTYPE_DATA — Concept 3: WorldSmith Guided Workspace.
 * Action-oriented; leads the user toward their most important next step.
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  Sparkles, Plus, ArrowRight, ChevronRight, ChevronLeft, Check,
  Globe, BookOpen, Layers, Clock, Settings, BarChart2, Zap,
} from "lucide-react";
import {
  WORLDS, PRODUCTION_SPECS, REVIEW_ITEMS, ACTIVITY,
  getFilteredAlerts, getFilteredActivity, getWorldIntegrations,
  timeAgo, ROLE_LABELS,
} from "../seed-data";
import type { Role, World, ActionAlert } from "../seed-data";
import { usePrototype } from "../prototype-context";
import { WorldHealthChip } from "../components/WorldHealthChip";
import { WorldSelector } from "../components/WorldSelector";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { ProductionProgressBar, ReviewQueueItem, ActivityStream, SpecRow, EmptyState } from "../components/Shared";
import { IntegrationStatusRow } from "../components/IntegrationStatusRow";
import { FeedbackPanel } from "../FeedbackPanel";
import { CreateWorldWizard } from "../wizard/CreateWorldWizard";

type WorldStage = "setup" | "governed" | "in_production" | "in_review" | "release_ready" | "published";

const STAGES: { id: WorldStage; label: string }[] = [
  { id: "setup",         label: "Setup" },
  { id: "governed",      label: "Governed" },
  { id: "in_production", label: "In Production" },
  { id: "in_review",     label: "In Review" },
  { id: "release_ready", label: "Release Ready" },
  { id: "published",     label: "Published" },
];

function getWorldStage(world: World): WorldStage {
  if (world.status === "in_setup") return "setup";
  if (world.productionCompletion === 0) return "governed";
  if (world.productionCompletion >= 90) return "release_ready";
  if (world.awaitingReview > 0) return "in_review";
  return "in_production";
}

export default function GuidedWorkspace() {
  const { role, worldFilter, worlds, wizardOpen, openWizard } = usePrototype();

  const displayWorld = worldFilter ? worlds.find(w => w.id === worldFilter) : null;
  const alerts = getFilteredAlerts(worldFilter, role);
  const primaryAction = alerts[0] ?? null;
  const secondaryActions = alerts.slice(1, 5);
  const activity = getFilteredActivity(worldFilter);

  const greetingName = role === "creative_director" ? "Sophie" :
                       role === "store_end_user" ? "Marcus" : "Admin";

  return (
    <div className="min-h-screen" style={{ background: "hsl(35 52% 94%)" }}>
      {wizardOpen && <CreateWorldWizard />}

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-12 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "hsl(221 46% 20%)" }}>
              <Sparkles className="w-3.5 h-3.5 text-[#C87560]" />
            </div>
            <p className="font-display font-semibold text-sm text-foreground">WorldSmith</p>
            <span className="text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 font-mono">
              Guided Workspace
            </span>
          </div>
          <div className="flex-1" />
          <WorldSelector compact />
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

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* ── Welcome area ──────────────────────────────────────── */}
        <WelcomeBanner
          role={role}
          name={greetingName}
          world={displayWorld}
          alertCount={alerts.length}
        />

        {/* ── Primary next action ───────────────────────────────── */}
        {primaryAction ? (
          <PrimaryActionCard alert={primaryAction} role={role} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Check className="w-8 h-8 text-green-600 mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">You're all caught up</p>
            <p className="text-[12.5px] text-muted-foreground mt-1">No immediate actions required.</p>
          </div>
        )}

        {/* ── Secondary actions ─────────────────────────────────── */}
        {secondaryActions.length > 0 && (
          <section aria-label="Next steps">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Next steps</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {secondaryActions.map(a => (
                <SecondaryActionCard key={a.id} alert={a} />
              ))}
            </div>
          </section>
        )}

        {/* ── World progress journey ────────────────────────────── */}
        <section aria-label="World progress">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-4">
            World progress
          </p>
          <div className="space-y-4">
            {(worldFilter ? worlds.filter(w => w.id === worldFilter) : worlds).map(w => (
              <WorldJourneyCard key={w.id} world={w} role={role} />
            ))}
          </div>
        </section>

        {/* ── Quick start ───────────────────────────────────────── */}
        <section aria-label="Quick start">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Quick start</p>
          <QuickStart role={role} onNewWorld={openWizard} worldFilter={worldFilter} />
        </section>

        {/* ── Activity stream ───────────────────────────────────── */}
        <ActivityStream events={activity} maxItems={6} title="Recent meaningful activity" />

        {/* ── Integration snapshot (admin role) ────────────────── */}
        {role === "daybook_admin" && (
          <IntegrationSnapshot worldFilter={worldFilter} />
        )}

        {/* ── Nav footer ────────────────────────────────────────── */}
        <div className="space-y-4 pt-2">
          <FeedbackPanel conceptKey="guided-workspace" conceptName="Guided Workspace" />
          <div className="flex items-center justify-between">
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

// ── Sub-components ────────────────────────────────────────────────────────────

function WelcomeBanner({ role, name, world, alertCount }: {
  role: Role; name: string; world: World | null | undefined; alertCount: number;
}) {
  const GREETINGS: Record<Role, string> = {
    creative_director: "Ready for review.",
    store_end_user: "Here's your production update.",
    daybook_admin: "System status at a glance.",
  };

  return (
    <div
      className="rounded-2xl p-6 flex items-start justify-between gap-4"
      style={{ background: "hsl(221 46% 20%)", color: "hsl(35 52% 90%)" }}
    >
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">
          {ROLE_LABELS[role]}
        </p>
        <h1 className="font-display text-2xl font-semibold leading-tight">
          Good morning, {name}.
        </h1>
        <p className="text-[13px] opacity-75">{GREETINGS[role]}</p>
        <div className="flex items-center gap-3 pt-1 flex-wrap">
          {world ? (
            <span className="text-[11.5px] bg-white/10 rounded-full px-2.5 py-0.5">
              {world.name} · {world.currentVolume ?? "In setup"}
            </span>
          ) : (
            <span className="text-[11.5px] bg-white/10 rounded-full px-2.5 py-0.5">
              All Worlds
            </span>
          )}
          {alertCount > 0 && (
            <span className="text-[11.5px] bg-[#C87560]/30 text-[#F0B8A8] rounded-full px-2.5 py-0.5">
              {alertCount} action{alertCount !== 1 ? "s" : ""} needed
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 hidden sm:block">
        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-[#C87560]" />
        </div>
      </div>
    </div>
  );
}

function PrimaryActionCard({ alert, role }: { alert: ActionAlert; role: Role }) {
  const [acted, setActed] = useState(false);

  const TYPE_BG: Record<ActionAlert["type"], string> = {
    review:      "linear-gradient(135deg, hsl(38 80% 95%), hsl(38 60% 88%))",
    resolve:     "linear-gradient(135deg, hsl(0 60% 95%), hsl(0 50% 88%))",
    retry:       "linear-gradient(135deg, hsl(0 60% 95%), hsl(0 50% 88%))",
    configure:   "linear-gradient(135deg, hsl(216 40% 95%), hsl(216 35% 88%))",
    compile:     "linear-gradient(135deg, hsl(270 35% 95%), hsl(270 30% 88%))",
    open_world:  "linear-gradient(135deg, hsl(160 40% 95%), hsl(160 35% 88%))",
    view_batch:  "linear-gradient(135deg, hsl(12 40% 95%), hsl(12 35% 88%))",
  };

  const world = WORLDS.find(w => w.id === alert.worldId);

  return (
    <div
      className="rounded-2xl border border-border p-6"
      style={{ background: TYPE_BG[alert.type] ?? "hsl(35 52% 94%)" }}
      role="region"
      aria-label="Primary next action"
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
        Primary next action
      </p>
      <h2 className="text-lg font-semibold text-foreground">{alert.title}</h2>
      {alert.detail && <p className="text-[13px] text-muted-foreground mt-1">{alert.detail}</p>}
      {world && (
        <p className="text-[11.5px] text-muted-foreground mt-0.5">
          World: <strong className="text-foreground">{world.name}</strong>
        </p>
      )}

      <div className="flex items-center gap-3 mt-5">
        {acted ? (
          <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
            <Check className="w-4 h-4" /> Done — action recorded
          </span>
        ) : (
          <button
            onClick={() => setActed(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-md"
            style={{ background: "#1B2A4A" }}
          >
            <Zap className="w-4 h-4" />
            {alert.actionLabel}
          </button>
        )}
        {!acted && (
          <button className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

function SecondaryActionCard({ alert }: { alert: ActionAlert }) {
  const [done, setDone] = useState(false);
  const world = WORLDS.find(w => w.id === alert.worldId);
  const TYPE_ACCENT: Record<ActionAlert["type"], string> = {
    review: "#f59e0b", resolve: "#ef4444", retry: "#ef4444",
    configure: "#6b7280", compile: "#8b5cf6", open_world: "#22c55e", view_batch: "#C87560",
  };

  return (
    <div
      className={[
        "rounded-xl border border-border bg-card p-4 transition-opacity",
        done ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1 w-2 h-2 rounded-full shrink-0"
          style={{ background: TYPE_ACCENT[alert.type] }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-foreground leading-tight">{alert.title}</p>
          {world && <p className="text-[11px] text-muted-foreground mt-0.5">{world.name}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {done ? (
          <span className="text-[11px] text-green-700 flex items-center gap-0.5"><Check className="w-3 h-3" /> Done</span>
        ) : (
          <button
            onClick={() => setDone(true)}
            className="text-[11.5px] font-medium text-foreground border border-border hover:border-foreground/20 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1"
          >
            {alert.actionLabel} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function WorldJourneyCard({ world, role }: { world: World; role: string }) {
  const stage = getWorldStage(world);
  const stageIdx = STAGES.findIndex(s => s.id === stage);
  const blocker = world.blockers > 0 ? world.healthReasons[0] : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: world.coverColor }}
            aria-hidden="true"
          />
          <div>
            <p className="text-[13px] font-semibold text-foreground">{world.name}</p>
            {world.currentVolume && (
              <p className="text-[10.5px] text-muted-foreground">{world.currentVolume}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WorldHealthChip health={world.health} />
          <button className="text-[11.5px] font-medium text-[#C87560] hover:underline">Open →</button>
        </div>
      </div>

      {/* Journey strip */}
      <div className="flex items-center gap-0" role="list" aria-label={`${world.name} production journey`}>
        {STAGES.map((s, i) => {
          const isComplete = i < stageIdx;
          const isCurrent = i === stageIdx;
          const isBlocked = isCurrent && blocker;

          return (
            <div key={s.id} className="flex items-center flex-1" role="listitem" aria-label={`${s.label}: ${isComplete ? "complete" : isCurrent ? "current" : "upcoming"}`}>
              <div className="flex flex-col items-center flex-1">
                <div
                  className={[
                    "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all",
                    isComplete ? "bg-[#1B2A4A] text-white" : "",
                    isCurrent && !isBlocked ? "bg-[#C87560] text-white ring-2 ring-[#C87560]/30" : "",
                    isBlocked ? "bg-amber-500 text-white ring-2 ring-amber-300" : "",
                    !isComplete && !isCurrent ? "bg-muted text-muted-foreground" : "",
                  ].join(" ")}
                >
                  {isComplete ? "✓" : i + 1}
                </div>
                <p className={`text-[9px] mt-1 text-center leading-tight hidden sm:block ${
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}>
                  {s.label}
                </p>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className="flex-1 h-0.5 mx-0.5 -mt-3.5"
                  style={{ background: isComplete ? "#1B2A4A" : "hsl(var(--border))" }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      {blocker && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <span className="text-amber-600 text-[11px] mt-0.5">⚠</span>
          <p className="text-[11px] text-amber-800 flex-1">{blocker}</p>
          <button className="text-[11px] font-medium text-amber-700 hover:underline shrink-0">Resolve</button>
        </div>
      )}

      {/* Role-specific progress indicator */}
      {role !== "daybook_admin" && world.status !== "in_setup" && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <ProductionProgressBar
            completion={world.productionCompletion}
            label={role === "store_end_user" ? "Products complete" : "Production complete"}
          />
        </div>
      )}
    </div>
  );
}

function QuickStart({ role, onNewWorld, worldFilter }: { role: Role; onNewWorld: () => void; worldFilter: string | null }) {
  const COMMON_ACTIONS = [
    { label: "Create a World",        icon: Plus,     action: onNewWorld,  roles: ["daybook_admin", "creative_director"] as Role[] },
    { label: "Review awaiting items",  icon: BookOpen, action: () => {},    roles: ["creative_director", "store_end_user"] as Role[] },
    { label: "Start production batch", icon: Layers,   action: () => {},    roles: ["creative_director", "daybook_admin"] as Role[] },
    { label: "View approved assets",   icon: BarChart2,action: () => {},    roles: ["store_end_user", "creative_director"] as Role[] },
    { label: "Configure integrations", icon: Settings, action: () => {},    roles: ["daybook_admin"] as Role[] },
    { label: "View runs history",      icon: Clock,    action: () => {},    roles: ["daybook_admin", "creative_director"] as Role[] },
  ];

  const visible = COMMON_ACTIONS.filter(a => a.roles.includes(role));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {visible.map(a => (
        <button
          key={a.label}
          onClick={a.action}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-foreground/20 hover:shadow-sm transition-all text-left"
        >
          <a.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[12px] font-medium text-foreground">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function IntegrationSnapshot({ worldFilter }: { worldFilter: string | null }) {
  const integrations = worldFilter
    ? getWorldIntegrations(worldFilter)
    : WORLDS.flatMap(w => getWorldIntegrations(w.id)).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);

  const issues = integrations.filter(i => i.status !== "connected" && i.status !== "not_required");

  return (
    <section aria-label="Integration health">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Integration health</p>
        {issues.length === 0 && (
          <span className="text-[11px] text-green-700 font-medium">All connected ✓</span>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
        {issues.length === 0 ? (
          <div className="p-4">
            <p className="text-[12.5px] text-muted-foreground text-center py-2">All integrations are healthy.</p>
          </div>
        ) : (
          issues.map(i => (
            <div key={i.id} className="px-4 py-1.5">
              <IntegrationStatusRow integration={i} compact />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
