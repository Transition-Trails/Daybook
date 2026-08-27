/**
 * Planner Studio — unified workspace for the planner product domain.
 *
 * All tabs follow the COMPOSE PATTERN (top-down):
 *   1. Page heading + subtitle + AI action button
 *   2. Decision card (when a fundamental choice exists)
 *   3. YOUR LIBRARY — horizontal visual card row
 *   4. BUILD PANEL — drop zone, describe textarea, inline options
 *
 * LEFT RAIL (all modes):
 *   TEMPLATE card (edition name + config summary + swatch)
 *   SETUP PRESETS (My usual [DEFAULT], Landscape, Minimal + Save)
 *   THIS BUILD summary pinned at bottom
 *
 * Chip fill: clay #C87560 in compose context, ink navy #1B2A4A for filters.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import { useLocation, useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, BookOpen, FileText, Download, Upload,
  Plus, Copy, Globe, EyeOff, ImageOff, Layers,
  Lock as LockIcon, RefreshCw, Check,
} from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  SectionLabel, ChipRow, MultiChipRow, SegmentedControl,
  EmptyState, ErrorState, SkeletonRows, RailCard, DockAiAssistant,
  StatusPill, ActionChip, CHIP_ACTIVE_BG,
} from "@/components/studio/primitives";
import { catalogApi, apiFetch, platformPlannersApi, type PlatformPlannerConfig } from "@/lib/api";
import { aiApi, extractJson, type AiResult } from "@/lib/ai";
import { useToast } from "@/hooks/use-toast";
import { PLANNER_FONT_FAMILIES } from "@/lib/studio/plannerConstants";
import {
  DEFAULT_BUILD, buildStateToStylePatch, templateToBuildState,
  type PlannerBuildState as BuildState,
} from "@/lib/studio/plannerState";
import { SPINE_BINDING_TYPES, SPINE_FINISHES, spineFinishLabel } from "@/lib/spineCatalog";

/** Defensive string extractor — prevents [object Object] when Claude returns JSON or an unexpected shape. */
function safeText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of ["description", "text", "content", "value", "body"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
    try { return JSON.stringify(v); } catch { /* ignore */ }
  }
  console.warn("[AI field] Expected string, got:", typeof v, v);
  return "";
}

// ── Mode definitions ──────────────────────────────────────────────────────────

const MODES = [
  { id: "build",    label: "Build" },
  { id: "editions", label: "Editions" },
  { id: "inserts",  label: "Inserts & widgets" },
  { id: "theme",    label: "Theme" },
  { id: "cover",    label: "Cover" },
  { id: "dividers", label: "Dividers & tabs" },
  { id: "paper",    label: "Paper & binding" },
  { id: "quality",  label: "Quality check" },
] as const;

type ModeId = typeof MODES[number]["id"];

// ── Design tokens ─────────────────────────────────────────────────────────────

/** Clay — active fill for COMPOSE context chips (decision cards, build options). */
const CLAY = "#C87560";

/** Paper tint used for library card thumbnails. */
const PAPER_TINT = "#FFFDF9";

const THIN_SCROLL: React.CSSProperties = {
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(0,0,0,0.12) transparent",
};

// ── Palette options ───────────────────────────────────────────────────────────

interface Palette { id: string; name: string; colors: string[] }

const PALETTES: Palette[] = [
  { id: "sage",  name: "Sage",   colors: ["#7C9E8A", "#B5C9BC", "#EBF0EC"] },
  { id: "rust",  name: "Rust",   colors: ["#C87560", "#D9A090", "#F5EDE9"] },
  { id: "slate", name: "Slate",  colors: ["#4A5568", "#718096", "#EDF2F7"] },
  { id: "sand",  name: "Sand",   colors: ["#A0856A", "#C4A882", "#F0E8DC"] },
  { id: "blush", name: "Blush",  colors: ["#C4526A", "#E49FAC", "#FCF0F2"] },
  { id: "ink",   name: "Ink",    colors: ["#1B2A4A", "#3D5278", "#EEF1F7"] },
];

// ── Year / month helpers ──────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS  = [2025, 2026, 2027, 2028];
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
const YEAR_OPTIONS  = YEARS.map(y => ({ value: String(y), label: String(y) }));

// ── Build form state ──────────────────────────────────────────────────────────

// ── Compose-context chip (clay active fill) ───────────────────────────────────

function ComposeChip({
  label, active, onClick, className,
}: {
  label: string; active: boolean; onClick: () => void; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: "pointer",
        ...(active ? { background: CLAY } : {}),
      }}
      className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
        active
          ? "text-white border-[#C87560]"
          : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
      } ${className ?? ""}`}
    >
      {label}
    </button>
  );
}

// ── Page header (compose pattern step 1) ─────────────────────────────────────

function ComposePageHeader({
  title, subtitle, aiLabel, onAi,
}: {
  title: string;
  subtitle: string;
  aiLabel?: string;
  onAi?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 className="font-display font-semibold text-[17px] text-foreground leading-tight">{title}</h2>
        <p className="text-[12.5px] text-muted-foreground max-w-xl">{subtitle}</p>
      </div>
      {aiLabel && onAi && (
        <button
          onClick={onAi}
          style={{ cursor: "pointer", background: CLAY, color: "#fff", flexShrink: 0 }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {aiLabel}
        </button>
      )}
    </div>
  );
}

// ── Decision card (compose pattern step 2) ────────────────────────────────────

function DecisionCard({
  question, options, value, onChange, explanation, disambiguation,
}: {
  question: string;
  options: Array<{ value: string; label: string; sub?: string }>;
  value: string;
  onChange: (v: string) => void;
  explanation?: string;
  disambiguation?: string;
}) {
  const chosen = options.find(o => o.value === value);
  return (
    <div
      className="rounded-[16px] border p-5 mb-6 space-y-3"
      style={{ borderColor: "hsl(var(--border))", background: "#FFFDF9" }}
    >
      {/* Eyebrow */}
      <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {question}
      </p>
      {/* Option chips */}
      <div className="flex gap-2 flex-wrap">
        {options.map(o => (
          <ComposeChip
            key={o.value}
            label={o.sub ? `${o.label} · ${o.sub}` : o.label}
            active={value === o.value}
            onClick={() => onChange(o.value)}
          />
        ))}
      </div>
      {/* Explanation for selected option */}
      {explanation && (
        <p className="text-[12.5px] text-muted-foreground leading-relaxed pt-0.5">
          {explanation}
        </p>
      )}
      {disambiguation && (
        <p className="text-[11px] text-muted-foreground/70 italic border-t pt-2">
          {disambiguation}
        </p>
      )}
    </div>
  );
}

// ── Library row (compose pattern step 3) ──────────────────────────────────────

interface LibraryItem {
  id: string;
  name: string;
  descriptor?: string;
  thumbBg?: string;
  thumbIcon?: React.ReactNode;
}

function LibraryRow({
  items, selected, onSelect, onNew, loading,
}: {
  items: LibraryItem[];
  selected: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading?: boolean;
}) {
  return (
    <div className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Your library
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          Click one to edit, or start fresh below
        </p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1" style={THIN_SCROLL}>
        {loading && (
          <>
            {[1,2,3].map(i => (
              <div key={i} className="shrink-0 rounded-[14px] border"
                style={{ width: 120, height: 148, background: PAPER_TINT, opacity: 1 - i * 0.2 }}>
                <div className="w-full h-20 bg-muted/30 rounded-t-[14px] animate-pulse" />
              </div>
            ))}
          </>
        )}
        {!loading && items.map(item => {
          const isActive = selected === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                cursor: "pointer",
                background: isActive ? "#FEF0ED" : PAPER_TINT,
                borderColor: isActive ? CLAY : "hsl(var(--border))",
                flexShrink: 0,
                width: 120,
              }}
              className={`rounded-[14px] border transition-colors text-left flex flex-col overflow-hidden ${
                isActive ? "" : "hover:border-foreground/20"
              }`}
              aria-pressed={isActive}
            >
              {/* Thumbnail */}
              <div
                className="w-full flex items-center justify-center"
                style={{
                  height: 80,
                  background: item.thumbBg ?? (isActive ? "#FDE8E0" : "hsl(var(--muted))"),
                  borderBottom: "1px solid",
                  borderColor: isActive ? "#F0C4B5" : "hsl(var(--border))",
                  flexShrink: 0,
                }}
              >
                {item.thumbIcon ?? (
                  <ImageOff className="w-5 h-5 text-muted-foreground/40" />
                )}
              </div>
              {/* Label */}
              <div className="px-2.5 py-2 space-y-0.5">
                <p className={`text-[12px] font-semibold leading-tight truncate ${
                  isActive ? "text-foreground" : "text-foreground"
                }`}>
                  {item.name}
                </p>
                {item.descriptor && (
                  <p className="text-[10.5px] text-muted-foreground truncate leading-tight">
                    {item.descriptor}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {/* New tile */}
        {!loading && (
          <button
            onClick={onNew}
            style={{ cursor: "pointer", flexShrink: 0, width: 120, minHeight: 120 }}
            className="rounded-[14px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[11.5px] font-medium">New</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Build panel (compose pattern step 4) ──────────────────────────────────────

function BuildPanel({
  eyebrow,
  prompt, onPromptChange, onAskClaude, askLoading,
  children,
}: {
  eyebrow: string;
  prompt: string;
  onPromptChange: (v: string) => void;
  onAskClaude: () => void;
  askLoading?: boolean;
  /** Variant/palette/option rows rendered inside the panel */
  children?: React.ReactNode;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="rounded-[16px] border p-5 space-y-5"
      style={{ borderColor: "hsl(var(--border))", background: PAPER_TINT }}
    >
      {/* Eyebrow */}
      <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>

      {/* Drop zone */}
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{ cursor: "pointer", width: "100%" }}
        className="rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 py-7 hover:border-foreground/30 hover:bg-muted/20 transition-colors"
      >
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
        <Upload className="w-5 h-5 text-muted-foreground/60" />
        <div className="space-y-0.5 text-center">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Show Claude an example
          </p>
          <p className="text-[12px] text-muted-foreground">
            Drop a screenshot, scan or sketch
          </p>
          <p className="text-[11px] text-muted-foreground/60">or click to browse</p>
        </div>
      </button>

      {/* Describe textarea + Ask Claude chip */}
      <div className="relative">
        <textarea
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          rows={4}
          placeholder="What should it contain?"
          className="w-full rounded-[12px] border bg-background px-4 py-3 pr-28 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors resize-none"
        />
        <button
          onClick={onAskClaude}
          disabled={!prompt.trim() || askLoading}
          style={{
            cursor: !prompt.trim() || askLoading ? "not-allowed" : "pointer",
            background: CLAY,
          }}
          className="absolute bottom-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {askLoading ? (
            <span className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <Sparkles className="w-2.5 h-2.5" />
          )}
          ✦ Ask Claude
        </button>
      </div>

      {/* Inline option rows */}
      {children}
    </div>
  );
}

// ── Palette swatch row ────────────────────────────────────────────────────────

function PaletteRow({
  value, onChange,
}: {
  value: string; onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">Palette</p>
      <div className="flex gap-3 flex-wrap">
        {PALETTES.map(p => {
          const active = value === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onChange(p.id)}
              style={{ cursor: "pointer" }}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-2 border transition-colors ${
                active
                  ? "border-[#C87560] bg-[#FEF0ED]"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              <div className="flex gap-0.5">
                {p.colors.map((c, i) => (
                  <div key={i} className="rounded-full" style={{ width: 12, height: 12, background: c }} />
                ))}
              </div>
              <span className={`text-[10.5px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {p.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Platform template left rail ───────────────────────────────────────────────

function PlatformTemplateRail({
  templates, selectedId, onSelect, onNew, loading,
}: {
  templates: PlatformPlannerConfig[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading?: boolean;
}) {
  const selected = templates.find(t => t.id === selectedId) ?? null;
  const setup = selected?.setup;

  return (
    <div className="flex flex-col h-full" style={{ background: PAPER_TINT }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={THIN_SCROLL}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Platform templates
          </p>
          <button
            onClick={onNew}
            style={{ cursor: "pointer", background: CLAY, color: "#fff" }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" /> New
          </button>
        </div>

        {/* Template list */}
        {loading ? (
          <SkeletonRows count={3} />
        ) : templates.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-[12px] text-muted-foreground">No templates yet</p>
            <button
              onClick={onNew}
              style={{ cursor: "pointer", background: CLAY, color: "#fff" }}
              className="mx-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" /> Create first template
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                style={{
                  cursor: "pointer", width: "100%", textAlign: "left",
                  borderColor: selectedId === t.id ? CLAY : undefined,
                  background: selectedId === t.id ? "#FEF0ED" : undefined,
                }}
                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border transition-colors ${
                  selectedId === t.id
                    ? "border-[#C87560]"
                    : "border-border hover:border-foreground/30 hover:bg-muted/30"
                }`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[12.5px] font-semibold text-foreground truncate">{t.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full ${
                      t.status === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {t.status}
                    </span>
                    {t.drive.pdfFileId && (
                      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        PDF ready
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Selected template summary pinned at bottom */}
      {selected && setup && (
        <div className="border-t p-4 shrink-0" style={{ background: PAPER_TINT }}>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Selected
          </p>
          <div className="space-y-0.5">
            <p className="text-[11.5px] text-muted-foreground">
              {(setup as any).datingMode ?? "dated"} · {(setup as any).weekStart ?? "mon"}-start
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {(setup as any).monthCount ?? 12} mo · {selected.style?.themeId ? "themed" : "no theme"}
            </p>
            {selected.editionId && (
              <p className="text-[11.5px] text-muted-foreground truncate">
                Edition linked
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edition quick-pick (in the left rail) ─────────────────────────────────────

function EditionQuickPick({ value, onChange }: { value: string; onChange: () => void }) {
  const { data: editions = [], isLoading } = useQuery({
    queryKey: ["editions-list-mini"],
    queryFn:  () => catalogApi.editions(),
    // staleTime: 0 — always re-fetch on mount; rail must not show a deleted edition
    staleTime: 0,
  });
  const live = (editions as any[]).filter((e: any) => e.status !== "deleted").slice(0, 4);

  if (isLoading) return <SkeletonRows count={2} />;

  return (
    <div className="space-y-1">
      {live.map((e: any) => (
        <button
          key={e.id}
          onClick={() => {}}  // handled by the main hub's buildState setter via onApplyPreset
          style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] transition-colors ${
            value === e.id
              ? "bg-[#FEF0ED] text-foreground font-semibold border border-[#C87560]/30"
              : "text-muted-foreground hover:bg-muted border border-transparent hover:text-foreground"
          }`}
        >
          <BookOpen className="w-3 h-3 shrink-0" />
          <span className="truncate flex-1">{e.name ?? e.id}</span>
        </button>
      ))}
      <button
        onClick={onChange}
        style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/20 transition-colors"
      >
        <Plus className="w-3 h-3 shrink-0" />
        New edition
      </button>
    </div>
  );
}

// ── PDF Preview dock panel ────────────────────────────────────────────────────

function PdfPreviewDock({ buildState, einkDevice }: { buildState: BuildState; einkDevice?: string | null }) {
  const [previewUrl, setPreviewUrl]             = useState<string | null>(null);
  const [loading, setLoading]                   = useState(false);
  const [fontSubstitutions, setFontSubstitutions] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!buildState.editionId) return;
    setLoading(true);
    try {
      // Compute monthCount from BuildState (1-indexed months → 0-indexed for server)
      const sm = Number(buildState.startMonth) - 1;
      const em = Number(buildState.endMonth)   - 1;
      const sy = Number(buildState.startYear);
      const ey = Number(buildState.endYear);
      const monthCount = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);

      const res = await fetch("/api/planners/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId:  buildState.editionId || undefined,
          einkDevice: einkDevice ?? null,
          setup: {
            weekStart:   buildState.weekStart,
            orientation: "vertical" as const,   // "vertical" = portrait in the generator
            startMonth:  sm,                     // server expects 0-indexed
            startYear:   sy,
            monthCount,
            datingMode:  buildState.datingMode,
          },
          style: {
            themeId:    buildState.themeId   || undefined,
            paletteId:  buildState.paletteId || undefined,
            tabPos:     buildState.tabPos,
            sections:   buildState.sections,
            weeklyType: buildState.weeklyType,
          },
          output: { calMode: "none", eventMins: 60, aiInPdf: false },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Read font substitution header before consuming the body
      const subHeader = res.headers.get("x-font-substitutions");
      setFontSubstitutions(subHeader ? subHeader.split(",").map(s => s.trim()).filter(Boolean) : []);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [buildState, einkDevice]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchPreview, 700);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchPreview]);

  if (!buildState.editionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <FileText className="w-8 h-8 text-muted-foreground" />
        <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center", gap: 4 }}>
          <p className="font-semibold text-[13px] text-foreground">No edition selected</p>
          <p className="text-[11px] text-muted-foreground">Pick an edition in the left rail to see a live preview.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {loading && (
        <div className="px-4 py-2 flex items-center gap-2 border-b shrink-0">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: `${CHIP_ACTIVE_BG} transparent ${CHIP_ACTIVE_BG} ${CHIP_ACTIVE_BG}` }} />
          <span className="text-[11px] text-muted-foreground">Rendering preview…</span>
        </div>
      )}
      {fontSubstitutions.length > 0 && !loading && (
        <div className="px-3 py-2 flex items-start gap-2 border-b shrink-0 bg-amber-50 dark:bg-amber-950/30">
          <span className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true">⚠</span>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
            <span className="font-semibold">Font substitution active —</span>{" "}
            {fontSubstitutions.join(", ")} could not be embedded and was replaced with a system font.
            The exported PDF may look different from your theme's typeface.
          </p>
        </div>
      )}
      {previewUrl ? (
        <iframe src={previewUrl} title="Planner preview" className="flex-1 w-full border-0" style={{ minHeight: 0 }} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: `${CHIP_ACTIVE_BG} transparent ${CHIP_ACTIVE_BG} ${CHIP_ACTIVE_BG}` }} />
        </div>
      )}
    </div>
  );
}

// ── BUILD mode center ─────────────────────────────────────────────────────────

// Eyebrow + consequence tokens used throughout the build card
const BUILD_EYEBROW    = "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";
const BUILD_CONSEQ     = "text-[12.5px] leading-relaxed text-muted-foreground";

export function BuildCenter({
  template, onUpdated, onCreateNew, onEinkDeviceChange,
}: {
  template: PlatformPlannerConfig | null;
  onUpdated: (t: PlatformPlannerConfig) => void;
  onCreateNew: (t: PlatformPlannerConfig) => void;
  onEinkDeviceChange?: (device: string | null) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Creation form state ──────────────────────────────────────────────────────
  const [newName,      setNewName]      = useState("");
  const [newEditionId, setNewEditionId] = useState("");

  // ── Template-backed local state ──────────────────────────────────────────────
  const isLocked = !!template?.generatedAt;
  const [datingMode,    setDatingMode]    = useState<"dated" | "undated" | "perpetual">("dated");
  const [weekStart,     setWeekStart]     = useState<"mon" | "sun">("mon");
  const [orientation,   setOrientation]   = useState<"vertical" | "landscape">("vertical");
  const [startMonth,    setStartMonth]    = useState(0);   // 0-indexed
  const [startYear,     setStartYear]     = useState(new Date().getFullYear() + 1);
  const [monthCount,    setMonthCount]    = useState(12);
  const [themeId,       setThemeId]       = useState("");
  const [paletteId,     setPaletteId]     = useState("");
  const [tabPos,        setTabPos]        = useState<"right" | "top" | "bottom" | "none">("right");
  const [sections,      setSections]      = useState<string[]>([]);
  const [packIds,       setPackIds]       = useState<string[]>([]);
  const [insertIds,     setInsertIds]     = useState<string[]>([]);
  const [addingSection,  setAddingSection]  = useState(false);
  const [sectionDraft,   setSectionDraft]   = useState("");
  const [inkFriendly,    setInkFriendly]    = useState(false);
  // ── Font / background overrides ──────────────────────────────────────────────
  const [headingFont,    setHeadingFont]    = useState("");
  const [subheadingFont, setSubheadingFont] = useState("");
  const [bodyFont,       setBodyFont]       = useState("");
  const [accentFont,     setAccentFont]     = useState("");
  const [backgroundId,   setBackgroundId]   = useState("");
  const [einkDevice,    setEinkDevice]    = useState<string | null>(null);
  const setEinkDeviceAndNotify = (device: string | null) => {
    setEinkDevice(device);
    onEinkDeviceChange?.(device);
  };

  // Sync from template when template identity changes
  useEffect(() => {
    if (!template) return;
    const s  = template.setup as any;
    const st = template.style  as any;
    setDatingMode(s.datingMode  ?? "dated");
    setWeekStart(s.weekStart    ?? "mon");
    setOrientation(s.orientation  ?? "vertical");
    setStartMonth(s.startMonth   ?? 0);
    setStartYear(s.startYear    ?? new Date().getFullYear() + 1);
    setMonthCount(s.monthCount  ?? 12);
    setThemeId(st.themeId    ?? "");
    setPaletteId(st.paletteId  ?? "");
    setTabPos(st.tabPos     ?? "right");
    setSections(st.sections   ?? []);
    setPackIds(st.packIds    ?? []);
    setInsertIds(st.insertIds   ?? []);
    // Font overrides
    setHeadingFont((st.fonts as any)?.heading    ?? "");
    setSubheadingFont((st.fonts as any)?.subheading ?? "");
    setBodyFont((st.fonts as any)?.script     ?? "");
    setAccentFont((st.fonts as any)?.accent    ?? "");
    // Background
    setBackgroundId(st.backgroundId ?? "");
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data queries ─────────────────────────────────────────────────────────────
  const { data: rawThemes = [] } = useQuery({
    queryKey: ["themes-mini"],
    queryFn:  () => catalogApi.themes(),
    // staleTime: 0 — always re-fetch on mount; deleted/unpublished themes must not
    // remain selectable in the Build picker after an admin removes them elsewhere.
    staleTime: 0,
  });
  const themes = (rawThemes as any[]).filter(
    (t: any) => t.origin !== "owned" && !String(t.name ?? "").includes("— Auto palette"),
  );
  // staleTime: 0 — picker queries always re-fetch on mount so deletions surface immediately
  const { data: packs     = [] } = useQuery({ queryKey: ["packs-mini"],    queryFn: () => catalogApi.packs(),    staleTime: 0 });
  const { data: inserts   = [] } = useQuery({ queryKey: ["inserts-mini"],  queryFn: () => catalogApi.inserts(),  staleTime: 0 });
  const { data: editions  = [] } = useQuery({ queryKey: ["editions-create"], queryFn: () => catalogApi.editions(), staleTime: 0 });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: () => platformPlannersApi.create({
      name: newName.trim(),
      editionId: newEditionId || undefined,
      setup: { weekStart: "mon", orientation: "vertical", startMonth: 0, startYear: new Date().getFullYear() + 1, monthCount: 12, datingMode: "dated" } as any,
    }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["platform-planners"] });
      onCreateNew(t);
      setNewName(""); setNewEditionId("");
    },
    onError: (err: Error) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  const setupMut = useMutation({
    mutationFn: () => platformPlannersApi.patch(template!.id, {
      setup: { datingMode, weekStart, orientation, startMonth, startYear, monthCount } as any,
    }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-planners"] }); onUpdated(t); toast({ title: "Setup saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const styleMut = useMutation({
    mutationFn: () => {
      // Carry forward the template's already-persisted binding and paperColour so
      // that a Build-tab save never resets PaperCompose choices to defaults.
      const savedSt = template?.style as any;
      return platformPlannersApi.patch(template!.id, {
        style: buildStateToStylePatch({
          ...DEFAULT_BUILD,
          themeId, paletteId, tabPos, sections, packIds, insertIds,
          headingFont, subheadingFont, bodyFont, accentFont, backgroundId,
          bindingType:   (savedSt?.binding as any)?.type   ?? DEFAULT_BUILD.bindingType,
          bindingFinish: (savedSt?.binding as any)?.finish  ?? DEFAULT_BUILD.bindingFinish,
          paperColour:   savedSt?.paperColour               ?? DEFAULT_BUILD.paperColour,
        }) as any,
      });
    },
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-planners"] }); onUpdated(t); toast({ title: "Style saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const generateMut = useMutation({
    mutationFn: () => platformPlannersApi.generate(template!.id, {
      inkFriendly: inkFriendly || !!einkDevice,
      einkDevice: einkDevice ?? undefined,
    }),
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ["platform-planners"] });
      const updated = await platformPlannersApi.get(template!.id);
      onUpdated(updated);
      const bwNote = einkDevice ? ` · ${einkDevice}` : (inkFriendly ? " · + ink-friendly" : "");
      toast({ title: "Generated", description: `${result.pageCount} pages · ${result.fileName}${bwNote}` });
      if (result.einkCaveat) {
        toast({ title: "Kindle Scribe listing note", description: result.einkCaveat, variant: "default" });
      }
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const publishMut = useMutation({
    mutationFn: () => platformPlannersApi.publish(template!.id),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-planners"] }); onUpdated(t); toast({ title: "Published to catalog" }); },
    onError: (err: Error) => toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  // ── Derived helpers ──────────────────────────────────────────────────────────
  const isDated      = datingMode === "dated";
  const selTheme     = (themes as any[]).find((t: any) => t.id === themeId) ?? null;
  const palettes: Array<{ id: string; name: string; colors: string[] }> = selTheme?.palettes ?? [];

  // End month/year for consequence line (both 0-indexed)
  const totalOffset  = startMonth + monthCount - 1;
  const endYear      = startYear + Math.floor(totalOffset / 12);
  const endMonth     = totalOffset % 12;

  const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_ABB  = MONTHS_FULL.map(m => m.slice(0, 3));
  const YEAR_SEL    = [2025, 2026, 2027, 2028, 2029, 2030];

  const datingConsequence: Record<string, string> = {
    dated:     "Real dates and weekdays — sells by year, links to calendar invites.",
    undated:   "No date links — fill-in boxes instead. Sells any time, no year expiry.",
    perpetual: "Reusable year-round — no year-specific content, no expiry.",
  };
  const tabConsequence: Record<string, string> = {
    right:  "Tabs appear on section dividers as right-edge navigational rails.",
    top:    "Tabs run across the top of each section divider page.",
    bottom: "Tabs run along the bottom edge of each section divider page.",
    none:   "No section dividers — a single Home tab only.",
  };

  const PRODUCT_TYPES = [
    { id: "planner",  label: "Planner",      sub: "Dated, hyperlinked,\ntab rails",  active: true  },
    { id: "notebook", label: "Notebook",     sub: "Repeating pages,\nno calendar",   active: false },
    { id: "svg",      label: "SVG cut pack", sub: "SVG + DXF + PNG,\ncut layers",    active: false },
    { id: "kdp",      label: "KDP interior", sub: "Print — v2",                      active: false },
  ];

  const pillCls = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors cursor-pointer ${
      active
        ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
        : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
    }`;

  // ── No template: creation form ────────────────────────────────────────────────
  if (!template) {
    return (
      <div className="space-y-6 pb-8" style={{ minWidth: 0, maxWidth: 700 }}>
        <div>
          <h2 className="font-display font-semibold text-[17px] text-foreground leading-tight">
            Start a new template
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-lg">
            Platform templates are catalog assets — build once, let every store adopt them.
          </p>
        </div>

        <div className="rounded-[16px] border overflow-hidden">
          <div className="border-l-[3px] border-[#1B2A4A] p-6 space-y-5" style={{ background: PAPER_TINT }}>
            <span className={BUILD_EYEBROW}>Template details</span>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-muted-foreground">Name *</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. 2027 Full-Year Planner"
                  onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMut.mutate(); }}
                  className="w-full h-10 rounded-xl border border-border bg-background px-4 text-[13px] outline-none focus:border-foreground/40 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-muted-foreground">
                  Edition <span className="text-muted-foreground/60">(optional — link later)</span>
                </label>
                <select
                  value={newEditionId}
                  onChange={e => setNewEditionId(e.target.value)}
                  style={{ cursor: "pointer" }}
                  className="w-full h-10 rounded-xl border border-border bg-background px-4 text-[13px] outline-none focus:border-foreground/40 transition-colors"
                >
                  <option value="">No edition yet</option>
                  {(editions as any[])
                    .filter((e: any) => e.status !== "deleted")
                    .map((e: any) => (
                      <option key={e.id} value={e.id}>{e.name ?? e.id}</option>
                    ))}
                </select>
              </div>
            </div>
            <button
              onClick={() => createMut.mutate()}
              disabled={!newName.trim() || createMut.isPending}
              style={{
                cursor: !newName.trim() || createMut.isPending ? "not-allowed" : "pointer",
                background: CHIP_ACTIVE_BG,
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {createMut.isPending
                ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <Plus className="w-4 h-4" />
              }
              Create template
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full build UI ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-8" style={{ minWidth: 0, maxWidth: 700 }}>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-[17px] text-foreground leading-tight">
            {template.name}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-lg">
            Structure is set once. Everything else you can change and re-export later.
          </p>
        </div>
        <button
          style={{ cursor: "pointer", background: CLAY, color: "#fff", flexShrink: 0 }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          ✦ Build with Claude
        </button>
      </div>

      {/* Edition requirement notice */}
      {!template.editionId && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <BookOpen className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-amber-800">No edition linked yet</p>
            <p className={`${BUILD_CONSEQ} text-amber-700`}>
              An edition defines the page layout and section order. Link one before generating.
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          CARD 1 — SET UP ONCE (navy left accent)
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-[16px] border overflow-hidden">
        <div className="border-l-[3px] border-[#1B2A4A] p-6 space-y-6" style={{ background: PAPER_TINT }}>

          {/* Card header */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className={BUILD_EYEBROW}>Set up once</span>
              {isLocked ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <LockIcon className="w-3 h-3" /> Locked — re-generate to change
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <LockIcon className="w-3 h-3" /> Locked after generating
                </span>
              )}
            </div>
            <p className={BUILD_CONSEQ}>
              These decide the page count and every internal link — they can't change without a fresh planner.
            </p>
          </div>

          {/* DATING */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={BUILD_EYEBROW}>Dating</span>
              <span className="px-2 py-0.5 rounded-full bg-[#1B2A4A]/10 text-[#1B2A4A] text-[11px] font-semibold capitalize leading-none py-[3px]">
                {datingMode}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["dated","undated","perpetual"] as const).map(v => (
                <button
                  key={v} disabled={isLocked}
                  onClick={() => !isLocked && setDatingMode(v)}
                  className={pillCls(datingMode === v)}
                  style={{ cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.6 : 1 }}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <p className={BUILD_CONSEQ}>{datingConsequence[datingMode]}</p>
          </div>

          {/* PRODUCT TYPE */}
          <div className="space-y-2">
            <span className={BUILD_EYEBROW}>Product type</span>
            <div className="grid grid-cols-4 gap-2">
              {PRODUCT_TYPES.map(pt => (
                <div key={pt.id} className={`p-3 rounded-xl border text-left select-none transition-colors ${
                  pt.active
                    ? "text-white border-[#C87560]"
                    : "bg-background text-foreground border-border opacity-40 cursor-not-allowed"
                }`} style={pt.active ? { background: CLAY } : {}}>
                  <p className="text-[12.5px] font-semibold leading-tight">{pt.label}</p>
                  <p className={`text-[11px] leading-snug mt-1 whitespace-pre-line ${pt.active ? "text-white/80" : "text-muted-foreground"}`}>{pt.sub}</p>
                </div>
              ))}
            </div>
            <p className={BUILD_CONSEQ}>Full planner engine — dating, hyperlink map, tab groups and realistic binding all apply.</p>
          </div>

          {/* COMPACT 4-FIELD ROW */}
          <div className="grid grid-cols-4 gap-4">

            {/* Week starts */}
            <div className="space-y-2">
              <span className={BUILD_EYEBROW}>Week starts</span>
              <div className="flex gap-1.5">
                {(["mon","sun"] as const).map(v => (
                  <button
                    key={v} disabled={isLocked}
                    onClick={() => !isLocked && setWeekStart(v)}
                    className={pillCls(weekStart === v)}
                    style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
                  >
                    {v === "mon" ? "Mon" : "Sun"}
                  </button>
                ))}
              </div>
            </div>

            {/* Layout */}
            <div className="space-y-2">
              <span className={BUILD_EYEBROW}>Layout</span>
              <div className="flex gap-1.5">
                {(["vertical","landscape"] as const).map(v => (
                  <button
                    key={v} disabled={isLocked}
                    onClick={() => !isLocked && setOrientation(v)}
                    className={pillCls(orientation === v)}
                    style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
                  >
                    {v === "vertical" ? "Vertical" : "2-page"}
                  </button>
                ))}
              </div>
            </div>

            {/* Starts — compact month + year selects */}
            <div className="space-y-2">
              <span className={`${BUILD_EYEBROW} ${!isDated ? "opacity-40" : ""}`}>Starts</span>
              <div className="flex items-center gap-1">
                <select
                  disabled={!isDated || isLocked}
                  value={startMonth}
                  onChange={e => setStartMonth(Number(e.target.value))}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-foreground/40 transition-colors disabled:opacity-40"
                  style={{ cursor: isDated && !isLocked ? "pointer" : "not-allowed" }}
                >
                  {MONTHS_ABB.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select
                  disabled={!isDated || isLocked}
                  value={startYear}
                  onChange={e => setStartYear(Number(e.target.value))}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-foreground/40 transition-colors disabled:opacity-40 w-[72px]"
                  style={{ cursor: isDated && !isLocked ? "pointer" : "not-allowed" }}
                >
                  {YEAR_SEL.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Months — stepper */}
            <div className="space-y-2">
              <span className={`${BUILD_EYEBROW} ${!isDated ? "opacity-40" : ""}`}>Months</span>
              <div className="flex items-center gap-0">
                <button
                  disabled={!isDated || isLocked || monthCount <= 1}
                  onClick={() => setMonthCount(Math.max(1, monthCount - 1))}
                  className="h-8 w-7 rounded-l-lg border border-r-0 text-[13px] font-medium flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{ cursor: isDated && !isLocked && monthCount > 1 ? "pointer" : "not-allowed" }}
                >−</button>
                <div className="h-8 w-10 border text-[13px] font-medium flex items-center justify-center bg-background">
                  {isDated ? monthCount : "—"}
                </div>
                <button
                  disabled={!isDated || isLocked || monthCount >= 24}
                  onClick={() => setMonthCount(Math.min(24, monthCount + 1))}
                  className="h-8 w-7 rounded-r-lg border border-l-0 text-[13px] font-medium flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{ cursor: isDated && !isLocked && monthCount < 24 ? "pointer" : "not-allowed" }}
                >+</button>
              </div>
            </div>

          </div>
          {/* Row consequence */}
          <p className={`${BUILD_CONSEQ} -mt-3`}>
            {isDated
              ? `${weekStart === "mon" ? "Monday" : "Sunday"}-start ${orientation === "vertical" ? "vertical" : "2-page spread"} · ${MONTHS_FULL[startMonth]} ${startYear} → ${MONTHS_FULL[endMonth]} ${endYear} · ${monthCount} ${monthCount === 1 ? "month" : "months"}.`
              : `${weekStart === "mon" ? "Monday" : "Sunday"}-start ${orientation === "vertical" ? "vertical" : "2-page spread"} · no fixed dates.`}
          </p>

          {/* Save setup */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => setupMut.mutate()}
              disabled={isLocked || setupMut.isPending}
              style={{ cursor: isLocked || setupMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
              className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-[12.5px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {setupMut.isPending
                ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <Check className="w-3.5 h-3.5" />
              }
              {isLocked ? "Locked" : "Save setup"}
            </button>
            {setupMut.isSuccess && <StatusPill label="Setup saved" kind="success" />}
            {setupMut.isError   && <StatusPill label="Save failed"  kind="error" />}
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CARD 2 — CUSTOMIZE ANYTIME (clay left accent)
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-[16px] border overflow-hidden">
        <div className="border-l-[3px] border-[#C87560] p-6 space-y-6" style={{ background: PAPER_TINT }}>

          {/* Card header */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className={BUILD_EYEBROW}>Customize anytime</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <RefreshCw className="w-3 h-3" /> Re-export whenever
              </span>
            </div>
            <p className={BUILD_CONSEQ}>
              Cosmetic and content choices. Change them and export a fresh PDF — existing planners stay untouched.
            </p>
          </div>

          {/* THEME & PALETTE */}
          <div className="space-y-3">
            <span className={BUILD_EYEBROW}>Theme &amp; Palette</span>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setThemeId(""); setPaletteId(""); }}
                style={{ cursor: "pointer" }}
                className={pillCls(themeId === "")}
              >
                No theme
              </button>
              {(themes as any[]).map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => {
                    const primary = (t.palettes ?? []).find((p: any) => p.isPrimary) ?? (t.palettes ?? [])[0];
                    setThemeId(t.id);
                    setPaletteId(primary?.id ?? "");
                  }}
                  style={{ cursor: "pointer", ...(themeId === t.id ? { background: CHIP_ACTIVE_BG } : {}) }}
                  className={pillCls(themeId === t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* Palette swatches */}
            {themeId && palettes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {palettes.map((pal) => (
                  <button
                    key={pal.id}
                    onClick={() => setPaletteId(pal.id)}
                    title={pal.name}
                    style={{ cursor: "pointer" }}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all ${
                      paletteId === pal.id
                        ? "border-[#1B2A4A] ring-1 ring-[#1B2A4A]/20"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex rounded overflow-hidden">
                      {(pal.colors ?? []).slice(0, 4).map((hex: string, ci: number) => (
                        <div key={ci} className="w-5 h-5" style={{ background: hex }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-none max-w-[80px] truncate">{pal.name}</span>
                  </button>
                ))}
              </div>
            )}
            <p className={BUILD_CONSEQ}>Sets the colour family and typeface applied across all pages.</p>
          </div>

          {/* TABS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={BUILD_EYEBROW}>Tabs</span>
              <span className="text-[11.5px] text-muted-foreground">
                {tabPos === "right" ? "side tabs" : tabPos === "top" ? "top tabs" : tabPos === "bottom" ? "bottom tabs" : "no tabs"}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {([["right","Side"],["top","Top"],["bottom","Bottom"],["none","Home only"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setTabPos(v as "right" | "top" | "bottom" | "none")} className={pillCls(tabPos === v)}>
                  {label}
                </button>
              ))}
            </div>
            <p className={BUILD_CONSEQ}>{tabConsequence[tabPos]}</p>
          </div>

          {/* FONTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={BUILD_EYEBROW}>Fonts</span>
              {(headingFont || subheadingFont || bodyFont || accentFont) && (
                <button
                  style={{ cursor: "pointer" }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  onClick={() => { setHeadingFont(""); setSubheadingFont(""); setBodyFont(""); setAccentFont(""); }}
                >
                  Reset to theme
                </button>
              )}
            </div>
            {/* Theme fontPairing preview (read-only) */}
            {selTheme?.fontPairing && (
              <div className="flex flex-wrap gap-1.5">
                {selTheme.fontPairing.heading && (
                  <span className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border bg-[#1B2A4A]/10 text-[#1B2A4A] border-[#1B2A4A]/20">
                    Theme heading: {selTheme.fontPairing.heading}
                  </span>
                )}
                {selTheme.fontPairing.body && (
                  <span className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-border bg-background text-muted-foreground">
                    Theme body: {selTheme.fontPairing.body}
                  </span>
                )}
              </div>
            )}
            {/* Per-role overrides — saved in style.fonts and restored on draft reopen */}
            <div className="grid grid-cols-2 gap-2">
              {([
                ["Heading",    headingFont,    setHeadingFont],
                ["Subheading", subheadingFont, setSubheadingFont],
                ["Body/Script", bodyFont,      setBodyFont],
                ["Accent",     accentFont,     setAccentFont],
              ] as Array<[string, string, (v: string) => void]>).map(([label, val, setter]) => (
                <div key={label} className="space-y-1">
                  <p className="text-[10.5px] font-medium text-muted-foreground">{label}</p>
                  <select
                    value={val}
                    onChange={e => setter(e.target.value)}
                    style={{ cursor: "pointer" }}
                    className="w-full h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-foreground/40 transition-colors"
                  >
                    <option value="">— Theme default —</option>
                    {PLANNER_FONT_FAMILIES.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className={BUILD_CONSEQ}>Overrides apply throughout — covers, section titles, and day labels. Empty = use theme pairing.</p>
          </div>

          {/* NOTE SECTIONS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={BUILD_EYEBROW}>Note sections</span>
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {sections.length} OF 10
                </span>
              </div>
              <button
                style={{ cursor: "pointer", color: CLAY }}
                className="text-[12px] font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity"
              >
                ✦ Name them for me
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {sections.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-[12.5px] border bg-background">
                  {s}
                  <button
                    onClick={() => setSections(sections.filter((_, j) => j !== i))}
                    style={{ cursor: "pointer" }}
                    className="w-4 h-4 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-[11px]"
                  >×</button>
                </span>
              ))}
              {sections.length < 10 && !addingSection && (
                <button
                  onClick={() => setAddingSection(true)}
                  style={{ cursor: "pointer" }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  <Plus className="w-3 h-3" /> add
                </button>
              )}
              {addingSection && (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    value={sectionDraft}
                    onChange={e => setSectionDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && sectionDraft.trim()) {
                        setSections([...sections, sectionDraft.trim()]);
                        setSectionDraft(""); setAddingSection(false);
                      }
                      if (e.key === "Escape") { setSectionDraft(""); setAddingSection(false); }
                    }}
                    placeholder="Section name…"
                    className="h-8 w-36 rounded-full border border-border bg-background px-3 text-[12.5px] outline-none focus:border-foreground/40"
                  />
                  <button
                    onClick={() => {
                      if (sectionDraft.trim()) setSections([...sections, sectionDraft.trim()]);
                      setSectionDraft(""); setAddingSection(false);
                    }}
                    style={{ cursor: "pointer" }}
                    className="text-[11.5px] text-muted-foreground hover:text-foreground px-1"
                  >done</button>
                </span>
              )}
            </div>
            <p className={BUILD_CONSEQ}>Section names appear on tab dividers and in the contents page hyperlink map.</p>
          </div>

          {/* STICKER PACKS */}
          <div className="space-y-2">
            <span className={BUILD_EYEBROW}>Sticker packs</span>
            {(packs as any[]).length === 0 ? (
              <div className="flex items-center justify-between rounded-xl border border-dashed px-4 py-3 bg-background">
                <p className="text-[12.5px] text-muted-foreground">No sticker packs in the catalog yet.</p>
              </div>
            ) : (
              <MultiChipRow
                options={(packs as any[]).map((p: any) => ({ value: p.id, label: p.name }))}
                value={packIds} onChange={setPackIds}
              />
            )}
            <p className={BUILD_CONSEQ}>Sticker packs add decorative clip-art sheets after the planner pages.</p>
          </div>

          {/* INSERTS */}
          <div className="space-y-2">
            <span className={BUILD_EYEBROW}>Inserts</span>
            {(inserts as any[]).length === 0 ? (
              <div className="flex items-center justify-between rounded-xl border border-dashed px-4 py-3 bg-background">
                <p className="text-[12.5px] text-muted-foreground">No inserts in the catalog yet.</p>
              </div>
            ) : (
              <MultiChipRow
                options={(inserts as any[]).map((i: any) => ({ value: i.id, label: i.name }))}
                value={insertIds} onChange={setInsertIds}
              />
            )}
            <p className={BUILD_CONSEQ}>Inserts add bonus pages — habit trackers, goal sheets, reading logs — between planner sections.</p>
          </div>

          {/* Save style */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => styleMut.mutate()}
              disabled={!template || styleMut.isPending}
              style={{ cursor: (!template || styleMut.isPending) ? "not-allowed" : "pointer", background: CLAY, color: "#fff" }}
              className="flex items-center gap-2 px-5 py-2 rounded-full text-[12.5px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {styleMut.isPending
                ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <Check className="w-3.5 h-3.5" />
              }
              Save style
            </button>
            {styleMut.isSuccess && <StatusPill label="Style saved" kind="success" />}
            {styleMut.isError   && <StatusPill label="Save failed"  kind="error" />}
          </div>

        </div>
      </div>

      {/* WHAT SHIPS WITH THE PLANNER */}
      <div className="rounded-[16px] border p-5 space-y-3" style={{ background: PAPER_TINT }}>
        <div>
          <span className={BUILD_EYEBROW}>What ships with the planner</span>
          <p className={`${BUILD_CONSEQ} mt-1`}>Same treatment as a sticker pack — the buyer gets more than a bare PDF.</p>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[
            { label: "Hyperlinked contents page", sub: "Every section and month, one tap away", badge: "Included", ok: true },
            { label: "Getting-started guide (PDF)", sub: "Written in your brand voice by Claude", badge: "Included", ok: true },
            { label: "Sticker packs bundled", sub: packIds.length > 0 ? `${packIds.length} pack${packIds.length > 1 ? "s" : ""} attached` : "Attach packs above", badge: "Optional", ok: false },
            { label: "Calendar starter file", sub: "Pre-built events — coming in v2", badge: "v2", ok: false },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-background">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.ok ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {item.ok ? <Check className="w-3 h-3" /> : <span className="text-[9px] font-bold">—</span>}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[12.5px] font-semibold leading-tight">{item.label}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.ok ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{item.badge}</span>
                </div>
                <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ink-friendly B&W export checkbox */}
      <div className="flex items-center gap-2 pt-2 pb-0.5">
        <input
          id="ink-friendly-check"
          type="checkbox"
          checked={inkFriendly || !!einkDevice}
          onChange={e => { setInkFriendly(e.target.checked); if (!e.target.checked) setEinkDeviceAndNotify(null); }}
          className="w-3.5 h-3.5 accent-[#1B2A4A]"
        />
        <label htmlFor="ink-friendly-check" className="text-xs cursor-pointer select-none" style={{ color: "hsl(216 15% 40%)" }}>
          Include ink-friendly B&W version{" "}
          <span className="text-[10px] ml-1" style={{ color: "hsl(216 15% 60%)" }}>
            — line art, no colour fills
          </span>
        </label>
      </div>

      {/* E-ink device profile selector */}
      <div className="flex flex-col gap-1 pb-1 pl-5">
        <p className="text-[11px]" style={{ color: "hsl(216 15% 55%)" }}>
          E-ink device profile{" "}
          <span className="text-[10px]" style={{ color: "hsl(216 15% 68%)" }}>— sets trim, enforces min line weight</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "none",          label: "None",             sub: "" },
            { key: "remarkable",    label: "reMarkable 2/Pro", sub: "447×597 pt" },
            { key: "supernote",     label: "Supernote A5X",    sub: "447×597 pt" },
            { key: "boox",          label: "Boox Note/Tab",    sub: "closest preset" },
            { key: "kindle_scribe", label: "Kindle Scribe",    sub: "links: poor" },
          ].map(({ key, label, sub }) => {
            const active = key === "none" ? !einkDevice : einkDevice === key;
            return (
              <button
                key={key}
                onClick={() => {
                  const next = key === "none" ? null : key;
                  setEinkDeviceAndNotify(next);
                  if (next) setInkFriendly(false); // einkDevice implies inkFriendly
                }}
                className="flex flex-col items-start px-2.5 py-1.5 rounded-lg border text-left transition-colors"
                style={{
                  borderColor: active ? "#1B2A4A" : "hsl(38 30% 85%)",
                  background:  active ? "#1B2A4A" : "white",
                  color:       active ? "white"   : "hsl(216 15% 40%)",
                }}
              >
                <span className="text-[11px] font-semibold">{label}</span>
                {sub && <span className="text-[9px] opacity-70">{sub}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate + Publish */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <button
          onClick={() => generateMut.mutate()}
          disabled={!template.editionId || generateMut.isPending}
          style={{
            cursor: !template.editionId || generateMut.isPending ? "not-allowed" : "pointer",
            background: CHIP_ACTIVE_BG,
          }}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {generateMut.isPending
            ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <Download className="w-4 h-4" />
          }
          {template.drive.pdfFileId ? "Re-generate" : "Generate planner"}
        </button>
        <button
          onClick={() => publishMut.mutate()}
          disabled={!template.drive.pdfFileId || template.status === "published" || publishMut.isPending}
          style={{ cursor: !template.drive.pdfFileId || template.status === "published" ? "not-allowed" : "pointer", borderColor: CLAY, color: CLAY }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold border border-current bg-background disabled:opacity-40 hover:opacity-80 transition-opacity"
        >
          {publishMut.isPending
            ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            : <Globe className="w-4 h-4" />
          }
          {template.status === "published" ? "Published ✓" : "Publish to catalog"}
        </button>
        {!template.editionId && (
          <p className="text-[11.5px] text-muted-foreground">Link an edition before generating</p>
        )}
        {generateMut.isSuccess && <StatusPill label="Saved to Drive" kind="success" />}
        {generateMut.isError   && <StatusPill label="Generation failed" kind="error" />}
        {publishMut.isSuccess  && <StatusPill label="Published" kind="success" />}
      </div>
    </div>
  );
}

// ── EDITIONS mode center ──────────────────────────────────────────────────────

function EditionCreateForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [name,        setName]        = useState("");
  const [tier,        setTier]        = useState("basic");
  const [priceLow,    setPriceLow]    = useState("");
  const [priceHigh,   setPriceHigh]   = useState("");
  const [description, setDescription] = useState("");
  const [drafting,    setDrafting]    = useState(false);

  const createMut = useMutation({
    mutationFn: () => catalogApi.createEdition({
      name: name.trim(), tier,
      description: description.trim() || undefined,
      priceLow:  priceLow  ? parseFloat(priceLow)  : undefined,
      priceHigh: priceHigh ? parseFloat(priceHigh) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editions"] });
      qc.invalidateQueries({ queryKey: ["editions-list-mini"] });
      onDone();
    },
  });

  const draftDescription = async () => {
    if (!name.trim()) return;
    setDrafting(true);
    try {
      const result: AiResult = await aiApi.complete(
        "You are a product copywriter for a digital planner platform. Write a concise, appealing edition description (2–3 sentences). Respond with just the description text.",
        `Edition name: "${name.trim()}". Tier: ${tier}.`,
      );
      setDescription(safeText(result.text).trim());
    } catch { /* ignore */ } finally { setDrafting(false); }
  };

  return (
    <div className="rounded-[16px] border p-6 space-y-5 mb-6" style={{ background: PAPER_TINT }}>
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold text-[15px] text-foreground">New edition</p>
        <button onClick={onCancel} style={{ cursor: "pointer" }}
          className="text-[11.5px] text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted-foreground">Name *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Classic Planner 2027"
          className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40 transition-colors" />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted-foreground">Tier</label>
        <SegmentedControl
          options={[{value:"basic",label:"PDF-only"},{value:"advanced",label:"Live planner"}]}
          value={tier} onChange={setTier}
        />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-muted-foreground">Price from ($)</label>
          <input type="number" value={priceLow} onChange={e => setPriceLow(e.target.value)}
            placeholder="14.99"
            className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40 transition-colors" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-muted-foreground">Price to ($)</label>
          <input type="number" value={priceHigh} onChange={e => setPriceHigh(e.target.value)}
            placeholder="29.99"
            className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40 transition-colors" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11.5px] font-medium text-muted-foreground">Description</label>
          <button onClick={draftDescription} disabled={!name.trim() || drafting}
            style={{ cursor: !name.trim() || drafting ? "not-allowed" : "pointer", background: CLAY }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
            {drafting ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Sparkles className="w-3 h-3" />}
            ✦ Draft with Claude
          </button>
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          rows={3} placeholder="Describe what makes this edition distinctive…"
          className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40 transition-colors resize-none" />
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}
          style={{ cursor: !name.trim() || createMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
          className="px-5 py-2 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity">
          {createMut.isPending ? "Creating…" : "Create edition"}
        </button>
        <p className="text-[11.5px] text-muted-foreground">Starts as draft — publish when ready</p>
      </div>
    </div>
  );
}

function EditionsListInStudio({
  tier, status, productType, onShowCreate, showCreate, onHideCreate,
}: {
  tier: string; status: string; productType: string;
  onShowCreate: () => void; showCreate: boolean; onHideCreate: () => void;
}) {
  const qc = useQueryClient();

  const { data: rawEditions = [], isLoading, error, refetch } = useQuery({
    queryKey: ["editions"],
    queryFn:  () => catalogApi.editions(),
    // staleTime: 30_000 — management list view; users see the full list and a
    // manual refetch button is present, so a short cache is acceptable here.
    staleTime: 30_000,
  });

  const editions = (rawEditions as any[])
    .filter((e: any) => e.status !== "deleted")
    .filter((e: any) => tier        === "all" || e.tier        === tier)
    .filter((e: any) => status      === "all" || e.status      === status)
    .filter((e: any) => productType === "all" || (e.productType ?? "planner") === productType);

  const publishMut = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      catalogApi.updateEdition(id, { status: newStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editions"] });
      qc.invalidateQueries({ queryKey: ["editions-list-mini"] });
    },
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => catalogApi.duplicateEdition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editions"] });
      qc.invalidateQueries({ queryKey: ["editions-list-mini"] });
    },
  });

  const [selectedEditionId, setSelectedEditionId] = useState<string | null>(null);

  if (isLoading) return (
    <div className="space-y-2">
      <ComposePageHeader
        title="Your editions"
        subtitle="Editions define tiers, pricing, and which catalog items buyers can access."
      />
      <SkeletonRows count={5} />
    </div>
  );

  if (error) return (
    <div>
      <ComposePageHeader title="Your editions" subtitle="Editions define tiers, pricing, and which catalog items buyers can access." />
      <ErrorState message="Couldn't load editions" onRetry={() => refetch()} />
    </div>
  );

  return (
    <div>
      <ComposePageHeader
        title="Your editions"
        subtitle="Editions define tiers, pricing, and which catalog items buyers can access."
      />

      {showCreate && <EditionCreateForm onDone={onHideCreate} onCancel={onHideCreate} />}

      {!editions.length && (
        <EmptyState
          icon={<BookOpen className="w-5 h-5 text-muted-foreground" />}
          title={tier !== "all" || status !== "all" ? "No editions match filters" : "No editions yet"}
          description={
            tier !== "all" || status !== "all"
              ? "Adjust the filters in the left rail to see more editions."
              : "Create the first edition to define tiers, pricing, and catalog access."
          }
          action={
            tier === "all" && status === "all"
              ? { label: "+ New edition", onClick: onShowCreate }
              : undefined
          }
        />
      )}

      <div className="space-y-2">
        {editions.map((e: any) => {
          // Derive swatch color from productType or status
          const swatchBg =
            e.productType === "notebook"        ? "#D4E4DA" :
            e.productType === "journal"         ? "#D4D4E8" :
            e.productType === "memory-keeping"  ? "#E8D4D4" :
            "#f5f0ea";
          const isLive = e.status === "live";

          const isSelected = selectedEditionId === e.id;
          return (
            <div key={e.id}>
              <div
                className={`flex items-center gap-4 p-4 rounded-[14px] border bg-card shadow-sm hover:shadow transition-shadow cursor-pointer ${
                  isSelected ? "rounded-b-none border-b-0" : ""
                }`}
                onClick={(ev) => {
                  if ((ev.target as HTMLElement).closest("button, a")) return;
                  setSelectedEditionId(prev => prev === e.id ? null : e.id);
                }}
              >
                {/* Cover swatch */}
                <div
                  className="w-12 rounded-lg flex items-center justify-center shrink-0 border"
                  style={{
                    height: 58,
                    background: swatchBg,
                    borderColor: "rgba(0,0,0,0.06)",
                  }}
                >
                  <BookOpen className="w-4 h-4 text-foreground/30" />
                </div>

                {/* Name + tier + price stacked */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-[13.5px] text-foreground truncate leading-tight">
                    {e.name}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {e.tier && (
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {e.tier === "basic" ? "PDF-only" : "Live planner"}
                      </span>
                    )}
                    {(e.priceLow || e.priceHigh) && (
                      <span className="text-[11px] text-muted-foreground">
                        ${e.priceLow ?? 0}–${e.priceHigh ?? 0}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <StatusPill
                  label={isLive ? "Live" : "Draft"}
                  kind={isLive ? "success" : "neutral"}
                  className="shrink-0"
                />

                {/* Visible action chips */}
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  <ActionChip
                    label={isLive ? "Unpublish" : "Publish"}
                    variant={isLive ? "secondary" : "primary"}
                    icon={isLive ? <EyeOff className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                    disabled={publishMut.isPending}
                    onClick={() => publishMut.mutate({ id: e.id, newStatus: isLive ? "draft" : "live" })}
                  />
                  <ActionChip
                    label="Duplicate"
                    variant="secondary"
                    icon={<Copy className="w-3 h-3" />}
                    disabled={dupMut.isPending && dupMut.variables === e.id}
                    onClick={() => dupMut.mutate(e.id)}
                  />
                  <Link
                    href={`/editions/${e.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border bg-background text-foreground border-border hover:bg-muted transition-colors"
                  >
                    Edit →
                  </Link>
                </div>
              </div>
              {isSelected && (
                <EditionDetailPanel
                  edition={e}
                  onClose={() => setSelectedEditionId(null)}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["editions"] })}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EDITION DETAIL PANEL (inline below row) ────────────────────────────────────

const EDITION_TIERS = [
  { value: "basic",     label: "PDF-only" },
  { value: "live",      label: "Live planner" },
];

const EDITION_DESC_SYSTEM = `You are a product copywriter for Daybook, a premium digital planner platform.
Write a 2-sentence product description for a planner edition. Be specific, warm, and benefit-led.
Respond with just the description text — no quotes, no preamble.`;

const EDITION_PRICE_SYSTEM = `You are a pricing analyst for a digital planner marketplace.
Given an edition tier, suggest a price range in USD.
Respond with ONLY valid JSON: { "low": 9.99, "high": 14.99 }`;

function EditionDetailPanel({ edition, onClose, onSaved }: {
  edition: any; onClose: () => void; onSaved: () => void;
}) {
  const [name,        setName]        = useState<string>(edition.name ?? "");
  const [tier,        setTier]        = useState<string>(edition.tier ?? "basic");
  const [priceLow,    setPriceLow]    = useState<string>(String(edition.priceLow  ?? ""));
  const [priceHigh,   setPriceHigh]   = useState<string>(String(edition.priceHigh ?? ""));
  const [description, setDescription] = useState<string>(edition.description ?? "");
  const [drafting,    setDrafting]    = useState(false);
  const [suggesting,  setSuggesting]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const { toast } = useToast();

  const safeStr = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") return JSON.stringify(v);
    return String(v ?? "");
  };

  const handleDescAi = async () => {
    setDrafting(true);
    try {
      const result = await aiApi.complete(EDITION_DESC_SYSTEM, `Edition name: "${name}". Tier: ${tier}.`);
      setDescription(safeStr(result.text).trim());
    } catch { /* ignore */ } finally { setDrafting(false); }
  };

  const handleSuggestPrice = async () => {
    setSuggesting(true);
    try {
      const result = await aiApi.complete(EDITION_PRICE_SYSTEM, `Tier: ${tier}. Edition name: "${name}".`);
      const parsed = extractJson<{ low?: number; high?: number }>(result.text);
      if (parsed?.low)  setPriceLow(String(parsed.low));
      if (parsed?.high) setPriceHigh(String(parsed.high));
    } catch { /* ignore */ } finally { setSuggesting(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await catalogApi.updateEdition(edition.id, {
        name, tier,
        priceLow:    priceLow    ? parseFloat(priceLow)    : undefined,
        priceHigh:   priceHigh   ? parseFloat(priceHigh)   : undefined,
        description: description || undefined,
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div
      className="rounded-[16px] border border-t-0 rounded-t-none p-5 space-y-5"
      style={{ background: PAPER_TINT, borderColor: "#E7DCCB" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Edition detail</p>
        <button onClick={onClose} style={{ cursor: "pointer" }}
          className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full rounded-[10px] border bg-background px-3.5 py-2 text-[13px] text-foreground outline-none focus:border-foreground/40 transition-colors"
          style={{ borderColor: "#D8D0C6" }}
        />
      </div>

      {/* Tier */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">Tier</label>
        <SegmentedControl
          options={EDITION_TIERS}
          value={tier}
          onChange={setTier}
        />
      </div>

      {/* Price */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">Price range (USD)</label>
          <button
            onClick={handleSuggestPrice}
            disabled={suggesting}
            style={{ cursor: suggesting ? "not-allowed" : "pointer" }}
            className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            <Sparkles className="w-3 h-3" />✦ suggest
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input value={priceLow}  onChange={e => setPriceLow(e.target.value)}
            placeholder="Low"  type="number" step="0.01" min="0"
            className="w-24 rounded-[10px] border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40 transition-colors" style={{ borderColor: "#D8D0C6" }} />
          <span className="text-muted-foreground text-sm">–</span>
          <input value={priceHigh} onChange={e => setPriceHigh(e.target.value)}
            placeholder="High" type="number" step="0.01" min="0"
            className="w-24 rounded-[10px] border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground/40 transition-colors" style={{ borderColor: "#D8D0C6" }} />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">Description</label>
          <button
            onClick={handleDescAi}
            disabled={drafting}
            style={{ cursor: drafting ? "not-allowed" : "pointer" }}
            className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            {drafting ? <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Sparkles className="w-3 h-3" />}
            ✦ Ask Claude
          </button>
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Short product description shown to buyers on the catalog page…"
          className="w-full rounded-[10px] border bg-background px-3.5 py-2.5 text-[13px] placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors resize-none"
          style={{ borderColor: "#D8D0C6" }}
        />
      </div>

      {/* Three attachment cards */}
      <div className="space-y-2">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Attachments</p>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "THEMES",               icon: "🎨", href: `/editions/${edition.id}/themes` },
            { label: "STICKER PACKS",         icon: "✦",  href: `/editions/${edition.id}/stickers` },
            { label: "INSERTS & PRODUCTS",    icon: "📄", href: `/editions/${edition.id}/inserts` },
          ].map(card => (
            <a
              key={card.label}
              href={card.href}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-[12px] border text-center hover:bg-muted/40 transition-colors"
              style={{ borderColor: "#E7DCCB" }}
            >
              <span className="text-lg leading-none">{card.icon}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground leading-tight">{card.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ cursor: saving ? "not-allowed" : "pointer", background: saved ? "#22A559" : CLAY }}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-[12.5px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-all"
        >
          {saving ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> : null}
          {saved ? "✓ Saved" : "Save changes"}
        </button>
        <Link href={`/editions/${edition.id}`}
          className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          Open full editor →
        </Link>
      </div>
    </div>
  );
}

// ── INSERTS & WIDGETS mode center ─────────────────────────────────────────────

const INSERT_EXPLANATIONS: Record<string, { text: string; disambig: string }> = {
  insert: {
    text: "A full page that slots into the planner — gets a tab, a contents entry, and its own internal links. Daily layouts, monthly overviews, and tab dividers live here.",
    disambig: "Not to be confused with stickers — washi tape, florals, and checkboxes are small placed elements and live in the Sticker Studio.",
  },
  widget: {
    text: "A compact overlay tracker placed on top of a page — habit logs, water counters, mood wheels. The widget doesn't take up a full page.",
    disambig: "Widgets are anchored to a specific page; inserts are standalone pages with their own navigation.",
  },
};

function InsertsCompose() {
  const [kind,          setKind]          = useState("insert");
  const [selectedId,    setSelectedId]    = useState("");
  const [prompt,        setPrompt]        = useState("");
  const [palette,       setPalette]       = useState("sage");
  const [orientation,   setOrientation]   = useState("portrait");
  const [askLoading,    setAskLoading]    = useState(false);

  const { data: rawInserts = [], isLoading } = useQuery({
    queryKey: ["inserts-library"],
    queryFn:  () => catalogApi.inserts(),
    // staleTime: 0 — compose picker; deleted inserts must not appear as selectable
    // library items after a platform admin removes them in another tab.
    staleTime: 0,
  });

  const libraryItems: LibraryItem[] = (rawInserts as any[]).map((ins: any) => ({
    id: ins.id,
    name: ins.name ?? ins.id,
    descriptor: ins.type ?? "Insert",
    thumbBg: "#EBF0EC",
    thumbIcon: <Layers className="w-5 h-5 text-[#7C9E8A]/70" />,
  }));

  const expl = INSERT_EXPLANATIONS[kind];

  const handleAsk = async () => {
    if (!prompt.trim()) return;
    setAskLoading(true);
    try {
      await aiApi.complete(
        `You are a planner insert designer. Suggest a specific SVG layout for a ${kind} described as: "${prompt}". Respond with a brief layout specification (3-5 bullet points).`,
        prompt,
      );
    } catch { /* handled in dock AI */ } finally { setAskLoading(false); }
  };

  return (
    <div style={{ minWidth: 0 }}>
      <ComposePageHeader
        title="Inserts & widgets"
        subtitle="Full-page layouts and compact overlay trackers that slot into your planner."
        aiLabel="✦ Draw it with Claude"
        onAi={() => {}}
      />

      <DecisionCard
        question="What are you making?"
        options={[
          { value: "insert", label: "Insert", sub: "whole page" },
          { value: "widget", label: "Widget", sub: "placed tracker" },
        ]}
        value={kind}
        onChange={setKind}
        explanation={expl.text}
        disambiguation={expl.disambig}
      />

      <LibraryRow
        items={libraryItems}
        selected={selectedId}
        onSelect={setSelectedId}
        onNew={() => setSelectedId("")}
        loading={isLoading}
      />

      <BuildPanel
        eyebrow={`Build — ${kind === "insert" ? "daily layout" : "habit widget"}`}
        prompt={prompt}
        onPromptChange={setPrompt}
        onAskClaude={handleAsk}
        askLoading={askLoading}
      >
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Orientation</p>
            <SegmentedControl
              options={[{value:"portrait",label:"Portrait"},{value:"landscape",label:"Landscape"}]}
              value={orientation} onChange={setOrientation}
            />
          </div>
          <PaletteRow value={palette} onChange={setPalette} />
        </div>
      </BuildPanel>
    </div>
  );
}

// ── COVER mode center ─────────────────────────────────────────────────────────

const COVER_TEXTURES = [
  { value: "leather", label: "Leather" },
  { value: "linen",   label: "Linen" },
  { value: "kraft",   label: "Kraft" },
  { value: "marble",  label: "Marble" },
];

function CoverCompose() {
  const [style,   setStyle]   = useState("texture");
  const [texture, setTexture] = useState("leather");
  const [palette, setPalette] = useState("sand");
  const [finish,  setFinish]  = useState<string[]>([]);
  const [text,    setText]    = useState("");

  const toggleFinish = (v: string) =>
    setFinish(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  // Palette swatch for the live preview
  const previewPalette = PALETTES.find(p => p.id === palette) ?? PALETTES[3];

  return (
    <div style={{ minWidth: 0 }}>
      <ComposePageHeader
        title="Cover designer"
        subtitle="Create front and back cover artwork — it also exports at listing-image size for your shop thumbnail."
        aiLabel="✦ Design it with Claude"
        onAi={() => {}}
      />

      {/* Cover style decision */}
      <div className="rounded-[16px] border p-5 mb-6 space-y-3" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Cover style</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "texture",   label: "Texture" },
            { value: "solid",     label: "Solid" },
            { value: "art",       label: "Your art" },
            { value: "blueprint", label: "Blueprint" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={style === o.value} onClick={() => setStyle(o.value)} />
          ))}
        </div>

        {/* Texture sub-chips */}
        {style === "texture" && (
          <div className="pt-1 space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Texture material</p>
            <div className="flex gap-2 flex-wrap">
              {COVER_TEXTURES.map(t => (
                <ComposeChip key={t.value} label={t.label} active={texture === t.value} onClick={() => setTexture(t.value)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Two-column: controls + live preview */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="space-y-5 min-w-0">
          {/* Palette */}
          <div className="rounded-[16px] border p-5" style={{ background: PAPER_TINT }}>
            <PaletteRow value={palette} onChange={setPalette} />
          </div>

          {/* Finish */}
          <div className="rounded-[16px] border p-5 space-y-3" style={{ background: PAPER_TINT }}>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Finish</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: "spine-shadow",  label: "Spine shadow" },
                { value: "foil-lettering", label: "Foil lettering" },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => toggleFinish(f.value)}
                  style={{
                    cursor: "pointer",
                    ...(finish.includes(f.value) ? { background: CLAY } : {}),
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
                    finish.includes(f.value)
                      ? "text-white border-[#C87560]"
                      : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cover text */}
          <div className="rounded-[16px] border p-5 space-y-2" style={{ background: PAPER_TINT }}>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Cover text</p>
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="e.g. My 2027 Planner"
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground/40 transition-colors"
            />
          </div>
        </div>

        {/* Live preview at realistic proportions (A5 ≈ 148×210mm) */}
        <div className="shrink-0 space-y-2">
          <div
            className="rounded-[12px] border shadow-sm flex flex-col items-center justify-center overflow-hidden"
            style={{
              width: 140,
              height: 198,
              background: previewPalette.colors[0],
              borderColor: "rgba(0,0,0,0.08)",
            }}
          >
            {/* Texture / style visual cue */}
            <div
              className="w-full h-full flex flex-col items-center justify-end pb-6"
              style={{ background: `linear-gradient(160deg, ${previewPalette.colors[0]}, ${previewPalette.colors[1]})` }}
            >
              {text && (
                <p
                  className="text-center font-display font-semibold text-[11px] px-3 leading-tight"
                  style={{ color: previewPalette.colors[2] === "#EEF1F7" ? "#1B2A4A" : "#fff" }}
                >
                  {text}
                </p>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center max-w-[140px] leading-tight">
            Exported at listing-image size too, so it doubles as your shop thumbnail.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── THEME mode center ─────────────────────────────────────────────────────────

function ThemeCompose() {
  const [themeStyle, setThemeStyle] = useState("palette");
  const [selectedId, setSelectedId] = useState("");
  const [prompt,     setPrompt]     = useState("");
  const [askLoading, setAskLoading] = useState(false);

  const { data: rawThemes = [], isLoading } = useQuery({
    queryKey: ["themes-compose"],
    queryFn:  () => catalogApi.themes(),
    // staleTime: 0 — compose picker; deleted themes must not appear as selectable
    // library items when a platform admin removes one in another tab.
    staleTime: 0,
  });

  const themes = (rawThemes as any[]).filter(
    (t: any) => t.origin !== "owned" && !String(t.name ?? "").includes("— Auto palette"),
  );

  const libraryItems: LibraryItem[] = themes.map((t: any) => ({
    id: t.id,
    name: t.name ?? t.id,
    descriptor: "Colour palette",
    thumbBg: t.colors?.[0] ?? "#E8EDE9",
  }));

  const THEME_STYLE_EXPLANATIONS: Record<string, string> = {
    palette:    "A cohesive 6-colour set — primary, secondary, accent, background, surface, and text — applied across all pages.",
    pattern:    "A repeating tile or motif used as subtle page texture and divider backgrounds.",
    typography: "A font pairing (heading + body) with size scale and line-height tokens.",
  };

  return (
    <div style={{ minWidth: 0 }}>
      <ComposePageHeader
        title="Theme studio"
        subtitle="Design a cohesive colour palette, pattern set, or typography pairing for your planner."
        aiLabel="✦ Design it with Claude"
        onAi={() => {}}
      />

      <DecisionCard
        question="What are you creating?"
        options={[
          { value: "palette",    label: "Colour palette" },
          { value: "pattern",    label: "Pattern set" },
          { value: "typography", label: "Typography combo" },
        ]}
        value={themeStyle}
        onChange={setThemeStyle}
        explanation={THEME_STYLE_EXPLANATIONS[themeStyle]}
      />

      <LibraryRow
        items={libraryItems}
        selected={selectedId}
        onSelect={setSelectedId}
        onNew={() => setSelectedId("")}
        loading={isLoading}
      />

      <BuildPanel
        eyebrow={`Build — ${themeStyle} design`}
        prompt={prompt}
        onPromptChange={setPrompt}
        onAskClaude={async () => { setAskLoading(true); try { await aiApi.complete("You are a colour system designer.", prompt); } catch {} finally { setAskLoading(false); } }}
        askLoading={askLoading}
      >
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Colour temperature</p>
            <SegmentedControl
              options={[{value:"warm",label:"Warm"},{value:"neutral",label:"Neutral"},{value:"cool",label:"Cool"}]}
              value="neutral" onChange={() => {}}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Mood</p>
            <div className="flex gap-1.5 flex-wrap">
              {["Minimal","Cosy","Bold","Romantic","Earthy","Dreamy"].map(m => (
                <ComposeChip key={m} label={m} active={false} onClick={() => {}} />
              ))}
            </div>
          </div>
        </div>
      </BuildPanel>
    </div>
  );
}

// ── DIVIDERS & TABS mode center ───────────────────────────────────────────────

const DIVIDER_EXPLANATIONS: Record<string, { text: string }> = {
  monthly:  { text: "A printed flag or notch tab on the page edge, one per month, used for navigation in physical/printed formats." },
  section:  { text: "A full-page divider with decorative art and a section title — sits between major planner sections." },
  index:    { text: "A corner or edge index tab for quick-flip navigation in digital PDFs; links to pages via internal anchors." },
  bookmark: { text: "A printable ribbon or clip bookmark with the planner name, year, and a decorative motif." },
};

function DividersCompose() {
  const [kind,       setKind]       = useState("monthly");
  const [selectedId, setSelectedId] = useState("");
  const [prompt,     setPrompt]     = useState("");
  const [palette,    setPalette]    = useState("sage");
  const [askLoading, setAskLoading] = useState(false);

  const mockItems: LibraryItem[] = [
    { id: "dt-1", name: "Side tab A5",    descriptor: "Monthly flag",  thumbBg: "#D4E4DA", thumbIcon: <Layers className="w-5 h-5 text-[#7C9E8A]/60" /> },
    { id: "dt-2", name: "Corner index",   descriptor: "Edge index",    thumbBg: "#D4D4E8", thumbIcon: <Layers className="w-5 h-5 text-[#6B6BA0]/60" /> },
    { id: "dt-3", name: "Section art",    descriptor: "Section divider",thumbBg: "#E8D4C8", thumbIcon: <Layers className="w-5 h-5 text-[#A0856A]/60" /> },
  ];

  return (
    <div style={{ minWidth: 0 }}>
      <ComposePageHeader
        title="Dividers & tabs"
        subtitle="Design tab rails, section dividers, corner indices, and printable bookmarks."
        aiLabel="✦ Design it with Claude"
        onAi={() => {}}
      />

      <DecisionCard
        question="What type of divider?"
        options={[
          { value: "monthly",  label: "Monthly tabs" },
          { value: "section",  label: "Section dividers" },
          { value: "index",    label: "Index tab" },
          { value: "bookmark", label: "Bookmark" },
        ]}
        value={kind}
        onChange={setKind}
        explanation={DIVIDER_EXPLANATIONS[kind].text}
      />

      <LibraryRow
        items={mockItems}
        selected={selectedId}
        onSelect={setSelectedId}
        onNew={() => setSelectedId("")}
      />

      <BuildPanel
        eyebrow={`Build — ${kind.replace("-", " ")} design`}
        prompt={prompt}
        onPromptChange={setPrompt}
        onAskClaude={async () => { setAskLoading(true); try { await aiApi.complete("You are a planner tab designer.", prompt); } catch {} finally { setAskLoading(false); } }}
        askLoading={askLoading}
      >
        <div className="space-y-3 pt-1">
          <PaletteRow value={palette} onChange={setPalette} />
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Label style</p>
            <SegmentedControl
              options={[{value:"text",label:"Text only"},{value:"icon",label:"Icon + text"},{value:"icon-only",label:"Icon only"}]}
              value="text" onChange={() => {}}
            />
          </div>
        </div>
      </BuildPanel>
    </div>
  );
}

// ── PAPER & BINDING mode center ───────────────────────────────────────────────

const FINISH_HEX: Record<string, string> = {
  gold: "#D4AF37", "rose-gold": "#B76E79", silver: "#A8A9AD",
  copper: "#B87333", bronze: "#8C7853", white: "#F0F0EE", "matte-black": "#2C2C2C",
};
const HARDWARE_OPTIONS = SPINE_FINISHES.map(({ value, label }) => ({
  value, label, hex: FINISH_HEX[value],
}));

const PAPER_COLOUR_OPTIONS = [
  { value: "white",  label: "White",  hex: "#FAFAFA" },
  { value: "cream",  label: "Cream",  hex: "#FDF6E3" },
  { value: "warm",   label: "Warm",   hex: "#F7F0E4" },
  { value: "stone",  label: "Stone",  hex: "#EDE8DF" },
  { value: "blush",  label: "Blush",  hex: "#FBF0F0" },
  { value: "sage",   label: "Sage",   hex: "#EDF2EE" },
];

interface PaperComposeProps {
  /** Binding type from saved draft — restored on reopen. */
  initialBindingType?:   string;
  /** Binding finish/hardware from saved draft. */
  initialBindingFinish?: string;
  /** Paper colour key from saved draft. */
  initialPaperColour?:   string;
  initialSpineStyleId?:  string;
  /** Called immediately when binding type changes so the parent can persist. */
  onBindingTypeChange?:   (value: string) => void;
  /** Called immediately when binding finish changes. */
  onBindingFinishChange?: (value: string) => void;
  /** Called immediately when paper colour changes. */
  onPaperColourChange?:   (value: string) => void;
  onSpineStyleChange?:    (value: string) => void;
}

function PaperCompose({
  initialBindingType   = "coil",
  initialBindingFinish = "gold",
  initialPaperColour   = "white",
  initialSpineStyleId  = "",
  onBindingTypeChange,
  onBindingFinishChange,
  onPaperColourChange,
  onSpineStyleChange,
}: PaperComposeProps) {
  const [renderStyle, setRenderStyle] = useState("realistic");
  const [size,        setSize]        = useState("a5");
  const [binding,     setBinding]     = useState(initialBindingType);
  const [hardware,    setHardware]    = useState(initialBindingFinish);
  const [paperColour, setPaperColour] = useState(initialPaperColour);
  const [spineStyleId, setSpineStyleId] = useState(initialSpineStyleId);
  const { data: spineStyles = [] } = useQuery({
    queryKey: ["spine-styles"],
    queryFn: () => catalogApi.spineStyles(),
    staleTime: 0,
  });
  const matchingSpineStyles = spineStyles.filter(
    style => style.bindingType === binding && style.finish === hardware,
  );
  const selectedSpine = matchingSpineStyles.find(s => s.id === spineStyleId);
  const [weight,      setWeight]      = useState("80");
  const [finish,      setFinish]      = useState("matte");

  // Re-sync when parent restores from a different template
  const prevInitRef = useRef({ initialBindingType, initialBindingFinish, initialPaperColour, initialSpineStyleId });
  useEffect(() => {
    const prev = prevInitRef.current;
    if (prev.initialBindingType   !== initialBindingType)   setBinding(initialBindingType);
    if (prev.initialBindingFinish !== initialBindingFinish) setHardware(initialBindingFinish);
    if (prev.initialPaperColour   !== initialPaperColour)   setPaperColour(initialPaperColour);
    if (prev.initialSpineStyleId  !== initialSpineStyleId)  setSpineStyleId(initialSpineStyleId);
    prevInitRef.current = { initialBindingType, initialBindingFinish, initialPaperColour, initialSpineStyleId };
  }, [initialBindingType, initialBindingFinish, initialPaperColour, initialSpineStyleId]);

  const SIZE_NOTES: Record<string, string> = {
    a5:           "148 × 210 mm — most popular globally for printed planners.",
    b6:           "125 × 176 mm — compact and handbag-friendly.",
    personal:     "95 × 171 mm — classic Filofax-style ring binder size.",
    "half-letter":"5.5 × 8.5 in — standard US half-sheet.",
    letter:       "8.5 × 11 in — full US letter, good for desk planners.",
    ipad:         "2048 × 1536 px (4:3) — digital-only, optimised for GoodNotes on iPad.",
  };

  const BINDING_DESCRIPTIONS: Record<string, string> = {
    coil:        "Plastic or metal coil through punched holes — lies flat when open.",
    "twin-loop": "Double-wire O binding — professional finish, very flat opening.",
    disc:        "Removable disc system (Arc, Atoma) — pages can be rearranged.",
    "3-ring":    "Classic binder rings — works with standard paper punches.",
    none:        "No binding artwork rendered — pages output as flat PDF.",
  };

  const bindingHasHardware = SPINE_BINDING_TYPES.includes(binding as any);
  const paperHex = PAPER_COLOUR_OPTIONS.find(p => p.value === paperColour)?.hex ?? "#FAFAFA";

  return (
    <div style={{ minWidth: 0 }}>
      <ComposePageHeader
        title="Paper & binding"
        subtitle="Set render style, page size, binding type, and hardware finish for this planner build."
      />

      {/* RENDER STYLE */}
      <div className="rounded-[16px] border p-5 mb-6 space-y-3" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Render style</p>
        <div className="flex gap-3">
          {[
            { value: "realistic", label: "Realistic", desc: "Ring art, grain & gutter shading — larger file size" },
            { value: "flat",      label: "Flat",       desc: "Clean, minimal — smaller file size" },
          ].map(o => (
            <button
              key={o.value}
              onClick={() => setRenderStyle(o.value)}
              style={{
                cursor: "pointer", flex: 1,
                background: renderStyle === o.value ? "#FEF0ED" : PAPER_TINT,
                borderColor: renderStyle === o.value ? CLAY : "#E7DCCB",
              }}
              className="rounded-[14px] border p-4 text-left transition-colors"
            >
              <p className="text-[13px] font-semibold text-foreground">{o.label}</p>
              <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{o.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* SIZE */}
      <div className="rounded-[16px] border p-5 mb-6 space-y-3" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Page size</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "a5",           label: "A5" },
            { value: "b6",           label: "B6" },
            { value: "personal",     label: "Personal" },
            { value: "half-letter",  label: "Half letter" },
            { value: "letter",       label: "Letter" },
            { value: "ipad",         label: "iPad 4:3" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={size === o.value} onClick={() => setSize(o.value)} />
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">{SIZE_NOTES[size]}</p>
      </div>

      {/* BINDING TYPE */}
      <div className="rounded-[16px] border p-5 mb-6 space-y-3" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Binding type</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "coil",       label: "Coil" },
            { value: "twin-loop",  label: "Twin loop" },
            { value: "disc",       label: "Disc" },
            { value: "3-ring",     label: "3-ring" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={binding === o.value} onClick={() => {
              setBinding(o.value);
              onBindingTypeChange?.(o.value);
              const selected = spineStyles.find(style => style.id === spineStyleId);
              if (selected && (selected.bindingType !== o.value || selected.finish !== hardware)) {
                setSpineStyleId("");
                onSpineStyleChange?.("");
              }
            }} />
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">{BINDING_DESCRIPTIONS[binding]}</p>
      </div>

      {/* CATALOG SPINE ART */}
      <div className="rounded-[16px] border p-5 mb-6 space-y-3" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Spine / ring artwork</p>
        <div className="grid grid-cols-2 gap-3">
          {[{ id: "", name: "None", assetRef: "", orientation: "vertical", bindingType: binding, finish: hardware }, ...matchingSpineStyles].map(style => {
            const active = spineStyleId === style.id;
            return (
              <button
                key={style.id || "none"}
                onClick={() => { setSpineStyleId(style.id); onSpineStyleChange?.(style.id); }}
                className="rounded-[12px] border p-3 text-left"
                style={{ cursor: "pointer", borderColor: active ? CLAY : "#E7DCCB", background: active ? "#FEF0ED" : PAPER_TINT }}
              >
                {style.assetRef ? (
                  <div className="h-20 rounded-md overflow-hidden bg-white mb-2 flex items-center justify-center">
                    <img src={style.assetRef} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : <div className="h-20 rounded-md border border-dashed mb-2 flex items-center justify-center text-xs text-muted-foreground">No artwork</div>}
                <p className="text-[12.5px] font-semibold">{style.name}</p>
                <p className="text-[10.5px] text-muted-foreground capitalize">{style.id ? style.orientation : "flat pages"}</p>
              </button>
            );
          })}
        </div>
        {matchingSpineStyles.length === 0 && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
            No {binding.replace("-", " ")} in {spineFinishLabel(hardware).toLowerCase()} yet. Choose None or add matching artwork to the catalog.
          </p>
        )}
        <p className="text-[11.5px] text-muted-foreground">Vertical assets render on the left edge. Horizontal assets render on the top edge.</p>
      </div>

      {/* HARDWARE ART & FINISH — chip row with colour dot + full label, only when binding has hardware */}
      {bindingHasHardware && (
        <div className="rounded-[16px] border p-5 mb-6 space-y-3" style={{ background: PAPER_TINT }}>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Hardware art & finish</p>
          <div className="flex gap-2 flex-wrap">
            {HARDWARE_OPTIONS.map(o => {
              const active = hardware === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => {
                    setHardware(o.value);
                    onBindingFinishChange?.(o.value);
                    const selected = spineStyles.find(style => style.id === spineStyleId);
                    if (selected && (selected.bindingType !== binding || selected.finish !== o.value)) {
                      setSpineStyleId("");
                      onSpineStyleChange?.("");
                    }
                  }}
                  style={{
                    cursor: "pointer",
                    background: active ? "#FEF0ED" : PAPER_TINT,
                    borderColor: active ? CLAY : "#E7DCCB",
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors"
                >
                  <span
                    className="rounded-full shrink-0 border"
                    style={{ width: 14, height: 14, background: o.hex, borderColor: "rgba(0,0,0,0.18)" }}
                  />
                  <span className="text-[12.5px] font-medium" style={{ color: active ? CLAY : "inherit", whiteSpace: "nowrap" }}>
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Ring colour, clasp, and hinge art rendered at print resolution. Metallic finishes include a specular highlight layer.
          </p>
        </div>
      )}

      {/* PAPER COLOUR + WEIGHT */}
      <div className="rounded-[16px] border p-5 mb-6 space-y-4" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Paper</p>
        {/* Colour swatches */}
        <div className="flex gap-2 flex-wrap">
          {PAPER_COLOUR_OPTIONS.map(o => {
            const active = paperColour === o.value;
            return (
              <button
                key={o.value}
                onClick={() => { setPaperColour(o.value); onPaperColourChange?.(o.value); }}
                style={{
                  cursor: "pointer",
                  background: active ? "#FEF0ED" : PAPER_TINT,
                  borderColor: active ? CLAY : "#E7DCCB",
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors"
              >
                <span
                  className="rounded-full shrink-0 border"
                  style={{ width: 14, height: 14, background: o.hex, borderColor: "rgba(0,0,0,0.15)" }}
                />
                <span className="text-[12.5px] font-medium" style={{ color: active ? CLAY : "inherit" }}>{o.label}</span>
              </button>
            );
          })}
        </div>
        {/* Weight chips */}
        <div>
          <p className="text-[10.5px] font-medium text-muted-foreground mb-2">Weight</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: "60",  label: "60 gsm · Light" },
              { value: "80",  label: "80 gsm · Standard" },
              { value: "100", label: "100 gsm · Premium" },
              { value: "120", label: "120 gsm · Heavy" },
            ].map(o => (
              <ComposeChip key={o.value} label={o.label} active={weight === o.value} onClick={() => setWeight(o.value)} />
            ))}
          </div>
        </div>
      </div>

      {/* COVER LAMINATION FINISH */}
      <div className="rounded-[16px] border p-5 mb-6 space-y-3" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Cover lamination finish</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "matte",      label: "Matte" },
            { value: "gloss",      label: "Gloss" },
            { value: "soft-touch", label: "Soft touch" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={finish === o.value} onClick={() => setFinish(o.value)} />
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {finish === "matte"      ? "Low-sheen professional finish. Most popular for planners." :
           finish === "gloss"      ? "High-shine coating that makes colours pop. Fingerprint-prone." :
                                    "Velvety texture that feels premium in-hand. Slightly higher cost."}
        </p>
      </div>

      {/* PAGE PREVIEW */}
      <div className="rounded-[16px] border p-5 space-y-3" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Vertical page · {size.toUpperCase()}{bindingHasHardware ? ` · ${binding.replace("-", " ")} binding` : ""}
        </p>
        <div className="flex justify-center">
          {/* Simulated page at book proportions */}
          <div style={{ position: "relative", width: 160, height: 226, borderRadius: 4, overflow: "hidden",
            background: paperHex, border: "1.5px solid #D0C8BE" }}>
            {/* Left-edge binding strip */}
            {selectedSpine?.assetRef && (
              <img
                src={selectedSpine.assetRef}
                alt=""
                style={selectedSpine.orientation === "horizontal"
                  ? { position: "absolute", left: 0, top: 0, width: "100%", height: 22, objectFit: "cover", objectPosition: "left top" }
                  : { position: "absolute", left: 0, top: 0, width: 22, height: "100%", objectFit: "cover", objectPosition: "left bottom" }}
              />
            )}
            {/* Page rules */}
            <div style={{ marginLeft: selectedSpine?.orientation === "vertical" ? 30 : 12, marginRight: 12, marginTop: selectedSpine?.orientation === "horizontal" ? 30 : 16 }}>
              <div style={{ width: 55, height: 7, background: "#D8D0C6", borderRadius: 2, marginBottom: 14, opacity: 0.7 }} />
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} style={{
                  height: 1, background: "#E7DCCB",
                  marginBottom: i % 4 === 3 ? 13 : 9, opacity: 0.8,
                }} />
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground text-center">
          Vertical page · {bindingHasHardware ? `left-edge ${binding.replace("-", " ")}` : "no binding"} · {size.toUpperCase()}
        </p>
      </div>
    </div>
  );
}

// ── QUALITY CHECK mode center ─────────────────────────────────────────────────

function QualityCompose() {
  const checks = [
    { id: "bleed",  label: "Bleed & safe zone",  desc: "3mm bleed on all sides; no live content within 5mm of trim." },
    { id: "dpi",    label: "Image resolution",    desc: "All raster images ≥ 300 DPI at print size." },
    { id: "colour", label: "Colour space",        desc: "Document is CMYK or PDF/X-1a for offset; RGB for POD." },
    { id: "fonts",  label: "Font embedding",      desc: "All fonts fully embedded or outlined; no system fonts." },
    { id: "links",  label: "Internal links",      desc: "All TOC entries and tab links resolve to existing page targets." },
  ];

  return (
    <div style={{ minWidth: 0 }}>
      <ComposePageHeader
        title="Quality check"
        subtitle="Run automated print-readiness checks before sending to print-on-demand or listing as a digital download."
      />

      <div className="rounded-[16px] border p-5 mb-6 space-y-1" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Checks that will run
        </p>
        {checks.map(c => (
          <div key={c.id} className="flex items-start gap-3 py-2.5 border-b last:border-0">
            <div className="w-4 h-4 rounded-full border-2 border-border mt-0.5 shrink-0" />
            <div className="space-y-0.5 flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-foreground">{c.label}</p>
              <p className="text-[12px] text-muted-foreground">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        style={{ cursor: "pointer", background: CHIP_ACTIVE_BG, color: "#fff" }}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold hover:opacity-90 transition-opacity"
      >
        <Sparkles className="w-4 h-4" />
        Run all checks
      </button>
    </div>
  );
}

// ── Editions-mode filter left rail ────────────────────────────────────────────

function EditionsFilterSection({
  tier, setTier, status, setStatus, productType, setProductType,
}: {
  tier: string; setTier: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  productType: string; setProductType: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel>Product type</SectionLabel>
        <ChipRow
          options={[
            { value:"all",label:"All" },
            { value:"planner",label:"Planner" },
            { value:"notebook",label:"Notebook" },
            { value:"journal",label:"Journal" },
            { value:"memory-keeping",label:"Memory" },
          ]}
          value={productType} onChange={setProductType}
        />
      </div>
      <div className="space-y-2">
        <SectionLabel>Tier</SectionLabel>
        <ChipRow
          options={[
            { value:"all",label:"All" },
            { value:"basic",label:"PDF-only" },
            { value:"advanced",label:"Live" },
          ]}
          value={tier} onChange={setTier}
        />
      </div>
      <div className="space-y-2">
        <SectionLabel>Status</SectionLabel>
        <ChipRow
          options={[
            { value:"all",label:"All" },
            { value:"draft",label:"Draft" },
            { value:"live",label:"Live" },
          ]}
          value={status} onChange={setStatus}
        />
      </div>
    </div>
  );
}

// ── Main hub ──────────────────────────────────────────────────────────────────

export default function PlannerStudioHub() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params    = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode      = (params.get("mode") ?? "build") as ModeId;

  const setMode = (id: string) => navigate(`/studios/planner?mode=${id}`);

  // ── Platform template state ─────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  /** Lifted from BuildCenter so PdfPreviewDock can re-render when device changes. */
  const [previewEinkDevice, setPreviewEinkDevice] = useState<string | null>(null);

  const { data: platformPlanners = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["platform-planners"],
    queryFn:  () => platformPlannersApi.list(),
    // staleTime: 0 — always re-fetch on mount so a deleted template never lingers
    // in the rail after SPA navigation or tab-switch.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const selectedTemplate = (platformPlanners as PlatformPlannerConfig[]).find(
    t => t.id === selectedTemplateId,
  ) ?? null;

  const handleTemplateUpdated = useCallback((t: PlatformPlannerConfig) => {
    setSelectedTemplateId(t.id);
  }, []);
  const handleTemplateCreated = useCallback((t: PlatformPlannerConfig) => {
    setSelectedTemplateId(t.id);
  }, []);

  // ── Paper & binding state — persisted via PaperCompose callbacks ────────────
  const qcHub = useQueryClient();
  const [paperBindingType,   setPaperBindingType]   = useState("coil");
  const [paperBindingFinish, setPaperBindingFinish] = useState("gold");
  const [paperPaperColour,   setPaperPaperColour]   = useState("white");
  const [paperSpineStyleId,  setPaperSpineStyleId]  = useState("");

  // Sync paper state whenever the selected template changes
  useEffect(() => {
    if (!selectedTemplate) return;
    const st = selectedTemplate.style as any;
    setPaperBindingType(  (st.binding as any)?.type   ?? "coil");
    setPaperBindingFinish((st.binding as any)?.finish  ?? "gold");
    setPaperPaperColour(  st.paperColour               ?? "white");
    setPaperSpineStyleId( st.spineStyleId              ?? "");
  }, [selectedTemplate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const paperStyleMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      selectedTemplate
        ? platformPlannersApi.patch(selectedTemplate.id, { style: patch as any })
        : Promise.reject(new Error("No template selected")),
    onSuccess: (t: PlatformPlannerConfig) => {
      qcHub.invalidateQueries({ queryKey: ["platform-planners"] });
      handleTemplateUpdated(t);
    },
  });

  const handleBindingTypeChange   = (v: string) => {
    setPaperBindingType(v);
    paperStyleMut.mutate({ binding: { type: v, finish: paperBindingFinish } });
  };
  const handleBindingFinishChange = (v: string) => {
    setPaperBindingFinish(v);
    paperStyleMut.mutate({ binding: { type: paperBindingType, finish: v } });
  };
  const handlePaperColourChange   = (v: string) => {
    setPaperPaperColour(v);
    paperStyleMut.mutate({ paperColour: v });
  };
  const handleSpineStyleChange = (v: string) => {
    setPaperSpineStyleId(v);
    paperStyleMut.mutate({ spineStyleId: v || null });
  };

  // Editions filters
  const [editionTier,        setEditionTier]        = useState("all");
  const [editionStatus,      setEditionStatus]      = useState("all");
  const [editionProductType, setEditionProductType] = useState(params.get("productType") ?? "all");
  const [showCreate,         setShowCreate]         = useState(false);

  // ── Mode gating — planner-only modes hidden for non-planner product types ──
  const PLANNER_ONLY = new Set<ModeId>(["build", "paper"]);
  const _productType = selectedTemplate?.productType ?? "planner";
  const visibleModes = (_productType && _productType !== "planner")
    ? MODES.filter(m => !PLANNER_ONLY.has(m.id))
    : [...MODES];

  // validMode must be one of the visible modes; fall back to first visible
  const validMode: ModeId = visibleModes.some(m => m.id === mode)
    ? mode as ModeId
    : (visibleModes[0]?.id ?? "editions") as ModeId;

  // ── Left rail ────────────────────────────────────────────────────────────────
  const leftRail = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto" style={THIN_SCROLL}>
        <PlatformTemplateRail
          templates={platformPlanners as PlatformPlannerConfig[]}
          selectedId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
          onNew={() => { setSelectedTemplateId(null); setMode("build"); }}
          loading={templatesLoading}
        />
      </div>
      {/* Mode-specific filter section for editions */}
      {validMode === "editions" && (
        <div className="border-t p-4 space-y-4" style={{ background: PAPER_TINT }}>
          <EditionsFilterSection
            tier={editionTier}        setTier={setEditionTier}
            status={editionStatus}    setStatus={setEditionStatus}
            productType={editionProductType} setProductType={setEditionProductType}
          />
        </div>
      )}
    </div>
  );

  // ── AI drawer context ────────────────────────────────────────────────────────
  // Register surface-specific prompts with the global AI drawer so the ✦ AI
  // button in the top bar opens with the right context for each studio mode.
  const { setAiContext, clearAiContext } = useAiDrawer();
  const _clearRef = useRef(clearAiContext);
  _clearRef.current = clearAiContext;
  // Restore generic prompts when the studio unmounts
  useEffect(() => () => _clearRef.current(), []);
  // Update text context whenever the active mode changes
  useEffect(() => {
    const systemPrompt =
      validMode === "build"
        ? "You are a planner design assistant. Help the user plan their planner structure, section order, and content balance."
        : validMode === "editions"
        ? "You are a planner product expert. Help the user define edition tiers, pricing strategy, and catalog item selection."
        : validMode === "inserts"
        ? "You are a planner insert designer. Suggest specific SVG layouts, content hierarchies, and visual treatments for planner inserts and widgets."
        : validMode === "cover"
        ? "You are a planner cover art director. Suggest cover concepts, colour pairings, texture choices, and typography."
        : validMode === "theme"
        ? "You are a colour system designer for print products. Generate 6-colour palettes and typography pairings that work for planner printing."
        : "You are a planner design expert. Give specific, actionable design suggestions.";
    const examplePrompts =
      validMode === "inserts"
        ? ["Suggest a weekly spread that includes a habit tracker", "What content makes a good daily insert?", "Design a mood and energy tracker widget"]
        : validMode === "cover"
        ? ["Suggest a cover concept for a minimal 2027 planner", "What colour palette works for a Q4 launch?", "Describe a foil lettering treatment for a premium edition"]
        : validMode === "theme"
        ? ["Generate a warm earthy palette for an autumn planner", "Suggest a font pairing for a clean minimal theme", "Create a soft botanical colour set"]
        : ["Suggest a section order for a productivity planner", "What inserts work best with a minimal theme?", "How should I price a Starter vs Pro edition?"];
    setAiContext({
      systemPrompt,
      examplePrompts,
      contextLabel: `Planner Studio · ${validMode}`,
      previewContent: null,
    });
  }, [validMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Update preview content separately — only build mode shows the PDF preview.
  // previewEinkDevice is lifted from BuildCenter so the preview rerenders on device change.
  useEffect(() => {
    setAiContext({
      previewContent: validMode === "build" && selectedTemplate
        ? <PdfPreviewDock buildState={templateToBuildState(selectedTemplate)} einkDevice={previewEinkDevice} />
        : null,
    });
  }, [validMode, selectedTemplate, previewEinkDevice]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Primary action (top bar) ────────────────────────────────────────────────
  const primaryAction = (() => {
    if (validMode === "editions") {
      return {
        label: "New edition",
        icon: <Plus className="w-3.5 h-3.5" />,
        onClick: () => setShowCreate(true),
      };
    }
    if (validMode === "build") {
      return {
        label: selectedTemplate ? "Generate" : "New template",
        icon: <Download className="w-3.5 h-3.5" />,
        onClick: () => {},
        disabled: !selectedTemplate?.editionId,
      };
    }
    return undefined;
  })();

  // ── Center content ──────────────────────────────────────────────────────────
  const center = (() => {
    if (validMode === "build")    return (
      <BuildCenter
        template={selectedTemplate}
        onUpdated={handleTemplateUpdated}
        onCreateNew={handleTemplateCreated}
        onEinkDeviceChange={setPreviewEinkDevice}
      />
    );
    if (validMode === "editions") return (
      <EditionsListInStudio
        tier={editionTier}
        status={editionStatus}
        productType={editionProductType}
        showCreate={showCreate}
        onShowCreate={() => setShowCreate(true)}
        onHideCreate={() => setShowCreate(false)}
      />
    );
    if (validMode === "inserts")  return <InsertsCompose />;
    if (validMode === "theme")    return <ThemeCompose />;
    if (validMode === "cover")    return <CoverCompose />;
    if (validMode === "dividers") return <DividersCompose />;
    if (validMode === "paper")    return (
      <PaperCompose
        initialBindingType={paperBindingType}
        initialBindingFinish={paperBindingFinish}
        initialPaperColour={paperPaperColour}
        initialSpineStyleId={paperSpineStyleId}
        onBindingTypeChange={handleBindingTypeChange}
        onBindingFinishChange={handleBindingFinishChange}
        onPaperColourChange={handlePaperColourChange}
        onSpineStyleChange={handleSpineStyleChange}
      />
    );
    if (validMode === "quality")  return <QualityCompose />;
    return null;
  })();

  return (
    <StudioLayout
      scope="Planner Studio"
      modes={visibleModes}
      activeMode={validMode}
      onModeChange={setMode}
      status={{ label: "Platform", ok: true }}
      primaryAction={primaryAction}
      leftRail={leftRail}
      hasAssistant
      hasPreview={validMode === "build"}
    >
      {center}
    </StudioLayout>
  );
}
