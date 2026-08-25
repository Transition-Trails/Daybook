/**
 * Planner Studio — store-admin shell for building, styling, and exporting
 * store-branded planner PDFs.
 *
 * Layout:
 *  ┌─ Tab bar (pill nav) ────────────────────────────────────────────────────┐
 *  │ Left rail (template + presets) │ Center (mode content) │ Right dock      │
 *  └─────────────────────────────────────────────────────────────────────────┘
 */

import { useState, useCallback, useRef, useEffect } from "react";
import HotspotEditor from "./HotspotEditor";

// ── SVG sanitizer ─────────────────────────────────────────────────────────────

function sanitizeSvg(svgString: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    if (doc.querySelector("parsererror")) return "";
    const DANGEROUS_TAGS = ["script", "foreignObject", "iframe", "object", "embed"];
    DANGEROUS_TAGS.forEach((tag) => doc.querySelectorAll(tag).forEach((el) => el.remove()));
    doc.querySelectorAll("*").forEach((el) => {
      const toRemove: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.toLowerCase().startsWith("on") || attr.value.toLowerCase().includes("javascript:"))
          toRemove.push(attr.name);
      }
      toRemove.forEach((name) => el.removeAttribute(name));
    });
    return doc.documentElement.outerHTML;
  } catch { return ""; }
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, BookOpen, Layout, Layers, FileText, Printer, MapPin,
  Bot, Eye, Plus, RefreshCw, Download, Lock, Wand2, Sparkles,
  ChevronRight, Bookmark, Star, Save,
} from "lucide-react";
import { SuperAdminAiBanner } from "./AiDisabledState";
import {
  storePlannersApi, widgetsApi, studioGenerateApi, storeStudiosApi,
  type StorePlannerConfig, type StorePlannerSetup, type StorePlannerStyle,
  type StorePlannerOutput, type Widget, type OwnedList,
} from "@/lib/api";
import { FontSpecimenCard } from "@/components/FontSpecimenCard";
import { PLANNER_FONT_FAMILIES } from "@/pages/studios/PlannerStudioHub";
import { isSuperAdminRole } from "@/lib/permissions";

// ── Types & constants ─────────────────────────────────────────────────────────

interface Props { storeId: string; role: string; aiEnabled: boolean }

type StudioMode = "build" | "cover" | "theme" | "paper" | "quality" | "dividers" | "inserts" | "editions" | "hotspots";
type DockTab = "ai" | "preview";

const MODES: { id: StudioMode; label: string }[] = [
  { id: "build",    label: "Build a planner" },
  { id: "cover",    label: "Cover" },
  { id: "theme",    label: "Theme" },
  { id: "paper",    label: "Paper & binding" },
  { id: "quality",  label: "Quality check" },
  { id: "dividers", label: "Dividers & tabs" },
  { id: "inserts",  label: "Inserts & widgets" },
  { id: "editions", label: "Editions" },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Preset templates for the left rail
const SETUP_PRESETS = [
  {
    id: "my-usual",
    label: "My usual",
    isDefault: true,
    summary: "Mon start · vertical · side tabs · 8 sections",
    setup: { weekStart: "mon" as const, orientation: "vertical" as const },
    style: { tabPos: "right" as const },
  },
  {
    id: "landscape",
    label: "Landscape",
    isDefault: false,
    summary: "Sun start · 2-page spread · top tabs",
    setup: { weekStart: "sun" as const, orientation: "landscape" as const },
    style: { tabPos: "top" as const },
  },
  {
    id: "minimal",
    label: "Minimal",
    isDefault: false,
    summary: "No tabs except Home · 5 sections",
    setup: {},
    style: { tabPos: "none" as const },
  },
];

// ── Pill chooser ──────────────────────────────────────────────────────────────

function PillGroup<T extends string>({
  options, value, onChange, disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
            value === opt.value
              ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
              : "bg-white text-foreground border-border hover:border-foreground/40 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Section badge ─────────────────────────────────────────────────────────────

function SectionBadge({ label, variant }: { label: string; variant: "lock" | "refresh" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
      variant === "lock"
        ? "bg-blue-50 text-blue-700 border border-blue-200"
        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
    }`}>
      {variant === "lock" ? <Lock className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
      {label}
    </span>
  );
}

// ── Planner selector (pre-studio) ─────────────────────────────────────────────

function PlannerSelector({
  storeId, onSelect, onCreate,
}: { storeId: string; onSelect: (p: StorePlannerConfig) => void; onCreate: () => void }) {
  const { data: planners = [], isLoading } = useQuery({
    queryKey: ["store-planners", storeId],
    queryFn: () => storePlannersApi.list(storeId),
  });

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-12 gap-6">
      <div className="text-center max-w-sm">
        <CalendarDays className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold mb-2">Planner Studio</h2>
        <p className="text-sm text-muted-foreground">
          Build, style, and export store-branded digital planners.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="w-4 h-4 mr-2" /> New Planner
      </Button>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : planners.length > 0 ? (
        <div className="w-full max-w-lg space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Your planners ({planners.length})
          </p>
          {planners.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium">
                  {p.setup.datingMode === "dated"
                    ? `${p.setup.startYear} Planner`
                    : `${p.setup.datingMode ?? "Dated"} Planner`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.setup.orientation} · {p.setup.weekStart === "mon" ? "Mon" : "Sun"} start ·{" "}
                  {p.generatedAt ? <span className="text-green-600">Generated</span> : <span className="text-amber-600">Draft</span>}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── New planner form ──────────────────────────────────────────────────────────

function NewPlannerForm({
  storeId, onCreated, onCancel,
}: { storeId: string; onCreated: (p: StorePlannerConfig) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<StorePlannerSetup>({
    datingMode: "dated",
    weekStart: "mon",
    orientation: "vertical",
    startMonth: new Date().getMonth(),
    startYear: new Date().getFullYear() + 1,
    monthCount: 12,
  });

  const createMut = useMutation({
    mutationFn: (s: StorePlannerSetup) => storePlannersApi.create(storeId, { setup: s }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, result.id);
      toast({ title: "Planner created", description: `${result.pageCount} pages generated.` });
      onCreated(full);
    },
    onError: (err: Error) => toast({ title: "Creation failed", description: err.message, variant: "destructive" }),
  });

  const startMonthLabel = MONTHS[setup.startMonth] + " " + setup.startYear;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-1">New planner</h2>
        <p className="text-sm text-muted-foreground">Structure is set once. Everything else you can change and re-export later.</p>
      </div>

      {/* SET UP ONCE card */}
      <div className="rounded-xl border p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Set up once</span>
          <SectionBadge label="Locked after generating" variant="lock" />
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          These decide the page count and every internal link.
        </p>

        {/* Dating mode */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dating</span>
            <span className="px-2 py-0.5 rounded-full bg-[#1B2A4A]/10 text-[#1B2A4A] text-xs font-medium capitalize">
              {setup.datingMode ?? "Dated"}
            </span>
          </div>
          <PillGroup
            options={[
              { value: "dated", label: "Dated" },
              { value: "undated", label: "Undated" },
              { value: "perpetual", label: "Perpetual" },
            ]}
            value={(setup.datingMode ?? "dated") as "dated" | "undated" | "perpetual"}
            onChange={(v) => setSetup((s) => ({ ...s, datingMode: v }))}
          />
          {setup.datingMode === "dated" && (
            <p className="text-xs text-muted-foreground">Real dates and weekdays — sells by year, links to calendar invites.</p>
          )}
        </div>

        {/* Fields row */}
        <div className="flex flex-wrap gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Week starts</label>
            <PillGroup
              options={[{ value: "mon", label: "Mon" }, { value: "sun", label: "Sun" }]}
              value={setup.weekStart}
              onChange={(v) => setSetup((s) => ({ ...s, weekStart: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layout</label>
            <PillGroup
              options={[{ value: "vertical", label: "Vertical" }, { value: "landscape", label: "2-page" }]}
              value={setup.orientation}
              onChange={(v) => setSetup((s) => ({ ...s, orientation: v }))}
            />
          </div>
          {(setup.datingMode ?? "dated") === "dated" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Starts</label>
                <Select value={String(setup.startMonth)} onValueChange={(v) => setSetup((s) => ({ ...s, startMonth: Number(v) }))}>
                  <SelectTrigger className="h-9 w-36 text-sm">
                    <SelectValue>{startMonthLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i)}>{m} {setup.startYear}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year</label>
                <Input
                  type="number" min={2025} max={2035}
                  value={setup.startYear}
                  onChange={(e) => setSetup((s) => ({ ...s, startYear: Number(e.target.value) }))}
                  className="h-9 w-24 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Months</label>
                <Input
                  type="number" min={1} max={24}
                  value={setup.monthCount}
                  onChange={(e) => setSetup((s) => ({ ...s, monthCount: Number(e.target.value) }))}
                  className="h-9 w-20 text-sm"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          disabled={createMut.isPending}
          onClick={() => createMut.mutate(setup)}
          style={{ backgroundColor: "#C87560" }}
          className="text-white hover:opacity-90"
        >
          {createMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Creating…</> : <>✦ Set it up</>}
        </Button>
      </div>
    </div>
  );
}

// ── Left rail ─────────────────────────────────────────────────────────────────

function LeftRail({
  planner, storeId, onUpdated,
}: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const patchMut = useMutation({
    mutationFn: (data: { setup?: Partial<StorePlannerSetup>; style?: Partial<StorePlannerStyle> }) =>
      storePlannersApi.patch(storeId, planner.id, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, planner.id);
      onUpdated(full);
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const applyPreset = (preset: typeof SETUP_PRESETS[number]) => {
    setActivePreset(preset.id);
    patchMut.mutate({ setup: preset.setup, style: preset.style });
  };

  const templateLabel = planner.setup.orientation === "landscape" ? "Landscape" : "Classic Vertical";
  const templateSub =
    (planner.style.tabPos === "none" ? "no tabs" : `${planner.style.tabPos ?? "side"} tabs`) +
    (planner.setup.monthCount ? ` · ${planner.setup.monthCount} mo` : "");

  return (
    <aside className="w-52 shrink-0 border-r overflow-y-auto [&::-webkit-scrollbar]:hidden flex flex-col gap-6 p-4" style={{ scrollbarWidth: "none" }}>

      {/* Template */}
      <section className="space-y-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Template</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            The art set and its link map. Defines where tabs and hotspots live.
          </p>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-background">
          <div className="w-8 h-8 rounded-md bg-[#1B2A4A] flex items-center justify-center shrink-0">
            <Bookmark className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{templateLabel}</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{templateSub}</p>
          </div>
        </div>
      </section>

      {/* Setup presets */}
      <section className="space-y-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Setup Presets</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Your usual planner setup, in one click.
          </p>
        </div>
        <div className="space-y-1.5">
          {SETUP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              disabled={patchMut.isPending}
              className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                activePreset === preset.id
                  ? "border-[#C87560]/60 bg-[#C87560]/8"
                  : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-medium">{preset.label}</span>
                {preset.isDefault && (
                  <span className="text-[10px] font-semibold text-[#C87560] uppercase tracking-wider">DEFAULT</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{preset.summary}</p>
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
          <Plus className="w-3 h-3" /> Save current as preset
        </button>
      </section>
    </aside>
  );
}

// ── Right dock ─────────────────────────────────────────────────────────────────

function DailySpreadPreview() {
  // Mini mock of a dated daily spread page
  return (
    <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
      {/* Day header */}
      <div className="bg-[#f5f0eb] px-3 pt-2.5 pb-1.5">
        <p className="text-[10px] text-muted-foreground font-medium" style={{ fontFamily: "serif" }}>Tuesday</p>
        <p className="text-3xl font-bold text-foreground leading-none" style={{ fontFamily: "serif" }}>14</p>
      </div>
      {/* Tab bar */}
      <div className="flex border-b">
        {["TOP 3", "HABITS"].map((t, i) => (
          <div key={t} className={`flex-1 py-1.5 text-center text-[9px] font-semibold tracking-wider border-b-2 ${i === 0 ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-muted-foreground"}`}>
            {t}
          </div>
        ))}
      </div>
      {/* Lines */}
      <div className="p-2.5 space-y-1.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-px bg-border/60" />
        ))}
      </div>
    </div>
  );
}

function IndexPreview() {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {/* Contents card */}
      <div className="rounded-md border bg-card p-2 space-y-1">
        <p className="text-[9px] font-semibold text-muted-foreground">Contents</p>
        <div className="space-y-0.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-[#C87560] rounded" />
              <div className="flex-1 h-0.5 bg-border/60 rounded" />
            </div>
          ))}
        </div>
      </div>
      {/* Getting started card */}
      <div className="rounded-md border bg-card p-2 space-y-1">
        <p className="text-[9px] font-semibold text-muted-foreground">Getting started</p>
        <div className="space-y-0.5">
          {["1", "2", "3"].map((n) => (
            <div key={n} className="flex items-center gap-1">
              <span className="text-[8px] font-bold text-[#1B2A4A] w-3">{n}</span>
              <div className="flex-1 h-0.5 bg-border/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RightDock({
  planner, storeId, mode, dockTab, onDockTab,
}: {
  planner: StorePlannerConfig;
  storeId: string;
  mode: StudioMode;
  dockTab: DockTab;
  onDockTab: (t: DockTab) => void;
}) {
  return (
    <aside className="w-60 shrink-0 border-l flex flex-col overflow-hidden">
      {/* Toggle buttons */}
      <div className="flex items-center gap-2 p-3 border-b shrink-0">
        <button
          onClick={() => onDockTab("ai")}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            dockTab === "ai"
              ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
              : "text-muted-foreground border-border hover:text-foreground"
          }`}
        >
          ✦ Assistant
        </button>
        <button
          onClick={() => onDockTab("preview")}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            dockTab === "preview"
              ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
              : "text-muted-foreground border-border hover:text-foreground"
          }`}
        >
          Preview
        </button>
      </div>

      {dockTab === "ai" ? (
        <AiAssistant storeId={storeId} mode={mode} planner={planner} />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {/* Daily spread */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Daily Spread</p>
            <DailySpreadPreview />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Dates link to Google Calendar invites, plus daily task rows with checkbox automation.
            </p>
          </div>
          {/* Index & instructions */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Index & Instructions</p>
            <IndexPreview />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Contents page is hyperlinked. The welcome page carries your brand voice.
            </p>
          </div>
          {/* PDF preview link */}
          {planner.drive.pdfFileId && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Full PDF</p>
              <LivePreview planner={planner} />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

// ── Build mode ────────────────────────────────────────────────────────────────

// Shared eyebrow style: uppercase, spaced, muted
const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";
// Consequence line style
const CONSEQUENCE = "text-[12.5px] leading-relaxed text-muted-foreground";

function BuildMode({
  planner, storeId, onUpdated, onAskClaude,
}: {
  planner: StorePlannerConfig;
  storeId: string;
  onUpdated: (p: StorePlannerConfig) => void;
  onAskClaude: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isLocked = !!planner.generatedAt;

  // ── Setup state (structural — Card 1) ──────────────────────────────────
  const [datingMode, setDatingMode] = useState<"dated" | "undated" | "perpetual">(
    (planner.setup.datingMode ?? "dated") as "dated" | "undated" | "perpetual",
  );
  const [weekStart,   setWeekStart]   = useState<"mon" | "sun">(planner.setup.weekStart);
  const [orientation, setOrientation] = useState<"vertical" | "landscape">(planner.setup.orientation);
  const [startMonth,  setStartMonth]  = useState(planner.setup.startMonth);
  const [startYear,   setStartYear]   = useState(planner.setup.startYear);
  const [monthCount,  setMonthCount]  = useState(planner.setup.monthCount);

  // ── Style state (cosmetic — Card 2) ────────────────────────────────────
  const [tabPos, setTabPos] = useState<"right" | "top" | "bottom" | "none">(
    (planner.style.tabPos ?? "right") as "right" | "top" | "bottom" | "none",
  );
  const [sections,      setSections]     = useState<string[]>(planner.style.sections ?? []);
  const [sectionDraft,  setSectionDraft] = useState("");
  const [addingSection, setAddingSection] = useState(false);

  // ── Font override state ─────────────────────────────────────────────────
  const [headingFont,    setHeadingFont]    = useState<string>(planner.style.fonts?.heading    ?? "");
  const [subheadingFont, setSubheadingFont] = useState<string>(planner.style.fonts?.subheading ?? "");
  const [bodyFont,       setBodyFont]       = useState<string>(planner.style.fonts?.script     ?? "");
  const [accentFont,     setAccentFont]     = useState<string>(planner.style.fonts?.accent     ?? "");

  // ── Data ───────────────────────────────────────────────────────────────
  const { data: owned } = useQuery<OwnedList>({
    queryKey: ["store-owned", storeId],
    queryFn: () => storeStudiosApi.list(storeId),
  });
  const themes = owned?.themes ?? [];
  const packs  = owned?.packs  ?? [];

  const selectedTheme = themes.find((t) => t.id === planner.style.themeId) ?? null;
  // Palette swatches: prefer theme.palettes, fall back to owned.palettes
  const palettes = selectedTheme?.palettes?.length
    ? selectedTheme.palettes
    : (owned?.palettes ?? []);

  // ── Mutations ──────────────────────────────────────────────────────────
  const setupMut = useMutation({
    mutationFn: () =>
      storePlannersApi.patch(storeId, planner.id, {
        setup: { datingMode, weekStart, orientation, startMonth, startYear, monthCount },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      onUpdated(await storePlannersApi.get(storeId, planner.id));
      toast({ title: "Setup saved" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const styleMut = useMutation({
    mutationFn: (patch: Partial<StorePlannerStyle>) =>
      storePlannersApi.patch(storeId, planner.id, { style: patch }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      onUpdated(await storePlannersApi.get(storeId, planner.id));
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const reexportMut = useMutation({
    mutationFn: () => storePlannersApi.reexport(storeId, planner.id, {}),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      onUpdated(await storePlannersApi.get(storeId, planner.id));
      toast({ title: "Re-exported", description: `${result.pageCount} pages · ${result.fileName}` });
    },
    onError: (err: Error) => toast({ title: "Re-export failed", description: err.message, variant: "destructive" }),
  });

  const saveSections = (next: string[]) => {
    setSections(next);
    styleMut.mutate({ sections: next });
  };

  // ── Helpers ────────────────────────────────────────────────────────────
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

  const isDated = datingMode === "dated";

  // Year stepper range
  const YEAR_OPTIONS = [2025, 2026, 2027, 2028, 2029, 2030];

  return (
    <div className="p-6 space-y-5" style={{ maxWidth: 720 }}>

      {/* ── Page title ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Build a planner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Structure is set once. Everything else you can change and re-export later.
          </p>
        </div>
        <Button
          onClick={onAskClaude}
          className="shrink-0 text-white hover:opacity-90 gap-1.5"
          style={{ backgroundColor: "#C87560" }}
        >
          ✦ Set it up with Claude
        </Button>
      </div>

      {/* ── Edition requirement notice ──────────────────────────────────── */}
      {!planner.editionId && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <BookOpen className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800">No edition linked yet</p>
            <p className={`${CONSEQUENCE} text-amber-700`}>
              An edition defines the page layout and section order. Go to the{" "}
              <button className="underline underline-offset-2 font-medium">Editions tab</button>{" "}
              to attach one before generating.
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CARD 1 — SET UP ONCE
          Navy left accent rule. Everything here is structural.
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border overflow-hidden">
        {/* Navy accent rule */}
        <div className="border-l-[3px] border-[#1B2A4A] p-6 space-y-6">

          {/* Card header */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className={EYEBROW}>Set up once</span>
              <SectionBadge label="Locked after generating" variant="lock" />
            </div>
            <p className={CONSEQUENCE}>
              These decide the page count and every internal link, so they can't change later without a fresh planner.
            </p>
          </div>

          {/* ── DATING ────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={EYEBROW}>Dating</span>
              <span className="px-2 py-0.5 rounded-full bg-[#1B2A4A]/10 text-[#1B2A4A] text-[11px] font-semibold capitalize leading-none py-1">
                {datingMode}
              </span>
            </div>
            <PillGroup
              options={[
                { value: "dated",     label: "Dated" },
                { value: "undated",   label: "Undated" },
                { value: "perpetual", label: "Perpetual" },
              ]}
              value={datingMode}
              onChange={(v) => setDatingMode(v as "dated" | "undated" | "perpetual")}
              disabled={isLocked}
            />
            <p className={CONSEQUENCE}>{datingConsequence[datingMode]}</p>
          </div>

          {/* ── PRODUCT TYPE ──────────────────────────────────────────── */}
          <div className="space-y-2">
            <span className={EYEBROW}>Product type</span>
            <div className="grid grid-cols-4 gap-2">
              {PRODUCT_TYPES.map((pt) => (
                <div
                  key={pt.id}
                  className={`p-3 rounded-lg border text-left select-none transition-colors ${
                    pt.active
                      ? "bg-[#C87560] text-white border-[#C87560]"
                      : "bg-background text-foreground border-border opacity-40 cursor-not-allowed"
                  }`}
                >
                  <p className="text-sm font-semibold leading-tight">{pt.label}</p>
                  <p className={`text-[11px] leading-snug mt-1 whitespace-pre-line ${pt.active ? "text-white/80" : "text-muted-foreground"}`}>
                    {pt.sub}
                  </p>
                </div>
              ))}
            </div>
            <p className={CONSEQUENCE}>Full planner engine — dating, hyperlink map, tab groups and realistic binding all apply.</p>
          </div>

          {/* ── COMPACT 4-FIELD ROW ────────────────────────────────────── */}
          {/* Week starts · Layout · Starts · Months — always in one row */}
          <div className="grid grid-cols-4 gap-4">

            {/* Week starts */}
            <div className="space-y-2">
              <span className={EYEBROW}>Week starts</span>
              <PillGroup
                options={[{ value: "mon", label: "Mon" }, { value: "sun", label: "Sun" }]}
                value={weekStart}
                onChange={(v) => setWeekStart(v as "mon" | "sun")}
                disabled={isLocked}
              />
            </div>

            {/* Layout */}
            <div className="space-y-2">
              <span className={EYEBROW}>Layout</span>
              <PillGroup
                options={[{ value: "vertical", label: "Vertical" }, { value: "landscape", label: "2-page" }]}
                value={orientation}
                onChange={(v) => setOrientation(v as "vertical" | "landscape")}
                disabled={isLocked}
              />
            </div>

            {/* Starts — month + year compact group */}
            <div className="space-y-2">
              <span className={`${EYEBROW} ${!isDated ? "opacity-40" : ""}`}>Starts</span>
              <div className="flex items-center gap-1">
                <Select
                  disabled={isLocked || !isDated}
                  value={String(startMonth)}
                  onValueChange={(v) => setStartMonth(Number(v))}
                >
                  <SelectTrigger className="h-8 text-sm px-2.5 min-w-0 flex-1">
                    <SelectValue>{MONTHS[startMonth].slice(0, 3)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  disabled={isLocked || !isDated}
                  value={String(startYear)}
                  onValueChange={(v) => setStartYear(Number(v))}
                >
                  <SelectTrigger className="h-8 text-sm px-2 w-[72px]">
                    <SelectValue>{startYear}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {YEAR_OPTIONS.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Months — stepper */}
            <div className="space-y-2">
              <span className={`${EYEBROW} ${!isDated ? "opacity-40" : ""}`}>Months</span>
              <div className="flex items-center gap-0.5">
                <button
                  disabled={isLocked || !isDated || monthCount <= 1}
                  onClick={() => setMonthCount((n) => Math.max(1, n - 1))}
                  className="h-8 w-7 rounded-l-md border border-r-0 text-sm font-medium flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >−</button>
                <div className="h-8 w-10 border text-sm font-medium flex items-center justify-center bg-background">
                  {monthCount}
                </div>
                <button
                  disabled={isLocked || !isDated || monthCount >= 24}
                  onClick={() => setMonthCount((n) => Math.min(24, n + 1))}
                  className="h-8 w-7 rounded-r-md border border-l-0 text-sm font-medium flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >+</button>
              </div>
            </div>

          </div>
          {/* Consequence for the 4-field row */}
          <p className={`${CONSEQUENCE} -mt-3`}>
            {isDated
              ? `${weekStart === "mon" ? "Monday" : "Sunday"}-start ${orientation === "landscape" ? "2-page spread" : "vertical"} · ${MONTHS[startMonth]} ${startYear} through ${MONTHS[(startMonth + monthCount - 1) % 12]} ${startYear + Math.floor((startMonth + monthCount - 1) / 12)} · ${monthCount} months.`
              : `${weekStart === "mon" ? "Monday" : "Sunday"}-start ${orientation === "landscape" ? "2-page spread" : "vertical"} · no fixed dates.`}
          </p>

          {/* ── Card 1 footer ──────────────────────────────────────────── */}
          {isLocked ? (
            <div className="flex items-center justify-between pt-1 border-t">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <p className="text-sm">Setup locked. Use Re-export to regenerate with updated style.</p>
              </div>
              {planner.drive.pdfFileId && (
                <Button size="sm" variant="outline" onClick={() => reexportMut.mutate()} disabled={reexportMut.isPending} className="shrink-0 ml-4">
                  {reexportMut.isPending ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Re-exporting…</> : <><Download className="w-3.5 h-3.5 mr-1.5" />Re-export PDF</>}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between pt-1 border-t">
              <p className={CONSEQUENCE}>Changes save when you click below. Generation locks this card.</p>
              <Button
                size="sm"
                title={!planner.editionId ? "Select an edition in the Editions tab first" : undefined}
                disabled={setupMut.isPending || !planner.editionId}
                onClick={() => setupMut.mutate()}
                className="shrink-0 ml-4"
              >
                {setupMut.isPending ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save & generate"}
              </Button>
            </div>
          )}

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CARD 2 — CUSTOMIZE ANYTIME
          Clay left accent rule. Everything here is re-exportable.
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border overflow-hidden">
        <div className="border-l-[3px] border-[#C87560] p-6 space-y-6">

          {/* Card header */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className={EYEBROW}>Customize anytime</span>
              <SectionBadge label="Re-export whenever" variant="refresh" />
            </div>
            <p className={CONSEQUENCE}>
              Cosmetic and content choices. Change them and export a fresh PDF — existing planners stay untouched.
            </p>
          </div>

          {/* ── THEME & PALETTE ────────────────────────────────────────── */}
          <div className="space-y-3">
            <span className={EYEBROW}>Theme &amp; Palette</span>

            {/* Theme chips */}
            <div className="flex flex-wrap gap-1.5">
              {themes.length === 0 && (
                <span className="px-3 py-1.5 rounded-full text-sm border border-dashed text-muted-foreground">
                  No themes yet — create one in Theme Studio
                </span>
              )}
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => styleMut.mutate({ themeId: t.id, paletteId: null })}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    planner.style.themeId === t.id
                      ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
                      : "bg-background text-foreground border-border hover:border-foreground/50"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* Palette swatches — shown when a theme is selected */}
            {selectedTheme && palettes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {palettes.map((pal) => (
                  <button
                    key={pal.id}
                    onClick={() => styleMut.mutate({ paletteId: pal.id })}
                    title={pal.name}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all ${
                      planner.style.paletteId === pal.id
                        ? "border-[#1B2A4A] ring-1 ring-[#1B2A4A]/30"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    {/* Colour swatch tiles */}
                    <div className="flex rounded overflow-hidden">
                      {pal.colors.slice(0, 4).map((hex, ci) => (
                        <div key={ci} className="w-5 h-5" style={{ backgroundColor: hex }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-none max-w-[80px] truncate">{pal.name}</span>
                  </button>
                ))}
              </div>
            )}

            <p className={CONSEQUENCE}>Sets the colour family and typeface applied across all pages.</p>
          </div>

          {/* ── TABS ──────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={EYEBROW}>Tabs</span>
              <span className="text-[12px] text-muted-foreground">
                {tabPos === "right" ? "side tabs" : tabPos === "top" ? "top tabs" : tabPos === "bottom" ? "bottom tabs" : "no tabs"}
                {planner.style.tabTheme ? `, ${planner.style.tabTheme}` : ""}
              </span>
            </div>
            <PillGroup
              options={[
                { value: "right",  label: "Side"      },
                { value: "top",    label: "Top"       },
                { value: "bottom", label: "Bottom"    },
                { value: "none",   label: "Home only" },
              ]}
              value={tabPos}
              onChange={(v) => { setTabPos(v as typeof tabPos); styleMut.mutate({ tabPos: v as typeof tabPos }); }}
            />
            <p className={CONSEQUENCE}>{tabConsequence[tabPos]}</p>
          </div>

          {/* ── FONTS ─────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={EYEBROW}>Fonts</span>
              {(headingFont || subheadingFont || bodyFont || accentFont) && (
                <button
                  style={{ cursor: "pointer" }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  onClick={() => {
                    setHeadingFont("");
                    setSubheadingFont("");
                    setBodyFont("");
                    setAccentFont("");
                    styleMut.mutate({ fonts: null });
                  }}
                >
                  Reset to theme
                </button>
              )}
            </div>
            {/* Theme fontPairing preview (read-only) */}
            {selectedTheme?.fontPairing ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedTheme.fontPairing.heading && (
                  <span className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border bg-[#1B2A4A]/10 text-[#1B2A4A] border-[#1B2A4A]/20">
                    Theme heading: {selectedTheme.fontPairing.heading}
                  </span>
                )}
                {selectedTheme.fontPairing.body && (
                  <span className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-border bg-background text-muted-foreground">
                    Theme body: {selectedTheme.fontPairing.body}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {themes.length === 0 ? "Set a theme above to see its font pairing." : "The selected theme has no font pairing set."}
              </p>
            )}
            {/* Per-role overrides */}
            <div className="grid grid-cols-2 gap-2">
              {([
                ["Heading",     headingFont,    setHeadingFont,    "heading"]    as const,
                ["Subheading",  subheadingFont, setSubheadingFont, "subheading"] as const,
                ["Body/Script", bodyFont,       setBodyFont,       "script"]     as const,
                ["Accent",      accentFont,     setAccentFont,     "accent"]     as const,
              ]).map(([label, val, setter, role]) => (
                <div key={label} className="space-y-1">
                  <p className="text-[10.5px] font-medium text-muted-foreground">{label}</p>
                  <select
                    value={val}
                    onChange={e => {
                      setter(e.target.value);
                      const next = {
                        ...(headingFont    ? { heading:    headingFont }    : {}),
                        ...(subheadingFont ? { subheading: subheadingFont } : {}),
                        ...(bodyFont       ? { script:     bodyFont }       : {}),
                        ...(accentFont     ? { accent:     accentFont }     : {}),
                        [role === "script" ? "script" : role]: e.target.value || undefined,
                      };
                      styleMut.mutate({ fonts: Object.keys(next).length ? next : null });
                    }}
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
            <p className={CONSEQUENCE}>Overrides apply throughout — covers, section titles, and day labels. Empty = use theme pairing.</p>
          </div>

          {/* ── NOTE SECTIONS ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={EYEBROW}>Note sections</span>
                <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {sections.length} OF 10
                </span>
              </div>
              <button
                onClick={onAskClaude}
                className="text-[12px] text-[#C87560] hover:text-[#b56650] font-medium transition-colors flex items-center gap-1"
              >
                ✦ Name them for me
              </button>
            </div>

            {/* Existing section chips + add tile */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {sections.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm border bg-background"
                >
                  {s}
                  <button
                    onClick={() => saveSections(sections.filter((_, j) => j !== i))}
                    className="w-4 h-4 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-xs"
                  >
                    ×
                  </button>
                </span>
              ))}

              {/* + add tile */}
              {sections.length < 10 && !addingSection && (
                <button
                  onClick={() => setAddingSection(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  <Plus className="w-3 h-3" /> add
                </button>
              )}

              {addingSection && (
                <div className="inline-flex items-center gap-1">
                  <Input
                    autoFocus
                    value={sectionDraft}
                    onChange={(e) => setSectionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && sectionDraft.trim()) {
                        saveSections([...sections, sectionDraft.trim()]);
                        setSectionDraft("");
                        setAddingSection(false);
                      }
                      if (e.key === "Escape") { setSectionDraft(""); setAddingSection(false); }
                    }}
                    placeholder="Section name…"
                    className="h-8 w-36 text-sm rounded-full px-3"
                  />
                  <button
                    onClick={() => {
                      if (sectionDraft.trim()) saveSections([...sections, sectionDraft.trim()]);
                      setSectionDraft(""); setAddingSection(false);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground px-1"
                  >done</button>
                </div>
              )}
            </div>
            <p className={CONSEQUENCE}>Section names appear on tab dividers and in the contents page hyperlink map.</p>
          </div>

          {/* ── STICKER PACKS ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <span className={EYEBROW}>Sticker packs</span>
            {packs.length === 0 ? (
              <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 bg-background">
                <p className="text-sm text-muted-foreground">No sticker packs attached to this planner.</p>
                <button className="text-sm text-[#C87560] font-medium hover:text-[#b56650] transition-colors flex items-center gap-1.5 shrink-0 ml-4">
                  <Plus className="w-3.5 h-3.5" /> Attach a pack
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {packs.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-sm border bg-background">
                    {p.name}
                  </span>
                ))}
              </div>
            )}
            <p className={CONSEQUENCE}>Sticker packs add decorative clip-art sheets after the planner pages.</p>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Editions mode ─────────────────────────────────────────────────────────────

function EditionsMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { data: owned } = useQuery<OwnedList>({ queryKey: ["store-owned", storeId], queryFn: () => storeStudiosApi.list(storeId) });
  const { toast } = useToast();
  const qc = useQueryClient();
  const editions = owned?.editions ?? [];

  const patchMut = useMutation({
    mutationFn: (editionId: string | null) => storePlannersApi.patch(storeId, planner.id, { editionId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, planner.id);
      onUpdated(full);
      toast({ title: "Edition linked" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Editions</h2>
        <p className="text-sm text-muted-foreground">Link an edition to define the page layout, sections, and included packs.</p>
      </div>
      {planner.editionId && (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {editions.find((e) => e.id === planner.editionId)?.name ?? planner.editionId}
          </span>
          <Badge variant="secondary" className="ml-auto">Linked</Badge>
        </div>
      )}
      <div className="space-y-3">
        {editions.map((ed) => {
          const edThemeIds: string[] = (ed.themes as string[] | undefined) ?? [];
          const pairedThemes = (owned?.themes ?? []).filter(
            (t) => edThemeIds.includes(t.id) && (t.fontPairing?.heading || t.fontPairing?.body),
          );
          return (
            <div key={ed.id} className="space-y-1.5">
              <button
                onClick={() => patchMut.mutate(ed.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  planner.editionId === ed.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ed.name}</p>
                  <p className="text-xs text-muted-foreground">{ed.status}</p>
                </div>
                {planner.editionId === ed.id && <Badge className="ml-auto shrink-0">Selected</Badge>}
              </button>
              {pairedThemes.map((t) => (
                <FontSpecimenCard key={t.id} fontPairing={t.fontPairing!} themeName={t.name} compact />
              ))}
            </div>
          );
        })}
        {editions.length === 0 && (
          <p className="text-sm text-muted-foreground">No editions found. Create one in Edition Studio first.</p>
        )}
      </div>
    </div>
  );
}

// ── Inserts & Widgets mode ────────────────────────────────────────────────────

function InsertsMode({ storeId, aiEnabled, isSuperAdmin }: { storeId: string; aiEnabled: boolean; isSuperAdmin?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [generateType, setGenerateType] = useState<"insert" | "widget">("insert");
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [sizeVariant, setSizeVariant] = useState<"7-day" | "30-day" | "month">("7-day");
  const { data: widgets = [] } = useQuery<Widget[]>({ queryKey: ["widgets", storeId], queryFn: () => widgetsApi.list(storeId) });

  const generateMut = useMutation({
    mutationFn: async () =>
      generateType === "insert"
        ? studioGenerateApi.insert(storeId, { prompt: prompt.trim() })
        : studioGenerateApi.widget(storeId, { prompt: prompt.trim(), sizeVariant }),
    onSuccess: (result) => { setGeneratedSvg(result.svgData); toast({ title: "Generated successfully" }); },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const saveMut = useMutation({
    mutationFn: () => widgetsApi.create(storeId, { name: `Widget — ${new Date().toLocaleDateString()}`, sizeVariants: generateType === "widget" ? [sizeVariant] : [], svgData: generatedSvg ?? undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["widgets", storeId] }); setGeneratedSvg(null); setPrompt(""); toast({ title: "Widget saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Inserts & Widgets</h2>
        <p className="text-sm text-muted-foreground">AI-generate recolourable vector inserts and functional overlay widgets.</p>
      </div>
      {aiEnabled ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={generateType === "insert" ? "default" : "outline"} onClick={() => setGenerateType("insert")}>Insert page</Button>
            <Button size="sm" variant={generateType === "widget" ? "default" : "outline"} onClick={() => setGenerateType("widget")}>Functional widget</Button>
          </div>
          {generateType === "widget" && (
            <Select value={sizeVariant} onValueChange={(v) => setSizeVariant(v as typeof sizeVariant)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7-day">7-day tracker</SelectItem>
                <SelectItem value="30-day">30-day habit grid</SelectItem>
                <SelectItem value="month">Monthly overview</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Textarea
            placeholder={generateType === "insert" ? "Describe the insert page…" : "Describe the widget…"}
            value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          />
          <div className="flex gap-2">
            <Button onClick={() => generateMut.mutate()} disabled={!prompt.trim() || generateMut.isPending}>
              {generateMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Wand2 className="w-4 h-4 mr-2" /> Generate SVG</>}
            </Button>
            {generatedSvg && (
              <Button variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save widget</Button>
            )}
          </div>
          {generatedSvg && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <p className="text-xs font-medium mb-2 text-muted-foreground">SVG Preview</p>
              <div className="w-full overflow-auto rounded" style={{ maxHeight: 300 }} dangerouslySetInnerHTML={{ __html: sanitizeSvg(generatedSvg) }} />
            </div>
          )}
        </div>
      ) : isSuperAdmin ? (
        <SuperAdminAiBanner />
      ) : (
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <Sparkles className="w-4 h-4 inline mr-2" />AI generation requires the AI add-on. Enable it in store flags.
        </div>
      )}
      {widgets.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saved widgets</p>
          {widgets.map((w) => (
            <div key={w.id} className="flex items-center gap-3 p-3 rounded-lg border">
              <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{w.name}</p>
                <p className="text-xs text-muted-foreground">{w.sizeVariants.join(", ") || "No variants"}</p>
              </div>
              <Badge variant={w.status === "live" ? "default" : "secondary"}>{w.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cover mode ────────────────────────────────────────────────────────────────

function CoverMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const style = planner.style;
  const [coverType, setCoverType]         = useState<string>(style.coverType ?? "solid");
  const [coverTitle, setCoverTitle]       = useState(style.coverTitle ?? "");
  const [coverSubtitle, setCoverSubtitle] = useState(style.coverSubtitle ?? "");

  const patchMut = useMutation({
    mutationFn: () => storePlannersApi.patch(storeId, planner.id, { style: { coverType: coverType as StorePlannerStyle["coverType"], coverTitle, coverSubtitle } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      onUpdated(await storePlannersApi.get(storeId, planner.id));
      toast({ title: "Cover updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-xl space-y-5">
      <h2 className="text-xl font-semibold">Cover</h2>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Cover type</label>
        <Select value={coverType} onValueChange={setCoverType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid colour</SelectItem>
            <SelectItem value="texture">Texture overlay</SelectItem>
            <SelectItem value="pattern">Pattern</SelectItem>
            <SelectItem value="photo">Photo / illustration</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Cover title</label>
        <Input value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} placeholder="e.g. My 2027 Planner" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Cover subtitle</label>
        <Input value={coverSubtitle} onChange={(e) => setCoverSubtitle(e.target.value)} placeholder="e.g. by Sage Studio" />
      </div>
      <Button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}>
        {patchMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save cover settings"}
      </Button>
    </div>
  );
}

// ── Theme mode (stub) ─────────────────────────────────────────────────────────

function ThemeMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: owned } = useQuery<OwnedList>({ queryKey: ["store-owned", storeId], queryFn: () => storeStudiosApi.list(storeId) });
  const themes = owned?.themes ?? [];

  const patchMut = useMutation({
    mutationFn: (themeId: string | null) => storePlannersApi.patch(storeId, planner.id, { style: { themeId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      onUpdated(await storePlannersApi.get(storeId, planner.id));
      toast({ title: "Theme updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Theme</h2>
        <p className="text-sm text-muted-foreground">Choose a colour palette and typography pairing for your planner.</p>
      </div>
      {themes.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => patchMut.mutate(t.id)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                planner.style.themeId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{t.status}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No themes in your catalog yet. Create one in Theme Studio.</p>
      )}
    </div>
  );
}

// ── Quality check mode (stub) ─────────────────────────────────────────────────

function QualityMode({ planner }: { planner: StorePlannerConfig }) {
  const checks = [
    { label: "Dating mode", ok: true,  note: planner.setup.datingMode ?? "dated" },
    { label: "Edition linked", ok: !!planner.editionId, note: planner.editionId ? "Linked" : "No edition" },
    { label: "PDF generated", ok: !!planner.generatedAt, note: planner.generatedAt ? "Generated" : "Not yet" },
    { label: "Cover set", ok: !!planner.style.coverTitle, note: planner.style.coverTitle || "No title" },
  ];

  return (
    <div className="p-6 max-w-xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Quality check</h2>
        <p className="text-sm text-muted-foreground">A quick checklist before publishing your planner.</p>
      </div>
      <div className="space-y-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-3 p-3 rounded-lg border">
            <div className={`w-2 h-2 rounded-full shrink-0 ${c.ok ? "bg-green-500" : "bg-amber-400"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-xs text-muted-foreground capitalize">{c.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dividers & tabs mode ──────────────────────────────────────────────────────

function DividersMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const style = planner.style;
  const [tabPos,   setTabPos]   = useState<string>(style.tabPos ?? "right");
  const [tabTheme, setTabTheme] = useState<string>(style.tabTheme ?? "accent");
  const [tabShape, setTabShape] = useState<string>(style.tabShape ?? "rounded");
  const [sections, setSections] = useState<string[]>(style.sections ?? []);
  const [newSection, setNewSection] = useState("");

  const patchMut = useMutation({
    mutationFn: () => storePlannersApi.patch(storeId, planner.id, { style: { tabPos: tabPos as StorePlannerStyle["tabPos"], tabTheme: tabTheme as StorePlannerStyle["tabTheme"], tabShape, sections } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      onUpdated(await storePlannersApi.get(storeId, planner.id));
      toast({ title: "Dividers & tabs updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-xl space-y-5">
      <h2 className="text-xl font-semibold">Dividers & Tabs</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tab position</label>
          <Select value={tabPos} onValueChange={setTabPos}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="right">Right edge</SelectItem>
              <SelectItem value="top">Top edge</SelectItem>
              <SelectItem value="bottom">Bottom edge</SelectItem>
              <SelectItem value="none">No tabs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tab colour</label>
          <Select value={tabTheme} onValueChange={setTabTheme}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accent">Accent</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Tab shape</label>
        <Select value={tabShape} onValueChange={setTabShape}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="rounded">Rounded</SelectItem>
            <SelectItem value="chevron">Chevron</SelectItem>
            <SelectItem value="square">Square</SelectItem>
            <SelectItem value="arch">Arch</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Custom sections <span className="text-muted-foreground font-normal">(up to 10)</span></label>
        <div className="flex gap-2">
          <Input placeholder="Section name" value={newSection} onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newSection.trim() && sections.length < 10) { setSections((s) => [...s, newSection.trim()]); setNewSection(""); } }}
          />
          <Button size="icon" variant="outline" disabled={!newSection.trim() || sections.length >= 10}
            onClick={() => { setSections((s) => [...s, newSection.trim()]); setNewSection(""); }}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {sections.map((s, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
            <span className="text-muted-foreground w-5 text-xs">{i + 1}.</span>
            <span className="flex-1">{s}</span>
            <button className="text-muted-foreground hover:text-destructive text-xs" onClick={() => setSections((ss) => ss.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      <Button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}>
        {patchMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save divider settings"}
      </Button>
    </div>
  );
}

// ── Paper & binding mode ──────────────────────────────────────────────────────

function PaperMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const style = planner.style;
  const [paperColour, setPaperColour] = useState<string>(style.paperColour ?? "white");
  const [size,         setSize]         = useState<string>(style.size ?? "A5");
  const [renderStyle,  setRenderStyle]  = useState<string>(style.renderStyle ?? "flat");
  const [bindingType,  setBindingType]  = useState<string>(style.binding?.type ?? "coil");
  const [bindingFinish,setBindingFinish]= useState<string>(style.binding?.finish ?? "gold");
  const [notePaper,    setNotePaper]    = useState<string>(style.notePaper ?? "dot");

  const patchMut = useMutation({
    mutationFn: () => storePlannersApi.patch(storeId, planner.id, { style: {
      paperColour: paperColour as StorePlannerStyle["paperColour"], size: size as StorePlannerStyle["size"],
      renderStyle: renderStyle as "realistic" | "flat",
      binding: { type: bindingType as "coil"|"twin-loop"|"discs"|"3-ring"|"none", finish: bindingFinish as "gold"|"rose gold"|"silver"|"matte black"|"white" },
      notePaper: notePaper as StorePlannerStyle["notePaper"],
    }}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      onUpdated(await storePlannersApi.get(storeId, planner.id));
      toast({ title: "Paper & binding updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-xl space-y-5">
      <h2 className="text-xl font-semibold">Paper & Binding</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Paper colour</label>
          <Select value={paperColour} onValueChange={setPaperColour}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="cream">Cream</SelectItem>
              <SelectItem value="ivory">Ivory</SelectItem>
              <SelectItem value="kraft">Kraft ⚠️</SelectItem>
              <SelectItem value="slate">Slate ⚠️</SelectItem>
            </SelectContent>
          </Select>
          {(paperColour === "kraft" || paperColour === "slate") && (
            <p className="text-xs text-amber-600">⚠️ Low contrast — check text readability.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Page size</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["A5","B6","Personal","Half letter","Letter","iPad 4:3"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Render style</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "flat", label: "Flat", desc: "Clean, minimal — smaller file size" },
            { value: "realistic", label: "Realistic", desc: "Ring art, grain & gutter shading" },
          ].map((opt) => (
            <button key={opt.value} onClick={() => setRenderStyle(opt.value)}
              className={`p-3 rounded-lg border text-left transition-colors ${renderStyle === opt.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Binding type</label>
          <Select value={bindingType} onValueChange={setBindingType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="coil">Coil</SelectItem>
              <SelectItem value="twin-loop">Twin loop</SelectItem>
              <SelectItem value="discs">Disc binding</SelectItem>
              <SelectItem value="3-ring">3-ring</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Binding finish</label>
          <Select value={bindingFinish} onValueChange={setBindingFinish}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="rose gold">Rose gold</SelectItem>
              <SelectItem value="silver">Silver</SelectItem>
              <SelectItem value="matte black">Matte black</SelectItem>
              <SelectItem value="white">White</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Note paper style</label>
        <Select value={notePaper} onValueChange={setNotePaper}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dot">Dot grid</SelectItem>
            <SelectItem value="graph">Graph</SelectItem>
            <SelectItem value="lined">Lined</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}>
        {patchMut.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save paper & binding"}
      </Button>
    </div>
  );
}

// ── AI Assistant ──────────────────────────────────────────────────────────────

function AiAssistant({ storeId, mode, planner }: { storeId: string; mode: StudioMode; planner: StorePlannerConfig }) {
  const { toast } = useToast();
  const [conversation, setConversation] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [userMsg, setUserMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversation]);

  const send = useCallback(async () => {
    if (!userMsg.trim() || isLoading) return;
    const msg = userMsg.trim();
    setUserMsg("");
    setConversation((c) => [...c, { role: "user", content: msg }]);
    setIsLoading(true);
    const context = `Studio mode: ${mode}. Planner setup: dating=${planner.setup.datingMode ?? "dated"}, orientation=${planner.setup.orientation}, weekStart=${planner.setup.weekStart}.`;
    try {
      const res = await fetch(`/api/stores/${storeId}/studios/planner/copilot`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-store-id": storeId },
        body: JSON.stringify({ message: msg, context, history: conversation.slice(-6) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { text?: string; content?: string };
      setConversation((c) => [...c, { role: "assistant", content: data.text ?? data.content ?? "No response." }]);
    } catch (err) {
      toast({ title: "AI error", description: String(err), variant: "destructive" });
    } finally { setIsLoading(false); }
  }, [userMsg, isLoading, storeId, mode, planner, conversation, toast]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
        {conversation.length === 0 && (
          <div className="text-center text-sm text-muted-foreground pt-4">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Ask for styling suggestions, cover copy, or section ideas.
          </div>
        )}
        {conversation.map((msg, i) => (
          <div key={i} className={`text-sm rounded-lg p-2.5 ${msg.role === "user" ? "bg-primary text-primary-foreground ml-4" : "bg-muted mr-4"}`}>
            {msg.content}
          </div>
        ))}
        {isLoading && <div className="bg-muted rounded-lg p-2.5 mr-4 text-sm text-muted-foreground animate-pulse">Thinking…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t flex gap-2 shrink-0">
        <Input value={userMsg} onChange={(e) => setUserMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about this planner…" className="text-sm"
        />
        <Button size="icon" onClick={send} disabled={!userMsg.trim() || isLoading}>
          <Bot className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Live Preview (compact) ────────────────────────────────────────────────────

function LivePreview({ planner }: { planner: StorePlannerConfig }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planners/preview", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup: planner.setup, style: planner.style, output: planner.output, sections: planner.style.sections ?? [] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      toast({ title: "Preview failed", description: String(err), variant: "destructive" });
    } finally { setLoading(false); }
  }, [planner, previewUrl, toast]);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <p className="text-[11px] font-medium text-muted-foreground">PDF preview</p>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={loadPreview} disabled={loading}>
          {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          {loading ? "" : "Load"}
        </Button>
      </div>
      {previewUrl ? (
        <iframe src={`${previewUrl}#view=FitH`} className="w-full h-48 border-0" title="PDF Preview" />
      ) : (
        <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
          <Eye className="w-4 h-4 mr-1.5 opacity-40" /> Click Load to preview
        </div>
      )}
    </div>
  );
}

// ── Main Planner Studio ────────────────────────────────────────────────────────

export default function PlannerStudio({ storeId, role, aiEnabled }: Props) {
  const [phase, setPhase]             = useState<"select" | "create" | "studio">("select");
  const [activePlanner, setActivePlanner] = useState<StorePlannerConfig | null>(null);
  const [mode, setMode]               = useState<StudioMode>("build");
  const [dockTab, setDockTab]         = useState<DockTab>("preview");

  const handleCreated = (p: StorePlannerConfig) => { setActivePlanner(p); setPhase("studio"); setMode("build"); };
  const handleSelected = (p: StorePlannerConfig) => { setActivePlanner(p); setPhase("studio"); setMode("build"); };
  const handleUpdated  = (p: StorePlannerConfig) => setActivePlanner(p);

  // ── Pre-studio phases ──────────────────────────────────────────────────────

  if (phase === "select") {
    return (
      <PlannerSelector storeId={storeId} onSelect={handleSelected} onCreate={() => setPhase("create")} />
    );
  }

  if (phase === "create") {
    return (
      <NewPlannerForm storeId={storeId} onCreated={handleCreated} onCancel={() => setPhase("select")} />
    );
  }

  if (!activePlanner) return null;

  // ── Studio ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Tab bar */}
      <div className="shrink-0 border-b bg-background">
        <div className="flex items-center px-4 h-12 gap-1">
          {/* Back */}
          <button
            onClick={() => { setPhase("select"); setActivePlanner(null); }}
            className="text-xs text-muted-foreground hover:text-foreground shrink-0 flex items-center gap-1 mr-2"
          >
            ← Planners
          </button>
          <div className="w-px h-4 bg-border shrink-0" />

          {/* Mode pills */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-0.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap transition-all shrink-0 ${
                    mode === m.id
                      ? "bg-[#1B2A4A] text-white font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status + save */}
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-medium border text-muted-foreground">
              {activePlanner.generatedAt ? "Generated" : "Draft"}
            </span>
            {activePlanner.drive.pdfFileId && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                <Download className="w-3 h-3" /> Save to Drive
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body: left rail | center | right dock */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left rail */}
        <LeftRail planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />

        {/* Center */}
        <main className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none", minWidth: 0 }}>
          {mode === "build"    && <BuildMode    planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} onAskClaude={() => setDockTab("ai")} />}
          {mode === "cover"    && <CoverMode    planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
          {mode === "theme"    && <ThemeMode    planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
          {mode === "paper"    && <PaperMode    planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
          {mode === "quality"  && <QualityMode  planner={activePlanner} />}
          {mode === "dividers" && <DividersMode planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
          {mode === "inserts"  && <InsertsMode  storeId={storeId} aiEnabled={aiEnabled} isSuperAdmin={isSuperAdminRole(role)} />}
          {mode === "editions" && <EditionsMode planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
          {mode === "hotspots" && <HotspotEditor storeId={storeId} />}
        </main>

        {/* Right dock */}
        <RightDock
          planner={activePlanner} storeId={storeId} mode={mode}
          dockTab={dockTab} onDockTab={setDockTab}
        />
      </div>
    </div>
  );
}
