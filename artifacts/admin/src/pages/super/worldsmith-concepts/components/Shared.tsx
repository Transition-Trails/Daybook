/**
 * ActivityItem, ReviewQueueItem, ProductionProgressBar,
 * EmptyState, ErrorState, LoadingState — shared primitives.
 */
import { RefreshCw, ArrowRight, ImageOff, AlertCircle, Loader2, BookOpen } from "lucide-react";
import type { ActivityEvent, ReviewItem, ProductionSpec } from "../seed-data";
import { timeAgo } from "../seed-data";
import { ReviewBadge, ProductionBadge } from "./StatusBadge";

// ── ActivityItem ─────────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<ActivityEvent["type"], string> = {
  compiled: "⚡",
  review_submitted: "📋",
  review_approved: "✓",
  review_returned: "↩",
  world_created: "◎",
  integration_connected: "⊕",
  integration_failed: "✕",
  spec_generated: "⬡",
  run_failed: "✕",
  asset_approved: "★",
};

export function ActivityItem({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span
        className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] shrink-0 mt-0.5"
        aria-hidden="true"
      >
        {ACTIVITY_ICONS[event.type] ?? "·"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] text-foreground leading-tight">{event.label}</p>
        {event.detail && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{event.detail}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {event.actionLabel && (
          <button className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
            {event.actionLabel}
            <ArrowRight className="w-2.5 h-2.5" />
          </button>
        )}
        <time className="text-[10.5px] text-muted-foreground/70 whitespace-nowrap">{timeAgo(event.timestamp)}</time>
      </div>
    </div>
  );
}

export function ActivityStream({ events, title = "Recent activity", maxItems = 8 }: {
  events: ActivityEvent[];
  title?: string;
  maxItems?: number;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2">{title}</p>
        <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1">{title}</p>
      <div className="divide-y divide-border">
        {events.slice(0, maxItems).map(e => <ActivityItem key={e.id} event={e} />)}
      </div>
    </div>
  );
}

// ── ReviewQueueItem ──────────────────────────────────────────────────────────

export function ReviewQueueItem({ item }: { item: ReviewItem }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-foreground leading-tight truncate">{item.title}</p>
        {item.returnedReason && (
          <p className="text-[11px] text-red-600 mt-0.5">{item.returnedReason}</p>
        )}
        <p className="text-[10.5px] text-muted-foreground mt-0.5">{timeAgo(item.submittedAt)}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <ReviewBadge status={item.status} />
        <button className="text-[11px] font-medium text-[#C87560] hover:underline">
          {item.status === "returned" ? "View notes" : "Review"}
        </button>
      </div>
    </div>
  );
}

// ── ProductionProgressBar ────────────────────────────────────────────────────

export function ProductionProgressBar({
  completion,
  total,
  approved,
  label,
  accentColor = "#C87560",
}: {
  completion: number;
  total?: number;
  approved?: number;
  label?: string;
  accentColor?: string;
}) {
  return (
    <div>
      {(label || total !== undefined) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <p className="text-[11px] text-muted-foreground">{label}</p>}
          {total !== undefined && (
            <p className="text-[11px] text-muted-foreground">{approved ?? Math.round(total * completion / 100)} / {total}</p>
          )}
          <p className="text-[11px] font-semibold text-foreground ml-auto">{completion}%</p>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${completion}%`, background: accentColor }}
        />
      </div>
    </div>
  );
}

// ── SpecRow ──────────────────────────────────────────────────────────────────

export function SpecRow({ spec }: { spec: ProductionSpec }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-foreground truncate">{spec.title}</p>
        <p className="text-[10.5px] text-muted-foreground">{spec.componentType.replace(/_/g, " ")}</p>
      </div>
      <ProductionBadge status={spec.status} />
      {spec.status === "blocked" && spec.blockedReason && (
        <button
          className="text-[11px] text-amber-600 hover:underline"
          title={spec.blockedReason}
        >
          Resolve
        </button>
      )}
      {spec.status === "ready_to_compile" && (
        <button className="text-[11px] font-medium text-[#C87560] hover:underline">Compile</button>
      )}
      {spec.status === "ready_for_review" && (
        <button className="text-[11px] font-medium text-foreground hover:underline">Review</button>
      )}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      {icon ? (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
          {icon}
        </div>
      ) : (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
          <ImageOff className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-[12.5px] text-muted-foreground mt-1 max-w-xs">{description}</p>}
      {action && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "#C87560" }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
      <p className="text-sm font-medium text-foreground">Failed to load</p>
      <p className="text-[12.5px] text-muted-foreground mt-1 max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium border border-border hover:border-foreground/20 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}
