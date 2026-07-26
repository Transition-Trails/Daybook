/**
 * Themes list — card grid replacing the legacy table.
 *
 * Each card: horizontal colour-swatch strip · theme name · status + origin badges
 * · labelled Edit and Publish/Unpublish chips. No icon-only action buttons.
 * No AI Draft button (the global ✦ AI pill in the Shell top-bar is the one entry point).
 */
import {
  useListThemes, useUpdateTheme, getListThemesQueryKey,
  type Theme, type CatalogStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";
import { useState } from "react";

// ── Shared badge primitives ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const live = status === "live";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={
        live
          ? { background: "#ecfdf5", color: "#047857" }
          : { background: "#fffbeb", color: "#b45309" }
      }
    >
      {live ? "Live" : "Draft"}
    </span>
  );
}

function OriginBadge({ origin }: { origin?: string }) {
  if (!origin) return null;
  const styles: Record<string, { bg: string; text: string }> = {
    starter:  { bg: "#ecfdf5", text: "#047857" },
    licensed: { bg: "#faf5ff", text: "#7e22ce" },
    owned:    { bg: "#eff6ff", text: "#1d4ed8" },
  };
  const s = styles[origin] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={{ background: s.bg, color: s.text }}
    >
      {origin}
    </span>
  );
}

// ── Action chip ────────────────────────────────────────────────────────────────

function ActionChip({
  label, onClick, variant = "default", disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "muted";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ cursor: disabled ? "not-allowed" : "pointer" }}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors disabled:opacity-40 ${
        variant === "muted"
          ? "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background"
          : "border-foreground/20 text-foreground bg-background hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

// ── Theme card ────────────────────────────────────────────────────────────────

function ThemeCard({
  theme, onToggle, togglePending,
}: {
  theme: Theme;
  onToggle: () => void;
  togglePending: boolean;
}) {
  const colors: string[] = (theme.colors as string[]) || [];
  const isLive = theme.status === "live";

  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">
      {/* Colour swatch strip — 6 slots (accent · accent-dark · secondary · tertiary · ink · paper) */}
      <div className="flex h-12 overflow-hidden shrink-0">
        {colors.slice(0, 6).map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} title={c} />
        ))}
        {colors.length === 0 && (
          <div className="flex-1 bg-muted flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">No colours</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Name + price */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-[13.5px] text-foreground truncate">{theme.name}</p>
            <p className="text-[11.5px] text-muted-foreground font-mono mt-0.5">
              {theme.price ? `$${theme.price.toFixed(2)}` : "Free"}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={theme.status} />
          <OriginBadge origin={(theme as unknown as Record<string, unknown>).origin as string | undefined} />
        </div>

        {/* Action chips */}
        <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
          <Link href={`/catalog/themes/${theme.id}`}>
            <ActionChip label="Edit" onClick={() => {}} variant="muted" />
          </Link>
          <ActionChip
            label={isLive ? "Unpublish" : "Publish"}
            onClick={onToggle}
            disabled={togglePending}
          />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ThemesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: themes, isLoading } = useListThemes();
  const updateTheme = useUpdateTheme();
  const [togglePending, setTogglePending] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");

  const togglePublish = (id: string, status: string) => {
    setTogglePending(id);
    const newStatus = status === "live" ? "draft" : "live";
    updateTheme.mutate({ id, data: { status: newStatus as CatalogStatus } }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
      },
      onSettled: () => setTogglePending(null),
    });
  };

  const allThemes = (themes as Theme[]) ?? [];
  const filtered = statusFilter === "all" ? allThemes : allThemes.filter(t => t.status === statusFilter);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Themes"
        subtitle="Colour palettes and aesthetics applied to generated planners. Each theme defines 6 colour slots: accent · accent-dark · secondary · tertiary · ink · paper."
        primaryCta={
          <Button asChild>
            <Link href="/catalog/themes/new">
              <Plus className="w-4 h-4 mr-2" />
              New theme
            </Link>
          </Button>
        }
        filters={[
          {
            value: statusFilter,
            options: [
              { value: "all", label: "All" },
              { value: "live", label: "Live" },
              { value: "draft", label: "Draft" },
            ],
            onChange: setStatusFilter,
          },
        ]}
        filterMeta={isLoading ? undefined : `${filtered.length} theme${filtered.length !== 1 ? "s" : ""}`}
      />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="border border-dashed rounded-[14px] p-14 text-center text-muted-foreground">
          {statusFilter !== "all" ? `No ${statusFilter} themes.` : "No themes yet — create one to get started."}
        </div>
      )}

      {/* Card grid — auto-fill minmax(260px, 1fr) → 3-4 across at 1440px */}
      {!isLoading && filtered.length > 0 && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {filtered.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onToggle={() => togglePublish(theme.id, theme.status)}
              togglePending={togglePending === theme.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
