/**
 * ProductRecipes — Super Admin page.
 *
 * A recipe is a named arrangement of engines the platform already has.
 * Defining one makes a new product type available inside a studio without
 * writing new studio code. This is the subscription mechanic: stores
 * renew for the recipes that arrive, not for software they already have.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, ChevronRight, BookOpen, FlaskConical, Info,
  Layers2, CalendarDays, ArrowRight, CheckCircle2, Clock, Archive,
} from "lucide-react";
import { recipesApi, type ProductRecipe } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK     = "hsl(221 46% 17%)";
const CLAY    = "#C87560";
const PAPER   = "hsl(38 65% 96%)";
const BORDER  = "hsl(38 30% 88%)";
const MUTED   = "hsl(216 15% 52%)";

const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.18em]";

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "live") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
      style={{ background: "hsl(142 50% 90%)", color: "hsl(142 55% 28%)" }}>
      <CheckCircle2 className="w-2.5 h-2.5" /> LIVE
    </span>
  );
  if (status === "draft") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "hsl(216 20% 92%)", color: MUTED }}>
      <Clock className="w-2.5 h-2.5" /> DRAFT
    </span>
  );
  if (status === "new") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
      style={{ background: "hsl(12 70% 90%)", color: CLAY }}>
      NEW
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "hsl(216 20% 90%)", color: MUTED }}>
      <Archive className="w-2.5 h-2.5" /> RETIRED
    </span>
  );
}

// ── Tier badge ────────────────────────────────────────────────────────────────
function TierBadge({ tiers }: { tiers?: string[] }) {
  if (!tiers || tiers.length === 0) return <span style={{ color: MUTED }} className="text-xs">TBD</span>;
  const label = tiers.includes("all") || tiers.length >= 3 ? "All plans" : tiers.map(t => {
    const m: Record<string, string> = { pro: "Pro", starter: "Starter", free: "Free" };
    return m[t] ?? t;
  }).join(", ");
  return <span className="text-xs font-medium" style={{ color: INK }}>{label}</span>;
}

// ── Recipe row ────────────────────────────────────────────────────────────────
function RecipeRow({
  recipe, onEdit,
}: { recipe: ProductRecipe; onEdit: (r: ProductRecipe) => void }) {
  const rel  = recipe.release as { planTiers?: string[]; month?: number; year?: number } | null;
  const now  = new Date();
  const releaseMonth = rel?.month;
  const releaseYear  = rel?.year;
  const isNewThisMonth = releaseMonth === now.getMonth() + 1 && releaseYear === now.getFullYear();
  const displayStatus  = isNewThisMonth && recipe.status === "live" ? "new" : recipe.status;

  const partsDisplay = (recipe.parts ?? []).slice(0, 5).join(" · ")
    + ((recipe.parts?.length ?? 0) > 5 ? " …" : "");

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 rounded-lg border transition-shadow hover:shadow-sm"
      style={{ background: "white", borderColor: BORDER }}
    >
      {/* Name + studio + parts */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm" style={{ color: INK }}>{recipe.name}</span>
          <span className="text-xs font-medium" style={{ color: CLAY }}>· {recipe.category}</span>
        </div>
        {partsDisplay && (
          <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>
            {partsDisplay}
          </p>
        )}
      </div>

      {/* Tier */}
      <div className="w-20 shrink-0 text-right">
        <TierBadge tiers={rel?.planTiers} />
      </div>

      {/* Build count */}
      <div className="w-20 shrink-0 text-right">
        <span className="text-xs tabular-nums" style={{ color: MUTED }}>
          {recipe.status === "draft"
            ? "—"
            : recipe.buildCount === 0 ? "just shipped" : `${recipe.buildCount.toLocaleString()} builds`}
        </span>
      </div>

      {/* Status */}
      <div className="w-20 shrink-0 flex justify-end">
        <StatusBadge status={displayStatus} />
      </div>

      {/* Edit chip */}
      <button
        onClick={() => onEdit(recipe)}
        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-colors hover:border-[#C87560] hover:text-[#C87560]"
        style={{ borderColor: BORDER, color: MUTED }}
      >
        Edit <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex-1 rounded-xl border px-6 py-5" style={{ background: "white", borderColor: BORDER }}>
      <p className="text-3xl font-bold font-display" style={{ color: INK }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className={`${EYEBROW} mt-1`} style={{ color: MUTED }}>{label}</p>
    </div>
  );
}

// ── Engine capability registry (for the parts multi-select) ─────────────────
const ENGINE_REGISTRY = [
  "calendar engine", "tab rails", "hyperlink map", "covers", "dividers",
  "page recipe", "cutout", "cut path", "index sheet", "shape masks", "papers",
  "edge treatment", "nesting", "ephemera", "tags", "pockets", "imposition",
  "photo layouts", "prompt deck", "oracle", "play sheet", "tracker",
  "B&W export", "DXF", "layered export", "paper generator", "palettes",
  "tiling", "invitations", "place cards", "signage", "envelopes",
  "lesson pages", "labels", "certificates", "charts",
];

const STUDIO_OPTIONS = [
  "Planner Studio", "Sticker Studio", "Journal Studio", "Theme Studio",
  "Marketing Studio", "New studio",
];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Edit / Create drawer ──────────────────────────────────────────────────────
function RecipeDrawer({
  recipe, onClose, onSaved,
}: {
  recipe: ProductRecipe | null; // null = creating new
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isNew = recipe === null;

  const rel = recipe?.release as { planTiers?: string[]; month?: number; year?: number } | null;
  const phys = recipe?.physicalPath as { prints?: boolean; impositionSheet?: string; templates?: string[] } | null;
  const brief = recipe?.claudeBrief as { asks?: string[]; generates?: string } | null;
  const card = recipe?.decisionCard as {
    prompt?: string;
    optionA?: { label?: string; consequence?: string };
    optionB?: { label?: string; consequence?: string };
  } | null;

  const [name, setName]           = useState(recipe?.name ?? "");
  const [category, setCategory]   = useState(recipe?.category ?? STUDIO_OPTIONS[0]);
  const [parts, setParts]         = useState<string[]>(recipe?.parts ?? []);
  const [month, setMonth]         = useState(rel?.month ?? (new Date().getMonth() + 1));
  const [year, setYear]           = useState(rel?.year ?? (new Date().getFullYear() + 1));
  const [tiers, setTiers]         = useState<string[]>(rel?.planTiers ?? ["all"]);
  const [prints, setPrints]       = useState(phys?.prints ?? false);
  const [impSheet, setImpSheet]   = useState(phys?.impositionSheet ?? "");
  const [briefAsks, setBriefAsks] = useState((brief?.asks ?? []).join("\n"));
  const [briefGen, setBriefGen]   = useState(brief?.generates ?? "");
  const [cardPrompt, setCardPrompt]   = useState(card?.prompt ?? "");
  const [cardALabel, setCardALabel]   = useState(card?.optionA?.label ?? "");
  const [cardACons, setCardACons]     = useState(card?.optionA?.consequence ?? "");
  const [cardBLabel, setCardBLabel]   = useState(card?.optionB?.label ?? "");
  const [cardBCons, setCardBCons]     = useState(card?.optionB?.consequence ?? "");
  const [saving, setSaving]           = useState(false);

  const togglePart = (p: string) =>
    setParts(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const buildPayload = () => ({
    name: name.trim(),
    category,
    parts,
    decisionCard: cardPrompt ? {
      prompt: cardPrompt,
      optionA: { label: cardALabel, consequence: cardACons },
      optionB: { label: cardBLabel, consequence: cardBCons },
    } : undefined,
    physicalPath: { prints, impositionSheet: impSheet, templates: [] },
    claudeBrief: { asks: briefAsks.split("\n").filter(Boolean), generates: briefGen },
    release: { planTiers: tiers, month, year },
  });

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (isNew) {
        await recipesApi.create(buildPayload());
      } else {
        await recipesApi.update(recipe!.id, buildPayload());
      }
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!recipe) return;
    setSaving(true);
    try {
      await recipesApi.publish(recipe.id);
      onSaved();
    } catch (e: any) {
      toast({ title: "Publish failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRetire = async () => {
    if (!recipe) return;
    if (!confirm(`Retire "${recipe.name}"? It will be hidden for new builds but existing artifacts are unaffected.`)) return;
    setSaving(true);
    try {
      await recipesApi.retire(recipe.id);
      onSaved();
    } catch (e: any) {
      toast({ title: "Retire failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C87560]";
  const inputStyle = { borderColor: BORDER, background: "white" };
  const labelCls  = `${EYEBROW} block mb-1.5`;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: "rgba(27,42,74,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="ml-auto h-full w-full max-w-lg flex flex-col shadow-2xl overflow-hidden"
        style={{ background: PAPER }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: BORDER }}>
          <div>
            <p className={`${EYEBROW} text-[10px]`} style={{ color: CLAY }}>Product Recipe</p>
            <h2 className="text-base font-semibold mt-0.5" style={{ color: INK }}>
              {isNew ? "New recipe" : `Edit · ${recipe.name}`}
            </h2>
          </div>
          <button onClick={onClose} className="text-sm" style={{ color: MUTED }}>✕</button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Name + category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: MUTED }}>Name</label>
              <input className={inputCls} style={inputStyle} value={name}
                onChange={e => setName(e.target.value)} placeholder="Dated planner" />
            </div>
            <div>
              <label className={labelCls} style={{ color: MUTED }}>Studio</label>
              <select className={inputCls} style={inputStyle} value={category}
                onChange={e => setCategory(e.target.value)}>
                {STUDIO_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Parts */}
          <div>
            <label className={labelCls} style={{ color: MUTED }}>Engine parts</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ENGINE_REGISTRY.map(p => (
                <button key={p} onClick={() => togglePart(p)}
                  className="px-2.5 py-1 rounded-full border text-xs font-medium transition-colors"
                  style={parts.includes(p)
                    ? { background: INK, borderColor: INK, color: "white" }
                    : { background: "white", borderColor: BORDER, color: MUTED }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Decision card */}
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: BORDER, background: "white" }}>
            <p className={labelCls} style={{ color: MUTED }}>Decision card</p>
            <input className={inputCls} style={inputStyle} value={cardPrompt}
              onChange={e => setCardPrompt(e.target.value)} placeholder="Buyer prompt (e.g. 'Do you want dates?')" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1" style={{ color: MUTED }}>Option A label</label>
                <input className={inputCls} style={inputStyle} value={cardALabel}
                  onChange={e => setCardALabel(e.target.value)} placeholder="Dated" />
                <textarea className={`${inputCls} mt-1.5 resize-none`} style={inputStyle} rows={2}
                  value={cardACons} onChange={e => setCardACons(e.target.value)}
                  placeholder="Consequence line…" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1" style={{ color: MUTED }}>Option B label</label>
                <input className={inputCls} style={inputStyle} value={cardBLabel}
                  onChange={e => setCardBLabel(e.target.value)} placeholder="Undated" />
                <textarea className={`${inputCls} mt-1.5 resize-none`} style={inputStyle} rows={2}
                  value={cardBCons} onChange={e => setCardBCons(e.target.value)}
                  placeholder="Consequence line…" />
              </div>
            </div>
          </div>

          {/* Physical path */}
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: BORDER, background: "white" }}>
            <p className={labelCls} style={{ color: MUTED }}>Physical path</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: INK }}>
              <input type="checkbox" checked={prints} onChange={e => setPrints(e.target.checked)} />
              This recipe produces a printable file
            </label>
            {prints && (
              <input className={inputCls} style={inputStyle} value={impSheet}
                onChange={e => setImpSheet(e.target.value)}
                placeholder="Imposition sheet (e.g. A4, US Letter 8.5×11)" />
            )}
          </div>

          {/* Claude brief */}
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: BORDER, background: "white" }}>
            <p className={labelCls} style={{ color: MUTED }}>Claude brief</p>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1" style={{ color: MUTED }}>What the assistant asks for (one per line)</label>
              <textarea className={`${inputCls} resize-none`} style={inputStyle} rows={3}
                value={briefAsks} onChange={e => setBriefAsks(e.target.value)}
                placeholder="What is the planner for?&#10;What tone should the design take?" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1" style={{ color: MUTED }}>What it generates from a premise</label>
              <input className={inputCls} style={inputStyle} value={briefGen}
                onChange={e => setBriefGen(e.target.value)}
                placeholder="A fully structured section layout with cover concept" />
            </div>
          </div>

          {/* Release */}
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: BORDER, background: "white" }}>
            <p className={labelCls} style={{ color: MUTED }}>Release</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1" style={{ color: MUTED }}>Month</label>
                <select className={inputCls} style={inputStyle} value={month}
                  onChange={e => setMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1" style={{ color: MUTED }}>Year</label>
                <input type="number" className={inputCls} style={inputStyle} value={year}
                  onChange={e => setYear(Number(e.target.value))} min={2024} max={2030} />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: MUTED }}>Plan tiers</label>
              <div className="flex gap-2 flex-wrap">
                {["all", "pro", "starter"].map(t => (
                  <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: INK }}>
                    <input type="checkbox"
                      checked={tiers.includes(t)}
                      onChange={() => setTiers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} />
                    {t === "all" ? "All plans" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center gap-2" style={{ borderColor: BORDER }}>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: INK }}>
            {saving ? "Saving…" : isNew ? "Create recipe" : "Save changes"}
          </button>
          {!isNew && recipe!.status === "draft" && (
            <button onClick={handlePublish} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: CLAY }}>
              Publish
            </button>
          )}
          {!isNew && recipe!.status === "live" && (
            <button onClick={handleRetire} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
              style={{ borderColor: BORDER, color: MUTED }}>
              Retire
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: BORDER, color: MUTED }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProductRecipesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing]       = useState<ProductRecipe | null | "new">(undefined as any);
  const drawerOpen = editing !== undefined;

  const { data: recipes = [], isLoading, error, refetch } = useQuery({
    queryKey: ["platform-recipes"],
    queryFn: () => recipesApi.list(),
  });

  const { data: stats } = useQuery({
    queryKey: ["platform-recipes-stats"],
    queryFn: () => recipesApi.stats(),
  });

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ["platform-recipes"] });
    qc.invalidateQueries({ queryKey: ["platform-recipes-stats"] });
    setEditing(undefined as any);
    toast({ title: "Recipe saved" });
  };

  // Next month release schedule from loaded recipes
  const now = new Date();
  const scheduleItems = recipes
    .filter(r => {
      const rel = r.release as { month?: number; year?: number } | null;
      return rel?.year && rel?.month;
    })
    .sort((a, b) => {
      const ra = a.release as any, rb = b.release as any;
      return (ra.year * 12 + ra.month) - (rb.year * 12 + rb.month);
    })
    .slice(0, 6);

  const dotColor = (r: ProductRecipe) => {
    if (r.status === "live") return "hsl(142 55% 40%)";
    if (r.status === "draft") return CLAY;
    return MUTED;
  };
  const dotLabel = (r: ProductRecipe) => {
    if (r.status === "live") return "Shipped";
    const rel = r.release as { month?: number; year?: number } | null;
    const isNext = rel?.month === now.getMonth() + 2;
    return isNext ? "In draft" : "Planned";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl">

      {/* Page header */}
      <div>
        <p className={`${EYEBROW} text-[10px]`} style={{ color: CLAY }}>Platform · Super Admin</p>
        <h1 className="text-xl font-bold font-display mt-1" style={{ color: INK }}>Product recipes</h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          The product types stores can build — defined here, shipped on a schedule.
        </p>
      </div>

      {/* ── Explainer card with navy left accent ── */}
      <div
        className="flex gap-4 rounded-xl border p-5 text-sm leading-relaxed"
        style={{ background: "white", borderColor: BORDER, borderLeft: `4px solid ${INK}` }}
      >
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-[hsl(221_46%_42%)]" />
        <p style={{ color: "hsl(221 46% 28%)" }}>
          A recipe is a named arrangement of engines the platform already has — page recipes,
          cut paths, imposition, photo layouts, decks, trackers. Defining one here makes a
          new product type available inside a studio without writing a new studio.{" "}
          <strong>This is the subscription:</strong> stores renew for the recipes that arrive,
          not for the software they already have.
        </p>
      </div>

      {/* ── Stat tiles ── */}
      <div className="flex gap-4">
        <StatTile value={stats?.live ?? "—"}           label="Live recipes" />
        <StatTile value={stats?.draft ?? "—"}          label="In draft" />
        <StatTile value={stats?.shipsNext ?? "—"}      label="Ships next month" />
        <StatTile value={`${stats?.renewalsCitingNew ?? "—"}%`} label="Renewals citing new recipes" />
      </div>

      {/* ── Recipe list ── */}
      <div className="rounded-xl border overflow-hidden" style={{ background: PAPER, borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <div>
            <h2 className="font-semibold text-sm" style={{ color: INK }}>Recipes</h2>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              Each one lists the engines it draws on. Nothing here required new engine work.
            </p>
          </div>
          <button
            onClick={() => setEditing(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
            style={{ background: CLAY }}
          >
            <Plus className="w-3.5 h-3.5" /> New recipe
          </button>
        </div>

        <div className="p-3 space-y-2">
          {isLoading && (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: "hsl(216 20% 94%)" }} />
            ))
          )}
          {error && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: MUTED }}>
              Couldn't load recipes.{" "}
              <button onClick={() => refetch()} className="underline" style={{ color: CLAY }}>Retry</button>
            </div>
          )}
          {!isLoading && !error && recipes.length === 0 && (
            <div className="px-4 py-10 text-center">
              <FlaskConical className="w-8 h-8 mx-auto mb-3" style={{ color: MUTED }} />
              <p className="text-sm font-medium" style={{ color: INK }}>No recipes yet</p>
              <p className="text-xs mt-1" style={{ color: MUTED }}>Create your first recipe to start building product types.</p>
            </div>
          )}
          {recipes.map(r => (
            <RecipeRow key={r.id} recipe={r} onEdit={setEditing} />
          ))}
        </div>
      </div>

      {/* ── Bottom two cards ── */}
      <div className="grid grid-cols-2 gap-5">

        {/* What a recipe defines */}
        <div className="rounded-xl border p-5" style={{ background: "white", borderColor: BORDER }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color: INK }}>What a recipe defines</h3>
          <p className="text-xs mb-4" style={{ color: MUTED }}>Six fields. No code.</p>
          <div className="space-y-3">
            {[
              ["NAME & CATEGORY", "What it is called in the studio picker, and which studio it appears in."],
              ["DECISION CARD", "The one either/or the buyer answers first, with the plain-language consequence of each choice."],
              ["PARTS LIST", "Which engines it draws on — page recipe, cut path, imposition, photo layouts, decks, trackers. Nothing new is written."],
              ["PHYSICAL PATH", "Whether it prints, what it imposes onto, what templates ship with it."],
              ["CLAUDE BRIEF", "What the assistant should ask for, and what it should generate from a premise."],
              ["RELEASE", "Which plan tiers get it, and the month it drops."],
            ].map(([label, desc]) => (
              <div key={label} className="flex gap-3">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide pt-0.5 shrink-0 w-28"
                  style={{ color: INK }}
                >
                  {label}
                </span>
                <span className="text-xs leading-relaxed" style={{ color: MUTED }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Release schedule */}
        <div className="rounded-xl border p-5" style={{ background: "white", borderColor: BORDER }}>
          <h3 className="font-semibold text-sm mb-1" style={{ color: INK }}>Release schedule</h3>
          <p className="text-xs mb-4" style={{ color: MUTED }}>A recipe a month is the renewal reason.</p>

          {scheduleItems.length === 0 ? (
            <div className="py-6 text-center text-xs" style={{ color: MUTED }}>
              No releases scheduled yet.
            </div>
          ) : (
            <div className="space-y-3">
              {scheduleItems.map(r => {
                const rel = r.release as { month?: number; year?: number } | null;
                const monthLabel = rel?.month ? MONTH_NAMES[(rel.month - 1) % 12] : "—";
                return (
                  <div key={r.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: dotColor(r) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: INK }}>{r.name}</p>
                      <p className="text-xs" style={{ color: MUTED }}>{monthLabel}</p>
                    </div>
                    <span className="text-xs font-medium shrink-0" style={{ color: dotColor(r) }}>
                      {dotLabel(r)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs mt-5 pt-4 border-t" style={{ borderColor: BORDER, color: MUTED }}>
            Stores see a "new this month" badge in their studio picker when a recipe drops.
          </p>
        </div>

      </div>

      {/* ── Recipe drawer ── */}
      {drawerOpen && (
        <RecipeDrawer
          recipe={editing === null ? null : (editing as ProductRecipe)}
          onClose={() => setEditing(undefined as any)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
