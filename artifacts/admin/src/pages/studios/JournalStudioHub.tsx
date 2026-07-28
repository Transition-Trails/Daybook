/**
 * Journal Studio — platform workspace for journal and notebook product templates.
 *
 * Modes: Build · Layout · Prompts · Theme · Paper
 *
 * LEFT RAIL: template list (productType "journal" | "notebook") + "New" button
 *
 * Uses the same StudioLayout shell and design tokens as the other studio hubs.
 */
import { useState, useEffect, useRef } from "react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked, Sparkles, Plus, Save, Globe,
  RefreshCw, Check, Trash2,
} from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  SectionLabel, EmptyState, ErrorState, SkeletonRows,
  StatusPill, CHIP_ACTIVE_BG,
} from "@/components/studio/primitives";
import {
  platformPlannersApi, catalogApi,
  type PlatformPlannerConfig,
} from "@/lib/api";
import { aiApi, extractJson } from "@/lib/ai";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ─────────────────────────────────────────────────────────────

const CLAY       = "#C87560";
const PAPER_TINT = "#FFFDF9";
const THIN_SCROLL: React.CSSProperties = {
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(0,0,0,0.12) transparent",
};

// ── Mode definitions ──────────────────────────────────────────────────────────

const MODES = [
  { id: "build",   label: "Build"   },
  { id: "layout",  label: "Layout"  },
  { id: "prompts", label: "Prompts" },
  { id: "theme",   label: "Theme"   },
  { id: "paper",   label: "Paper"   },
] as const;
type ModeId = typeof MODES[number]["id"];

// ── Option lists ──────────────────────────────────────────────────────────────

const PAGE_STYLES = [
  { value: "lined",  label: "Lined"  },
  { value: "dotted", label: "Dotted" },
  { value: "blank",  label: "Blank"  },
  { value: "grid",   label: "Grid"   },
  { value: "mixed",  label: "Mixed"  },
];

const MARGIN_WIDTHS = [
  { value: "narrow",   label: "Narrow"   },
  { value: "standard", label: "Standard" },
  { value: "wide",     label: "Wide"     },
];

const HEADER_STYLES = [
  { value: "minimal",   label: "Minimal"   },
  { value: "date-only", label: "Date only" },
  { value: "full",      label: "Full"      },
];

const PROMPT_DENSITIES = [
  { value: "none",     label: "None — free-form"       },
  { value: "sparse",   label: "Sparse — 1 per spread"  },
  { value: "moderate", label: "Moderate — 1 per page"  },
  { value: "dense",    label: "Dense — 2–3 per page"   },
];

const JOURNAL_TYPES = [
  { value: "journal",  label: "Journal"  },
  { value: "notebook", label: "Notebook" },
];

const BINDING_OPTIONS = [
  { value: "coil",      label: "Coil"         },
  { value: "twin-loop", label: "Twin-loop"     },
  { value: "discs",     label: "Discs"         },
  { value: "3-ring",    label: "3-ring"        },
  { value: "none",      label: "Perfect bound" },
];

const PAPER_COLOURS = [
  { value: "white", label: "White", swatch: "#FFFFFF" },
  { value: "cream", label: "Cream", swatch: "#FFFAF0" },
  { value: "ivory", label: "Ivory", swatch: "#FFFFF0" },
  { value: "kraft", label: "Kraft", swatch: "#D2B48C" },
  { value: "slate", label: "Slate", swatch: "#708090" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isJournal(t: PlatformPlannerConfig) {
  return t.productType === "journal" || t.productType === "notebook";
}

const BUILD_EYEBROW = "text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground";
const BUILD_CONSEQ  = "text-[12px] text-muted-foreground leading-snug";

/** Map template status to StatusPill props */
function statusPillProps(s: string): { label: string; kind: "success" | "neutral" | "warning" } {
  if (s === "published") return { label: "Live",     kind: "success" };
  if (s === "archived")  return { label: "Archived", kind: "warning" };
  return                        { label: "Draft",    kind: "neutral"  };
}

/** Pill-style chip button used everywhere in this file (clay accent on active). */
function PillChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: "pointer",
        background: active ? "#FEF0ED" : "#FAFAF9",
        borderColor: active ? CLAY     : "#E7DCCB",
        color:       active ? CLAY     : "#4B5563",
      }}
      className="h-9 px-4 rounded-full border text-[12.5px] font-medium transition-colors"
    >
      {label}
    </button>
  );
}

// ── AI system prompt ──────────────────────────────────────────────────────────

const JOURNAL_AI_SYSTEM = `You are a creative director for a digital planner brand called Daybook.
Given a journal concept, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "journal template name (2-5 words)",
  "tagline": "one-sentence description for sellers",
  "pageStyle": "lined|dotted|blank|grid|mixed",
  "promptDensity": "none|sparse|moderate|dense",
  "samplePrompts": ["prompt 1", "prompt 2", "prompt 3", "prompt 4"]
}
samplePrompts: 4 reflective, open-ended journaling prompts that fit the concept.`;

// ── Template rail ─────────────────────────────────────────────────────────────

function TemplateRail({
  templates, selectedId, onSelect, onCreate, isLoading, isError,
}: {
  templates: PlatformPlannerConfig[];
  selectedId: string | null;
  onSelect: (t: PlatformPlannerConfig) => void;
  onCreate: () => void;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={onCreate}
          style={{ cursor: "pointer", background: CHIP_ACTIVE_BG }}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-white text-[12.5px] font-semibold transition-opacity hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          New template
        </button>
      </div>

      <div className="px-3 pb-1">
        <SectionLabel>Templates ({templates.length})</SectionLabel>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2" style={THIN_SCROLL}>
        {isLoading && <SkeletonRows count={4} />}
        {isError && (
          <ErrorState message="Couldn't load templates" />
        )}
        {!isLoading && !isError && templates.length === 0 && (
          <EmptyState
            icon={<BookMarked className="w-6 h-6 text-muted-foreground" />}
            title="No journal templates yet"
            description="Create your first template to get started."
          />
        )}
        {templates.map(t => {
          const active = t.id === selectedId;
          const sp = statusPillProps(t.status);
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              style={{
                cursor: "pointer",
                background: active ? "#FEF0ED" : PAPER_TINT,
                borderColor: active ? CLAY     : "#E7DCCB",
              }}
              className="w-full text-left p-3 rounded-xl border transition-colors hover:border-[#C87560]/60 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12.5px] font-semibold leading-tight text-foreground line-clamp-2 flex-1">
                  {t.name}
                </p>
                <StatusPill label={sp.label} kind={sp.kind} />
              </div>
              <p className="text-[11px] text-muted-foreground capitalize">{t.productType}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Build tab ─────────────────────────────────────────────────────────────────

function BuildPanel({ template, onUpdated }: { template: PlatformPlannerConfig | null; onUpdated: (t: PlatformPlannerConfig) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [name,        setName]        = useState(template?.name        ?? "");
  const [productType, setProductType] = useState(template?.productType ?? "journal");
  const [description, setDescription] = useState(template?.description ?? "");

  useEffect(() => {
    setName(       template?.name        ?? "");
    setProductType(template?.productType ?? "journal");
    setDescription(template?.description ?? "");
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: () => platformPlannersApi.patch(template!.id, {
      name: name.trim(),
      description: description.trim() || undefined,
    }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-journals"] }); onUpdated(t); toast({ title: "Saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const pubMut = useMutation({
    mutationFn: () => platformPlannersApi.publish(template!.id),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-journals"] }); onUpdated(t); toast({ title: "Published!" }); },
    onError: (err: Error) => toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: () => platformPlannersApi.delete(template!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-journals"] }); toast({ title: "Archived" }); },
    onError: (err: Error) => toast({ title: "Archive failed", description: err.message, variant: "destructive" }),
  });

  const st = template?.style as any;

  if (!template) {
    return (
      <EmptyState
        icon={<BookMarked className="w-8 h-8 text-muted-foreground" />}
        title="Select a template"
        description="Pick a template from the rail, or create a new one."
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-2">
      {/* Name + description */}
      <div className="rounded-[16px] border p-5 space-y-4" style={{ background: PAPER_TINT }}>
        <div>
          <span className={BUILD_EYEBROW}>Template info</span>
          <p className={`${BUILD_CONSEQ} mt-0.5`}>Name and metadata visible to Daybook staff only.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">Template name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Guided Gratitude Journal"
            className="w-full h-10 rounded-xl border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-foreground/40 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">Description (optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Briefly describe the journal's purpose and audience…"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-foreground/40 resize-none transition-colors"
          />
        </div>

        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Type</span>
          <div className="flex flex-wrap gap-2">
            {JOURNAL_TYPES.map(o => (
              <PillChip key={o.value} label={o.label} active={productType === o.value} onClick={() => setProductType(o.value)} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => saveMut.mutate()}
            disabled={!name.trim() || saveMut.isPending}
            style={{ cursor: !name.trim() || saveMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[12.5px] font-semibold disabled:opacity-50"
          >
            {saveMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
          {template.status !== "published" && (
            <button
              onClick={() => pubMut.mutate()}
              disabled={pubMut.isPending}
              style={{ cursor: pubMut.isPending ? "not-allowed" : "pointer" }}
              className="flex items-center gap-2 h-9 px-4 rounded-xl border border-border bg-background text-foreground text-[12.5px] font-semibold hover:border-foreground/40 transition-colors disabled:opacity-50"
            >
              <Globe className="w-3.5 h-3.5" />
              Publish
            </button>
          )}
          {template.status === "published" && (
            <span className="flex items-center gap-1.5 text-[12px] text-emerald-700">
              <Check className="w-3.5 h-3.5" />
              Published
            </span>
          )}
          <button
            onClick={() => { if (window.confirm("Archive this template?")) deleteMut.mutate(); }}
            disabled={deleteMut.isPending}
            style={{ cursor: deleteMut.isPending ? "not-allowed" : "pointer" }}
            className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Style summary */}
      <div className="rounded-[16px] border p-5 space-y-3" style={{ background: PAPER_TINT }}>
        <span className={BUILD_EYEBROW}>Current configuration</span>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          {([
            ["Page style",     st?.pageStyle      ?? "—"],
            ["Margin",         st?.marginWidth    ?? "—"],
            ["Header",         st?.headerStyle    ?? "—"],
            ["Prompt density", st?.promptDensity  ?? "—"],
            ["Theme",          st?.themeId        ? "Set" : "None"],
            ["Binding",        (st?.binding as any)?.type ?? "—"],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-background">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium capitalize">{value}</span>
            </div>
          ))}
        </div>
        <p className={BUILD_CONSEQ}>Switch tabs above to edit each section.</p>
      </div>
    </div>
  );
}

// ── Layout tab ────────────────────────────────────────────────────────────────

function LayoutPanel({ template, onUpdated }: { template: PlatformPlannerConfig | null; onUpdated: (t: PlatformPlannerConfig) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const st = template?.style as any;

  const [pageStyle,   setPageStyle]   = useState<string>(st?.pageStyle   ?? "lined");
  const [marginWidth, setMarginWidth] = useState<string>(st?.marginWidth ?? "standard");
  const [headerStyle, setHeaderStyle] = useState<string>(st?.headerStyle ?? "minimal");

  useEffect(() => {
    const s = (template?.style as any) ?? {};
    setPageStyle(  s.pageStyle   ?? "lined");
    setMarginWidth(s.marginWidth ?? "standard");
    setHeaderStyle(s.headerStyle ?? "minimal");
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: () => platformPlannersApi.patch(template!.id, { style: { pageStyle, marginWidth, headerStyle } as any }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-journals"] }); onUpdated(t); toast({ title: "Layout saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  if (!template) return <EmptyState icon={<BookMarked className="w-8 h-8 text-muted-foreground" />} title="Select a template" description="Pick a template from the rail first." />;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-2">
      <div>
        <span className={BUILD_EYEBROW}>Page layout</span>
        <p className={`${BUILD_CONSEQ} mt-1`}>Controls the printed ruling and structure of each journal page.</p>
      </div>
      <div className="rounded-[16px] border p-5 space-y-5" style={{ background: PAPER_TINT }}>
        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Page style</span>
          <div className="flex flex-wrap gap-2">
            {PAGE_STYLES.map(o => <PillChip key={o.value} label={o.label} active={pageStyle === o.value} onClick={() => setPageStyle(o.value)} />)}
          </div>
        </div>
        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Margin width</span>
          <div className="flex flex-wrap gap-2">
            {MARGIN_WIDTHS.map(o => <PillChip key={o.value} label={o.label} active={marginWidth === o.value} onClick={() => setMarginWidth(o.value)} />)}
          </div>
          <p className={BUILD_CONSEQ}>Wide margins give room for annotations and doodles.</p>
        </div>
        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Page header</span>
          <div className="flex flex-wrap gap-2">
            {HEADER_STYLES.map(o => <PillChip key={o.value} label={o.label} active={headerStyle === o.value} onClick={() => setHeaderStyle(o.value)} />)}
          </div>
          <p className={BUILD_CONSEQ}>"Full" shows date, day of week, and page number. "Minimal" shows date only.</p>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          style={{ cursor: saveMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[12.5px] font-semibold disabled:opacity-50"
        >
          {saveMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save layout
        </button>
      </div>
    </div>
  );
}

// ── Prompts tab ───────────────────────────────────────────────────────────────

interface JournalAiResult { name: string; tagline: string; pageStyle: string; promptDensity: string; samplePrompts: string[] }

function PromptsPanel({ template, onUpdated }: { template: PlatformPlannerConfig | null; onUpdated: (t: PlatformPlannerConfig) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const st = template?.style as any;

  const [promptDensity, setPromptDensity] = useState<string>(st?.promptDensity ?? "none");
  const [samplePrompts, setSamplePrompts] = useState<string[]>(st?.samplePrompts ?? []);
  const [aiConcept, setAiConcept] = useState("");
  const [aiError,   setAiError]   = useState<string | null>(null);

  useEffect(() => {
    const s = (template?.style as any) ?? {};
    setPromptDensity(s.promptDensity ?? "none");
    setSamplePrompts(Array.isArray(s.samplePrompts) ? s.samplePrompts : []);
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: () => platformPlannersApi.patch(template!.id, { style: { promptDensity, samplePrompts } as any }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-journals"] }); onUpdated(t); toast({ title: "Prompts saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const genMut = useMutation({
    mutationFn: () => aiApi.complete(JOURNAL_AI_SYSTEM, aiConcept.trim()),
    onSuccess: (res) => {
      setAiError(null);
      try {
        const parsed = extractJson<JournalAiResult>(res.text);
        if (parsed?.samplePrompts) setSamplePrompts(parsed.samplePrompts.slice(0, 4));
        if (parsed?.promptDensity) setPromptDensity(parsed.promptDensity);
      } catch { setAiError("Claude returned invalid JSON — try rephrasing."); }
    },
    onError: (err: Error) => setAiError(err.message),
  });

  if (!template) return <EmptyState icon={<BookMarked className="w-8 h-8 text-muted-foreground" />} title="Select a template" description="Pick a template from the rail first." />;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-2">
      <div>
        <span className={BUILD_EYEBROW}>Prompt configuration</span>
        <p className={`${BUILD_CONSEQ} mt-1`}>Prompts appear on journal pages to guide the writer. Leave density at "None" for free-form notebooks.</p>
      </div>

      {/* AI brainstorm */}
      <div className="rounded-[16px] border p-5 space-y-3" style={{ background: "#F9F6FF" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span className={BUILD_EYEBROW} style={{ color: "#7C3AED" }}>Brainstorm with Claude</span>
        </div>
        <p className="text-[12px] text-purple-700">Describe the journal concept — Claude suggests a prompt style and 4 sample prompts.</p>
        <textarea
          value={aiConcept}
          onChange={e => setAiConcept(e.target.value)}
          rows={2}
          placeholder="e.g. A gratitude journal for busy mums — quick, warm, achievable…"
          className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-[13px] text-foreground outline-none focus:border-purple-400 resize-none transition-colors"
        />
        {aiError && <p className="text-[12px] text-destructive">{aiError}</p>}
        <button
          onClick={() => genMut.mutate()}
          disabled={!aiConcept.trim() || genMut.isPending}
          style={{ cursor: !aiConcept.trim() || genMut.isPending ? "not-allowed" : "pointer", background: "#7C3AED" }}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[12.5px] font-semibold disabled:opacity-50"
        >
          {genMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {genMut.isPending ? "Generating…" : "Generate prompts"}
        </button>
      </div>

      <div className="rounded-[16px] border p-5 space-y-5" style={{ background: PAPER_TINT }}>
        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Prompt density</span>
          {PROMPT_DENSITIES.map(o => {
            const active = promptDensity === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setPromptDensity(o.value)}
                style={{ cursor: "pointer", background: active ? "#FEF0ED" : "#FAFAF9", borderColor: active ? CLAY : "#E7DCCB" }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left"
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? "border-[#C87560]" : "border-border"}`}>
                  {active && <div className="w-2 h-2 rounded-full bg-[#C87560]" />}
                </div>
                <span className="text-[12.5px] text-foreground">{o.label}</span>
              </button>
            );
          })}
        </div>

        {promptDensity !== "none" && (
          <div className="space-y-2">
            <span className={BUILD_EYEBROW}>Sample prompts</span>
            <p className={BUILD_CONSEQ}>Default prompt library — sellers can customise further.</p>
            <div className="space-y-2">
              {(samplePrompts.length > 0 ? samplePrompts : ["", "", "", ""]).map((p, i) => (
                <input
                  key={i}
                  value={p}
                  onChange={e => { const next = [...samplePrompts]; while (next.length <= i) next.push(""); next[i] = e.target.value; setSamplePrompts(next); }}
                  placeholder={`Prompt ${i + 1}`}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-foreground/40 transition-colors"
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          style={{ cursor: saveMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[12.5px] font-semibold disabled:opacity-50"
        >
          {saveMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save prompts
        </button>
      </div>
    </div>
  );
}

// ── Theme tab ─────────────────────────────────────────────────────────────────

function ThemePanel({ template, onUpdated }: { template: PlatformPlannerConfig | null; onUpdated: (t: PlatformPlannerConfig) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const st = template?.style as any;

  const [themeId,   setThemeId]   = useState<string>(st?.themeId   ?? "");
  const [paletteId, setPaletteId] = useState<string>(st?.paletteId ?? "");

  useEffect(() => {
    const s = (template?.style as any) ?? {};
    setThemeId(  s.themeId   ?? "");
    setPaletteId(s.paletteId ?? "");
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: themes = [] } = useQuery({
    queryKey: ["themes-live"],
    queryFn:  () => catalogApi.themes(),
    staleTime: 60_000,
  });

  const selTheme = (themes as any[]).find((t: any) => t.id === themeId);

  const saveMut = useMutation({
    mutationFn: () => platformPlannersApi.patch(template!.id, { style: { themeId: themeId || null, paletteId: paletteId || null } as any }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-journals"] }); onUpdated(t); toast({ title: "Theme saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  if (!template) return <EmptyState icon={<BookMarked className="w-8 h-8 text-muted-foreground" />} title="Select a template" description="Pick a template from the rail first." />;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-2">
      <div>
        <span className={BUILD_EYEBROW}>Theme</span>
        <p className={`${BUILD_CONSEQ} mt-1`}>Controls the colour palette and typography used throughout the journal.</p>
      </div>
      <div className="rounded-[16px] border p-5 space-y-5" style={{ background: PAPER_TINT }}>
        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Theme</span>
          <select
            value={themeId}
            onChange={e => { setThemeId(e.target.value); setPaletteId(""); }}
            style={{ cursor: "pointer" }}
            className="w-full h-10 rounded-xl border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-foreground/40 transition-colors"
          >
            <option value="">— No theme —</option>
            {(themes as any[]).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {selTheme?.palettes?.length > 0 && (
          <div className="space-y-2">
            <span className={BUILD_EYEBROW}>Colour palette</span>
            <div className="flex flex-wrap gap-2">
              <PillChip label="Theme default" active={!paletteId} onClick={() => setPaletteId("")} />
              {(selTheme.palettes as any[]).map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => setPaletteId(p.id)}
                  style={{
                    cursor: "pointer",
                    borderColor: paletteId === p.id ? CLAY : "#E7DCCB",
                    background:  paletteId === p.id ? "#FEF0ED" : PAPER_TINT,
                  }}
                  className="flex items-center gap-2 h-9 px-3 rounded-full border text-[12px] font-medium transition-colors"
                >
                  {p.colors?.slice(0, 3).map((c: string, i: number) => (
                    <span key={i} className="w-3 h-3 rounded-full inline-block border border-border/20" style={{ background: c }} />
                  ))}
                  <span style={{ color: paletteId === p.id ? CLAY : "#4B5563" }}>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          style={{ cursor: saveMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[12.5px] font-semibold disabled:opacity-50"
        >
          {saveMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save theme
        </button>
      </div>
    </div>
  );
}

// ── Paper tab ─────────────────────────────────────────────────────────────────

function PaperPanel({ template, onUpdated }: { template: PlatformPlannerConfig | null; onUpdated: (t: PlatformPlannerConfig) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const st = template?.style as any;

  const [bindingType,   setBindingType]   = useState<string>((st?.binding as any)?.type   ?? "coil");
  const [bindingFinish, setBindingFinish] = useState<string>((st?.binding as any)?.finish  ?? "gold");
  const [paperColour,   setPaperColour]   = useState<string>(st?.paperColour ?? "white");

  useEffect(() => {
    const s = (template?.style as any) ?? {};
    setBindingType(  (s.binding as any)?.type   ?? "coil");
    setBindingFinish((s.binding as any)?.finish  ?? "gold");
    setPaperColour(  s.paperColour               ?? "white");
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: () => platformPlannersApi.patch(template!.id, {
      style: { binding: { type: bindingType, finish: bindingFinish }, paperColour } as any,
    }),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["platform-journals"] }); onUpdated(t); toast({ title: "Paper & binding saved" }); },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  if (!template) return <EmptyState icon={<BookMarked className="w-8 h-8 text-muted-foreground" />} title="Select a template" description="Pick a template from the rail first." />;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-2">
      <div>
        <span className={BUILD_EYEBROW}>Paper & binding</span>
        <p className={`${BUILD_CONSEQ} mt-1`}>Physical specifications — guides print-on-demand partners.</p>
      </div>
      <div className="rounded-[16px] border p-5 space-y-5" style={{ background: PAPER_TINT }}>
        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Binding</span>
          <div className="flex flex-wrap gap-2">
            {BINDING_OPTIONS.map(o => <PillChip key={o.value} label={o.label} active={bindingType === o.value} onClick={() => setBindingType(o.value)} />)}
          </div>
        </div>
        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Paper colour</span>
          <div className="flex flex-wrap gap-2">
            {PAPER_COLOURS.map(o => (
              <button
                key={o.value}
                onClick={() => setPaperColour(o.value)}
                style={{
                  cursor: "pointer",
                  background: paperColour === o.value ? "#FEF0ED" : "#FAFAF9",
                  borderColor: paperColour === o.value ? CLAY : "#E7DCCB",
                }}
                className="flex items-center gap-2 h-9 px-3 rounded-full border text-[12.5px] font-medium transition-colors"
              >
                <span className="w-3.5 h-3.5 rounded-full border border-border/40" style={{ background: o.swatch }} />
                <span style={{ color: paperColour === o.value ? CLAY : "#4B5563" }}>{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          style={{ cursor: saveMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[12.5px] font-semibold disabled:opacity-50"
        >
          {saveMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save paper & binding
        </button>
      </div>
    </div>
  );
}

// ── New-template modal ────────────────────────────────────────────────────────

function NewTemplateModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: PlatformPlannerConfig) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<"journal" | "notebook">("journal");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setName(""); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [open]);

  const createMut = useMutation({
    mutationFn: () =>
      platformPlannersApi.create({ name: name.trim(), ...{ productType: type } } as any),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["platform-journals"] });
      toast({ title: "Template created" });
      onCreated(t);
      onClose();
    },
    onError: (err: Error) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-[15px] font-semibold">New journal template</h2>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">Template name</label>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && name.trim()) createMut.mutate(); }}
            placeholder="e.g. Guided Gratitude Journal"
            className="w-full h-10 rounded-xl border border-border bg-background px-3 text-[13px] outline-none focus:border-foreground/40 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <span className={BUILD_EYEBROW}>Type</span>
          <div className="flex gap-2">
            {JOURNAL_TYPES.map(o => (
              <PillChip key={o.value} label={o.label} active={type === o.value} onClick={() => setType(o.value as "journal" | "notebook")} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => createMut.mutate()}
            disabled={!name.trim() || createMut.isPending}
            style={{ cursor: !name.trim() || createMut.isPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG }}
            className="flex-1 h-10 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50"
          >
            {createMut.isPending ? "Creating…" : "Create template"}
          </button>
          <button
            onClick={onClose}
            style={{ cursor: "pointer" }}
            className="h-10 px-4 rounded-xl border border-border text-[13px] font-medium hover:border-foreground/40 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main hub ──────────────────────────────────────────────────────────────────

export default function JournalStudioHub() {
  const { setAiContext, clearAiContext } = useAiDrawer();

  const [mode,         setMode]         = useState<ModeId>("build");
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [showNewModal, setShowNewModal]  = useState(false);

  const { data: allTemplates = [], isLoading, isError } = useQuery({
    queryKey: ["platform-journals"],
    queryFn:  () => platformPlannersApi.list(),
    staleTime: 30_000,
    select:    (data) => data.filter(isJournal),
  });

  const templates       = allTemplates as PlatformPlannerConfig[];
  const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;

  // Register AI context so the global drawer knows which studio is active
  useEffect(() => {
    setAiContext({ systemPrompt: JOURNAL_AI_SYSTEM });
    return () => clearAiContext();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdated = (t: PlatformPlannerConfig) => setSelectedId(t.id);

  const rail = (
    <TemplateRail
      templates={templates}
      selectedId={selectedId}
      onSelect={t => setSelectedId(t.id)}
      onCreate={() => setShowNewModal(true)}
      isLoading={isLoading}
      isError={isError}
    />
  );

  let center: React.ReactNode;
  switch (mode) {
    case "build":   center = <BuildPanel   template={selectedTemplate} onUpdated={handleUpdated} />; break;
    case "layout":  center = <LayoutPanel  template={selectedTemplate} onUpdated={handleUpdated} />; break;
    case "prompts": center = <PromptsPanel template={selectedTemplate} onUpdated={handleUpdated} />; break;
    case "theme":   center = <ThemePanel   template={selectedTemplate} onUpdated={handleUpdated} />; break;
    case "paper":   center = <PaperPanel   template={selectedTemplate} onUpdated={handleUpdated} />; break;
  }

  return (
    <>
      <StudioLayout
        scope="Journal Studio"
        modes={MODES}
        activeMode={mode}
        onModeChange={(id) => setMode(id as ModeId)}
        leftRail={rail}
        hasAssistant
      >
        {center}
      </StudioLayout>

      <NewTemplateModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={t => setSelectedId(t.id)}
      />
    </>
  );
}
