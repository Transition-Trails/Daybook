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
import { useLocation, useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, BookOpen, FileText, Download, Upload,
  Plus, Copy, Globe, EyeOff, ImageOff, Layers,
} from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  SectionLabel, ChipRow, MultiChipRow, SegmentedControl,
  EmptyState, ErrorState, SkeletonRows, RailCard, DockAiAssistant,
  StatusPill, ActionChip, CHIP_ACTIVE_BG,
} from "@/components/studio/primitives";
import { catalogApi, apiFetch } from "@/lib/api";
import { aiApi, extractJson, type AiResult } from "@/lib/ai";
import { useToast } from "@/hooks/use-toast";

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

interface BuildState {
  editionId:   string;
  editionName: string;
  startYear:   string;
  startMonth:  string;
  endYear:     string;
  endMonth:    string;
  paperSize:   "A5" | "HalfLetter";
  weeklyType:  "vertical" | "two-page";
  themeId:     string;
  themeName:   string;
  packIds:     string[];
  insertIds:   string[];
  productIds:  string[];
}

const DEFAULT_BUILD: BuildState = {
  editionId:   "",
  editionName: "—",
  startYear:   String(new Date().getFullYear()),
  startMonth:  "1",
  endYear:     String(new Date().getFullYear()),
  endMonth:    "12",
  paperSize:   "A5",
  weeklyType:  "vertical",
  themeId:     "",
  themeName:   "None",
  packIds:     [],
  insertIds:   [],
  productIds:  [],
};

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

// ── Unified left rail (all modes) ─────────────────────────────────────────────

interface Preset { id: string; label: string; isDefault?: boolean; summary: string; state: Partial<BuildState> }

const BUILT_IN_PRESETS: Preset[] = [
  {
    id: "usual",
    label: "My usual",
    isDefault: true,
    summary: "A5 · vertical · Jan–Dec",
    state: { paperSize: "A5", weeklyType: "vertical", startMonth: "1", endMonth: "12" },
  },
  {
    id: "landscape",
    label: "Landscape",
    summary: "Half letter · 2-page · 6 mo",
    state: { paperSize: "HalfLetter", weeklyType: "two-page", startMonth: "1", endMonth: "6" },
  },
  {
    id: "minimal",
    label: "Minimal",
    summary: "A5 · no theme · 3 mo",
    state: { paperSize: "A5", weeklyType: "vertical", themeId: "", startMonth: "1", endMonth: "3" },
  },
];

function UnifiedRail({
  buildState, onApplyPreset, onNewEdition,
}: {
  buildState: BuildState;
  onApplyPreset: (preset: Preset) => void;
  onNewEdition: () => void;
}) {
  const monthLabel = (m: string) => MONTHS[parseInt(m, 10) - 1] ?? m;

  const thisBuilSummaryLines = [
    `Edition: ${buildState.editionName}`,
    `Format: ${buildState.paperSize} · ${buildState.weeklyType === "vertical" ? "Vertical" : "2-page"}`,
    `Dates: ${monthLabel(buildState.startMonth)} ${buildState.startYear} – ${monthLabel(buildState.endMonth)} ${buildState.endYear}`,
    `Theme: ${buildState.themeName || "None"}`,
    ...(buildState.packIds.length > 0 ? [`Packs: ${buildState.packIds.length} selected`] : []),
  ];

  // Swatch for the template card: use first palette or default tints
  const swatchColors = buildState.themeId
    ? (PALETTES.find(p => p.id === buildState.themeId)?.colors ?? ["#f5f0ea","#e8e0d5","#d0c8be"])
    : ["#f5f0ea", "#e8e0d5", "#d0c8be"];

  return (
    <div className="flex flex-col h-full" style={{ background: PAPER_TINT }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-5" style={THIN_SCROLL}>

        {/* TEMPLATE CARD */}
        <div className="rounded-[14px] border bg-card shadow-sm p-4 space-y-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Template
          </p>
          <div className="space-y-1">
            <p className="font-display font-semibold text-[13.5px] text-foreground truncate">
              {buildState.editionName !== "—" ? buildState.editionName : "No edition"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {buildState.paperSize} · {buildState.weeklyType === "vertical" ? "side tabs" : "2-page weekly"} · {
                parseInt(buildState.endMonth) - parseInt(buildState.startMonth) < 0
                  ? 12 + parseInt(buildState.endMonth) - parseInt(buildState.startMonth) + 1
                  : parseInt(buildState.endMonth) - parseInt(buildState.startMonth) + 1
              } mo
            </p>
          </div>
          {/* Colour swatch */}
          <div className="flex gap-1">
            {swatchColors.map((c, i) => (
              <div key={i} className="rounded-full h-3 flex-1" style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* SETUP PRESETS */}
        <div className="space-y-2">
          <SectionLabel>Setup presets</SectionLabel>
          <div className="space-y-1.5">
            {BUILT_IN_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => onApplyPreset(preset)}
                style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-border hover:border-foreground/30 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold text-foreground">{preset.label}</span>
                    {preset.isDefault && (
                      <span
                        className="text-[9.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full"
                        style={{ background: "#edf4f0", color: "#3f6b4c" }}
                      >
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{preset.summary}</p>
                </div>
              </button>
            ))}
            {/* Save current */}
            <button
              style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Plus className="w-3 h-3 shrink-0" />
              Save current as preset
            </button>
          </div>
        </div>

        {/* Edition quick-switch */}
        <div className="space-y-2">
          <SectionLabel>Edition</SectionLabel>
          <EditionQuickPick
            value={buildState.editionId}
            onChange={onNewEdition}
          />
        </div>

      </div>

      {/* THIS BUILD — pinned at bottom */}
      <div className="border-t p-4 shrink-0" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
          This build
        </p>
        <div className="space-y-0.5">
          {thisBuilSummaryLines.map((line, i) => (
            <p key={i} className="text-[11.5px] text-muted-foreground leading-relaxed">{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Edition quick-pick (in the left rail) ─────────────────────────────────────

function EditionQuickPick({ value, onChange }: { value: string; onChange: () => void }) {
  const { data: editions = [], isLoading } = useQuery({
    queryKey: ["editions-list-mini"],
    queryFn:  () => catalogApi.editions(),
    staleTime: 60_000,
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

function PdfPreviewDock({ buildState }: { buildState: BuildState }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!buildState.editionId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/planners/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId:        buildState.editionId,
          startYear:        Number(buildState.startYear),
          startMonth:       Number(buildState.startMonth),
          endYear:          Number(buildState.endYear),
          endMonth:         Number(buildState.endMonth),
          paperSize:        buildState.paperSize,
          orientation:      "portrait",
          weeklySpreadType: buildState.weeklyType,
          themeId:          buildState.themeId || undefined,
          packIds:          buildState.packIds,
          insertIds:        buildState.insertIds,
          productIds:       buildState.productIds,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [buildState]);

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

function BuildCenter({
  state, setState,
}: { state: BuildState; setState: React.Dispatch<React.SetStateAction<BuildState>> }) {
  const set = <K extends keyof BuildState>(key: K, val: BuildState[K]) =>
    setState(prev => ({ ...prev, [key]: val }));

  const { data: rawThemes = [] } = useQuery({
    queryKey: ["themes-mini"],
    queryFn:  () => catalogApi.themes(),
    staleTime: 60_000,
  });
  const themes = (rawThemes as any[]).filter(
    (t: any) => t.origin !== "owned" && !String(t.name ?? "").includes("— Auto palette"),
  );

  const { data: packs   = [] } = useQuery({ queryKey: ["packs-mini"],   queryFn: () => catalogApi.packs(),   staleTime: 60_000 });
  const { data: inserts = [] } = useQuery({ queryKey: ["inserts-mini"], queryFn: () => catalogApi.inserts(), staleTime: 60_000 });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiFetch("/planners/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId:        state.editionId,
          startYear:        Number(state.startYear),
          startMonth:       Number(state.startMonth),
          endYear:          Number(state.endYear),
          endMonth:         Number(state.endMonth),
          paperSize:        state.paperSize,
          weeklySpreadType: state.weeklyType,
          themeId:          state.themeId || undefined,
          packIds:          state.packIds,
          insertIds:        state.insertIds,
          productIds:       state.productIds,
        }),
      }),
  });

  const monthChipCls = (active: boolean) =>
    `px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
      active ? "text-white border-[#1B2A4A]" : "border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-7" style={{ minWidth: 0 }}>
      <ComposePageHeader
        title="Configure your planner"
        subtitle="Set dates, format, and style — then generate the PDF or hand it to Claude."
        aiLabel="✦ Build with Claude"
        onAi={() => {}}
      />

      {/* Date range */}
      <div className="space-y-4 rounded-[16px] border p-5" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Date range</p>
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="space-y-2">
            <p className="text-[11.5px] font-medium text-muted-foreground">Start year</p>
            <ChipRow options={YEAR_OPTIONS} value={state.startYear} onChange={v => set("startYear", v)} />
          </div>
          <div className="space-y-2">
            <p className="text-[11.5px] font-medium text-muted-foreground">End year</p>
            <ChipRow options={YEAR_OPTIONS} value={state.endYear} onChange={v => set("endYear", v)} />
          </div>
          <div className="space-y-2">
            <p className="text-[11.5px] font-medium text-muted-foreground">Start month</p>
            <div className="flex gap-1 flex-wrap">
              {MONTH_OPTIONS.map(o => (
                <button key={o.value} onClick={() => set("startMonth", o.value)}
                  style={{ cursor: "pointer", ...(state.startMonth === o.value ? { background: CHIP_ACTIVE_BG } : {}) }}
                  className={monthChipCls(state.startMonth === o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11.5px] font-medium text-muted-foreground">End month</p>
            <div className="flex gap-1 flex-wrap">
              {MONTH_OPTIONS.map(o => (
                <button key={o.value} onClick={() => set("endMonth", o.value)}
                  style={{ cursor: "pointer", ...(state.endMonth === o.value ? { background: CHIP_ACTIVE_BG } : {}) }}
                  className={monthChipCls(state.endMonth === o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Format */}
      <div className="space-y-3 rounded-[16px] border p-5" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Format</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="space-y-1.5">
            <p className="text-[11.5px] font-medium text-muted-foreground">Paper size</p>
            <SegmentedControl
              options={[{value:"A5",label:"A5"},{value:"HalfLetter",label:"Half letter"}]}
              value={state.paperSize}
              onChange={v => set("paperSize", v as "A5" | "HalfLetter")}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-[11.5px] font-medium text-muted-foreground">Weekly spread</p>
            <SegmentedControl
              options={[{value:"vertical",label:"Vertical"},{value:"two-page",label:"2-page"}]}
              value={state.weeklyType}
              onChange={v => set("weeklyType", v as "vertical" | "two-page")}
            />
          </div>
        </div>
      </div>

      {/* Style */}
      <div className="space-y-3 rounded-[16px] border p-5" style={{ background: PAPER_TINT }}>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Style</p>
        <div className="space-y-2">
          <p className="text-[11.5px] font-medium text-muted-foreground">Theme</p>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => set("themeId", "")}
              style={{ cursor: "pointer" }}
              className={`px-3 py-1 rounded-full text-[12px] font-medium border border-dashed transition-colors ${
                state.themeId === ""
                  ? "border-foreground/30 text-muted-foreground bg-muted"
                  : "border-border text-muted-foreground/50 hover:text-muted-foreground hover:border-foreground/20"
              }`}
            >
              No theme
            </button>
            {themes.map((t: any) => (
              <button
                key={t.id}
                onClick={() => { set("themeId", t.id); set("themeName", t.name); }}
                style={{ cursor: "pointer", ...(state.themeId === t.id ? { background: CHIP_ACTIVE_BG } : {}) }}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                  state.themeId === t.id
                    ? "text-white border-[#1B2A4A]"
                    : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[11.5px] font-medium text-muted-foreground">Sticker packs</p>
          <MultiChipRow
            options={(packs as any[]).map((p: any) => ({ value: p.id, label: p.name }))}
            value={state.packIds} onChange={v => set("packIds", v)}
          />
        </div>
        <div className="space-y-2">
          <p className="text-[11.5px] font-medium text-muted-foreground">Inserts</p>
          <MultiChipRow
            options={(inserts as any[]).map((i: any) => ({ value: i.id, label: i.name }))}
            value={state.insertIds} onChange={v => set("insertIds", v)}
          />
        </div>
      </div>

      {/* Generate */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => generateMutation.mutate()}
          disabled={!state.editionId || generateMutation.isPending}
          style={{
            cursor: !state.editionId || generateMutation.isPending ? "not-allowed" : "pointer",
            background: CHIP_ACTIVE_BG,
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {generateMutation.isPending ? (
            <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Generate & save to Drive
        </button>
        {!state.editionId && (
          <p className="text-[11.5px] text-muted-foreground">Select an edition in the left rail first</p>
        )}
        {generateMutation.isSuccess && <StatusPill label="Saved to Drive" kind="success" />}
        {generateMutation.isError   && <StatusPill label="Generation failed" kind="error" />}
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
    staleTime: 60_000,
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
    staleTime: 60_000,
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

const HARDWARE_OPTIONS = [
  { value: "gold",       label: "Gold",       hex: "#D4AF37" },
  { value: "rose-gold",  label: "Rose gold",  hex: "#B76E79" },
  { value: "silver",     label: "Silver",     hex: "#A8A9AD" },
  { value: "bronze",     label: "Bronze",     hex: "#8C7853" },
  { value: "white",      label: "White",      hex: "#F0F0EE" },
  { value: "matt-black", label: "Matt black", hex: "#2C2C2C" },
];

const PAPER_COLOUR_OPTIONS = [
  { value: "white",  label: "White",  hex: "#FAFAFA" },
  { value: "cream",  label: "Cream",  hex: "#FDF6E3" },
  { value: "warm",   label: "Warm",   hex: "#F7F0E4" },
  { value: "stone",  label: "Stone",  hex: "#EDE8DF" },
  { value: "blush",  label: "Blush",  hex: "#FBF0F0" },
  { value: "sage",   label: "Sage",   hex: "#EDF2EE" },
];

function PaperCompose() {
  const [renderStyle, setRenderStyle] = useState("realistic");
  const [size,        setSize]        = useState("a5");
  const [binding,     setBinding]     = useState("coil");
  const [hardware,    setHardware]    = useState("gold");
  const [paperColour, setPaperColour] = useState("white");
  const [weight,      setWeight]      = useState("80");
  const [finish,      setFinish]      = useState("matte");

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
    discs:       "Removable disc system (Arc, Atoma) — pages can be rearranged.",
    "3-ring":    "Classic binder rings — works with standard paper punches.",
    none:        "No binding artwork rendered — pages output as flat PDF.",
  };

  const bindingHasHardware = ["coil", "twin-loop", "discs", "3-ring"].includes(binding);
  const hwHex = HARDWARE_OPTIONS.find(h => h.value === hardware)?.hex ?? "#D4AF37";
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
            { value: "discs",      label: "Discs" },
            { value: "3-ring",     label: "3-ring" },
            { value: "none",       label: "None" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={binding === o.value} onClick={() => setBinding(o.value)} />
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">{BINDING_DESCRIPTIONS[binding]}</p>
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
                  onClick={() => setHardware(o.value)}
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
                onClick={() => setPaperColour(o.value)}
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
            {bindingHasHardware && (
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: 22,
                background: `linear-gradient(180deg, ${hwHex}22, ${hwHex}55, ${hwHex}22)`,
                borderRight: `2px solid ${hwHex}88`,
              }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{
                    position: "absolute", left: 4, top: 20 + i * 28,
                    width: 14, height: 16,
                    border: `2px solid ${hwHex}`,
                    borderRadius: "50% / 40%",
                    background: "transparent",
                    opacity: 0.85,
                  }} />
                ))}
              </div>
            )}
            {/* Page rules */}
            <div style={{ marginLeft: bindingHasHardware ? 30 : 12, marginRight: 12, marginTop: 16 }}>
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
  const validMode: ModeId = MODES.some(m => m.id === mode) ? mode : "build";

  const setMode = (id: string) => navigate(`/studios/planner?mode=${id}`);

  const [buildState, setBuildState] = useState<BuildState>(DEFAULT_BUILD);

  // Editions filters
  const [editionTier,        setEditionTier]        = useState("all");
  const [editionStatus,      setEditionStatus]      = useState("all");
  const [editionProductType, setEditionProductType] = useState("all");
  const [showCreate,         setShowCreate]         = useState(false);

  const applyPreset = (preset: Preset) => {
    setBuildState(prev => ({ ...prev, ...preset.state }));
  };

  // ── Left rail: ALWAYS the unified rail ─────────────────────────────────────
  const leftRail = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto" style={THIN_SCROLL}>
        <div className="p-4 space-y-5">
          <UnifiedRail
            buildState={buildState}
            onApplyPreset={applyPreset}
            onNewEdition={() => setMode("editions")}
          />
        </div>
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

  // ── Right dock ──────────────────────────────────────────────────────────────
  const rightDock = {
    assistant: (
      <DockAiAssistant
        systemPrompt={
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
            : "You are a planner design expert. Give specific, actionable design suggestions."
        }
        placeholder="Ask for design ideas, layout suggestions, or content advice…"
        examplePrompts={
          validMode === "inserts"
            ? ["Suggest a weekly spread that includes a habit tracker", "What content makes a good daily insert?", "Design a mood and energy tracker widget"]
            : validMode === "cover"
            ? ["Suggest a cover concept for a minimal 2027 planner", "What colour palette works for a Q4 launch?", "Describe a foil lettering treatment for a premium edition"]
            : validMode === "theme"
            ? ["Generate a warm earthy palette for an autumn planner", "Suggest a font pairing for a clean minimal theme", "Create a soft botanical colour set"]
            : ["Suggest a section order for a productivity planner", "What inserts work best with a minimal theme?", "How should I price a Starter vs Pro edition?"]
        }
      />
    ),
    preview: validMode === "build" ? <PdfPreviewDock buildState={buildState} /> : undefined,
  };

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
        label: "Generate",
        icon: <Download className="w-3.5 h-3.5" />,
        onClick: () => {},
        disabled: !buildState.editionId,
      };
    }
    return undefined;
  })();

  // ── Center content ──────────────────────────────────────────────────────────
  const center = (() => {
    if (validMode === "build")    return <BuildCenter state={buildState} setState={setBuildState} />;
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
    if (validMode === "paper")    return <PaperCompose />;
    if (validMode === "quality")  return <QualityCompose />;
    return null;
  })();

  return (
    <StudioLayout
      scope="Planner Studio"
      modes={MODES}
      activeMode={validMode}
      onModeChange={setMode}
      status={{ label: "Platform", ok: true }}
      primaryAction={primaryAction}
      leftRail={leftRail}
      rightDock={rightDock}
    >
      {center}
    </StudioLayout>
  );
}
