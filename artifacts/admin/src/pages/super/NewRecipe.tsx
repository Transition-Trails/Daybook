/**
 * NewRecipe — Progressive build-center for authoring a product recipe.
 *
 * Route: /super/recipes/new
 *
 * Step 0  Claude drafting (optional assisted path)
 * Step 1  Product type (gates everything below)
 * Step 2  Parts toggle
 * Step 3  Buyer decision card
 * ···     Publishing details (collapsed)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, CalendarDays, BookOpen, LayoutGrid,
  Sparkles, Star, Layers2, Check, Minus,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { recipesApi, storageApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK    = "hsl(221 46% 17%)";
const CLAY   = "#C87560";
const PAPER  = "var(--admin-paper)";
const BORDER = "var(--admin-border)";
const MUTED  = "var(--admin-muted)";

const EYEBROW   = "text-[10px] font-semibold uppercase tracking-[0.18em]";
const INPUT_CLS = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C87560]";
const INPUT_STY = { borderColor: BORDER, background: "white" } as React.CSSProperties;

const CLAY_GRADIENT = `linear-gradient(135deg, ${CLAY} 0%, hsl(12 60% 42%) 100%)`;

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

interface DraftResult {
  productType: ProductTypeId;
  partsOn: string[];
  partsOff: Array<{ key: string; reason: string }>;
  decisionCard: DecisionCard;
  reading: { type: string; partsOn: string; partsOff: string; question: string };
  gaps: Array<{ title: string; explanation: string; severity: string }>;
  imageReading: string | null;
}

interface AttachedImage {
  id: string;
  file: File;
  previewUrl: string;  // ObjectURL — display only
  base64: string;      // for Claude vision call
  mediaType: string;
  role: "layout" | "style";
  objectPath?: string; // set after object-storage upload resolves
}

// ── Part definitions ──────────────────────────────────────────────────────────
const PARTS: Record<string, PartDef> = {
  "page recipes":    { key: "page recipes",    name: "Page recipes",    description: "The layout engine — grids, lines, spreads" },
  "date engine":     { key: "date engine",     name: "Date engine",     description: "Real dates, weekday columns, month rollover" },
  "hyperlink layer": { key: "hyperlink layer", name: "Hyperlink layer", description: "Internal PDF links — tabs, contents, cross-refs" },
  "tab rail":        { key: "tab rail",        name: "Tab rail",        description: "Edge tabs and dividers" },
  "trackers":        { key: "trackers",        name: "Trackers",        description: "Habit, mood, run and progress grids" },
  "photo layouts":   { key: "photo layouts",   name: "Photo layouts",   description: "Collage frames the buyer drops images into" },
  "imposition":      { key: "imposition",      name: "Imposition",      description: "Letter-size tiling for home printing" },
  "index sheet":     { key: "index sheet",     name: "Index sheet",     description: "A visual contents page of everything included" },
  "prompt decks":    { key: "prompt decks",    name: "Prompt decks",    description: "Curated question sets for journaling or play" },
  "cut paths":       { key: "cut paths",       name: "Cut paths",       description: "SVG cut lines for Cricut / Silhouette" },
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
      optionA: { label: "Digital",     consequence: "Digital — transparent PNGs sized for GoodNotes." },
      optionB: { label: "Print & cut", consequence: "Print & cut — adds a cut path and a Letter-size sheet." },
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
function TypeCard({ config, selected, onClick }: { config: TypeConfig; selected: boolean; onClick: () => void }) {
  const { Icon, name } = config;
  return (
    <button
      onClick={onClick}
      className="relative text-left rounded-xl border p-4 transition-all focus:outline-none"
      style={selected ? {
        background: "hsl(12 55% 95%)",
        borderColor: CLAY,
        boxShadow: `inset 3px 0 0 ${CLAY}`,
      } : { background: "white", borderColor: BORDER }}
    >
      <Icon className="w-5 h-5 mb-2.5" style={{ color: selected ? CLAY : "hsl(221 46% 42%)" }} />
      <p className="font-semibold text-sm leading-tight" style={{ color: INK }}>{name}</p>
    </button>
  );
}

// ── PartToggleCard ────────────────────────────────────────────────────────────
function PartToggleCard({ part, enabled, onToggle }: { part: PartDef; enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-start gap-3 text-left rounded-xl border p-4 w-full transition-colors focus:outline-none"
      style={{ background: "white", borderColor: enabled ? CLAY : BORDER }}
    >
      <div
        className="mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center"
        style={enabled
          ? { background: CLAY, border: `1.5px solid ${CLAY}` }
          : { background: "transparent", border: `1.5px solid ${CLAY}` }}
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
// entity = eyebrow label (e.g. "YOU · PLATFORM")
// num    = the number shown large
// unit   = inline label after the number (e.g. "parts offered")
// desc   = supporting sentence
function RailRow({ entity, num, unit, desc }: {
  entity: string;
  num: number | string;
  unit: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: PAPER, borderColor: BORDER }}>
      <p className={`${EYEBROW} mb-1.5`} style={{ color: MUTED }}>{entity}</p>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-2xl font-bold font-display tabular-nums" style={{ color: INK }}>{num}</span>
        <span className="text-sm font-semibold" style={{ color: INK }}>{unit}</span>
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

  // ── Claude drafting (Step 0) ──────────────────────────────────────────────
  const [briefText,    setBriefText]    = useState("");
  const [drafting,     setDrafting]     = useState(false);
  const [stagedDraft,  setStagedDraft]  = useState<DraftResult | null>(null);
  const [attachments,  setAttachments]  = useState<AttachedImage[]>([]);
  const [dragging,     setDragging]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref so the productType useEffect can read it synchronously
  const stagedDraftRef = useRef<DraftResult | null>(null);

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

  // When productType changes: apply staged draft values OR reset to type defaults
  useEffect(() => {
    if (!typeConfig) return;
    const sd = stagedDraftRef.current;
    if (sd && sd.productType === productType) {
      setEnabledParts(new Set(sd.partsOn));
      setDcPrompt(sd.decisionCard.prompt);
      setDcALabel(sd.decisionCard.optionA.label);
      setDcACons(sd.decisionCard.optionA.consequence);
      setDcBLabel(sd.decisionCard.optionB.label);
      setDcBCons(sd.decisionCard.optionB.consequence);
    } else {
      setEnabledParts(new Set(typeConfig.defaultOn));
      setDcPrompt(typeConfig.decision.prompt);
      setDcALabel(typeConfig.decision.optionA.label);
      setDcACons(typeConfig.decision.optionA.consequence);
      setDcBLabel(typeConfig.decision.optionB.label);
      setDcBCons(typeConfig.decision.optionB.consequence);
      setName(typeConfig.defaultName);
      setCategory(typeConfig.defaultStudio);
    }
  }, [productType]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePart = (key: string) =>
    setEnabledParts(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // ── Attachment utilities ──────────────────────────────────────────────────
  const readFileAsBase64 = (file: File): Promise<{ base64: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [header, base64] = dataUrl.split(",");
        const mediaType = header.split(":")[1]?.split(";")[0] ?? file.type;
        resolve({ base64, mediaType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /** Upload image to object storage (fire-and-forget — does not block drafting). */
  const uploadToStorage = useCallback(async (id: string, file: File) => {
    try {
      const { uploadURL, objectPath } = await storageApi.requestUploadUrl(
        file.name, file.size, file.type,
      );
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setAttachments(prev => prev.map(a => a.id === id ? { ...a, objectPath } : a));
    } catch {
      // Non-fatal — storage failure doesn't block the draft call
    }
  }, []);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
    const MAX_BYTES = 5 * 1024 * 1024;
    const toAdd = Array.from(fileList)
      .filter(f => ALLOWED.includes(f.type) && f.size <= MAX_BYTES)
      .slice(0, 4 - attachments.length);

    for (const file of toAdd) {
      const { base64, mediaType } = await readFileAsBase64(file);
      const id = Math.random().toString(36).slice(2);
      const previewUrl = URL.createObjectURL(file);
      const newAtt: AttachedImage = { id, file, previewUrl, base64, mediaType, role: "layout" };
      setAttachments(prev => [...prev, newAtt]);
      uploadToStorage(id, file);
    }
  }, [attachments.length, uploadToStorage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  };

  const toggleRole = (id: string) =>
    setAttachments(prev =>
      prev.map(a => a.id === id ? { ...a, role: a.role === "layout" ? "style" : "layout" } : a),
    );

  // ── Rail numbers ──────────────────────────────────────────────────────────
  const platformCount   = typeConfig
    ? typeConfig.defaultOn.length + typeConfig.available.length
    : ("—" as const);
  const storeOwnerCount = typeConfig ? enabledParts.size : ("—" as const);

  // ── Claude drafting handlers ──────────────────────────────────────────────
  const handleDraft = async () => {
    if (!briefText.trim()) return;
    setDrafting(true);
    setStagedDraft(null);
    stagedDraftRef.current = null;
    try {
      const images = attachments.map(a => ({ base64: a.base64, mediaType: a.mediaType, role: a.role }));
      const result = await recipesApi.draftFromBrief(briefText.trim(), images.length > 0 ? images : undefined);
      // Validate productType is one we know
      const validTypes: ProductTypeId[] = ["planner", "journal", "memory", "solo", "stickers", "inserts"];
      if (!validTypes.includes(result.productType as ProductTypeId)) {
        throw new Error(`Unrecognised product type: ${result.productType}`);
      }
      const draft = result as DraftResult;
      stagedDraftRef.current = draft;
      setStagedDraft(draft);

      if (productType === draft.productType) {
        // Type didn't change — apply draft values directly (useEffect won't re-run)
        setEnabledParts(new Set(draft.partsOn));
        setDcPrompt(draft.decisionCard.prompt);
        setDcALabel(draft.decisionCard.optionA.label);
        setDcACons(draft.decisionCard.optionA.consequence);
        setDcBLabel(draft.decisionCard.optionB.label);
        setDcBCons(draft.decisionCard.optionB.consequence);
      } else {
        // Type changed — useEffect will pick up from stagedDraftRef
        setProductType(draft.productType);
      }
    } catch (e: unknown) {
      toast({ title: "Draft failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDrafting(false);
    }
  };

  const handleStartOver = () => {
    setStagedDraft(null);
    stagedDraftRef.current = null;
    setBriefText("");
    setAttachments(prev => { prev.forEach(a => URL.revokeObjectURL(a.previewUrl)); return []; });
  };

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
        claudeBrief: {
          asks:       briefAsks.split("\n").filter(Boolean),
          generates:  briefGen,
          // Persist Claude's engine gaps so the publish endpoint can enforce them
          ...(stagedDraft && {
            engineGaps:   stagedDraft.gaps,
            reading:      stagedDraft.reading,
            imageReading: stagedDraft.imageReading,
            refImages: attachments
              .filter(a => a.objectPath)
              .map(a => ({ objectPath: a.objectPath!, role: a.role })),
          }),
        },
        release: { planTiers: tiers, month, year },
      });
      qc.invalidateQueries({ queryKey: ["platform-recipes"] });
      qc.invalidateQueries({ queryKey: ["platform-recipes-stats"] });
      toast({ title: "Recipe saved as draft" });
      navigate("/super/recipes");
    } catch (e: unknown) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
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
          Pick the product type first. Everything after it narrows to what that type can actually use.
        </p>
      </div>

      {/* ── Two-column grid ─────────────────────────────────────────────── */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1.5fr 1fr", alignItems: "start" }}>

        {/* ══ LEFT: Steps ════════════════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">

          {/* ── STEP 0: Start with Claude ────────────────────────────────── */}
          <div
            className="rounded-2xl p-6"
            style={{ background: "white", border: `1.5px solid ${CLAY}` }}
          >
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              {/* Gradient avatar */}
              <div
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold select-none"
                style={{ background: CLAY_GRADIENT }}
                aria-hidden="true"
              >
                ✦
              </div>
              <div className="min-w-0">
                <p className={`${EYEBROW} mb-0.5`} style={{ color: CLAY }}>Start with Claude</p>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                  Describe the product in plain language. Claude proposes the type, the parts and the
                  buyer's question — and tells you when it needs engine work we don't have yet.
                </p>
              </div>
            </div>

            {/* Staged pill */}
            {stagedDraft && (
              <div
                className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold"
                style={{ background: "hsl(142 76% 93%)", color: "hsl(142 60% 26%)" }}
              >
                ✓ STAGED BELOW — ADJUST ANYTHING
              </div>
            )}

            {/* Textarea */}
            <textarea
              className={`${INPUT_CLS} resize-none mb-3`}
              style={INPUT_STY}
              rows={3}
              value={briefText}
              onChange={e => setBriefText(e.target.value)}
              placeholder="A mobile-sized planner — phone screen proportions, dated, for someone who plans on their phone rather than an iPad."
            />

            {/* ── Attachment row ───────────────────────────────────── */}
            <div
              className="mb-3"
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            >
              <div className="flex items-baseline gap-2 mb-1.5">
                <p className={EYEBROW} style={{ color: MUTED }}>Show Claude what you mean</p>
                <p className="text-[10px]" style={{ color: MUTED }}>
                  Sketches, screenshots, a page you like — optional
                </p>
              </div>

              <div
                className="flex gap-2 items-start"
                style={{
                  padding:      dragging ? 6 : 0,
                  border:       dragging ? `1.5px dashed ${CLAY}` : "1.5px solid transparent",
                  borderRadius: 12,
                  transition:   "all 0.12s",
                  overflowX:    "auto",
                }}
              >
                {/* Thumbnails */}
                {attachments.map(att => (
                  <div key={att.id} className="shrink-0 flex flex-col" style={{ width: 108 }}>
                    <div className="relative mb-1" style={{ height: 76 }}>
                      <img
                        src={att.previewUrl}
                        alt={att.file.name}
                        className="w-full h-full object-cover"
                        style={{ borderRadius: 9, border: `1px solid ${BORDER}` }}
                      />
                      <button
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none"
                        style={{ background: "rgba(0,0,0,0.48)", color: "white", fontSize: 11 }}
                      >
                        ×
                      </button>
                    </div>
                    {/* Role toggle pill */}
                    <button
                      onClick={() => toggleRole(att.id)}
                      title="Click to switch role"
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full mb-0.5 self-start transition-colors"
                      style={att.role === "layout"
                        ? { background: "#E1E8F0", color: "#4A5D78" }
                        : { background: "hsl(12 55% 95%)", color: CLAY }}
                    >
                      {att.role.toUpperCase()}
                    </button>
                    <p className="text-[10.5px] leading-tight" style={{ color: MUTED, maxWidth: 108, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.file.name}
                    </p>
                  </div>
                ))}

                {/* Add image tile */}
                {attachments.length < 4 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 flex flex-col items-center justify-center border-2 border-dashed transition-colors"
                    style={{ width: 108, height: 76, borderRadius: 9, borderColor: BORDER }}
                  >
                    <span style={{ color: CLAY, fontSize: 22, lineHeight: 1, marginBottom: 2 }}>+</span>
                    <span className="text-[10.5px] font-medium" style={{ color: CLAY }}>Add image</span>
                  </button>
                )}

                {/* Explainer */}
                <div className="flex-1 self-start" style={{ minWidth: 150, paddingLeft: 8 }}>
                  <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>
                    Tag each one so Claude knows how to read it.{" "}
                    <strong style={{ color: INK }}>Layout</strong> shapes the parts and page
                    structure.{" "}
                    <strong style={{ color: INK }}>Style</strong> informs the theme brief only —
                    it never changes which engines a recipe uses.
                  </p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDraft}
                disabled={drafting || !briefText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ background: CLAY_GRADIENT }}
              >
                {drafting ? "Drafting…" : "✦ Draft this recipe"}
              </button>
              {stagedDraft && (
                <button
                  onClick={handleStartOver}
                  className="px-3 py-2 rounded-lg text-xs font-medium border transition-opacity hover:opacity-70"
                  style={{ color: MUTED, borderColor: BORDER }}
                >
                  Start over
                </button>
              )}
            </div>

            {/* Reading panel — appears after staging */}
            {stagedDraft && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: BORDER }}>
                <p className={`${EYEBROW} mb-3`} style={{ color: MUTED }}>What Claude read from that</p>
                <dl className="space-y-2">
                  {([
                    // "YOUR SKETCH" row — only when layout images produced a reading
                    ...(stagedDraft.imageReading
                      ? [{ dt: "YOUR SKETCH", dd: stagedDraft.imageReading }]
                      : []),
                    { dt: "TYPE",      dd: stagedDraft.reading.type },
                    { dt: "PARTS ON",  dd: stagedDraft.reading.partsOn },
                    { dt: "PARTS OFF", dd: stagedDraft.reading.partsOff },
                    { dt: "QUESTION",  dd: stagedDraft.reading.question },
                  ]).map(({ dt, dd }) => (
                    <div key={dt} className="grid gap-x-3" style={{ gridTemplateColumns: "80px 1fr" }}>
                      <dt className={`${EYEBROW} pt-0.5`} style={{ color: CLAY }}>{dt}</dt>
                      <dd className="text-xs leading-relaxed" style={{ color: INK }}>{dd}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Engine gaps panel */}
            {stagedDraft && stagedDraft.gaps.length > 0 && (
              <div
                className="mt-4 rounded-xl p-4"
                style={{ background: "#FDF6EF", border: "1px solid #F0E0CF" }}
              >
                <p className="text-sm font-semibold mb-3" style={{ color: INK }}>
                  ⚠ This recipe needs engine work first
                </p>
                <div className="space-y-3">
                  {stagedDraft.gaps.map((gap, i) => (
                    <div key={i}>
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="text-xs font-semibold leading-snug" style={{ color: INK }}>
                          {gap.title}
                        </p>
                        <span
                          className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={gap.severity === "Blocks release"
                            ? { background: "#FBECEB", color: "#A33A32" }
                            : { background: "#FDF0E6", color: "hsl(20 50% 32%)" }}
                        >
                          {gap.severity}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                        {gap.explanation}
                      </p>
                    </div>
                  ))}
                </div>
                <p
                  className="text-xs mt-3 pt-3 border-t leading-relaxed italic"
                  style={{ borderColor: "#F0E0CF", color: MUTED }}
                >
                  Claude staged this so you can review it, but it cannot generate until the engine
                  work above ships. Save it as a draft, build the profile, then release.
                </p>
              </div>
            )}

            {/* Hidden file picker — triggered by the "+ Add image" tile */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </div>

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
                  <p className="text-xs italic" style={{ color: MUTED }}>No optional parts for this type.</p>
                )}

                {typeConfig!.never.length > 0 && (
                  <div className="mt-5 pt-4 border-t" style={{ borderColor: BORDER }}>
                    <p className={`${EYEBROW} mb-2`} style={{ color: MUTED }}>Not offered for this type</p>
                    <div className="flex flex-wrap gap-1.5">
                      {typeConfig!.never.map(key => (
                        <span
                          key={key}
                          className="px-2.5 py-1 rounded-full border text-xs"
                          style={{ borderColor: BORDER, color: MUTED, background: "hsl(38 30% 97%)" }}
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

                <div className="mb-5">
                  <label className={`${EYEBROW} block mb-1.5`} style={{ color: MUTED }}>Question</label>
                  <input
                    className={INPUT_CLS}
                    style={INPUT_STY}
                    value={dcPrompt}
                    onChange={e => setDcPrompt(e.target.value)}
                    placeholder="e.g. Dated or undated?"
                  />
                </div>

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
                ? <ChevronUp   className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
                : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: MUTED }} />
              }
            </button>

            {showPublishing && (
              <div className="px-6 pb-6 space-y-4 border-t" style={{ borderColor: BORDER }}>
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
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: BORDER, background: PAPER }}>
                  <p className={`${EYEBROW} mb-1`} style={{ color: MUTED }}>Physical path</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: INK }}>
                    <input type="checkbox" checked={prints} onChange={e => setPrints(e.target.checked)} />
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
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: BORDER, background: PAPER }}>
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
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: BORDER, background: PAPER }}>
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
                                prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
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

        {/* ══ RIGHT: Choices rail ══════════════════════════════════════════ */}
        <div style={{ position: "sticky", top: "1rem" }}>
          <div
            className="rounded-2xl border p-5 mb-3"
            style={{ background: "white", borderColor: BORDER }}
          >
            <h3 className="text-sm font-extrabold uppercase tracking-wide mb-0.5" style={{ color: INK }}>
              How many choices each person faces
            </h3>
            <p className="text-xs mb-5 leading-relaxed" style={{ color: MUTED }}>
              The same product, seen from three sides. Choice narrows at every level — that is the whole design.
            </p>

            <div className="space-y-2.5">
              <RailRow
                entity="YOU · PLATFORM"
                num={platformCount}
                unit="parts offered"
                desc="Every part this product type can use. You decide which of them the recipe turns on."
              />
              <RailRow
                entity="STORE OWNER"
                num={storeOwnerCount}
                unit="parts they can touch"
                desc="Only the ones you left on above — and already filled in by their theme. They adjust; they do not assemble."
              />
              <RailRow
                entity="CONSUMER"
                num={3}
                unit="choices at checkout"
                desc="The buyer question, a theme, and a palette. Everything else was decided before they arrived."
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
