/**
 * Shared UI primitives used across all three admin consoles.
 */
import { cn } from "@/lib/utils";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── StatusPill ─────────────────────────────────────────────────────────────

type Status = "live" | "draft" | "active" | "trial" | "suspended" | "deleted" |
              "store_owner" | "store_staff" | "support" | "customer" |
              "pro" | "starter" | "article" | "faq";

const STATUS_STYLES: Record<string, string> = {
  live:        "bg-emerald-100 text-emerald-800 border-emerald-200",
  active:      "bg-emerald-100 text-emerald-800 border-emerald-200",
  draft:       "bg-amber-100  text-amber-800  border-amber-200",
  trial:       "bg-sky-100    text-sky-800    border-sky-200",
  suspended:   "bg-red-100    text-red-800    border-red-200",
  deleted:     "bg-gray-100   text-gray-500   border-gray-200",
  store_owner: "bg-violet-100 text-violet-800 border-violet-200",
  store_staff: "bg-blue-100   text-blue-800   border-blue-200",
  support:     "bg-teal-100   text-teal-800   border-teal-200",
  customer:    "bg-gray-100   text-gray-700   border-gray-200",
  super_admin: "bg-[#C87560]/10 text-[#C87560] border-[#C87560]/20",
  pro:         "bg-violet-100 text-violet-800 border-violet-200",
  starter:     "bg-gray-100   text-gray-700   border-gray-200",
  article:     "bg-sky-100    text-sky-800    border-sky-200",
  faq:         "bg-purple-100 text-purple-800 border-purple-200",
};

const STATUS_LABELS: Record<string, string> = {
  store_owner: "Owner",
  store_staff: "Staff",
  support:     "Support",
  customer:    "Customer",
  super_admin: "Super admin",
};

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const styles = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const label  = STATUS_LABELS[status] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        styles,
        className,
      )}
    >
      {label}
    </span>
  );
}

// ── StatTile ───────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-3xl font-display font-semibold text-foreground tabular-nums">
        {value}
      </div>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── PageHeader ─────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  scopeLabel,
  actions,
}: {
  title: string;
  description?: string;
  scopeLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-display font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {scopeLabel && (
          <span className="inline-flex items-center rounded-full border border-[#E7DCCB] bg-[#F7F0E6] px-3 py-1 text-xs font-medium text-[#4A6080]">
            {scopeLabel}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ElementType;
}) {
  const DisplayIcon = Icon ?? Inbox;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <DisplayIcon className="w-6 h-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ── ErrorState ─────────────────────────────────────────────────────────────

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <div>
        <p className="font-medium text-foreground">Something went wrong</p>
        <p className="text-sm text-muted-foreground mt-1">
          {message ?? "We couldn't load this data. Please try again."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5 mr-2" />
          Try again
        </Button>
      )}
    </div>
  );
}

// ── SkeletonRows ───────────────────────────────────────────────────────────

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className="h-8 flex-1"
              style={{ opacity: 1 - i * 0.12 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
