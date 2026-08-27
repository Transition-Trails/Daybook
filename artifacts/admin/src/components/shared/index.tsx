import { cn } from "@/lib/utils";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createPortal } from "react-dom";
import { useContext } from "react";
import { PageHeaderTargetContext } from "./page-header-context";

const STATUS_STYLES: Record<string, string> = {
  live: "bg-[#E8F1EA] text-[#3F7A5E] border-[#CFE0D2]",
  active: "bg-[#E8F1EA] text-[#3F7A5E] border-[#CFE0D2]",
  draft: "bg-[#F6EBD4] text-[#8A6A22] border-[#E9D8B7]",
  trial: "bg-[#E4EAF4] text-[#3A5480] border-[#CDD7E8]",
  suspended: "bg-[#F3E4DF] text-[#A85B48] border-[#E8CFC7]",
  deleted: "bg-[#F5EFE5] text-[#A2937E] border-[#E7DCCB]",
  store_owner: "bg-[#E4EAF4] text-[#3A5480] border-[#CDD7E8]",
  store_staff: "bg-[#E4EAF4] text-[#3A5480] border-[#CDD7E8]",
  support: "bg-[#E8F1EA] text-[#3F7A5E] border-[#CFE0D2]",
  customer: "bg-[#F5EFE5] text-[#7A6A57] border-[#E7DCCB]",
  super_admin: "bg-[#F3E4DF] text-[#A85B48] border-[#E8CFC7]",
  pro: "bg-[#E4EAF4] text-[#3A5480] border-[#CDD7E8]",
  starter: "bg-[#F5EFE5] text-[#7A6A57] border-[#E7DCCB]",
  article: "bg-[#E4EAF4] text-[#3A5480] border-[#CDD7E8]",
  faq: "bg-[#F3E4DF] text-[#A85B48] border-[#E8CFC7]",
};

const STATUS_LABELS: Record<string, string> = {
  store_owner: "Owner",
  store_staff: "Staff",
  support: "Support",
  customer: "Customer",
  super_admin: "Super admin",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
      STATUS_STYLES[status] ?? "bg-[#F5EFE5] text-[#7A6A57] border-[#E7DCCB]",
      className,
    )}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export type PillTone = "live" | "draft" | "info" | "warn" | "on" | "off";
const PILL_TONES: Record<PillTone, string> = {
  live: "bg-[#E8F1EA] text-[#3F7A5E] border-[#CFE0D2]",
  draft: "bg-[#F6EBD4] text-[#8A6A22] border-[#E9D8B7]",
  info: "bg-[#E4EAF4] text-[#3A5480] border-[#CDD7E8]",
  warn: "bg-[#F3E4DF] text-[#A85B48] border-[#E8CFC7]",
  on: "bg-[#F3E4DF] text-[#A85B48] border-[#E8CFC7]",
  off: "bg-[#F5EFE5] text-[#A2937E] border-[#E7DCCB]",
};

export function Pill({ tone, children, className }: { tone: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4",
      PILL_TONES[tone],
      className,
    )}>
      {children}
    </span>
  );
}

export function Chip({ active, children, className }: { active: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
      active
        ? "border-[#E8CFC7] bg-[#F3E4DF] text-[#A85B48]"
        : "border-[#E7DCCB] bg-[#F5EFE5] text-[#A2937E] line-through decoration-[#D4C6B0]",
      className,
    )}>
      {children}
    </span>
  );
}

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
    <div className={cn("flex flex-col gap-2 rounded-xl border border-[#E7DCCB] bg-[#FFFDF9] p-5 shadow-[0_1px_2px_rgba(27,42,74,.05)]", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#7A6A57]">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-[#8A7A66]" />}
      </div>
      <div className="font-display text-3xl font-semibold tabular-nums text-[#1B2A4A]">{value}</div>
      {sub && <p className="text-xs text-[#7A6A57]">{sub}</p>}
    </div>
  );
}

export function Sparkline({ values, desirable = true }: { values: Array<number | null>; desirable?: boolean }) {
  const width = 96;
  const height = 20;
  const validValues = values.filter((value): value is number => value !== null);
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    if (value === null) return null;
    const x = values.length === 1 ? 0 : index * (width / (values.length - 1));
    const y = height - 2 - ((value - min) / span) * (height - 4);
    return `${x},${y}`;
  });
  const segments: string[] = [];
  let segment: string[] = [];
  for (const point of points) {
    if (point === null) {
      if (segment.length) segments.push(segment.join(" "));
      segment = [];
    } else {
      segment.push(point);
    }
  }
  if (segment.length) segments.push(segment.join(" "));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-5 w-24" aria-hidden="true">
      {segments.map((segmentPoints) => (
        <polyline key={segmentPoints} points={segmentPoints} fill="none" stroke={desirable ? "#3F7A5E" : "#A85B48"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

export function metricTrendTone(
  values: Array<number | null> | undefined,
  higherIsBetter = true,
): "positive" | "negative" | "neutral" {
  const comparableValues = values?.filter((value): value is number => value !== null);
  if (!comparableValues || comparableValues.length < 2) return "neutral";
  const change = comparableValues[comparableValues.length - 1] - comparableValues[comparableValues.length - 2];
  if (change === 0) return "neutral";
  return (higherIsBetter ? change > 0 : change < 0) ? "positive" : "negative";
}

export function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: string | number; delta: string; values?: Array<number | null>; desirable?: boolean; neutral?: boolean }>;
}) {
  return (
    <div className="grid overflow-hidden rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] shadow-[0_1px_3px_rgba(27,42,74,.06)] sm:grid-cols-2 xl:auto-cols-fr xl:grid-flow-col">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 border-b border-r border-[#EFE6D8] px-4 py-4 last:border-r-0 xl:border-b-0">
          {(() => {
            const tone = metric.neutral ? "neutral" : metricTrendTone(metric.values, metric.desirable !== false);
            const toneClass = tone === "positive"
              ? "text-[#3F7A5E]"
              : tone === "negative"
                ? "text-[#A85B48]"
                : "text-[#8A7A66]";
            return <>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8A7A66]">{metric.label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-[22px] font-semibold text-[#1B2A4A]">{metric.value}</span>
            <span className={cn("text-[10px] font-semibold", toneClass)}>{metric.delta}</span>
          </div>
          {metric.values && metric.values.filter((value) => value !== null).length > 1
            ? <Sparkline values={metric.values} desirable={tone !== "negative"} />
            : <p className="mt-1 text-[10px] text-[#A2937E]">Trend unavailable</p>}
            </>;
          })()}
        </div>
      ))}
    </div>
  );
}

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
  const target = useContext(PageHeaderTargetContext);
  const content = (
    <div className="admin-page-header__page-content">
      <div className="min-w-0">
        <h1 className="font-display text-[19px] font-semibold text-[#1B2A4A]">{title}</h1>
        {description && <p className="mt-1 truncate text-sm text-[#7A6A57]">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {scopeLabel && <Pill tone="info">{scopeLabel}</Pill>}
        {actions}
      </div>
    </div>
  );
  if (target) return createPortal(content, target);
  return <div className="mb-6 flex min-h-14 items-start justify-between gap-4">{content}</div>;
}

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
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5EFE5]">
        <DisplayIcon className="h-6 w-6 text-[#8A7A66]" />
      </div>
      <div>
        <p className="font-medium text-[#1B2A4A]">{title}</p>
        {description && <p className="mt-1 max-w-xs text-sm text-[#7A6A57]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F3E4DF]">
        <AlertCircle className="h-6 w-6 text-[#A85B48]" />
      </div>
      <div>
        <p className="font-medium text-[#1B2A4A]">Something went wrong</p>
        <p className="mt-1 text-sm text-[#7A6A57]">{message ?? "We couldn't load this data. Please try again."}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />Try again
        </Button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}