import type { WorldHealth } from "../seed-data";
import { HEALTH_LABELS } from "../seed-data";

interface WorldHealthChipProps {
  health: WorldHealth;
  reasons?: string[];
  showReasons?: boolean;
}

const HEALTH_STYLES: Record<WorldHealth, { dot: string; text: string; bg: string; border: string }> = {
  healthy:         { dot: "#22c55e", text: "hsl(160 50% 28%)", bg: "hsl(160 50% 94%)", border: "hsl(160 40% 82%)" },
  needs_attention: { dot: "#f59e0b", text: "hsl(38 80% 28%)",  bg: "hsl(38 90% 93%)", border: "hsl(38 70% 78%)" },
  blocked:         { dot: "#ef4444", text: "hsl(0 60% 38%)",   bg: "hsl(0 72% 93%)",  border: "hsl(0 60% 82%)" },
  in_setup:        { dot: "#6b7280", text: "hsl(216 40% 32%)", bg: "hsl(216 40% 93%)",border: "hsl(216 35% 80%)" },
  inactive:        { dot: "#9ca3af", text: "hsl(0 0% 45%)",    bg: "hsl(0 0% 93%)",   border: "hsl(0 0% 82%)" },
};

export function WorldHealthChip({ health, reasons, showReasons }: WorldHealthChipProps) {
  const s = HEALTH_STYLES[health];
  return (
    <div>
      <span
        className="inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium px-2.5 py-1"
        style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
        title={reasons?.join(" · ")}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: s.dot }}
          aria-hidden="true"
        />
        {HEALTH_LABELS[health]}
      </span>
      {showReasons && reasons && reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-muted-foreground/50" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
