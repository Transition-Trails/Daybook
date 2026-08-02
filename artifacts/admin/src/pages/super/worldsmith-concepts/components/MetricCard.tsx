interface MetricCardProps {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  accent?: string;
  detail?: string;
  alert?: boolean;
  onClick?: () => void;
}

export function MetricCard({ label, value, icon, accent, detail, alert, onClick }: MetricCardProps) {
  const accentColor = accent ?? "hsl(221 46% 20%)";
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={[
        "rounded-xl border bg-card p-4 flex flex-col gap-1 text-left",
        "transition-shadow",
        onClick ? "cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" : "",
        alert ? "border-orange-300 bg-orange-50" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground leading-tight">
          {label}
        </p>
        {icon && (
          <span className="w-6 h-6 flex items-center justify-center opacity-60" style={{ color: accentColor }}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-3xl font-display font-semibold leading-none" style={{ color: accentColor }}>
        {value}
      </p>
      {detail && (
        <p className="text-[11px] text-muted-foreground">{detail}</p>
      )}
    </Tag>
  );
}

// Compact tile variant for dense grids
export function MetricTile({ label, value, accent, alert }: Omit<MetricCardProps, "icon" | "detail" | "onClick">) {
  const color = alert ? "hsl(0 60% 38%)" : (accent ?? "hsl(221 46% 20%)");
  return (
    <div
      className={[
        "rounded-lg border bg-card px-3 py-2.5 flex items-center justify-between gap-3",
        alert ? "border-orange-300 bg-orange-50" : "border-border",
      ].join(" ")}
    >
      <p className="text-[11px] text-muted-foreground font-medium truncate">{label}</p>
      <p className="text-xl font-display font-semibold shrink-0 leading-none" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
