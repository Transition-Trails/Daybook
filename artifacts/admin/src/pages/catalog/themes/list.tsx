/**
 * Themes list — bundle summary cards.
 *
 * Each card shows:
 *  · Primary palette colour dots (up to 5)
 *  · Theme name + status + origin badges
 *  · Bundle summary line: "2 palettes · 1 background · Playfair Display / Lato · 2 packs"
 *  · Amber warning when no palettes are attached yet
 *  · Edit and Publish/Unpublish action chips
 */
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Loader2, Plus, Edit2, AlertTriangle, Layers3, Image, Package,
  Type, Check, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";

// ── Local types (enriched theme API response) ─────────────────────────────

interface RichPalette {
  id: string;
  name: string;
  colors: string[];
  isPrimary: boolean;
  position: number;
}
interface RichBackground {
  id: string;
  name: string;
  type: string;
  value: string | null;
}
interface RichPack {
  id: string;
  name: string;
}
interface FontPairing {
  heading?: string;
  subheading?: string;
  body?: string;
  accent?: string;
}
interface EnrichedTheme {
  id: string;
  name: string;
  desc: string | null;
  status: string;
  origin: string;
  price: number;
  colors: string[];
  fontPairing: FontPairing | null;
  palettes: RichPalette[];
  backgrounds: RichBackground[];
  packs: RichPack[];
}

// ── API helpers ───────────────────────────────────────────────────────────

async function fetchThemes(): Promise<EnrichedTheme[]> {
  const res = await fetch("/api/themes", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load themes");
  return res.json();
}

async function patchTheme(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/themes/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── Sub-components ────────────────────────────────────────────────────────

/** Five colour dots from the primary palette. Falls back to the theme.colors JSONB. */
function PaletteDots({ theme }: { theme: EnrichedTheme }) {
  const primary = theme.palettes.find(p => p.isPrimary) ?? theme.palettes[0];
  const colors: string[] = primary?.colors ?? (theme.colors as string[]) ?? [];
  return (
    <div className="flex items-center gap-1">
      {colors.slice(0, 5).map((c, i) => (
        <span
          key={i}
          style={{ background: c }}
          className="w-5 h-5 rounded-full border border-black/10 shrink-0"
        />
      ))}
      {colors.length === 0 && (
        <span className="text-xs text-muted-foreground italic">no palette</span>
      )}
    </div>
  );
}

/** "2 palettes · 1 background · Playfair Display / Lato · 2 packs" */
function BundleSummary({ theme }: { theme: EnrichedTheme }) {
  const parts: string[] = [];
  parts.push(`${theme.palettes.length} palette${theme.palettes.length !== 1 ? "s" : ""}`);
  if (theme.backgrounds.length)
    parts.push(`${theme.backgrounds.length} background${theme.backgrounds.length !== 1 ? "s" : ""}`);
  if (theme.fontPairing?.heading && theme.fontPairing?.body)
    parts.push(`${theme.fontPairing.heading} / ${theme.fontPairing.body}`);
  if (theme.packs.length)
    parts.push(`${theme.packs.length} pack${theme.packs.length !== 1 ? "s" : ""}`);
  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      {parts.join(" · ") || "No content attached yet"}
    </p>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    live:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    draft:   "bg-amber-50 text-amber-700 border-amber-200",
    deleted: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls[status] ?? cls.draft}`}>
      {status}
    </span>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  const cls: Record<string, string> = {
    starter:  "bg-sky-50 text-sky-700 border-sky-200",
    licensed: "bg-violet-50 text-violet-700 border-violet-200",
    owned:    "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls[origin] ?? "bg-muted text-muted-foreground border-border"}`}>
      {origin}
    </span>
  );
}

/** Icon row at the bottom of each card for palette/bg/font/pack counts. */
function BundleIcons({ theme }: { theme: EnrichedTheme }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Layers3 className="w-3 h-3" />
        {theme.palettes.length}
      </span>
      <span className="flex items-center gap-1">
        <Image className="w-3 h-3" />
        {theme.backgrounds.length}
      </span>
      {(theme.fontPairing?.heading || theme.fontPairing?.body) && (
        <span className="flex items-center gap-1">
          <Type className="w-3 h-3" />
          <span className="truncate max-w-[80px]">
            {theme.fontPairing?.heading ?? "—"}
          </span>
        </span>
      )}
      <span className="flex items-center gap-1">
        <Package className="w-3 h-3" />
        {theme.packs.length}
      </span>
    </div>
  );
}

// ── Theme card ────────────────────────────────────────────────────────────

function ThemeCard({ theme, onPublish }: {
  theme: EnrichedTheme;
  onPublish: (theme: EnrichedTheme) => void;
}) {
  const isEmpty = theme.palettes.length === 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
      {/* Colour dots + badges */}
      <div className="flex items-start justify-between gap-2">
        <PaletteDots theme={theme} />
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={theme.status} />
          <OriginBadge origin={theme.origin} />
        </div>
      </div>

      {/* Name */}
      <div>
        <h3 className="font-display font-semibold text-[15px] text-foreground leading-tight">
          {theme.name}
        </h3>
        {theme.desc && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {theme.desc}
          </p>
        )}
      </div>

      {/* Empty state warning */}
      {isEmpty && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" />
          <p className="text-[11px] text-amber-800 leading-snug">
            No palettes attached. Open the editor to build this bundle.
          </p>
        </div>
      )}

      {/* Bundle summary line */}
      {!isEmpty && <BundleSummary theme={theme} />}

      {/* Icon counts */}
      <BundleIcons theme={theme} />

      {/* Palette name chips (show first 3) */}
      {theme.palettes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {theme.palettes.slice(0, 3).map(p => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground border border-border"
            >
              {p.isPrimary && <Check className="w-2.5 h-2.5 text-emerald-500" />}
              {p.name}
            </span>
          ))}
          {theme.palettes.length > 3 && (
            <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground border border-border">
              +{theme.palettes.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-border">
        <Link href={`/catalog/themes/${theme.id}`}>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-[12px] font-medium text-foreground transition-colors">
            <Edit2 className="w-3 h-3" />
            Edit bundle
          </button>
        </Link>
        {theme.status === "draft" ? (
          <button
            onClick={() => onPublish(theme)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2A4A] hover:bg-[#1B2A4A]/90 text-[12px] font-medium text-white transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Publish
          </button>
        ) : (
          <button
            onClick={() => onPublish(theme)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-[12px] font-medium text-muted-foreground transition-colors"
          >
            Unpublish
          </button>
        )}
        {theme.price > 0 && (
          <span className="ml-auto text-[11px] font-medium text-muted-foreground">
            ${theme.price.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["all", "live", "draft"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function ThemesList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: themes = [], isLoading } = useQuery<EnrichedTheme[]>({
    queryKey: ["themes-enriched"],
    queryFn: fetchThemes,
  });

  const publishMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await patchTheme(id, { status });
    },
    onSuccess: () => {
      toast({ title: "Theme updated" });
      qc.invalidateQueries({ queryKey: ["themes-enriched"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const visible = themes.filter(t =>
    statusFilter === "all" ? true : t.status === statusFilter,
  );

  const liveCount  = themes.filter(t => t.status === "live").length;
  const draftCount = themes.filter(t => t.status === "draft").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <CatalogPageHeader
        title="Themes"
        subtitle="Bundled visual identities — each theme carries multiple palettes, a font pairing, and optional backgrounds and sticker packs. Sellers pick a theme; buyers choose within it."
        primaryCta={
          <Link href="/catalog/themes/new">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" /> New theme
            </button>
          </Link>
        }
        filters={[{
          value: statusFilter,
          options: [
            { value: "all",   label: `All (${themes.length})` },
            { value: "live",  label: `Live (${liveCount})` },
            { value: "draft", label: `Draft (${draftCount})` },
          ],
          onChange: (v) => setStatusFilter(v as StatusFilter),
        }]}
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Layers3 className="w-8 h-8 opacity-40" />
          <p className="text-sm">No themes match this filter.</p>
          <Link href="/catalog/themes/new">
            <button className="mt-2 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-sm font-medium hover:opacity-90 transition-opacity">
              Create first theme
            </button>
          </Link>
        </div>
      ) : (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {visible.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onPublish={t =>
                publishMutation.mutate({ id: t.id, status: t.status === "live" ? "draft" : "live" })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
