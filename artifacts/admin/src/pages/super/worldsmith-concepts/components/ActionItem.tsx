import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { ActionAlert, Role } from "../seed-data";
import { WORLDS } from "../seed-data";

interface ActionItemProps {
  alert: ActionAlert;
  compact?: boolean;
}

const TYPE_COLORS: Record<ActionAlert["type"], { bg: string; border: string; dot: string }> = {
  review:      { bg: "hsl(38 80% 94%)",  border: "hsl(38 60% 82%)",  dot: "#f59e0b" },
  resolve:     { bg: "hsl(0 60% 94%)",   border: "hsl(0 50% 84%)",   dot: "#ef4444" },
  retry:       { bg: "hsl(0 60% 94%)",   border: "hsl(0 50% 84%)",   dot: "#ef4444" },
  configure:   { bg: "hsl(216 40% 94%)", border: "hsl(216 35% 82%)", dot: "#6b7280" },
  compile:     { bg: "hsl(270 35% 94%)", border: "hsl(270 30% 83%)", dot: "#8b5cf6" },
  open_world:  { bg: "hsl(160 40% 94%)", border: "hsl(160 35% 82%)", dot: "#22c55e" },
  view_batch:  { bg: "hsl(160 40% 94%)", border: "hsl(160 35% 82%)", dot: "#22c55e" },
};

export function ActionItem({ alert, compact }: ActionItemProps) {
  const [done, setDone] = useState(false);
  const world = WORLDS.find(w => w.id === alert.worldId);
  const c = TYPE_COLORS[alert.type];

  if (done) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 opacity-50">
        <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
        <p className="text-[12px] text-muted-foreground line-through flex-1">{alert.title}</p>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-shadow hover:shadow-sm"
      style={{ background: c.bg, borderColor: c.border }}
      role="listitem"
    >
      <span
        className="mt-1 w-2 h-2 rounded-full shrink-0"
        style={{ background: c.dot }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-foreground leading-tight">{alert.title}</p>
        {!compact && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {world ? world.name : "Platform"}{alert.detail ? ` · ${alert.detail}` : ""}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setDone(true)}
          className="text-[11px] font-semibold text-foreground/70 px-2.5 py-1 rounded-md border border-current/20 hover:bg-background/60 transition-colors flex items-center gap-1"
          aria-label={`${alert.actionLabel} — ${alert.title}`}
        >
          {alert.actionLabel}
          <ArrowRight className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

interface ActionCenterProps {
  alerts: ActionAlert[];
  role: Role;
  title?: string;
  maxItems?: number;
}

export function ActionCenter({ alerts, title = "Action center", maxItems = 6 }: ActionCenterProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? alerts : alerts.slice(0, maxItems);
  const hasMore = alerts.length > maxItems;

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">{title}</p>
        <p className="text-sm text-muted-foreground text-center py-4">No actions required — everything is on track.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        <span className="text-[11px] text-muted-foreground">{alerts.length} item{alerts.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-2" role="list" aria-label={title}>
        {visible.map(a => <ActionItem key={a.id} alert={a} />)}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "Show less" : `Show ${alerts.length - maxItems} more`}
        </button>
      )}
    </div>
  );
}
