/**
 * NewRecipe — Progressive build-center for authoring a product recipe.
 *
 * Route: /super/recipes/new
 *
 * Design principle: options appear as a consequence of a decision already
 * made, never all at once. Three levels narrow:
 *   Platform  → picks from everything a type allows
 *   Store owner → sees only what the recipe enabled
 *   Consumer  → picks a template, changes two or three things
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, CalendarDays, BookOpen, LayoutGrid,
  Sparkles, Star, Layers2, Check, Minus,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { recipesApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK    = "hsl(221 46% 17%)";
const CLAY   = "#C87560";
const PAPER  = "hsl(38 65% 96%)";
const BORDER = "hsl(38 30% 88%)";
const MUTED  = "hsl(216 15% 52%)";

const EYEBROW    = "text-[10px] font-semibold uppercase tracking-[0.18em]";
const INPUT_CLS  = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C87560]";
const INPUT_STY  = { borderColor: BORDER, background: "white" } as React.CSSProperties;

// ── Types ─────────────────────────────────────────────────────────────────────
type ProductTypeId = "planner" | "journal" | "memory" | "solo" | "stickers" | "inserts";

interface PartDef {
  key: string;
  name: string;
  description: string;
}

interface DecisionCard {
  prompt: string;
  optionA: { label: string; consequence: string };
  optionB: { label: string; consequence: string };
}

interface TypeConfig {
  id: ProductTypeId;
  name: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  note: string;
  defaultOn: string[];
  available: string[];
  never: string[];
  decision: DecisionCard;
  defaultName: string;
  defaultStudio: string;
}

// ── Part definitions ──────────────────────────────────────────────────────────
const PARTS: Record<string, PartDef> = {
  "page recipes":   { key: "page recipes",   name: "Page recipes",   description: "The layout engine — grids, lines, spreads" },
  "date engine":    { key: "date engine",    name: "Date engine",    description: "Real dates, weekday columns, month rollover" },
  "hyperlink layer":{ key: "hyperlink layer",name: "Hyperlink layer",description: "Internal PDF links — tabs, contents, cross-refs" },
  "tab rail":       { key: "tab rail",       name: "Tab rail",       description: "Edge tabs and dividers" },
  "trackers":       { key: "trackers",       name: "Trackers",       description: "Habit, mood, run and progress grids" },
  "photo layouts":  { key: "photo layouts",  name: "Photo layouts",  description: "Collage frames the buyer drops images into" },
  "imposition":     { key: "imposition",     name: "Imposition",     description: "Letter-size tiling for home printing" },
  "index sheet":    { key: "index sheet",    name: "Index sheet",    description: "A visual contents page of everything included" },
  "prompt decks":   { key: "prompt decks",   name: "Prompt decks",   description: "Curated question sets for journaling or play" },
  "cut paths":      { key: "cut paths",      name: "Cut paths",      description: "SVG cut lines for Cricut / Silhouette" },
};

// ── Type configs ──────────────────────────────────────────────────────────────
const TYPE_CONFIGS: TypeConfig[] = [
  {
    id: "planner",
    name: "Planner",
    Icon: CalendarDays,
    note: "Dated or undated, tabbed, hyperlinked. The heaviest type — it can use nearly every engine.",
    defaultOn:  ["page recipes", "date engine", "hyperlink layer", "tab rail", "trackers"],
    available:  ["photo layouts", "imposition", "index sheet"],
    never:      ["prompt decks", "cut paths"],
    decision: {
      prompt: "Dated or undated?",
      optionA: { label: "Dated",   consequence: "Dated — real dates, weekday columns, calendar links. Sells by year." },
      optionB: { label: "Undated", consequence: "Undated — blank date fields, reusable. Sells forever." },
    },
    defaultName:   "Planner",
    defaultStudio: "Planner Studio",
  },
  {
    id: "journal",
    name: "Journal / notebook",
    Icon: BookOpen,
    note: "Guided or open. A prompt on every page, or pure paper. Simple engine set.",
    defaultOn:  ["page recipes", "tab rail", "index sheet"],
    available:  ["prompt decks", "trackers", "imposition"],
    never:      ["date engine", "hyperlink layer", "cut paths", "photo layouts"],
    decision: {
      prompt: "Guided or open?",
      optionA: { label: "Guided", consequence: "Guided — a prompt on every page. Good for a first-time journaler." },
      optionB: { label: "Open",   consequence: "Open — paper only. Good for someone who already writes." },
    },
    defaultName:   "Journal",
    defaultStudio: "Journal Studio",
  },
  {
    id: "memory",
    name: "Memory keeping",
    Icon: LayoutGrid,
    note: "Photo collage or pocket pages. The buyer provides the images; the recipe provides the frames.",
    defaultOn:  ["photo layouts", "page recipes", "index sheet"],
    available:  ["tab rail", "imposition", "trackers"],
    never:      ["date engine", "hyperlink layer", "prompt decks", "cut paths"],
    decision: {
      prompt: "Album or pocket pages?",
      optionA: { label: "Album",  consequence: "Album — full-page collage templates the buyer drops photos into." },
      optionB: { label: "Pocket", consequence: "Pocket — gridded card slots, scrapbook style." },
    },
    defaultName:   "Memory keeping",
    defaultStudio: "Journal Studio",
  },
  {
    id: "solo",
    name: "Solo game journal",
    Icon: Sparkles,
    note: "Prompt-driven or mechanics-driven. Either way, a journal the buyer fills through play.",
    defaultOn:  ["prompt decks", "trackers", "page recipes"],
    available:  ["tab rail", "index sheet", "imposition"],
    never:      ["date engine", "hyperlink layer", "photo layouts", "cut paths"],
    decision: {
      prompt: "Story-led or system-led?",
      optionA: { label: "Story-led",  consequence: "Story-led — prompts carry the fiction, light mechanics." },
      optionB: { label: "System-led", consequence: "System-led — tables and trackers drive play." },
    },
    defaultName:   "Solo game journal",
    defaultStudio: "Journal Studio",
  },
  {
    id: "stickers",
    name: "Sticker pack",
    Icon: Star,
    note: "Cut-ready or digital-only. The lightest engine set — mostly about output format.",
    defaultOn:  ["cut paths", "index sheet", "imposition"],
    available:  [],
    never:      ["page recipes", "date engine", "hyperlink layer", "tab rail", "photo layouts", "prompt decks", "trackers"],
    decision: {
      prompt: "Digital or print & cut?",
      optionA: { label: "Digital",      consequence: "Digital — transparent PNGs sized for GoodNotes." },
      optionB: { label: "Print & cut",  consequence: "Print & cut — adds a cut path and a Letter-size sheet." },
    },
    defaultName:   "Sticker pack",
    defaultStudio: "Sticker Studio",
  },
  {
    id: "inserts",
    name: "Insert set",
    Icon: Layers2,
    note: "Page inserts or widget overlays. Slots into an existing planner or journal.",
    defaultOn:  ["page recipes", "trackers"],
    available:  ["hyperlink layer", "photo layouts", "index sheet"],
    never:      ["date engine", "tab rail", "prompt decks", "cut paths", "imposition"],
    decision: {
      prompt: "Whole page or widget?",
      optionA: { label: "Page",   consequence: "Page — slots in, gets a tab and a contents entry." },
      optionB: { label: "Widget", consequence: "Widget — a placed tracker on an existing page." },
    },
    defaultName:   "Insert set",
    defaultStudio: "Planner Studio",
  },
];

const STUDIO_OPTIONS = [
  "Planner Studio", "Sticker Studio", "Journal Studio", "Theme Studio", "Marketing Studio",
];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── TypeCard ──────────────────────────────────────────────────────────────────
function TypeCard({
  config, selected, onClick,
}: { config: TypeConfig; selected: boolean; onClick: () => void }) {
  const { Icon, name } = config;
  return (
    <button
      onClick={onClick}
      className="relative text-left rounded-xl border p-4 transition-all focus:outline-none"
      style={selected ? {
        background: "hsl(12 55% 95%)",
        borderColor: CLAY,
        boxShadow: `inset 3px 0 0 ${CLAY}`,
      } : {
        background: "white",
        borderColor: BORDER,
      }}
    >
      <Icon
        className="w-5 h-5 mb-2.5"
        style={{ color: selected ? CLAY : "hsl(221 46% 42%)" }}
      />
      <p className="font-semibold text-sm leading-tight" style={{ color: INK }}>{name}</p>
    </button>
  );
}

// ── PartToggleCard ────────────────────────────────────────────────────────────
function PartToggleCard({
  part, enabled, onToggle,
}: { part: PartDef; enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-start gap-3 text-left rounded-xl border p-4 w-full transition-colors focus:outline-none"
      style={{
        background: enabled ? "white" : "white",
        borderColor: enabled ? CLAY : BORDER,
      }}
    >
      {/* Check indicator */}
      <div
        className="mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center"
        style={enabled ? {
          background: CLAY,
          border: `1.5px solid ${CLAY}`,
        } : {
          background: "transparent",
          border: `1.5px solid ${CLAY}`,
        }}
      >
        {enabled
          ? <Check className="w-3 h-3 text-white" strokeWidth={3} />
          : <Minus className="w-3 h-3" style={{ color: CLAY }} strokeWidth={3} />
        }
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm leading-tight" style={{ color: INK }}>{part.name}</p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: MUTED }}>{part.description}</p>
      </div>
    </button>
  );
}

// ── RailRow ───────────────────────────────────────────────────────────────────
function RailRow({
  num, label, desc,
}: { num: number | string; label: string; desc: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: PAPER, borderColor: BORDER }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold font-display tabular-nums" style={{ color: INK }}>{num}</span>
        <span className="text-sm font-semibold" style={{ color: INK }}>{label}</span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{desc}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewRecipePage() {
  const [, navigate] = useLocation();
  const { toast }    = useToast();
  const qc           = useQueryClient();

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const [productType, setProductType] = useState<ProductTypeId | null>(null);
  const typeConfig = productType ? TYPE_CONFIGS.find(t => t.id === productType)! : null;

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const [enabledParts, setEnabledParts] = useState<Set<string>>(new Set());

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const [dcPrompt, setDcPrompt] = useState("");
  const [dcALabel, setDcALabel] = useState("");
  const [dcACons,  setDcACons]  = useState("");
  const [dcBLabel, setDcBLabel] = useState("");
  const [dcBCons,  setDcBCons]  = useState("");

  // ── Publishing details ────────────────────────────────────────────────────
  const [showPublishing, setShowPublishing] = useState(false);
  const [name,      setName]      = useState("");
  const [category,  setCategory]  = useState(STUDIO_OPTIONS[0]);
  const [month,     setMonth]     = useState(new Date().getMonth() + 1);
  const [year,      setYear]      = useState(new Date().getFullYear() + 1);
  const [tiers,     setTiers]     = useState<string[]>(["all"]);
  const [prints,    setPrints]    = useState(false);
  const [impSheet,  setImpSheet]  = useState("");
  const [briefAsks, setBriefAsks] = useState("");
  const [briefGen,  setBriefGen]  = useState("");
  const [saving,    setSaving]    = useState(false);

  // Reset steps 2 + 3 when type changes
  useEffect(() => {
    if (!typeConfig) return;
    setEnabledParts(new Set(typeConfig.defaultOn));
    setDcPrompt(typeConfig.decision.prompt);
    setDcALabel(typeConfig.decision.optionA.label);
    setDcACons(typeConfig.decision.optionA.consequence);
    setDcBLabel(typeConfig.decision.optionB.label);
    setDcBCons(typeConfig.decision.optionB.consequence);
    setName(typeConfig.defaultName);
    setCategory(typeConfig.defaultStudio);
  }, [productType]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePart = (key: string) =>
    setEnabledParts(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // ── Rail numbers ──────────────────────────────────────────────────────────
  const platformCount    = typeConfig
    ? typeConfig.defaultOn.length + typeConfig.available.length
    : ("—" as const);
  const storeOwnerCount  = typeConfig ? enabledParts.size : ("—" as const);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!productType || !typeConfig) {
      toast({ title: "Pick a product type first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await recipesApi.create({
        name: name.trim() || typeConfig.defaultName,
        category,
        parts: Array.from(enabledParts),
        decisionCard: dcPrompt ? {
          prompt:  dcPrompt,
          optionA: { label: dcALabel, consequence: dcACons },
          optionB: { label: dcBLabel, consequence: dcBCons },
        } : undefined,
        physicalPath: { prints, impositionSheet: impSheet, templates: [] },
        claudeBrief:  { asks: briefAsks.split("\n").filter(Boolean), generates: briefGen },
        release:      { planTiers: tiers, month, year },
      });
      qc.invalidateQueries({ queryKey: ["platform-recipes"] });
      qc.invalidateQueries({ queryKey: ["platform-recipes-stats"] });
      toast({ title: "Recipe saved as draft" });
      navigate("/super/recipes");
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: PAPER }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <button
          onClick={() => navigate("/super/recipes")}
          className="inline-flex items-center gap-1.5 text-sm mb-3 transition-opacity hover:opacity-70"
          style={{ color: MUTED }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Recipes
        </button>
        <h1 className="text-2xl font-bold font-display" style={{ color: INK }}>New recipe</h1>
        <p className="text-sm mt-0.5" style={{ color: MUTED }}>
          Pick the product type first. Everything after narrows to what that type can actually use.
        </p>
      </div>

      {/* ── Two-column grid ─────────────────────────────────────────────── */}
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "1.5fr 1fr", alignItems: "start" }}
      >

        {/* ══ LEFT: Steps ════════════════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">

          {/* ── STEP 1: What kind of product? ───────────────────────────── */}
          <div className="rounded-2xl border p-6" style={{ background: "white", borderColor: BORDER }}>
            <p className={`${EYEBROW} mb-0.5`} style={{ color: CLAY }}>Step 1</p>
            <h2 className="text-sm font-extrabold uppercase tracking-wide mb-1" style={{ color: INK }}>
              What kind of product?
            </h2>
            <p className="text-xs mb-5" style={{ color: MUTED }}>
              This one answer decides which engines are even offered below.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {TYPE_CONFIGS.map(tc => (
                <TypeCard
                  key={tc.id}
                  config={tc}
                  selected={productType === tc.id}
                  onClick={() => setProductType(tc.id)}
                />
              ))}
            </div>

            {/* Type note */}
            {typeConfig && (
              <div
                className="mt-4 rounded-xl px-4 py-3 text-sm leading-relaxed"
                style={{ background: "hsl(12 55% 95%)", color: "hsl(12 55% 32%)" }}
              >
                {typeConfig.note}
              </div>
            )}
          </div>

          {/* ── Steps 2 + 3 gated ───────────────────────────────────────── */}
          {!productType ? (
            <div
              className="rounded-2xl p-10 text-center"
              style={{ border: `1.5px dashed ${BORDER}` }}
            >
              <p className="font-semibold text-sm" style={{ color: MUTED }}>
                Steps 2 and 3 appear once you pick a type
              </p>
              <p
                className="text-xs mt-2 max-w-[260px] mx-auto leading-relaxed"
                style={{ color: "hsl(216 15% 68%)" }}
              >
                Showing every option at once is how a builder becomes unusable.
                The type is what makes the rest short.
              </p>
            </div>
          ) : (
            <>
              {/* ── STEP 2: Parts ────────────────────────────────────────── */}
              <div className="rounded-2xl border p-6" style={{ background: "white", borderColor: BORDER }}>
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className={`${EYEBROW} mb-0.5`} style={{ color: CLAY }}>Step 2</p>
                    <h2 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: INK }}>
                      Parts a {typeConfig!.name} can use
                    </h2>
                  </div>
                  <span
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-2"
                    style={{ background: CLAY, color: "white" }}
                  >
                    {enabledParts.size} on
                  </span>
                </div>
                <p className="text-xs mb-5" style={{ color: MUTED }}>
                  Sensible defaults are already on. Turn off what this recipe should not offer —
                  store owners never see the rest.
                </p>

                {/* Parts grid */}
                {(typeConfig!.defaultOn.length + typeConfig!.available.length) > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[...typeConfig!.defaultOn, ...typeConfig!.available].map(key => {
                      const part = PARTS[key];
                      if (!part) return null;
                      return (
                        <PartToggleCard
                          key={key}
                          part={part}
                          enabled={enabledParts.has(key)}
                          onToggle={() => togglePart(key)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: MUTED }}>
                    No optional parts for this type.
                  </p>
                )}

                {/* Not offered row */}
                {typeConfig!.never.length > 0 && (
                  <div className="mt-5 pt-4 border-t" style={{ borderColor: BORDER }}>
                    <p className={`${EYEBROW} mb-2`} style={{ color: MUTED }}>
                      Not offered for this type
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {typeConfig!.never.map(key => (
                        <span
                          key={key}
                          className="px-2.5 py-1 rounded-full border text-xs"
                          style={{
                            borderColor: BORDER,
                            color: MUTED,
                            background: "hsl(38 30% 97%)",
                          }}
                        >
                          {PARTS[key]?.name ?? key}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── STEP 3: Decision card ────────────────────────────────── */}
              <div className="rounded-2xl border p-6" style={{ background: "white", borderColor: BORDER }}>
                <p className={`${EYEBROW} mb-0.5`} style={{ color: CLAY }}>Step 3</p>
                <h2 className="text-sm font-extrabold uppercase tracking-wide mb-1" style={{ color: INK }}>
                  The one question the buyer answers
                </h2>
                <p className="text-xs mb-5" style={{ color: MUTED }}>
                  Every recipe opens with a single either/or. Anything else waits until after they answer it.
                </p>

                {/* Question */}
                <div className="mb-5">
                  <label
                    className={`${EYEBROW} block mb-1.5`}
                    style={{ color: MUTED }}
                  >
                    Question
                  </label>
                  <input
                    className={INPUT_CLS}
                    style={INPUT_STY}
                    value={dcPrompt}
                    onChange={e => setDcPrompt(e.target.value)}
                    placeholder="e.g. Dated or undated?"
                  />
                </div>

                {/* Option cards */}
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { label: dcALabel, setLabel: setDcALabel, cons: dcACons, setCons: setDcACons, slot: "A" },
                    { label: dcBLabel, setLabel: setDcBLabel, cons: dcBCons, setCons: setDcBCons, slot: "B" },
                  ] as const).map(({ label, setLabel, cons, setCons, slot }) => (
                    <div
                      key={slot}
                      className="rounded-xl border p-4 space-y-2"
                      style={{ borderColor: BORDER, background: PAPER }}
                    >
                      <input
                        className={INPUT_CLS}
                        style={INPUT_STY}
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder={`Option ${slot} label`}
                      />
                      <textarea
                        className={`${INPUT_CLS} resize-none text-xs leading-relaxed`}
                        style={INPUT_STY}
                        rows={3}
                        value={cons}
                        onChange={e => setCons(e.target.value)}
                        placeholder="Plain-language consequence…"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Publishing details (collapsed) ─────────────────────────── */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: "white", borderColor: BORDER }}
          >
            <button
              onClick={() => setShowPublishing(p => !p)}
              className="w-full flex items-center justify-between px-6 py-4 text-left focus:outline-none"
            >
              <div>
                <p className="font-semibold text-sm" style={{ color: INK }}>Publishing details</p>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  Name, studio, physical path, Claude brief, release month/year, plan tiers
                </p>
              </div>
              {showPublishing
                ? <ChevronUp  className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
              }
            </button>

            {showPublishing && (
              <div
                className="px-6 pb-6 space-y-4 border-t"
                style={{ borderColor: BORDER }}
              >
                {/* Name + studio */}
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <div>
                    <label className={`${EYEBROW} block mb-1.5`} style={{ color: MUTED }}>Name</label>
                    <input
                      className={INPUT_CLS}
                      style={INPUT_STY}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={typeConfig?.defaultName ?? "Recipe name"}
                    />
                  </div>
                  <div>
                    <label className={`${EYEBROW} block mb-1.5`} style={{ color: MUTED }}>Studio</label>
                    <select
                      className={INPUT_CLS}
                      style={INPUT_STY}
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                    >
                      {STUDIO_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {/* Physical path */}
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: BORDER, background: PAPER }}
                >
                  <p className={`${EYEBROW} mb-1`} style={{ color: MUTED }}>Physical path</p>
                  <label
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    style={{ color: INK }}
                  >
                    <input
                      type="checkbox"
                      checked={prints}
                      onChange={e => setPrints(e.target.checked)}
                    />
                    This recipe produces a printable file
                  </label>
                  {prints && (
                    <input
                      className={INPUT_CLS}
                      style={INPUT_STY}
                      value={impSheet}
                      onChange={e => setImpSheet(e.target.value)}
                      placeholder="Imposition sheet (e.g. US Letter 8.5×11)"
                    />
                  )}
                </div>

                {/* Claude brief */}
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: BORDER, background: PAPER }}
                >
                  <p className={`${EYEBROW}`} style={{ color: MUTED }}>Claude brief</p>
                  <div>
                    <label
                      className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                      style={{ color: MUTED }}
                    >
                      What the assistant asks for (one per line)
                    </label>
                    <textarea
                      className={`${INPUT_CLS} resize-none`}
                      style={INPUT_STY}
                      rows={3}
                      value={briefAsks}
                      onChange={e => setBriefAsks(e.target.value)}
                      placeholder={"What is the planner for?\nWhat tone should the design take?"}
                    />
                  </div>
                  <div>
                    <label
                      className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                      style={{ color: MUTED }}
                    >
                      What it generates from a premise
                    </label>
                    <input
                      className={INPUT_CLS}
                      style={INPUT_STY}
                      value={briefGen}
                      onChange={e => setBriefGen(e.target.value)}
                      placeholder="A fully structured section layout with cover concept"
                    />
                  </div>
                </div>

                {/* Release */}
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: BORDER, background: PAPER }}
                >
                  <p className={`${EYEBROW}`} style={{ color: MUTED }}>Release</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                        style={{ color: MUTED }}
                      >
                        Month
                      </label>
                      <select
                        className={INPUT_CLS}
                        style={INPUT_STY}
                        value={month}
                        onChange={e => setMonth(Number(e.target.value))}
                      >
                        {MONTH_NAMES.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                        style={{ color: MUTED }}
                      >
                        Year
                      </label>
                      <input
                        type="number"
                        className={INPUT_CLS}
                        style={INPUT_STY}
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        min={2024}
                        max={2030}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="text-[10px] font-semibold uppercase tracking-wide block mb-1.5"
                      style={{ color: MUTED }}
                    >
                      Plan tiers
                    </label>
                    <div className="flex gap-3 flex-wrap">
                      {["all", "pro", "starter"].map(t => (
                        <label
                          key={t}
                          className="flex items-center gap-1.5 text-sm cursor-pointer"
                          style={{ color: INK }}
                        >
                          <input
                            type="checkbox"
                            checked={tiers.includes(t)}
                            onChange={() =>
                              setTiers(prev =>
                                prev.includes(t)
                                  ? prev.filter(x => x !== t)
                                  : [...prev, t]
                              )
                            }
                          />
                          {t === "all" ? "All plans" : t.charAt(0).toUpperCase() + t.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT: Who sees what rail ═══════════════════════════════════ */}
        <div style={{ position: "sticky", top: "1rem" }}>
          <div
            className="rounded-2xl border p-5 mb-3"
            style={{ background: "white", borderColor: BORDER }}
          >
            <p className={`${EYEBROW} mb-0.5`} style={{ color: CLAY }}>Who sees what</p>
            <p className="text-xs mb-5 leading-relaxed" style={{ color: MUTED }}>
              Choice narrows at every level. That is the whole design.
            </p>

            <div className="space-y-2.5">
              <RailRow
                num={platformCount}
                label="You · platform"
                desc="Choose from every part this product type can use. Authored once."
              />
              <RailRow
                num={storeOwnerCount}
                label="Store owner"
                desc="Sees only what you enabled, pre-filled from a theme. Adjusts what matters to them."
              />
              <RailRow
                num={3}
                label="Consumer"
                desc="Picks a template, changes two or three things. Never sees the rest."
              />
            </div>

            <p
              className="text-xs mt-5 pt-4 border-t leading-relaxed"
              style={{ borderColor: BORDER, color: MUTED }}
            >
              Store owners and consumers start from a{" "}
              <strong style={{ color: INK }}>theme</strong> or a finished template, not a blank
              builder. They add to it — they do not assemble it.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !productType}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: CLAY }}
          >
            {saving ? "Saving…" : "Save recipe as draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
