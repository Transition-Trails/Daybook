/**
 * Planner Studio — unified workspace for the planner product domain.
 *
 * Three-column layout via StudioLayout:
 *   LEFT RAIL  — mode-aware context (edition, date, style quick-picks)
 *   CENTER     — mode content (build config, editions list, inserts, etc.)
 *   RIGHT DOCK — AI Assistant + Live PDF Preview
 *
 * Modes (top-bar pill switcher):
 *   Build · Editions · Inserts & widgets · Theme · Cover · Dividers · Paper · Quality
 *
 * "Build" mode owns its own form state here so the right dock preview and the
 * left rail quick-config both read from the same source. All API calls are
 * unchanged — /api/planners/preview and /api/planners/generate.
 *
 * Item 1: Edition creation inline in Editions mode, + "New edition" in Build rail
 * Item 2: Duplicate edition per row (auto-advances year in name)
 * Item 3: Theme/palette dedup — auto-palette themes excluded client-side
 * Item 4: "None" theme chip rendered neutral, never navy-filled
 * Item 5: Left rail — bg-[#FFFDF9], no nested scrollbars, thin scrollbar CSS
 * Item 6: Active fill = Ink Navy #1B2A4A throughout (via primitives)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Hammer, BookOpen, FileText, Download,
  Plus, Copy, Globe, EyeOff,
} from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  SectionLabel, ChipRow, MultiChipRow, SegmentedControl,
  EmptyState, ErrorState, SkeletonRows, RailCard, DockAiAssistant,
  StatusPill, ActionChip, CHIP_ACTIVE_BG,
} from "@/components/studio/primitives";
import InsertsList from "@/pages/catalog/inserts/list";
import ThemeStudio from "@/pages/studios/ThemeStudio";
import { catalogApi, apiFetch } from "@/lib/api";
import { aiApi, type AiResult } from "@/lib/ai";

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

// ── Year / month helpers ──────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS  = [2025, 2026, 2027, 2028];
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
const YEAR_OPTIONS  = YEARS.map(y => ({ value: String(y), label: String(y) }));

// ── Build form state ──────────────────────────────────────────────────────────

interface BuildState {
  editionId:  string;
  startYear:  string;
  startMonth: string;
  endYear:    string;
  endMonth:   string;
  paperSize:  "A5" | "HalfLetter";
  weeklyType: "vertical" | "two-page";
  themeId:    string;
  packIds:    string[];
  insertIds:  string[];
  productIds: string[];
}

const DEFAULT_BUILD: BuildState = {
  editionId:  "",
  startYear:  String(new Date().getFullYear()),
  startMonth: "1",
  endYear:    String(new Date().getFullYear()),
  endMonth:   "12",
  paperSize:  "A5",
  weeklyType: "vertical",
  themeId:    "",
  packIds:    [],
  insertIds:  [],
  productIds: [],
};

// ── Coming soon stub ──────────────────────────────────────────────────────────

const STUB_DESC: Partial<Record<ModeId, string>> = {
  cover:    "Design front/back cover layouts, foil-stamp options, and cover-image slots.",
  dividers: "Define tab rail configurations, divider page templates, and multi-edge tab sets.",
  paper:    "Set paper weight, binding type, cover lamination, and print-spec overrides per edition.",
  quality:  "Run automated print-readiness checks: bleed, DPI, colour-space, and font embedding.",
};

function ComingSoon({ mode }: { mode: ModeId }) {
  const label = MODES.find(m => m.id === mode)?.label ?? mode;
  return (
    <EmptyState
      icon={<Hammer className="w-5 h-5 text-muted-foreground" />}
      title={label}
      description={STUB_DESC[mode] ?? "This mode is coming soon."}
    />
  );
}

// ── Thin scrollbar style (item 5) ─────────────────────────────────────────────
// Applied inline to every independently-scrollable rail/panel.

const THIN_SCROLL: React.CSSProperties = {
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(0,0,0,0.12) transparent",
};

// ── Edition selector (left rail build mode) ───────────────────────────────────

function EditionSelector({
  value, onChange, onNewEdition,
}: {
  value: string;
  onChange: (v: string) => void;
  onNewEdition: () => void;
}) {
  const { data: editions = [], isLoading, error, refetch } = useQuery({
    queryKey: ["editions-list-mini"],
    queryFn:  () => catalogApi.editions(),
    staleTime: 60_000,
  });

  const live = (editions as any[]).filter((e: any) => e.status !== "deleted");

  if (isLoading) return <SkeletonRows count={3} />;
  if (error)
    return <ErrorState message="Couldn't load editions" onRetry={() => refetch()} />;

  return (
    <div className="space-y-1">
      {!live.length && (
        <p className="text-[11.5px] text-muted-foreground px-1">
          No editions yet. Create one in the Editions tab.
        </p>
      )}
      {live.map((e: any) => (
        <button
          key={e.id}
          onClick={() => onChange(e.id)}
          style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-colors border ${
            value === e.id
              ? "bg-primary/10 border-primary/30 text-foreground font-semibold"
              : "border-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate flex-1">{e.name ?? e.id}</span>
          {e.status === "live" && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#3f6b4c" }} />
          )}
        </button>
      ))}

      {/* "+ New edition" navigates to Editions mode — never opens inline editor here */}
      <button
        onClick={onNewEdition}
        style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 transition-colors mt-1"
      >
        <Plus className="w-3.5 h-3.5 shrink-0" />
        New edition
      </button>
    </div>
  );
}

// ── Editions-mode left rail ───────────────────────────────────────────────────

function EditionsRail({
  tier, setTier, status, setStatus, productType, setProductType,
}: {
  tier: string; setTier: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  productType: string; setProductType: (v: string) => void;
}) {
  return (
    <div className="p-4 space-y-5">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Editions</p>
          <p className="text-[11px] text-muted-foreground">
            Editions are the sellable wrappers around a planner build. Each edition
            defines the tier, price range, and which catalog items buyers can access.
          </p>
        </div>
      </RailCard>

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
            { value:"all",label:"All" },{ value:"basic",label:"Basic" },
            { value:"advanced",label:"Advanced" },
          ]}
          value={tier} onChange={setTier}
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>Status</SectionLabel>
        <ChipRow
          options={[
            { value:"all",label:"All" },{ value:"draft",label:"Draft" },
            { value:"live",label:"Live" },
          ]}
          value={status} onChange={setStatus}
        />
      </div>
    </div>
  );
}

// ── Inserts-mode left rail ────────────────────────────────────────────────────

function InsertsRail({ type, setType }: { type: string; setType: (v: string) => void }) {
  return (
    <div className="p-4 space-y-5">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Inserts & widgets</p>
          <p className="text-[11px] text-muted-foreground">
            Full-page SVG inserts and functional overlay widgets available to planner builders.
          </p>
        </div>
      </RailCard>
      <div className="space-y-2">
        <SectionLabel>Type</SectionLabel>
        <ChipRow
          options={[
            {value:"all",label:"All"},{value:"planner",label:"Planner"},
            {value:"journal",label:"Journal"},{value:"notes",label:"Notes"},
          ]}
          value={type} onChange={setType}
        />
      </div>
    </div>
  );
}

// ── Theme-mode left rail ──────────────────────────────────────────────────────

function ThemeRail({ tone, setTone }: { tone: string; setTone: (v: string) => void }) {
  return (
    <div className="p-4 space-y-5">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Theme generator</p>
          <p className="text-[11px] text-muted-foreground">
            Generate a 6-colour palette from a mood, season, or concept description.
            Saved palettes appear in Planner Builder's style picker.
          </p>
        </div>
      </RailCard>
      <div className="space-y-2">
        <SectionLabel>Colour temperature</SectionLabel>
        <SegmentedControl
          options={[{value:"warm",label:"Warm"},{value:"neutral",label:"Neutral"},{value:"cool",label:"Cool"}]}
          value={tone} onChange={setTone}
        />
      </div>
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
      // silent — preview error doesn't block editing
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

// ── Build center panel ────────────────────────────────────────────────────────

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
  // Item 3: exclude store-owned auto-palettes from the theme picker
  const themes = (rawThemes as any[]).filter(
    (t: any) => t.origin !== "owned" && !String(t.name ?? "").includes("— Auto palette"),
  );

  const { data: packs    = [] } = useQuery({ queryKey: ["packs-mini"],    queryFn: () => catalogApi.packs(),    staleTime: 60_000 });
  const { data: inserts  = [] } = useQuery({ queryKey: ["inserts-mini"],  queryFn: () => catalogApi.inserts(),  staleTime: 60_000 });
  const { data: products = [] } = useQuery({ queryKey: ["products-mini"], queryFn: () => catalogApi.products(), staleTime: 60_000 });

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

  /** Shared month-chip button style (item 6: navy active fill) */
  const monthChipCls = (active: boolean) =>
    `px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
      active ? "text-white border-[#1B2A4A]" : "border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-7" style={{ minWidth: 0 }}>
      {/* Date range */}
      <div className="space-y-4 rounded-[14px] border bg-card shadow-sm p-5">
        <SectionLabel>Date range</SectionLabel>
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
      <div className="space-y-3 rounded-[14px] border bg-card shadow-sm p-5">
        <SectionLabel>Format</SectionLabel>
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
      <div className="space-y-3 rounded-[14px] border bg-card shadow-sm p-5">
        <SectionLabel>Style</SectionLabel>

        {/* Item 4: "None" theme chip — neutral dashed style, never navy-filled */}
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
                onClick={() => set("themeId", t.id)}
                style={{
                  cursor: "pointer",
                  ...(state.themeId === t.id ? { background: CHIP_ACTIVE_BG } : {}),
                }}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-colors ${
                  state.themeId === t.id
                    ? "text-white border-[#1B2A4A]"
                    : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {t.name}
              </button>
            ))}
            {themes.length === 0 && (
              <span className="text-[11.5px] text-muted-foreground italic">No themes in catalog yet</span>
            )}
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
        <div className="space-y-2">
          <p className="text-[11.5px] font-medium text-muted-foreground">Notebooks &amp; journals</p>
          <MultiChipRow
            options={(products as any[]).map((p: any) => ({ value: p.id, label: p.name }))}
            value={state.productIds} onChange={v => set("productIds", v)}
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
        {generateMutation.isSuccess && (
          <StatusPill label="Saved to Drive" kind="success" />
        )}
        {generateMutation.isError && (
          <StatusPill label="Generation failed" kind="error" />
        )}
      </div>
    </div>
  );
}

// ── EditionCreateForm ─────────────────────────────────────────────────────────
// Item 1: Inline creation form inside Editions center panel.

function EditionCreateForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [name,        setName]        = useState("");
  const [tier,        setTier]        = useState("basic");
  const [priceLow,    setPriceLow]    = useState("");
  const [priceHigh,   setPriceHigh]   = useState("");
  const [description, setDescription] = useState("");
  const [drafting,    setDrafting]    = useState(false);
  const [draftErr,    setDraftErr]    = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => catalogApi.createEdition({
      name:        name.trim(),
      tier,
      description: description.trim() || undefined,
      priceLow:    priceLow  ? parseFloat(priceLow)  : undefined,
      priceHigh:   priceHigh ? parseFloat(priceHigh) : undefined,
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
    setDraftErr(null);
    try {
      const result: AiResult = await aiApi.complete(
        "You are a product copywriter for a digital planner platform. Write a concise, appealing edition description (2–3 sentences) for the platform catalog. Focus on the edition's value, who it's for, and what makes it distinctive. Respond with just the description text, no title or extra labels.",
        `Edition name: "${name.trim()}". Tier: ${tier}. ${priceHigh ? `Price: $${priceLow}–$${priceHigh}.` : ""}`,
      );
      setDescription(result.text.trim());
    } catch (e) {
      setDraftErr((e as Error).message ?? "Draft failed");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="rounded-[14px] border bg-card shadow-sm p-6 space-y-5 mb-6">
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold text-[15px] text-foreground">New edition</p>
        <button onClick={onCancel} style={{ cursor: "pointer" }}
          className="text-[11.5px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted-foreground">Name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Classic Planner 2027"
          className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors"
        />
      </div>

      {/* Tier */}
      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted-foreground">Tier</label>
        <SegmentedControl
          options={[{value:"basic",label:"PDF-only"},{value:"advanced",label:"Live planner"}]}
          value={tier} onChange={setTier}
        />
      </div>

      {/* Price range */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-muted-foreground">Price from ($)</label>
          <input
            type="number" min="0" step="0.01"
            value={priceLow} onChange={e => setPriceLow(e.target.value)}
            placeholder="e.g. 14.99"
            className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-muted-foreground">Price to ($)</label>
          <input
            type="number" min="0" step="0.01"
            value={priceHigh} onChange={e => setPriceHigh(e.target.value)}
            placeholder="e.g. 29.99"
            className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors"
          />
        </div>
      </div>

      {/* Description + AI draft */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11.5px] font-medium text-muted-foreground">Description</label>
          <button
            onClick={draftDescription}
            disabled={!name.trim() || drafting}
            style={{
              cursor: !name.trim() || drafting ? "not-allowed" : "pointer",
              background: CHIP_ACTIVE_BG,
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {drafting ? (
              <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            ✦ Draft with Claude
          </button>
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe what makes this edition distinctive…"
          className="w-full rounded-xl border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors resize-none"
        />
        {draftErr && (
          <p className="text-[11px]" style={{ color: "#b23b3b" }}>Draft failed: {draftErr}</p>
        )}
      </div>

      {createMut.isError && (
        <p className="text-[11.5px]" style={{ color: "#b23b3b" }}>
          {String((createMut.error as any)?.message ?? "Create failed")}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => createMut.mutate()}
          disabled={!name.trim() || createMut.isPending}
          style={{
            cursor: !name.trim() || createMut.isPending ? "not-allowed" : "pointer",
            background: CHIP_ACTIVE_BG,
          }}
          className="px-5 py-2 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {createMut.isPending ? "Creating…" : "Create edition"}
        </button>
        <p className="text-[11.5px] text-muted-foreground">Starts as draft — publish when ready</p>
      </div>
    </div>
  );
}

// ── EditionsListInStudio ──────────────────────────────────────────────────────
// Items 1 + 2: Inline edition list replacing <EditionsList />.

function EditionsListInStudio({
  tier, status, productType, onShowCreate, showCreate, onHideCreate,
}: {
  tier: string; status: string; productType: string;
  onShowCreate: () => void;
  showCreate: boolean;
  onHideCreate: () => void;
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

  // Item 2: duplicate via POST /editions/:id/duplicate
  const dupMut = useMutation({
    mutationFn: (id: string) => catalogApi.duplicateEdition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editions"] });
      qc.invalidateQueries({ queryKey: ["editions-list-mini"] });
    },
  });

  if (isLoading) return <SkeletonRows count={5} />;
  if (error)
    return <ErrorState message="Couldn't load editions" onRetry={() => refetch()} />;

  return (
    <div>
      {/* Inline create form */}
      {showCreate && (
        <EditionCreateForm onDone={onHideCreate} onCancel={onHideCreate} />
      )}

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
        {editions.map((e: any) => (
          <div
            key={e.id}
            className="flex items-center gap-3 p-4 rounded-[14px] border bg-card shadow-sm hover:shadow transition-shadow"
          >
            {/* Icon */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#f5f0ea" }}
            >
              <BookOpen className="w-4.5 h-4.5 text-muted-foreground" style={{ width: 18, height: 18 }} />
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[13px] text-foreground truncate">{e.name}</span>
                <StatusPill
                  label={e.status}
                  kind={e.status === "live" ? "success" : e.status === "draft" ? "neutral" : "warning"}
                />
                {e.tier && (
                  <span className="text-[10.5px] text-muted-foreground font-medium uppercase tracking-wide">
                    {e.tier === "basic" ? "PDF-only" : "Live"}
                  </span>
                )}
              </div>
              {(e.priceLow || e.priceHigh) && (
                <p className="text-[11.5px] text-muted-foreground">
                  ${e.priceLow ?? 0}–${e.priceHigh ?? 0}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Publish / Unpublish */}
              <ActionChip
                label={e.status === "live" ? "Unpublish" : "Publish"}
                variant={e.status === "live" ? "secondary" : "primary"}
                icon={e.status === "live"
                  ? <EyeOff className="w-3 h-3" />
                  : <Globe className="w-3 h-3" />
                }
                disabled={publishMut.isPending}
                onClick={() => publishMut.mutate({
                  id: e.id,
                  newStatus: e.status === "live" ? "draft" : "live",
                })}
              />

              {/* Duplicate (item 2) */}
              <ActionChip
                label="Duplicate"
                variant="secondary"
                icon={<Copy className="w-3 h-3" />}
                disabled={dupMut.isPending && dupMut.variables === e.id}
                onClick={() => dupMut.mutate(e.id)}
              />

              {/* Edit → navigates to existing edition editor */}
              <Link
                href={`/editions/${e.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border bg-background text-foreground border-border hover:bg-muted transition-colors"
              >
                Edit →
              </Link>
            </div>
          </div>
        ))}
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

  // Build-mode state (shared between left rail, center, and right dock preview)
  const [buildState, setBuildState] = useState<BuildState>(DEFAULT_BUILD);

  // Editions-mode filter + create state
  const [editionTier,        setEditionTier]        = useState("all");
  const [editionStatus,      setEditionStatus]      = useState("all");
  const [editionProductType, setEditionProductType] = useState("all");
  const [showCreate,         setShowCreate]         = useState(false);

  // Inserts/Theme filter state
  const [insertType, setInsertType] = useState("all");
  const [themeTone,  setThemeTone]  = useState("neutral");

  // ── Left rail (mode-aware) ──────────────────────────────────────────────────
  // Item 5: aside is overflow-hidden flex-col; rail content owns its own scroll.
  //   Build mode: flex flex-col h-full + inner flex-1 overflow-y-auto + sticky bottom
  //   Other modes: flex-1 overflow-y-auto wrapper
  const leftRail = (() => {
    if (validMode === "build") {
      return (
        // Item 5: h-full fills the aside; flex-col with sticky bottom; ONE scroller
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-5" style={THIN_SCROLL}>
            <RailCard>
              <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
                <p className="font-display font-semibold text-[13px] text-foreground">Edition</p>
                <p className="text-[11px] text-muted-foreground">
                  Pick the edition this planner belongs to. The edition sets tier, price, and catalog entitlements.
                </p>
              </div>
            </RailCard>
            <div className="space-y-2">
              <SectionLabel>Select edition</SectionLabel>
              <EditionSelector
                value={buildState.editionId}
                onChange={v => setBuildState(p => ({ ...p, editionId: v }))}
                onNewEdition={() => setMode("editions")}
              />
            </div>
          </div>
          {/* Voice / tone pinned at bottom — sticky inside the inner scroller */}
          <div className="border-t p-4 shrink-0" style={{ background: "#FFFDF9" }}>
            <SectionLabel className="mb-2">AI voice</SectionLabel>
            <SegmentedControl
              options={[{value:"professional",label:"Pro"},{value:"friendly",label:"Friendly"},{value:"minimal",label:"Minimal"}]}
              value="friendly"
              onChange={() => {}}
            />
          </div>
        </div>
      );
    }

    // All other modes: single outer scroller (aside is overflow-hidden, this div scrolls)
    const inner = (() => {
      if (validMode === "editions") {
        return (
          <EditionsRail
            tier={editionTier}     setTier={setEditionTier}
            status={editionStatus} setStatus={setEditionStatus}
            productType={editionProductType} setProductType={setEditionProductType}
          />
        );
      }
      if (validMode === "inserts") return <InsertsRail type={insertType} setType={setInsertType} />;
      if (validMode === "theme")   return <ThemeRail   tone={themeTone}  setTone={setThemeTone}  />;
      return (
        <div className="p-4">
          <RailCard>
            <p className="text-[12px] text-muted-foreground">Configure options for this mode here.</p>
          </RailCard>
        </div>
      );
    })();

    return (
      <div className="flex-1 overflow-y-auto" style={THIN_SCROLL}>
        {inner}
      </div>
    );
  })();

  // ── Right dock ──────────────────────────────────────────────────────────────
  const rightDock = {
    assistant: (
      <DockAiAssistant
        systemPrompt={
          validMode === "build"
            ? "You are a planner design assistant. Help the user plan their planner structure, section order, and content balance. Give specific, actionable suggestions."
            : validMode === "editions"
            ? "You are a planner product expert. Help the user define edition tiers, pricing strategy, and catalog item selection."
            : "You are a planner content expert. Give specific design and content suggestions for planner inserts, themes, and covers."
        }
        placeholder="Ask for planner structure suggestions, section ideas, or layout advice…"
        examplePrompts={
          validMode === "build"
            ? [
                "Suggest a section order for a productivity planner",
                "How many weekly spreads should I include for a full year?",
                "What inserts work best with a minimal theme?",
              ]
            : validMode === "editions"
            ? [
                "What's a good pricing strategy for a Starter vs Pro edition?",
                "Which catalog items should I include in a Studio tier?",
              ]
            : ["Suggest insert types for a journalling planner", "What covers sell best in Q4?"]
        }
      />
    ),
    preview: validMode === "build" ? <PdfPreviewDock buildState={buildState} /> : undefined,
  };

  // ── Center content (mode-aware) ─────────────────────────────────────────────
  const primaryAction = (() => {
    if (validMode === "build") {
      return {
        label: "Generate",
        icon: <Sparkles className="w-3.5 h-3.5" />,
        onClick: () => {},
        disabled: !buildState.editionId,
      };
    }
    if (validMode === "editions") {
      return {
        label: "New edition",
        icon: <Plus className="w-3.5 h-3.5" />,
        onClick: () => setShowCreate(true),
      };
    }
    return undefined;
  })();

  const center = (() => {
    if (validMode === "build") return <BuildCenter state={buildState} setState={setBuildState} />;
    if (validMode === "editions") {
      return (
        <EditionsListInStudio
          tier={editionTier}
          status={editionStatus}
          productType={editionProductType}
          showCreate={showCreate}
          onShowCreate={() => setShowCreate(true)}
          onHideCreate={() => setShowCreate(false)}
        />
      );
    }
    if (validMode === "inserts") return <InsertsList />;
    if (validMode === "theme")   return <ThemeStudio />;
    return <ComingSoon mode={validMode} />;
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
