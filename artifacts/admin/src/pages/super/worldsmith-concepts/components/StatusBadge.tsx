import type { WorldHealth, IntegrationStatus, ProductionStatus, ReviewStatus } from "../seed-data";

// ── World health ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<WorldHealth, { label: string; icon: string; bg: string; text: string; border: string }> = {
  healthy:          { label: "Healthy",         icon: "✓",  bg: "hsl(160 50% 93%)", text: "hsl(160 50% 30%)", border: "hsl(160 40% 80%)" },
  needs_attention:  { label: "Needs attention",  icon: "⚠",  bg: "hsl(38 90% 93%)", text: "hsl(38 80% 28%)",  border: "hsl(38 70% 78%)" },
  blocked:          { label: "Blocked",          icon: "✕",  bg: "hsl(0 72% 93%)",  text: "hsl(0 60% 38%)",   border: "hsl(0 60% 82%)" },
  in_setup:         { label: "In setup",         icon: "◐",  bg: "hsl(216 40% 93%)",text: "hsl(216 40% 32%)", border: "hsl(216 35% 80%)" },
  inactive:         { label: "Inactive",         icon: "–",  bg: "hsl(0 0% 93%)",   text: "hsl(0 0% 45%)",    border: "hsl(0 0% 82%)" },
};

export function WorldHealthBadge({ health, size = "sm" }: { health: WorldHealth; size?: "xs" | "sm" | "md" }) {
  const cfg = HEALTH_CONFIG[health];
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0.5" : size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sz}`}
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
      aria-label={`World health: ${cfg.label}`}
    >
      <span aria-hidden="true">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

// ── Integration status ────────────────────────────────────────────────────────

const INT_CONFIG: Record<IntegrationStatus, { label: string; icon: string; bg: string; text: string; border: string }> = {
  connected:           { label: "Connected",          icon: "●", bg: "hsl(160 50% 93%)", text: "hsl(160 50% 28%)", border: "hsl(160 40% 80%)" },
  needs_configuration: { label: "Needs config",       icon: "○", bg: "hsl(216 40% 93%)", text: "hsl(216 40% 32%)", border: "hsl(216 35% 80%)" },
  warning:             { label: "Warning",             icon: "⚠", bg: "hsl(38 90% 93%)", text: "hsl(38 80% 28%)",  border: "hsl(38 70% 78%)" },
  failed:              { label: "Failed",              icon: "✕", bg: "hsl(0 72% 93%)",  text: "hsl(0 60% 38%)",   border: "hsl(0 60% 82%)" },
  not_required:        { label: "Not required",        icon: "–", bg: "hsl(0 0% 93%)",   text: "hsl(0 0% 45%)",    border: "hsl(0 0% 82%)" },
  unknown:             { label: "Unknown",             icon: "?", bg: "hsl(0 0% 91%)",   text: "hsl(0 0% 40%)",    border: "hsl(0 0% 80%)" },
};

export function IntegrationBadge({ status }: { status: IntegrationStatus }) {
  const cfg = INT_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2 py-0.5"
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
      aria-label={`Integration: ${cfg.label}`}
    >
      <span aria-hidden="true" className="text-[9px]">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

// ── Production status ─────────────────────────────────────────────────────────

const PROD_CONFIG: Record<ProductionStatus, { label: string; bg: string; text: string }> = {
  not_started:      { label: "Not started",     bg: "hsl(0 0% 93%)",   text: "hsl(0 0% 40%)" },
  in_progress:      { label: "In progress",     bg: "hsl(216 50% 93%)",text: "hsl(216 50% 32%)" },
  ready_to_compile: { label: "Ready to compile",bg: "hsl(270 40% 93%)",text: "hsl(270 40% 35%)" },
  compiled:         { label: "Compiled",        bg: "hsl(160 40% 93%)",text: "hsl(160 40% 28%)" },
  ready_for_review: { label: "Ready for review",bg: "hsl(38 80% 93%)", text: "hsl(38 80% 28%)" },
  blocked:          { label: "Blocked",         bg: "hsl(0 72% 93%)",  text: "hsl(0 60% 38%)" },
  approved:         { label: "Approved",        bg: "hsl(160 50% 91%)",text: "hsl(160 50% 26%)" },
  release_ready:    { label: "Release ready",   bg: "hsl(12 60% 92%)", text: "hsl(12 55% 34%)" },
  failed:           { label: "Failed",          bg: "hsl(0 72% 93%)",  text: "hsl(0 60% 38%)" },
};

export function ProductionBadge({ status, size = "sm" }: { status: ProductionStatus; size?: "xs" | "sm" }) {
  const cfg = PROD_CONFIG[status];
  const sz = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sz}`}
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

// ── Review status ─────────────────────────────────────────────────────────────

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const map: Record<ReviewStatus, { label: string; bg: string; text: string }> = {
    awaiting:   { label: "Awaiting review", bg: "hsl(38 80% 93%)", text: "hsl(38 80% 28%)" },
    in_review:  { label: "In review",       bg: "hsl(216 50% 93%)",text: "hsl(216 50% 32%)" },
    approved:   { label: "Approved",        bg: "hsl(160 50% 91%)",text: "hsl(160 50% 26%)" },
    returned:   { label: "Returned",        bg: "hsl(0 72% 93%)",  text: "hsl(0 60% 38%)" },
  };
  const cfg = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full text-[11px] font-medium px-2 py-0.5"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}
