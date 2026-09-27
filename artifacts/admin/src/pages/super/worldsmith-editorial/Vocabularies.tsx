import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronDown, CircleHelp, LockKeyhole, Pencil, Plus, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useEditorial } from "@/contexts/EditorialContext";
import {
  useCreateVocabularyEntry, useUpdateVocabularyEntry, useVocabularyManagement,
  type Vocabulary, type VocabularyOption,
} from "./useVocabularyManagement";
import { canonRecordTypes, fieldLabel, fieldsForType, recordTypeFields, sharedFields, type CanonRecordType } from "./recordTypeVocabularyFields";

type Entry = Vocabulary | VocabularyOption;
type Kind = "vocabularies" | "options";
type Editor = { kind: Kind; entry?: Entry; vocabularyId?: string };
type Confirmation = { kind: Kind; entry: Entry };
const CUSTOM_FIELD = "__custom__";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "The change could not be saved. Please try again.";

function isConflict(error: unknown) {
  return (error as { status?: number } | null)?.status === 409;
}

function StatusBadge({ active, label }: { active: boolean; label?: string }) {
  return <span className={`vocab-badge ${active ? "vocab-badge-active" : "vocab-badge-inactive"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#3F7A5E]" : "bg-[#9A8B7A]"}`} />
    {label ?? (active ? "Active" : "Inactive")}
  </span>;
}

function ScopeBadge({ global }: { global: boolean }) {
  return <span className={`vocab-badge ${global ? "vocab-badge-global" : "vocab-badge-world"}`}>
    {global ? <LockKeyhole size={11} /> : null}
    {global ? "Inherited global · read only" : "This world"}
  </span>;
}

function EntryLine({ entry, kind, worldId, parentInactive, onEdit, onToggle }: {
  entry: Entry; kind: Kind; worldId: string; parentInactive?: boolean;
  onEdit: (editor: Editor) => void; onToggle: (confirmation: Confirmation) => void;
}) {
  const global = entry.worldId !== worldId;
  return <div className="vocab-row grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center" data-testid={`row-${kind}-${entry.id}`}>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-[13px] font-semibold text-[var(--admin-ink)]" data-testid={`text-label-${entry.id}`}>{entry.label}</strong>
        <StatusBadge active={entry.active && !parentInactive} label={parentInactive && entry.active ? "Unavailable" : undefined} />
        <ScopeBadge global={global} />
      </div>
      {entry.description && <p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">{entry.description}</p>}
      {parentInactive && entry.active && <p className="mt-1 text-[11px] text-[var(--admin-clay-hover)]">Choice is active, but unavailable while its vocabulary is inactive.</p>}
    </div>
    <div className="min-w-0">
      <span className="block text-[10px] text-[var(--admin-faint)]">SAVED KEY</span>
      <code className="vocab-key" data-testid={`text-key-${entry.id}`}>{entry.key}</code>
    </div>
    {!global && <div className="flex items-center gap-1 md:justify-end">
      <button className="vocab-btn" type="button" onClick={() => onEdit({ kind, entry })} data-testid={`button-edit-${entry.id}`} aria-label={`Edit ${entry.label}`}><Pencil size={13} /> Edit</button>
      <button className="vocab-btn" type="button" onClick={() => onToggle({ kind, entry })} data-testid={`button-toggle-${entry.id}`} aria-label={`${entry.active ? "Deactivate" : "Activate"} ${entry.label}`}>{entry.active ? "Deactivate" : "Activate"}</button>
    </div>}
  </div>;
}

export default function Vocabularies() {
  const { selectedWorldId, selectedWorld, worldsLoading } = useEditorial();
  const worldId = selectedWorldId ?? null;
  const queryClient = useQueryClient();
  const register = useVocabularyManagement(worldId);
  const create = useCreateVocabularyEntry();
  const update = useUpdateVocabularyEntry();
  const [search, setSearch] = useState("");
  const [recordType, setRecordType] = useState<CanonRecordType | "all">("all");
  const [editorRecordType, setEditorRecordType] = useState<CanonRecordType | "">("");
  const [fieldSelection, setFieldSelection] = useState("");
  const [view, setView] = useState<"all" | "active" | "inactive">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [toggleError, setToggleError] = useState("");
  const currentWorldId = useRef(worldId);
  currentWorldId.current = worldId;
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setEditor(null);
    setConfirmation(null);
    setNotice("");
    setExpanded({});
  }, [worldId]);

  const openEditor = (next: Editor) => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(next);
    setKey(next.entry?.key ?? "");
    setLabel(next.entry?.label ?? "");
    setDescription(next.entry?.description ?? "");
    setEditorRecordType(recordType === "all" ? "" : recordType);
    setFieldSelection("");
    setFormError("");
    setNotice("");
  };
  const openConfirmation = (next: Confirmation) => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setToggleError("");
    setConfirmation(next);
  };

  const refreshAfterConflict = async (id: string, initiatingWorldId: string) => {
    if (initiatingWorldId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["editorial-vocabularies", initiatingWorldId] }),
        queryClient.invalidateQueries({ queryKey: ["editorial-vocabulary-management", initiatingWorldId] }),
      ]);
    }
    if (currentWorldId.current !== initiatingWorldId) return;
    setEditor(null);
    setConfirmation(null);
    setNotice(`Another editor changed this entry. The latest version has been loaded. Review ${id} and open Edit again to retry; your change was not saved.`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !worldId) return;
    const initiatingWorldId = worldId;
    const cleanKey = key.trim();
    const cleanLabel = label.trim();
    if (!editor.entry && editor.kind === "vocabularies" && (!editorRecordType || !fieldSelection)) {
      setFormError("Choose a Canon record type and a field first.");
      return;
    }
    if (!cleanLabel || (!editor.entry && !cleanKey)) {
      setFormError("A label and saved key are required.");
      return;
    }
    if (!editor.entry && !/^[a-z0-9][a-z0-9_-]*$/.test(cleanKey)) {
      setFormError("Saved keys must start with a letter or number and use only lowercase letters, numbers, underscores, or hyphens. For example: documentary.");
      return;
    }
    if (!editor.entry && editor.kind === "vocabularies" && register.data?.vocabularies.some(
      v => v.worldId === worldId && v.key === cleanKey,
    )) {
      setFormError("This field already has a vocabulary in this world. Close this form and add choices to its card.");
      return;
    }
    setFormError("");
    try {
      if (editor.entry) {
        await update.mutateAsync({ kind: editor.kind, id: editor.entry.id, worldId, expectedVersion: editor.entry.version, label: cleanLabel, description: description.trim() });
      } else {
        await create.mutateAsync({ kind: editor.kind, worldId, vocabularyId: editor.vocabularyId, key: cleanKey, label: cleanLabel, description: description.trim() });
      }
      if (currentWorldId.current !== initiatingWorldId) return;
      setEditor(null);
      if (!editor.entry && editor.kind === "vocabularies" && fieldSelection === CUSTOM_FIELD) setRecordType("all");
      setNotice(editor.entry ? "Entry updated." : fieldSelection === CUSTOM_FIELD ? "Entry added. Custom fields appear under All record types." : "Entry added to this world.");
    } catch (error) {
      if (isConflict(error) && editor.entry) await refreshAfterConflict(editor.entry.key, initiatingWorldId);
      else if (currentWorldId.current === initiatingWorldId) setFormError(errorText(error));
    }
  };

  const toggle = async () => {
    if (!confirmation || !worldId) return;
    const initiatingWorldId = worldId;
    setToggleError("");
    const { kind, entry } = confirmation;
    try {
      await update.mutateAsync({ kind, id: entry.id, worldId, expectedVersion: entry.version, active: !entry.active });
      if (currentWorldId.current !== initiatingWorldId) return;
      setConfirmation(null);
      setNotice(`${entry.label} ${entry.active ? "deactivated" : "activated"}.`);
    } catch (error) {
      if (isConflict(error)) await refreshAfterConflict(entry.key, initiatingWorldId);
      else if (currentWorldId.current === initiatingWorldId) setToggleError(errorText(error));
    }
  };

  const vocabs = (register.data?.vocabularies ?? []).filter(v => v.worldId === worldId || v.worldId == null);
  const options = (register.data?.options ?? []).filter(o => o.worldId === worldId || o.worldId == null);
  const scopedVocabs = recordType === "all" ? vocabs : vocabs.filter(v => fieldsForType(recordType).includes(v.key));
  const existingFieldVocabulary = editor?.kind === "vocabularies" && !editor.entry
    ? vocabs.find(v => v.worldId === worldId && v.key === key)
    : undefined;
  const scopedOptions = options.filter(o => scopedVocabs.some(v => v.id === o.vocabularyId));
  const activeChoices = scopedOptions.filter(o => o.active && scopedVocabs.some(v => v.id === o.vocabularyId && v.active)).length;
  const inactiveChoices = scopedOptions.length - activeChoices;
  const term = search.trim().toLowerCase();
  const visible = scopedVocabs.filter(v => {
    const children = options.filter(o => o.vocabularyId === v.id);
    const matchesSearch = !term || [v.key, v.label, v.description, ...children.flatMap(o => [o.key, o.label, o.description])].some(s => s?.toLowerCase().includes(term));
    const matchesView = view === "all" || (view === "active" ? v.active || children.some(o => o.active && v.active) : !v.active || children.some(o => !o.active));
    return matchesSearch && matchesView;
  });

  return <div className="vocab-page flex-1 overflow-y-auto" key={worldId ?? "no-world"}>
    <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-9 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="vocab-kicker mb-2">WorldSmith / Canon governance</div>
          <h1 className="text-[32px] leading-tight font-semibold md:text-[39px]">Vocabularies</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--admin-muted)]">The exact terms AI clients may write into Canon metadata. Keys are permanent; labels and availability can be revised.</p>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--admin-muted)]">Choose a Canon record type, then select the field whose choices you want to manage. Shared fields appear under more than one type.</p>
        </div>
        {worldId && <button type="button" className="vocab-btn vocab-btn-primary" onClick={() => openEditor({ kind: "vocabularies" })} data-testid="button-add-vocabulary"><Plus size={15} /> New vocabulary</button>}
      </div>

      {!worldId ? <div className="vocab-panel mt-9 flex flex-col items-start gap-3 p-8" data-testid="status-no-world">
        <BookOpen size={24} className="text-[var(--admin-clay)]" />
        <h2 className="text-xl">Choose a world to begin</h2>
        <p className="text-sm text-[var(--admin-muted)]">{worldsLoading ? "Loading worlds…" : "Select a world in the editorial navigation to review its terminology and inherited global choices."}</p>
      </div> : <>
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-y border-[var(--admin-border)] py-4 text-xs">
          <span><strong className="mr-2 text-[var(--admin-ink)]">{selectedWorld?.name ?? "Selected world"}</strong><span className="text-[var(--admin-muted)]">current scope</span></span>
          <span><strong className="mr-2 text-[var(--admin-ink)]">{scopedVocabs.length}</strong><span className="text-[var(--admin-muted)]">vocabularies</span></span>
          <span><strong className="mr-2 text-[#35694e]">{activeChoices}</strong><span className="text-[var(--admin-muted)]">available choices</span></span>
          <span><strong className="mr-2 text-[var(--admin-clay-hover)]">{inactiveChoices}</strong><span className="text-[var(--admin-muted)]">unavailable choices</span></span>
        </div>

        {notice && <div role="status" className="mt-5 flex items-start justify-between gap-3 rounded-lg border border-[#d9c4b5] bg-[#f8eee5] px-4 py-3 text-xs text-[var(--admin-ink)]" data-testid="status-vocabulary-notice">
          <span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice" data-testid="button-dismiss-notice"><X size={15} /></button>
        </div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-[240px]">
            <label className="vocab-label" htmlFor="vocab-type-filter">Canon record type</label>
            <select id="vocab-type-filter" className="vocab-input" value={recordType} onChange={e => { setRecordType(e.target.value as CanonRecordType | "all"); setSearch(""); setExpanded({}); }} data-testid="select-vocabulary-record-type">
              <option value="all">All record types</option>
              {canonRecordTypes.map(type => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
          </div>
          <div className="relative w-full sm:max-w-[370px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-[var(--admin-faint)]" />
            <input className="vocab-input pl-9" value={search} onChange={e => { setSearch(e.target.value); setExpanded({}); }} placeholder="Find a label, key or description" aria-label="Search vocabularies" data-testid="input-search-vocabularies" />
          </div>
          <div className="flex gap-1 rounded-lg border border-[var(--admin-border)] p-1" role="group" aria-label="Filter by availability">
            {(["all", "active", "inactive"] as const).map(value => <button key={value} type="button" onClick={() => setView(value)} aria-pressed={view === value} data-testid={`button-filter-${value}`} className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${view === value ? "bg-[var(--admin-ink)] text-[#f8f0e6]" : "text-[var(--admin-muted)] hover:bg-[var(--admin-sunken)]"}`}>{value}</button>)}
          </div>
        </div>

        {register.isPending ? <div className="mt-5 space-y-3" aria-label="Loading vocabularies" data-testid="status-vocabularies-loading">{[1, 2, 3].map(i => <div key={i} className="vocab-panel h-28 animate-pulse bg-[var(--admin-sunken)]" />)}</div>
          : register.isError ? <div className="vocab-panel mt-5 p-7" role="alert" data-testid="status-vocabularies-error"><h2 className="text-lg">The register could not be loaded</h2><p className="my-2 text-sm text-[var(--admin-muted)]">{errorText(register.error)}</p><button type="button" className="vocab-btn" onClick={() => register.refetch()} data-testid="button-retry-vocabularies">Try again</button></div>
          : scopedVocabs.length === 0 ? <div className="vocab-panel mt-5 flex flex-col items-start gap-3 p-9" data-testid="status-vocabularies-empty"><CircleHelp size={24} className="text-[var(--admin-clay)]" /><h2 className="text-xl">{recordType === "all" ? "No vocabulary sets yet" : `No ${canonRecordTypes.find(type => type.key === recordType)?.label} vocabularies yet`}</h2><p className="text-sm text-[var(--admin-muted)]">Choose a field to create its vocabulary in this world. Inherited global sets appear automatically when available.</p><button type="button" className="vocab-btn vocab-btn-primary" onClick={() => openEditor({ kind: "vocabularies" })} data-testid="button-add-first-vocabulary"><Plus size={14} /> Create a vocabulary</button></div>
          : visible.length === 0 ? <div className="vocab-panel mt-5 p-8 text-sm text-[var(--admin-muted)]" data-testid="status-no-matches">No sets match this search and filter. Adjust your terms to see more choices.</div>
          : <div className="mt-5 space-y-3">
            {visible.map(v => {
              const childOptions = options.filter(o => o.vocabularyId === v.id).sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
              const shownOptions = childOptions.filter(o => {
                const matchSearch = !term || [v.key, v.label, v.description, o.key, o.label, o.description].some(s => s?.toLowerCase().includes(term));
                const matchView = view === "all" || (view === "active" ? o.active && v.active : !o.active || !v.active);
                return matchSearch && matchView;
              });
              const isExpanded = expanded[v.id] ?? (Boolean(term) && shownOptions.length > 0);
              return <section key={v.id} className="vocab-panel overflow-hidden" data-testid={`section-vocabulary-${v.id}`}>
                <div className="bg-[#faf6ef] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="min-w-0 text-lg font-semibold leading-tight">
                      <button type="button" id={`vocab-toggle-${v.id}`} className="group flex items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-ink)]" aria-expanded={isExpanded} aria-controls={`vocab-choices-${v.id}`} onClick={() => setExpanded(previous => ({ ...previous, [v.id]: !isExpanded }))} data-testid={`button-expand-vocabulary-${v.id}`}>
                        <ChevronDown size={17} className={`shrink-0 text-[var(--admin-muted)] transition-transform ${isExpanded ? "" : "-rotate-90"}`} aria-hidden="true" />
                        <span><span className="vocab-kicker mb-1 block">Vocabulary set · {childOptions.length} {childOptions.length === 1 ? "choice" : "choices"}</span><span className="group-hover:underline">{v.label}</span></span>
                      </button>
                    </h2>
                    {v.worldId === worldId
                      ? <button type="button" className="vocab-btn" onClick={() => openEditor({ kind: "options", vocabularyId: v.id })} data-testid={`button-add-option-${v.id}`}><Plus size={13} /> Add world choice</button>
                      : <span className="text-[11px] text-[var(--admin-muted)]">Inherited global set · choices are read only here</span>}
                  </div>
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">{v.description || "No description provided."}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge active={v.active} /><ScopeBadge global={v.worldId !== worldId} /><span className="text-[10px] text-[var(--admin-faint)]">SAVED KEY</span><code className="vocab-key" data-testid={`text-vocabulary-key-${v.id}`}>{v.key}</code>
                    {v.worldId === worldId && <div className="ml-auto flex gap-1"><button className="vocab-btn" type="button" onClick={() => openEditor({ kind: "vocabularies", entry: v })} data-testid={`button-edit-vocabulary-${v.id}`}><Pencil size={12} /> Edit</button><button className="vocab-btn" type="button" onClick={() => openConfirmation({ kind: "vocabularies", entry: v })} data-testid={`button-toggle-vocabulary-${v.id}`}>{v.active ? "Deactivate" : "Activate"}</button></div>}
                  </div>
                </div>
                {isExpanded && <div id={`vocab-choices-${v.id}`} role="region" aria-labelledby={`vocab-toggle-${v.id}`} className="border-t border-[var(--admin-border)]">
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--admin-faint)]">Allowed choices · label / status / source / saved key</div>
                  {shownOptions.length ? shownOptions.map(o => <EntryLine key={o.id} entry={o} kind="options" worldId={worldId} parentInactive={!v.active} onEdit={openEditor} onToggle={openConfirmation} />) : <div className="border-t border-[var(--admin-row-divider)] px-4 py-5 text-xs text-[var(--admin-muted)]">{childOptions.length ? "No choices match this filter." : v.worldId === worldId ? "No choices yet. Add a world-specific choice to this set." : "No choices in this inherited global set."}</div>}
                </div>}
              </section>;
            })}
          </div>}
        <p className="mt-7 text-[11px] leading-relaxed text-[var(--admin-muted)]">Global terminology is inherited and cannot be edited here. Deactivated choices remain visible for existing records but cannot be used for future metadata saves.</p>
      </>}
    </div>

    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !create.isPending && !update.isPending) setEditor(null); }}>
      {editor && <DialogContent className="vocab-modal !block" onEscapeKeyDown={event => { if (create.isPending || update.isPending) event.preventDefault(); }} onInteractOutside={event => { if (create.isPending || update.isPending) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current?.isConnected) restoreFocus.current.focus(); }}>
        <div className="flex items-start justify-between gap-4"><div><div className="vocab-kicker mb-1">{editor.entry ? "Revise terminology" : "Add terminology"}</div><DialogTitle id="vocab-editor-title" className="!font-[var(--app-font-display)] !text-2xl !font-normal !leading-tight">{editor.entry ? "Edit" : "New"} {editor.kind === "options" ? "choice" : "vocabulary"}</DialogTitle></div><button type="button" className="vocab-btn !min-h-8 !px-2 mr-6" onClick={() => setEditor(null)} aria-label="Close editor" disabled={create.isPending || update.isPending} data-testid="button-close-vocabulary-editor"><X size={15} /></button></div>
        <DialogDescription className="mt-2 text-xs leading-relaxed text-[var(--admin-muted)]">Changes here apply only to {selectedWorld?.name ?? "this world"}. The saved key is fixed after creation.</DialogDescription>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {editor.kind === "vocabularies" && !editor.entry && <>
            <div><label className="vocab-label" htmlFor="vocab-type-input">Canon record type</label><select id="vocab-type-input" autoFocus className="vocab-input" required value={editorRecordType} onChange={e => { setEditorRecordType(e.target.value as CanonRecordType | ""); setFieldSelection(""); setKey(""); setLabel(""); setFormError(""); }} data-testid="select-new-vocabulary-record-type">
              <option value="">Choose a record type</option>
              {canonRecordTypes.map(type => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select></div>
            <div><label className="vocab-label" htmlFor="vocab-field-input">Field to manage</label><select id="vocab-field-input" className="vocab-input" required disabled={!editorRecordType} value={fieldSelection} onChange={e => { const field = e.target.value; setFieldSelection(field); setKey(field === CUSTOM_FIELD ? "" : field); setLabel(field === CUSTOM_FIELD || !field ? "" : fieldLabel(field)); setFormError(""); }} data-testid="select-new-vocabulary-field">
              <option value="">Choose a field</option>
              {editorRecordType && <>
                <optgroup label="Shared by Canon records">{sharedFields.map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}</optgroup>
                <optgroup label={`${canonRecordTypes.find(type => type.key === editorRecordType)?.label} fields`}>{recordTypeFields[editorRecordType].map(field => <option key={field} value={field}>{fieldLabel(field)}</option>)}</optgroup>
                <option value={CUSTOM_FIELD}>Other field (advanced)</option>
              </>}
            </select></div>
            {existingFieldVocabulary && <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--admin-muted)]">This field is already set up. <button type="button" className="vocab-btn" onClick={() => { setEditor(null); if (editorRecordType) setRecordType(editorRecordType); setSearch(""); setExpanded(previous => ({ ...previous, [existingFieldVocabulary.id]: true })); }} data-testid="button-open-existing-vocabulary">Open its choices</button></div>}
          </>}
          {(editor.kind === "options" || Boolean(editor.entry) || fieldSelection) && <div><label className="vocab-label" htmlFor="vocab-key-input">Saved key</label><input id="vocab-key-input" className="vocab-input font-mono" required value={key} readOnly={editor.kind === "vocabularies" && fieldSelection !== CUSTOM_FIELD && !editor.entry} disabled={Boolean(editor.entry)} onChange={e => { setKey(e.target.value.toLowerCase()); setFormError(""); }} placeholder="e.g. documentary" aria-describedby="vocab-key-help" data-testid="input-vocabulary-key" /><p id="vocab-key-help" className="mt-1 text-[11px] text-[var(--admin-faint)]">{editor.entry ? "Permanent identifier; cannot be changed." : editor.kind === "vocabularies" && fieldSelection !== CUSTOM_FIELD ? "Set automatically from your field selection. This key cannot be changed later." : "Use lowercase letters, numbers, underscores or hyphens. This key cannot be changed later."}</p></div>}
          <div><label className="vocab-label" htmlFor="vocab-label-input">Display label</label><input id="vocab-label-input" autoFocus={editor.kind === "options" || Boolean(editor.entry)} className="vocab-input" required value={label} onChange={e => setLabel(e.target.value)} placeholder="Name staff will recognize" data-testid="input-vocabulary-label" /></div>
          <div><label className="vocab-label" htmlFor="vocab-description-input">Description <span className="font-normal text-[var(--admin-faint)]">optional</span></label><textarea id="vocab-description-input" className="vocab-input min-h-[86px] resize-y" value={description} onChange={e => setDescription(e.target.value)} placeholder="When should an editor use this term?" data-testid="input-vocabulary-description" /></div>
          {formError && <p role="alert" className="text-xs text-[var(--admin-clay-hover)]" data-testid="status-vocabulary-form-error">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-[var(--admin-border)] pt-4"><button type="button" className="vocab-btn" onClick={() => setEditor(null)} disabled={create.isPending || update.isPending} data-testid="button-cancel-vocabulary">Cancel</button><button type="submit" className="vocab-btn vocab-btn-primary" disabled={create.isPending || update.isPending} data-testid="button-save-vocabulary">{create.isPending || update.isPending ? "Saving…" : editor.entry ? "Save changes" : "Create entry"}</button></div>
        </form>
      </DialogContent>}
    </Dialog>

    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !update.isPending) setConfirmation(null); }}>
      {confirmation && <AlertDialogContent className="vocab-modal !block" onEscapeKeyDown={event => { if (update.isPending) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus.current?.isConnected) restoreFocus.current.focus(); }}>
        <div className="vocab-kicker mb-2">Availability change</div>
        <AlertDialogTitle id="vocab-confirm-title" className="!font-[var(--app-font-display)] !text-2xl !font-normal">{confirmation.entry.active ? "Deactivate" : "Activate"} {confirmation.entry.label}?</AlertDialogTitle>
        <AlertDialogDescription id="vocab-confirm-description" className="mt-3 text-sm leading-relaxed text-[var(--admin-muted)]">{confirmation.entry.active ? "Deactivation disallows future metadata saves using this choice. Existing Canon records retain their saved values, and this entry remains visible in the register." : "This term will be available for future metadata saves again."}</AlertDialogDescription>
        {toggleError && <p role="alert" className="mt-4 text-xs text-[var(--admin-clay-hover)]" data-testid="status-toggle-error">{toggleError}</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" className="vocab-btn" disabled={update.isPending} onClick={() => setConfirmation(null)} data-testid="button-cancel-toggle">Keep as is</button><button type="button" className={`vocab-btn ${confirmation.entry.active ? "vocab-btn-danger" : "vocab-btn-primary"}`} disabled={update.isPending} onClick={toggle} data-testid="button-confirm-toggle">{update.isPending ? "Saving…" : confirmation.entry.active ? "Deactivate" : "Activate"}</button></div>
      </AlertDialogContent>}
    </AlertDialog>
  </div>;
}