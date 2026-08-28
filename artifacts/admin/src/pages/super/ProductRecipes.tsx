import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  AlertTriangle, Archive, CalendarDays, CheckCircle2, ChevronRight, Clock,
  Info, Layers2, Pencil, Plus, Save, Search, Trash2, X,
} from "lucide-react";
import { platformApi, recipesApi, type PlatformEinkPreset, type PlatformEinkRule, type ProductRecipe } from "@/lib/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageHeader, Pill, type PillTone, SkeletonRows } from "@/components/shared";
import { useToast } from "@/hooks/use-toast";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STUDIOS = ["Planner Studio", "Sticker Studio", "Journal Studio", "Theme Studio", "Marketing Studio", "New studio"];
const ENGINES = ["calendar engine","tab rails","hyperlink map","covers","dividers","page recipe","cutout","cut path","index sheet","shape masks","papers","edge treatment","nesting","ephemera","tags","pockets","imposition","photo layouts","prompt deck","oracle","play sheet","tracker","B&W export","DXF","layered export","paper generator","palettes","tiling","invitations","place cards","signage","envelopes","lesson pages","labels","certificates","charts"];
const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.18em]";
type View = "recipes" | "schedule" | "eink";
type DrawerState = { mode: "closed" } | { mode: "create"; month?: number; year?: number } | { mode: "edit"; recipe: ProductRecipe };
type RecipeShape = { month?: number; year?: number; planTiers?: string[] };

function releaseOf(recipe: ProductRecipe): RecipeShape {
  return (recipe.release ?? {}) as RecipeShape;
}
function statusFor(recipe: ProductRecipe, now = new Date()): "live" | "draft" | "info" | "warn" | "off" {
  const rel = releaseOf(recipe);
  return recipe.status === "live" && rel.month === now.getMonth() + 1 && rel.year === now.getFullYear() ? "info" : recipe.status === "live" ? "live" : recipe.status === "draft" ? "draft" : "off";
}
function statusLabel(recipe: ProductRecipe, now = new Date()) {
  const tone = statusFor(recipe, now);
  return tone === "info" ? "NEW" : recipe.status.toUpperCase();
}
function blockersFor(recipe: Partial<ProductRecipe>, fields?: { prints: boolean; impositionSheet: string; cardPrompt: string; cardALabel: string; cardACons: string; cardBLabel: string; cardBCons: string; asks: string; generates: string }) {
  const phys = fields ? { prints: fields.prints, impositionSheet: fields.impositionSheet } : recipe.physicalPath as { prints?: boolean; impositionSheet?: string } | null;
  const card = fields ? { prompt: fields.cardPrompt, optionA: { label: fields.cardALabel, consequence: fields.cardACons }, optionB: { label: fields.cardBLabel, consequence: fields.cardBCons } } : recipe.decisionCard;
  const brief = fields ? { asks: fields.asks.split("\n").filter(Boolean), generates: fields.generates } : recipe.claudeBrief;
  const rel = recipe.release as RecipeShape | null;
  const errors: string[] = [];
  if (!recipe.parts?.length) errors.push("No parts list");
  if (!STUDIOS.slice(0, 5).includes(recipe.category ?? "")) errors.push("Category is not a known studio");
  if (phys?.prints && !phys.impositionSheet) errors.push("Printable path has no imposition sheet");
  if (!rel?.month || !rel.planTiers?.length) errors.push("Release needs a month and plan tiers");
  if (card?.prompt && (!card.optionA?.label || !card.optionA?.consequence || !card.optionB?.label || !card.optionB?.consequence)) errors.push("Decision card is missing an option label or consequence");
  if (brief?.asks?.length && !brief.generates) errors.push("Claude brief has asks but no generates field");
  return errors;
}

function RecipeStatus({ recipe }: { recipe: ProductRecipe }) {
  const tone = statusFor(recipe);
  return <Pill tone={tone as PillTone}>{statusLabel(recipe)}</Pill>;
}

function RecipeDrawer({ state, onClose, onSaved }: { state: Exclude<DrawerState, { mode: "closed" }>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const recipe = state.mode === "edit" ? state.recipe : null;
  const rel = recipe ? releaseOf(recipe) : {};
  const phys = recipe?.physicalPath as { prints?: boolean; impositionSheet?: string } | null;
  const card = recipe?.decisionCard;
  const brief = recipe?.claudeBrief;
  const [name, setName] = useState(recipe?.name ?? "");
  const [category, setCategory] = useState(recipe?.category ?? STUDIOS[0]);
  const [parts, setParts] = useState(recipe?.parts ?? []);
  const [month, setMonth] = useState(rel.month ?? (state.mode === "create" ? state.month : undefined) ?? new Date().getMonth() + 1);
  const [year, setYear] = useState(rel.year ?? (state.mode === "create" ? state.year : undefined) ?? new Date().getFullYear() + 1);
  const [tiers, setTiers] = useState(rel.planTiers ?? ["all"]);
  const [prints, setPrints] = useState(phys?.prints ?? false);
  const [impositionSheet, setImpositionSheet] = useState(phys?.impositionSheet ?? "");
  const [cardPrompt, setCardPrompt] = useState(card?.prompt ?? "");
  const [cardALabel, setCardALabel] = useState(card?.optionA?.label ?? "");
  const [cardACons, setCardACons] = useState(card?.optionA?.consequence ?? "");
  const [cardBLabel, setCardBLabel] = useState(card?.optionB?.label ?? "");
  const [cardBCons, setCardBCons] = useState(card?.optionB?.consequence ?? "");
  const [asks, setAsks] = useState((brief?.asks ?? []).join("\n"));
  const [generates, setGenerates] = useState(brief?.generates ?? "");
  const [editParts, setEditParts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const blockers = blockersFor({ name, category, parts, release: { month, year, planTiers: tiers }, physicalPath: { prints, impositionSheet }, decisionCard: cardPrompt ? { prompt: cardPrompt, optionA: { label: cardALabel, consequence: cardACons }, optionB: { label: cardBLabel, consequence: cardBCons } } : null, claudeBrief: { asks: asks.split("\n").filter(Boolean), generates } }, { prints, impositionSheet, cardPrompt, cardALabel, cardACons, cardBLabel, cardBCons, asks, generates });
  const payload = () => ({ name: name.trim(), category, parts, decisionCard: cardPrompt ? { prompt: cardPrompt, optionA: { label: cardALabel, consequence: cardACons }, optionB: { label: cardBLabel, consequence: cardBCons } } : null, physicalPath: { prints, impositionSheet, templates: [] }, claudeBrief: { asks: asks.split("\n").filter(Boolean), generates }, release: { planTiers: tiers, month, year } });
  const save = async () => {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try { recipe ? await recipesApi.update(recipe.id, payload()) : await recipesApi.create(payload()); onSaved(); }
    catch (error) { toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" }); }
    finally { setSaving(false); }
  };
  const publish = async () => { if (!recipe || blockers.length) return; setSaving(true); try { await recipesApi.publish(recipe.id); onSaved(); } catch (error) { toast({ title: "Publish failed", description: (error as Error).message, variant: "destructive" }); } finally { setSaving(false); } };
  const retire = async () => { if (!recipe) return; setSaving(true); try { await recipesApi.retire(recipe.id); onSaved(); } catch (error) { toast({ title: "Retire failed", description: (error as Error).message, variant: "destructive" }); } finally { setSaving(false); setRetireOpen(false); } };
  const input = "w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--admin-clay)]";
  return <div className="fixed inset-0 z-50 flex bg-[rgba(27,42,74,.45)]" onClick={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="ml-auto flex h-full w-full max-w-[460px] flex-col bg-[var(--admin-paper)] shadow-[-10px_0_34px_rgba(27,42,74,.2)]">
      <header className="flex items-start justify-between border-b border-[var(--admin-border)] px-6 py-5"><div><p className={`${EYEBROW} text-[var(--admin-clay)]`}>Recipe · {category}</p><h2 className="mt-1 font-display text-lg font-semibold text-[var(--admin-ink)]">{recipe?.name ?? "New recipe"}</h2></div><button aria-label="Close drawer" onClick={onClose}><X className="h-4 w-4 text-[var(--admin-muted)]" /></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {blockers.length > 0 && <div className="rounded-lg border border-[#E8CFC7] border-l-4 bg-[#FDF7F4] p-3"><p className={`${EYEBROW} text-[#A85B48]`}>Blocking release</p>{blockers.map((blocker) => <p key={blocker} className="mt-1 text-xs text-[#7A4B3E]">▲ {blocker}</p>)}</div>}
        <div className="grid grid-cols-2 gap-3"><label className={`${EYEBROW} text-[var(--admin-muted)]`}>Name<input className={`${input} mt-1 normal-case tracking-normal`} value={name} onChange={(e) => setName(e.target.value)} /></label><label className={`${EYEBROW} text-[var(--admin-muted)]`}>Studio<select className={`${input} mt-1 normal-case tracking-normal`} value={category} onChange={(e) => setCategory(e.target.value)}>{STUDIOS.map((studio) => <option key={studio}>{studio}</option>)}</select></label></div>
        <section><div className="flex items-center justify-between"><p className={`${EYEBROW} text-[var(--admin-muted)]`}>Parts list · {parts.length}</p><button className="text-xs font-semibold text-[var(--admin-clay)]" onClick={() => setEditParts(!editParts)}>{editParts ? "Done" : "Edit parts"}</button></div>{editParts ? <div className="mt-2 flex flex-wrap gap-1.5">{ENGINES.map((part) => <button key={part} onClick={() => setParts((current) => current.includes(part) ? current.filter((item) => item !== part) : [...current, part])} className={`rounded-full border px-2.5 py-1 text-xs ${parts.includes(part) ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] text-white" : "border-[var(--admin-border)] bg-[var(--admin-card)] text-[var(--admin-muted)]"}`}>{part}</button>)}</div> : <div className="mt-2 flex flex-wrap gap-1.5">{parts.length ? parts.map((part) => <Pill key={part} tone="info">{part}</Pill>) : <span className="rounded-full border border-dashed border-[#C87560] px-3 py-1 text-xs text-[#A85B48]">no parts selected <span className="ml-1 opacity-70">empty — this is what blocks release</span></span>}</div>}</section>
        <section className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-4"><p className={`${EYEBROW} text-[var(--admin-muted)]`}>Decision card</p><input className={`${input} mt-2`} placeholder="Buyer prompt" value={cardPrompt} onChange={(e) => setCardPrompt(e.target.value)} />{cardPrompt ? <div className="mt-3 grid grid-cols-2 gap-3">{[[cardALabel, setCardALabel, cardACons, setCardACons], [cardBLabel, setCardBLabel, cardBCons, setCardBCons]].map(([label, setLabel, consequence, setConsequence], index) => <div key={index}><input className={input} placeholder={`Option ${index ? "B" : "A"} label`} value={label as string} onChange={(e) => (setLabel as (value: string) => void)(e.target.value)} /><textarea className={`${input} mt-2 resize-none`} rows={2} placeholder="Consequence" value={consequence as string} onChange={(e) => (setConsequence as (value: string) => void)(e.target.value)} /></div>)}</div> : <p className="mt-3 text-xs text-[var(--admin-muted)]">The buyer has nothing to answer first.</p>}</section>
        <div className="grid grid-cols-2 gap-3"><section><p className={`${EYEBROW} text-[var(--admin-muted)]`}>Physical path</p><label className="mt-2 flex items-center gap-2 text-sm text-[var(--admin-ink)]"><input type="checkbox" checked={prints} onChange={(e) => setPrints(e.target.checked)} /> Prints</label>{prints && <input className={`${input} mt-2`} placeholder="Imposition sheet" value={impositionSheet} onChange={(e) => setImpositionSheet(e.target.value)} />}</section><section><p className={`${EYEBROW} text-[var(--admin-muted)]`}>Release</p><div className="mt-2 flex gap-2"><select className={input} value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((item, index) => <option key={item} value={index + 1}>{item}</option>)}</select><input className={input} type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div><div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--admin-ink)]">{["all","pro","starter"].map((tier) => <label key={tier}><input type="checkbox" checked={tiers.includes(tier)} onChange={() => setTiers((current) => current.includes(tier) ? current.filter((item) => item !== tier) : [...current, tier])} /> {tier}</label>)}</div></section></div>
        <section className="rounded-xl border border-[var(--admin-border)] bg-[#FBF6EE] p-4"><p className={`${EYEBROW} text-[var(--admin-muted)]`}>Claude brief</p><textarea className={`${input} mt-2 resize-none`} rows={3} placeholder="Asks, one per line" value={asks} onChange={(e) => setAsks(e.target.value)} /><input className={`${input} mt-2`} placeholder="What it generates" value={generates} onChange={(e) => setGenerates(e.target.value)} /></section>
      </div>
      <footer className="flex items-center gap-2 border-t border-[var(--admin-border)] px-6 py-4"><Button onClick={save} disabled={saving} className="flex-1 bg-[var(--admin-ink)] hover:bg-[var(--admin-ink)]">{saving ? "Saving…" : recipe ? "Save changes" : "Create recipe"}</Button>{recipe?.status === "draft" && <Button onClick={publish} disabled={saving || blockers.length > 0} className="bg-[var(--admin-clay)] hover:bg-[var(--admin-clay)]">{blockers.length ? "Blocked" : "Publish"}</Button>}{recipe?.status === "live" && <Button variant="outline" onClick={() => setRetireOpen(true)} disabled={saving}>Retire</Button>}<Button variant="outline" onClick={onClose}>Cancel</Button></footer>
    </aside>
    <AlertDialog open={retireOpen} onOpenChange={setRetireOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Retire “{recipe?.name}”?</AlertDialogTitle><AlertDialogDescription>It will be hidden for new builds; existing artifacts are unaffected.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={retire}>Retire recipe</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function RecipesView({ recipes, stats, onOpen }: { recipes: ProductRecipe[]; stats?: { live: number; draft: number; shipsNext: number; renewalsCitingNew: number }; onOpen: (state: DrawerState) => void }) {
  const [search, setSearch] = useState(""); const [studio, setStudio] = useState("All");
  const filtered = recipes.filter((recipe) => (!search || `${recipe.name} ${recipe.parts.join(" ")}`.toLowerCase().includes(search.toLowerCase())) && (studio === "All" || recipe.category === studio));
  const blocked = recipes.map((recipe) => ({ recipe, blockers: blockersFor(recipe) })).find((item) => item.blockers.length);
  const next = recipes.find((recipe) => {
    const rel = releaseOf(recipe);
    const now = new Date();
    return !!rel.year && !!rel.month
      && rel.year * 12 + rel.month === now.getFullYear() * 12 + (now.getMonth() + 1) + 1;
  });
  const metrics = [{ label: "Live recipes", value: stats?.live ?? "—", note: "across 4 studios" }, { label: "In draft", value: stats?.draft ?? "—", note: "1 blocked", warn: true }, { label: "Ships next month", value: stats?.shipsNext ?? "—", note: next?.name ?? "No recipe scheduled" }, ...(stats?.renewalsCitingNew ? [{ label: "Renewals citing new", value: stats.renewalsCitingNew, note: "real observed renewals" }] : [])];
  return <div className="space-y-5"><div className="grid overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-card)] sm:grid-cols-3">{metrics.map((metric) => <div key={metric.label} className="border-b border-r border-[#EFE6D8] px-5 py-4"><p className={`${EYEBROW} text-[var(--admin-faint)]`}>{metric.label}</p><p className={`mt-2 font-display text-[22px] font-semibold ${metric.warn ? "text-[#A85B48]" : "text-[var(--admin-ink)]"}`}>{metric.value}</p><p className="mt-1 text-[10px] text-[var(--admin-muted)]">{metric.note}</p></div>)}</div>
    {blocked && <button onClick={() => onOpen({ mode: "edit", recipe: blocked.recipe })} className="w-full rounded-xl border border-[#E8CFC7] border-l-4 bg-[#FDF7F4] p-4 text-left"><p className={`${EYEBROW} text-[#A85B48]`}>Release blocker · {blocked.recipe.name}</p><p className="mt-1 text-xs text-[#7A4B3E]">{blocked.blockers[0]} <ChevronRight className="inline h-3 w-3" /></p></button>}
    <div className="flex flex-wrap items-center gap-2"><label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--admin-muted)]" /><input className="w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] py-2 pl-9 pr-3 text-sm" placeholder="Search name or parts" value={search} onChange={(e) => setSearch(e.target.value)} /></label>{["All", ...STUDIOS.slice(0, 5)].map((item) => <button key={item} onClick={() => setStudio(item)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${studio === item ? "border-[var(--admin-ink)] bg-[var(--admin-ink)] text-white" : "border-[var(--admin-border)] bg-[var(--admin-card)] text-[var(--admin-muted)]"}`}>{item.replace(" Studio", "")}</button>)}<span className="ml-auto font-mono text-[10px] text-[var(--admin-muted)]">{filtered.length} of {recipes.length} recipes</span></div>
    <div className="overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-card)]"><div className="grid grid-cols-[2.6fr_1fr_.8fr_.9fr_24px] gap-3 border-b border-[var(--admin-border)] bg-[var(--admin-card-subtle)] px-[18px] py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--admin-faint)]"><span>Recipe</span><span>Plans</span><span className="text-right">Builds</span><span className="text-right">Status</span><span /></div>{filtered.map((recipe) => <button key={recipe.id} onClick={() => onOpen({ mode: "edit", recipe })} className="grid w-full grid-cols-[2.6fr_1fr_.8fr_.9fr_24px] items-center gap-3 border-b border-[#F2EAE0] px-[18px] py-3 text-left transition-colors hover:bg-[var(--admin-card-subtle)]"><span className="min-w-0"><span className="flex truncate text-sm font-semibold text-[var(--admin-ink)]">{recipe.name}<small className="ml-2 font-medium text-[var(--admin-clay)]">{recipe.category}</small></span><span className="block truncate text-xs text-[var(--admin-muted)]">{recipe.parts.join(" · ") || "No parts selected"}</span></span><span className="text-xs text-[var(--admin-muted)]">{releaseOf(recipe).planTiers?.includes("all") ? "All plans" : releaseOf(recipe).planTiers?.join(", ") || "TBD"}</span><span className="text-right font-mono text-xs text-[var(--admin-muted)]">{recipe.buildCount.toLocaleString()}</span><span className="flex justify-end"><RecipeStatus recipe={recipe} /></span><ChevronRight className="h-4 w-4 text-[var(--admin-muted)]" /></button>)}</div>
  </div>;
}

function ScheduleView({ recipes, onOpen }: { recipes: ProductRecipe[]; onOpen: (state: DrawerState) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const now = new Date(); const currentIndex = now.getFullYear() * 12 + now.getMonth();
  const rows = MONTHS.map((name, month) => ({ name, month, recipe: recipes.find((item) => releaseOf(item).year === year && releaseOf(item).month === month + 1) }));
  const empty = rows.filter((row) => !row.recipe).length; let longest = 0; let run = 0; rows.forEach((row) => { run = row.recipe ? 0 : run + 1; longest = Math.max(longest, run); });
  return <div className="space-y-5"><div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]"><div className="rounded-[14px] bg-[var(--admin-ink)] p-6 text-white"><p className={`${EYEBROW} text-[#C6D1E0]`}>The renewal argument</p><h2 className="mt-3 max-w-md font-display text-xl">A recipe a month gives stores a reason to renew for what arrives next.</h2></div><div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-border)]">{[["Shipped this year", rows.filter((row) => row.recipe && row.month + 1 < now.getMonth() + 1 && year === now.getFullYear()).length],["Scheduled", rows.filter((row) => row.recipe).length],["Months with nothing", empty],["Longest gap", `${longest} months`]].map(([label, value]) => <div key={label as string} className="bg-[var(--admin-card)] p-4"><p className={`${EYEBROW} text-[var(--admin-faint)]`}>{label}</p><p className={`mt-2 font-display text-xl font-semibold ${label === "Months with nothing" && empty ? "text-[#A85B48]" : "text-[var(--admin-ink)]"}`}>{value}</p></div>)}</div></div><div className="flex items-center justify-between"><p className={`${EYEBROW} text-[var(--admin-muted)]`}>Release calendar</p><select className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 py-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((item) => <option key={item}>{item}</option>)}</select></div><div className="overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-card)]">{rows.map((row) => { const absolute = year * 12 + row.month; const state = row.recipe ? absolute < currentIndex ? "Shipped" : absolute === currentIndex ? "This month" : row.recipe.status === "live" ? "Scheduled" : "Draft" : "Nothing scheduled"; return <button key={row.name} onClick={() => onOpen(row.recipe ? { mode: "edit", recipe: row.recipe } : { mode: "create", month: row.month + 1, year })} className={`grid w-full grid-cols-[.9fr_2fr_.9fr_.9fr] items-center gap-3 border-b border-[#F2EAE0] px-[18px] py-3 text-left ${!row.recipe ? "bg-[#FDF7F4]" : "hover:bg-[var(--admin-card-subtle)]"}`}><span className="font-mono text-xs text-[var(--admin-muted)]">{String(row.month + 1).padStart(2, "0")} · {row.name}</span><span className={`text-sm font-semibold ${row.recipe ? "text-[var(--admin-ink)]" : "text-[#A85B48]"}`}>{row.recipe?.name ?? "No recipe"}{!row.recipe && <small className="ml-2 block text-xs font-normal">A month a store renews for software it already had.</small>}</span><span className="font-mono text-right text-xs text-[var(--admin-muted)]">{row.recipe?.buildCount ?? "—"}</span><span className="flex justify-end"><Pill tone={!row.recipe ? "warn" : state === "Draft" ? "draft" : state === "This month" ? "warn" : state === "Scheduled" ? "info" : "live"}>{state}</Pill></span></button>})}</div><div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 text-sm text-[var(--admin-muted)]">When a recipe drops, stores see it in the studio picker, in the email, and at renewal.</div></div>;
}

type EinkPresetForm = Omit<PlatformEinkPreset, "linksQuality">;

function presetForm(preset?: PlatformEinkPreset): EinkPresetForm {
  return {
    key: preset?.key ?? "",
    name: preset?.name ?? "",
    pixelWidth: preset?.pixelWidth ?? 1404,
    pixelHeight: preset?.pixelHeight ?? 1872,
    trimWidth: preset?.trimWidth ?? 447,
    trimHeight: preset?.trimHeight ?? 597,
    linkSupport: preset?.linkSupport ?? "full",
    safeInset: preset?.safeInset ?? 8,
    sellGuidance: preset?.sellGuidance ?? "",
    caveat: preset?.caveat ?? "",
  };
}

function EinkView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const catalogQuery = useQuery({ queryKey: ["platform-eink"], queryFn: platformApi.eink });
  const riskQuery = useQuery({ queryKey: ["platform/stats", "eink-link-risk"], queryFn: () => platformApi.stats() });
  const [presetDraft, setPresetDraft] = useState<EinkPresetForm | null>(null);
  const [ruleDraft, setRuleDraft] = useState<PlatformEinkRule | null>(null);
  const savePreset = useMutation({
    mutationFn: (draft: EinkPresetForm) => draft.key && catalogQuery.data?.presets.some((item) => item.key === draft.key)
      ? platformApi.updateEinkPreset(draft.key, draft)
      : platformApi.createEinkPreset(draft),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-eink"] }); qc.invalidateQueries({ queryKey: ["platform/stats"] }); setPresetDraft(null); toast({ title: "E-ink preset saved" }); },
    onError: (error) => toast({ title: "Preset save failed", description: (error as Error).message, variant: "destructive" }),
  });
  const deletePreset = useMutation({
    mutationFn: platformApi.deleteEinkPreset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-eink"] }); qc.invalidateQueries({ queryKey: ["platform/stats"] }); toast({ title: "E-ink preset deleted" }); },
    onError: (error) => toast({ title: "Preset delete failed", description: (error as Error).message, variant: "destructive" }),
  });
  const saveRule = useMutation({
    mutationFn: (rule: PlatformEinkRule) => platformApi.updateEinkRule(rule.key, {
      label: rule.label, description: rule.description, enabled: rule.enabled, threshold: rule.threshold, unit: rule.unit,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-eink"] }); setRuleDraft(null); toast({ title: "Enforcement rule saved" }); },
    onError: (error) => toast({ title: "Rule save failed", description: (error as Error).message, variant: "destructive" }),
  });
  const input = "w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--admin-ink)]";
  const catalog = catalogQuery.data;
  const risks = riskQuery.data?.linkRiskListings ?? [];
  return <div className="space-y-5">
    <div className="flex items-center gap-3 rounded-[14px] border border-[var(--admin-border)] border-l-4 border-l-[var(--admin-ink)] bg-[var(--admin-card)] p-5"><Info className="h-5 w-5 text-[var(--admin-ink)]" /><div><p className="text-sm font-semibold text-[var(--admin-ink)]">E-ink is a profile, not a studio or recipe.</p><p className="mt-1 text-xs text-[var(--admin-muted)]">These rules are inherited by every recipe exported for an e-ink device.</p></div><Pill tone="info" className="ml-auto">Inherited by every recipe</Pill></div>
    {catalogQuery.isLoading ? <SkeletonRows rows={5} cols={4} /> : catalogQuery.error ? <ErrorState message="Could not load e-ink profiles." onRetry={() => catalogQuery.refetch()} /> : <div className="space-y-5">
      <div className="overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-card)]">
        <div className="flex items-center justify-between border-b border-[var(--admin-border)] bg-[var(--admin-card-subtle)] px-[18px] py-3"><p className={`${EYEBROW} text-[var(--admin-faint)]`}>Device profiles · {catalog?.presets.length ?? 0}</p><button id="eink-add-preset" className="sr-only" onClick={() => setPresetDraft(presetForm())}>Add device preset</button></div>
        <div className="grid grid-cols-[1.4fr_.8fr_2.4fr_.9fr_68px] border-b border-[var(--admin-border)] bg-[var(--admin-card-subtle)] px-[18px] py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--admin-faint)]"><span>Device</span><span>Trim</span><span>How to sell it</span><span className="text-right">PDF links</span><span /></div>
        {catalog?.presets.map((preset) => <div key={preset.key} className="grid grid-cols-[1.4fr_.8fr_2.4fr_.9fr_68px] items-center border-b border-[#F2EAE0] px-[18px] py-4"><span><span className="block text-sm font-semibold text-[var(--admin-ink)]">{preset.name}</span><span className="font-mono text-[10px] text-[var(--admin-faint)]">{preset.key}</span></span><span className="font-mono text-xs text-[var(--admin-muted)]">{preset.trimWidth} × {preset.trimHeight} pt</span><span className="text-xs text-[var(--admin-muted)]">{preset.sellGuidance}</span><span className="flex justify-end"><Pill tone={preset.linkSupport === "full" ? "live" : "warn"}>{preset.linkSupport}</Pill></span><span className="flex justify-end gap-1"><button aria-label={`Edit ${preset.name}`} onClick={() => setPresetDraft(presetForm(preset))}><Pencil className="h-3.5 w-3.5 text-[var(--admin-muted)]" /></button><button aria-label={`Delete ${preset.name}`} onClick={() => window.confirm(`Delete ${preset.name}? Existing exports using it will prevent deletion.`) && deletePreset.mutate(preset.key)}><Trash2 className="h-3.5 w-3.5 text-[var(--admin-muted)]" /></button></span></div>)}
      </div>
      {presetDraft && <section className="rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-card)] p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[var(--admin-ink)]">{presetDraft.key ? "Edit device preset" : "Add device preset"}</h2><button aria-label="Close preset editor" onClick={() => setPresetDraft(null)}><X className="h-4 w-4 text-[var(--admin-muted)]" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Key", "key", "text"], ["Name", "name", "text"], ["Pixel width", "pixelWidth", "number"], ["Pixel height", "pixelHeight", "number"], ["Trim width (pt)", "trimWidth", "number"], ["Trim height (pt)", "trimHeight", "number"], ["Safe inset (pt)", "safeInset", "number"]].map(([label, key, type]) => <label key={key} className={`${EYEBROW} text-[var(--admin-muted)]`}>{label}<input className={`${input} mt-1 normal-case tracking-normal`} type={type} value={String(presetDraft[key as keyof EinkPresetForm] ?? "")} disabled={key === "key" && !!catalog?.presets.some((item) => item.key === presetDraft.key)} onChange={(event) => setPresetDraft({ ...presetDraft, [key]: type === "number" ? Number(event.target.value) : event.target.value })} /></label>)}<label className={`${EYEBROW} text-[var(--admin-muted)]`}>Link support<select className={`${input} mt-1 normal-case tracking-normal`} value={presetDraft.linkSupport} onChange={(event) => setPresetDraft({ ...presetDraft, linkSupport: event.target.value as EinkPresetForm["linkSupport"] })}><option value="full">Full</option><option value="partial">Partial</option><option value="poor">Poor</option></select></label><label className={`${EYEBROW} text-[var(--admin-muted)] sm:col-span-2`}>Sell guidance<textarea className={`${input} mt-1 normal-case tracking-normal`} rows={2} value={presetDraft.sellGuidance} onChange={(event) => setPresetDraft({ ...presetDraft, sellGuidance: event.target.value })} /></label><label className={`${EYEBROW} text-[var(--admin-muted)] sm:col-span-2`}>Caveat (optional)<textarea className={`${input} mt-1 normal-case tracking-normal`} rows={2} value={presetDraft.caveat ?? ""} onChange={(event) => setPresetDraft({ ...presetDraft, caveat: event.target.value })} /></label></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setPresetDraft(null)}>Cancel</Button><Button onClick={() => savePreset.mutate(presetDraft)} disabled={savePreset.isPending} className="bg-[var(--admin-ink)] hover:bg-[var(--admin-ink)]"><Save className="mr-1.5 h-3.5 w-3.5" />{savePreset.isPending ? "Saving…" : "Save preset"}</Button></div></section>}
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-card)] p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[var(--admin-ink)]">What the profile enforces</h2><span className="text-[10px] text-[var(--admin-faint)]">Editable rules</span></div><div className="mt-4 space-y-3">{catalog?.rules.map((rule) => <div key={rule.key} className="flex items-start gap-3 border-b border-[#F2EAE0] pb-3 last:border-0 last:pb-0"><span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-ink)]">{rule.label}</span><span className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--admin-muted)]">{rule.description}{rule.threshold !== null && <span className="ml-1 font-mono text-[10px]">({rule.threshold} {rule.unit})</span>} {!rule.enabled && <Pill tone="off" className="ml-1">off</Pill>}</span><button aria-label={`Edit ${rule.label}`} onClick={() => setRuleDraft({ ...rule })}><Pencil className="h-3.5 w-3.5 text-[var(--admin-muted)]" /></button></div>)}</div>{ruleDraft && <div className="mt-4 rounded-lg bg-[var(--admin-card-subtle)] p-3"><p className={`${EYEBROW} text-[var(--admin-muted)]`}>Edit {ruleDraft.label}</p><div className="mt-2 flex items-center gap-2"><input type="checkbox" checked={ruleDraft.enabled} onChange={(event) => setRuleDraft({ ...ruleDraft, enabled: event.target.checked })} /><span className="text-xs text-[var(--admin-ink)]">Enforced</span>{ruleDraft.threshold !== null && <input className={`${input} max-w-28`} type="number" step="0.01" value={ruleDraft.threshold} onChange={(event) => setRuleDraft({ ...ruleDraft, threshold: Number(event.target.value) })} />}</div><textarea className={`${input} mt-2`} rows={2} value={ruleDraft.description} onChange={(event) => setRuleDraft({ ...ruleDraft, description: event.target.value })} /><div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setRuleDraft(null)}>Cancel</Button><Button size="sm" onClick={() => saveRule.mutate(ruleDraft)} disabled={saveRule.isPending}>Save rule</Button></div></div>}</section>
        <section className="rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-card)] p-5"><h2 className="text-sm font-semibold text-[var(--admin-ink)]">Listings that overclaim</h2><p className="mt-2 text-xs leading-relaxed text-[var(--admin-muted)]">Live listings targeting a poor-link device while promising hyperlinked navigation appear here and in the platform decision queue.</p>{riskQuery.isLoading ? <div className="mt-5"><SkeletonRows rows={2} cols={3} /></div> : riskQuery.error ? <ErrorState message="Could not load listing risks." onRetry={() => riskQuery.refetch()} /> : risks.length === 0 ? <div className="mt-5 rounded-lg bg-[var(--admin-card-subtle)] p-4 text-xs text-[var(--admin-muted)]">No flagged listings found.</div> : <ul className="mt-5 divide-y divide-[#F2EAE0]">{risks.map((listing) => <li key={listing.plannerId} className="py-3 first:pt-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--admin-ink)]">{listing.editionName}</p><p className="mt-1 text-xs text-[var(--admin-muted)]">{listing.storeName || listing.storeId || "Platform catalog"} · {listing.deviceLabel}</p></div><span className="shrink-0 font-mono text-[10px] text-[var(--admin-faint)]">{listing.ageHours !== undefined ? `${listing.ageHours}h old` : "recent"}</span></div><a className="mt-2 inline-block text-xs font-semibold text-[var(--admin-ink)] underline" href={listing.storeId ? `/store/${listing.storeId}/builds` : "/super/catalog/global"}>Review listing</a></li>)}</ul>}</section></div>
      </div>}
  </div>;
}

export default function ProductRecipesPage() {
  const [location, navigate] = useLocation(); const qc = useQueryClient(); const { toast } = useToast();
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const view: View = location.endsWith("/eink") ? "eink" : params.get("view") === "schedule" ? "schedule" : "recipes";
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const { data: recipes = [], isLoading, error, refetch } = useQuery({ queryKey: ["platform-recipes"], queryFn: () => recipesApi.list() });
  const { data: stats } = useQuery({ queryKey: ["platform-recipes-stats"], queryFn: () => recipesApi.stats() });
  const saveDone = () => { qc.invalidateQueries({ queryKey: ["platform-recipes"] }); qc.invalidateQueries({ queryKey: ["platform-recipes-stats"] }); setDrawer({ mode: "closed" }); toast({ title: "Recipe saved" }); };
  const setView = (next: View) => navigate(next === "eink" ? "/super/recipes/eink" : `/super/recipes?view=${next}`);
  const action = view === "recipes" ? <Button size="sm" onClick={() => setDrawer({ mode: "create" })} className="bg-[var(--admin-clay)] hover:bg-[var(--admin-clay)]"><Plus className="mr-1.5 h-4 w-4" /> New recipe</Button> : view === "schedule" ? <Button size="sm" onClick={() => setDrawer({ mode: "create" })} className="bg-[var(--admin-clay)] hover:bg-[var(--admin-clay)]"><CalendarDays className="mr-1.5 h-4 w-4" /> Schedule a recipe</Button> : <Button size="sm" onClick={() => document.getElementById("eink-add-preset")?.click()} className="bg-[var(--admin-clay)] hover:bg-[var(--admin-clay)]"><Plus className="mr-1.5 h-4 w-4" /> Add device preset</Button>;
  return <div className="space-y-5"><PageHeader title="Product recipes" description="The product types stores can build — defined here, shipped on a schedule." scopeLabel="Platform" actions={action} /><div className="flex w-fit gap-1 rounded-[11px] bg-[#F2EAE0] p-[3px]"><button onClick={() => setView("recipes")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${view === "recipes" ? "bg-[#FFFDF9] text-[var(--admin-ink)] shadow-[0_1px_2px_rgba(27,42,74,.08)]" : "text-[var(--admin-muted)]"}`}>Recipes</button><button onClick={() => setView("schedule")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${view === "schedule" ? "bg-[#FFFDF9] text-[var(--admin-ink)] shadow-[0_1px_2px_rgba(27,42,74,.08)]" : "text-[var(--admin-muted)]"}`}>Schedule</button><button onClick={() => setView("eink")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${view === "eink" ? "bg-[#FFFDF9] text-[var(--admin-ink)] shadow-[0_1px_2px_rgba(27,42,74,.08)]" : "text-[var(--admin-muted)]"}`}>E-ink</button></div>{view === "eink" ? <EinkView /> : isLoading ? <SkeletonRows rows={6} cols={4} /> : error ? <ErrorState onRetry={() => refetch()} /> : view === "schedule" ? <ScheduleView recipes={recipes} onOpen={setDrawer} /> : <RecipesView recipes={recipes} stats={stats} onOpen={setDrawer} />}{drawer.mode !== "closed" && <RecipeDrawer state={drawer} onClose={() => setDrawer({ mode: "closed" })} onSaved={saveDone} />}</div>;
}