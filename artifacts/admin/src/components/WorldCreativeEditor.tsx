import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { moveEra, type CreativeDraft, type HistoricalEra, type NarrativePillar, type Institution, type ContinuityAnchor, type OpenQuestion } from "@/lib/worldsmith/world-editor-types";

type Section = "Identity" | "Reality" | "Story Engine" | "Creative Direction";
export const WORLD_SECTIONS: Section[] = ["Identity", "Reality", "Story Engine", "Creative Direction"];
type ListKey = "coreThemes" | "storyGuardrails" | "visualGuardrails";
type ObjectKey = "narrativePillars" | "historicalEras" | "institutions" | "continuityAnchors" | "openQuestions";
type ObjectItem = NarrativePillar | HistoricalEra | Institution | ContinuityAnchor | OpenQuestion;
const objectFields: Record<ObjectKey, { label: string; description: string; fields: Array<{ key: string; label: string; kind?: "area" | "select"; options?: string[] }> }> = {
  narrativePillars: { label: "Narrative Pillars", description: "The kinds of stories that belong here.", fields: [{ key: "name", label: "Name" }, { key: "description", label: "Description", kind: "area" }] },
  historicalEras: { label: "Historical Eras", description: "A sequence, not necessarily a dated timeline. Reorder without changing each era's ID.", fields: [{ key: "name", label: "Era name" }, { key: "summary", label: "Summary", kind: "area" }, { key: "narrativeCondition", label: "Narrative condition", kind: "area" }, { key: "approximatePeriod", label: "Approximate period (optional)" }, { key: "notes", label: "Notes", kind: "area" }] },
  institutions: { label: "Institutions & Social Structure", description: "Households, communities, businesses and structures of power.", fields: [{ key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "description", label: "Description", kind: "area" }, { key: "roleInWorld", label: "Role in world", kind: "area" }, { key: "notes", label: "Notes", kind: "area" }] },
  continuityAnchors: { label: "Continuity Anchors", description: "Compact editorial reminders; Canon remains the authority for facts.", fields: [{ key: "label", label: "Label" }, { key: "statement", label: "Statement", kind: "area" }, { key: "severity", label: "Severity", kind: "select", options: ["advisory", "important", "critical"] }] },
  openQuestions: { label: "Open Questions", description: "Intentionally unresolved. Writers should not answer these automatically.", fields: [{ key: "question", label: "Question", kind: "area" }, { key: "notes", label: "Notes", kind: "area" }, { key: "status", label: "Status", kind: "select", options: ["open", "developing", "deferred"] }] },
};
const textFields: Array<{ section: Section; key: keyof CreativeDraft; title: string; help: string; max: number }> = [
  { section: "Identity", key: "worldPremise", title: "World Premise", help: "What is this realm fundamentally about?", max: 10000 },
  { section: "Identity", key: "foundationalHistory", title: "Origin / Foundational History", help: "Where did the realm begin, and how did it become what it is?", max: 30000 },
  { section: "Identity", key: "centralDramaticQuestion", title: "Central Dramatic Question", help: "The question this world keeps asking across stories.", max: 5000 },
  { section: "Reality", key: "economyAndResources", title: "Economy & Resources", help: "Money, labor, scarcity, infrastructure and material constraints.", max: 20000 },
  { section: "Reality", key: "knowledgeAndAuthority", title: "Knowledge & Authority", help: "How evidence, expertise, memory and correction work here.", max: 20000 },
  { section: "Reality", key: "currentWorldState", title: "Current World State", help: "The present narrative condition and unresolved tensions.", max: 20000 },
  { section: "Story Engine", key: "narrativeGravity", title: "Narrative Gravity", help: "Which questions do stories naturally return to?", max: 10000 },
  { section: "Story Engine", key: "conflictGrammar", title: "Conflict Grammar", help: "How does conflict arise without defaulting to genre drift?", max: 10000 },
  { section: "Story Engine", key: "discoveryRules", title: "Mystery / Discovery Rules", help: "How should discoveries emerge and change understanding?", max: 10000 },
  { section: "Creative Direction", key: "imageDirection", title: "Image Direction", help: "How should WorldSmith portray this realm? Distinct from its visual palette.", max: 10000 },
];
const listFields: Record<ListKey, { title: string; help: string; max: number; placeholder: string }> = {
  coreThemes: { title: "Core Themes", help: "Ideas examined again and again.", max: 50, placeholder: "Add a theme…" },
  storyGuardrails: { title: "Story Guardrails", help: "What stories in this realm should avoid becoming.", max: 100, placeholder: "Add a guardrail…" },
  visualGuardrails: { title: "Visual Guardrails", help: "Rules imagery should consistently respect.", max: 100, placeholder: "Add a visual rule…" },
};
const sectionItems: Record<Section, Array<keyof CreativeDraft>> = {
  Identity: ["worldPremise", "foundationalHistory", "centralDramaticQuestion", "coreThemes", "narrativePillars"],
  Reality: ["historicalEras", "institutions", "economyAndResources", "knowledgeAndAuthority", "currentWorldState"],
  "Story Engine": ["narrativeGravity", "conflictGrammar", "discoveryRules", "storyGuardrails", "continuityAnchors", "openQuestions"],
  "Creative Direction": ["visualGuardrails", "imageDirection"],
};

function StringList({ field, values, onChange }: { field: ListKey; values: string[]; onChange: (values: string[]) => void }) {
  const [input, setInput] = useState("");
  const config = listFields[field];
  const add = () => {
    if (!input.trim() || values.length >= config.max) return;
    onChange([...values, input.trim()]);
    setInput("");
  };
  return <div className="world-bible-entry space-y-3" data-testid={`list-${field}`}>
    <div><h3 className="font-semibold text-sm">{config.title}</h3><p className="text-xs text-muted-foreground mt-1">{config.help}</p></div>
    <div className="space-y-2">{values.map((value, index) => <div key={`${field}-${index}`} className="flex gap-2 items-center">
      <input className="world-bible-input" aria-label={`${config.title} ${index + 1}`} data-testid={`input-${field}-${index}`} value={value} onChange={e => onChange(values.map((v, i) => i === index ? e.target.value : v))} />
      <button type="button" aria-label={`Delete ${config.title} ${index + 1}`} data-testid={`button-delete-${field}-${index}`} onClick={() => onChange(values.filter((_, i) => i !== index))} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 size={16}/></button>
    </div>)}</div>
    <div className="flex gap-2"><input className="world-bible-input" data-testid={`input-add-${field}`} aria-label={config.placeholder} placeholder={config.placeholder} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button type="button" data-testid={`button-add-${field}`} onClick={add} disabled={!input.trim() || values.length >= config.max} className="shrink-0 rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">Add</button></div>
    <span className="text-[11px] text-muted-foreground">{values.length} / {config.max}</span>
  </div>;
}

function StructuredList({ field, values, onChange }: { field: ObjectKey; values: ObjectItem[]; onChange: (values: ObjectItem[]) => void }) {
  const config = objectFields[field];
  const [expanded, setExpanded] = useState<string | null>(null);
  const add = () => {
    const id = crypto.randomUUID();
    const defaults = field === "historicalEras" ? { name: "", summary: "", order: values.length } : field === "narrativePillars" ? { name: "", description: "" } : field === "institutions" ? { name: "", description: "" } : field === "continuityAnchors" ? { label: "", statement: "", severity: "advisory" } : { question: "", status: "open" };
    onChange([...values, { id, ...defaults } as ObjectItem]);
    setExpanded(id);
  };
  const change = (id: string, key: string, value: string) => onChange(values.map(item => item.id === id ? { ...item, [key]: value } : item));
  return <div className="world-bible-entry space-y-3" data-testid={`repeater-${field}`}>
    <div><h3 className="font-semibold text-sm">{config.label}</h3><p className="text-xs text-muted-foreground mt-1">{config.description}</p></div>
    {values.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">Nothing recorded yet. Add the first entry when this part of the world is ready.</p>}
    {values.map((item, index) => {
      const title = ("name" in item ? item.name : "label" in item ? item.label : item.question) || `Untitled ${config.label.toLowerCase().replace(/s$/, "")}`;
      return <div key={item.id} className="world-bible-repeater-entry rounded-xl border" data-testid={`entry-${field}-${item.id}`}>
        <div className="flex items-center gap-2 p-2">
          <button type="button" aria-expanded={expanded === item.id} data-testid={`button-edit-${field}-${item.id}`} onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="flex-1 min-w-0 text-left px-2 py-1 text-sm font-medium truncate">{field === "historicalEras" ? `${index + 1}. ` : ""}{title}</button>
          {field === "historicalEras" && <>
            <button type="button" aria-label={`Move ${title} earlier`} data-testid={`button-up-${item.id}`} disabled={index === 0} onClick={() => onChange(moveEra(values as HistoricalEra[], index, -1))} className="p-1.5 disabled:opacity-30"><ArrowUp size={15}/></button>
            <button type="button" aria-label={`Move ${title} later`} data-testid={`button-down-${item.id}`} disabled={index === values.length - 1} onClick={() => onChange(moveEra(values as HistoricalEra[], index, 1))} className="p-1.5 disabled:opacity-30"><ArrowDown size={15}/></button>
          </>}
          <button type="button" aria-label={`Delete ${title}`} data-testid={`button-delete-${field}-${item.id}`} onClick={() => { if (window.confirm(`Delete ${title}?`)) onChange(values.filter(v => v.id !== item.id).map((v, i) => field === "historicalEras" ? { ...v, order: i } : v)); }} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={15}/></button>
        </div>
        {expanded === item.id && <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">{config.fields.map(({ key, label, kind, options }) => <label key={key} className={`block text-xs font-medium ${kind === "area" ? "sm:col-span-2" : ""}`}>{label}
          {kind === "select" ? <select className="world-bible-input mt-1" data-testid={`select-${field}-${key}-${item.id}`} value={String((item as unknown as Record<string, unknown>)[key] ?? options?.[0])} onChange={e => change(item.id, key, e.target.value)}>{options?.map(option => <option key={option} value={option}>{option}</option>)}</select> : kind === "area"
            ? <textarea rows={3} className="world-bible-input mt-1 resize-y" data-testid={`input-${field}-${key}-${item.id}`} value={String((item as unknown as Record<string, unknown>)[key] ?? "")} onChange={e => change(item.id, key, e.target.value)}/>
            : <input className="world-bible-input mt-1" data-testid={`input-${field}-${key}-${item.id}`} value={String((item as unknown as Record<string, unknown>)[key] ?? "")} onChange={e => change(item.id, key, e.target.value)}/>}
        </label>)}</div>}
      </div>;
    })}
    <button type="button" data-testid={`button-add-${field}`} onClick={add} className="world-bible-add inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><Plus size={14}/> Add {config.label.replace(/s$/, "")}</button>
  </div>;
}

export function WorldCreativeEditor({ section, draft, onChange }: { section: Section; draft: CreativeDraft; onChange: (next: CreativeDraft) => void }) {
  return <div className="space-y-4" data-testid={`section-${section.toLowerCase().replace(/ /g, "-")}`}>
    {sectionItems[section].map(key => {
      const text = textFields.find(field => field.key === key);
      if (text) return <label key={key} className="world-bible-entry block">
        <span className="block text-sm font-semibold">{text.title}</span><span className="block text-xs text-muted-foreground mt-1 mb-3">{text.help}</span>
        <textarea data-testid={`input-${key}`} aria-label={text.title} className="world-bible-input min-h-32 resize-y" maxLength={text.max} value={(draft[key] as string | null) ?? ""} onChange={e => onChange({ ...draft, [key]: e.target.value || null })} placeholder={`Write ${text.title.toLowerCase()}…`}/>
        <span className="block text-right text-[11px] text-muted-foreground mt-1">{((draft[key] as string | null) ?? "").length.toLocaleString()} / {text.max.toLocaleString()}</span>
      </label>;
      if (key in listFields) return <StringList key={key} field={key as ListKey} values={draft[key] as string[]} onChange={values => onChange({ ...draft, [key]: values })}/>;
      return <StructuredList key={key} field={key as ObjectKey} values={draft[key] as ObjectItem[]} onChange={values => onChange({ ...draft, [key]: values })}/>;
    })}
  </div>;
}