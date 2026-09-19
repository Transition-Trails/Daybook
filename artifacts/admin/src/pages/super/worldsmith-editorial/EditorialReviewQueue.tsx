import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, FileText, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useEditorialPageFilters } from "./EditorialShell";

type JsonObject = Record<string, any>;
type Discovery = JsonObject & { id: string; title?: string; status?: string; decisionStatus?: string; decisionReason?: string | null; revisions?: JsonObject[]; submissionSnapshot?: JsonObject | null; immutableSubmissionSnapshot?: JsonObject | null };
type SuggestionResponse = { suggestions?: JsonObject[] };
const statuses = ["all", "submitted", "in_review", "returned", "accepted", "rejected"];
const label = (value: unknown) => String(value ?? "").replace(/_/g, " ");
const snapshotOf = (item?: Discovery | null) => item?.immutableSubmissionSnapshot ?? item?.submissionSnapshot ?? {};
const kindOf = (item?: Discovery | null) => String(snapshotOf(item).discovery_kind ?? "owner_submission");
const kindLabel = (kind: string) => kind === "canon_idea" ? "Canon idea" : kind === "storyline_idea" ? "Storyline idea" : "Owner submission";

function JsonCard({ title, value }: { title: string; value?: unknown }) {
  if (value == null) return null;
  return <section className="rounded-xl border border-[#E5E7EB] bg-white p-4"><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">{title}</h3><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[#374151]">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre></section>;
}

export default function EditorialReviewQueue() {
  const { selectedWorldId } = useEditorial();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [draft, setDraft] = useState<JsonObject>({});
  const [acceptMode, setAcceptMode] = useState<"existing" | "create">("existing");
  const [canonId, setCanonId] = useState("");
  const [newCanon, setNewCanon] = useState({ name: "", canon_type: "character", narrative_details: "", historical_context: "", visual_notes: "" });
  const query = useQuery({ queryKey: ["editorial/owner-discoveries", selectedWorldId, status], enabled: Boolean(selectedWorldId), queryFn: () => apiFetch<{ discoveries: Discovery[] }>(`/v1/editorial/owner-discoveries?world_id=${encodeURIComponent(selectedWorldId!)}${status !== "all" ? `&status=${encodeURIComponent(status)}` : ""}`) });
  const canonQuery = useQuery({ queryKey: ["editorial/canon-records", selectedWorldId], enabled: Boolean(selectedWorldId), queryFn: () => apiFetch<{ canon_records: Array<{ id: string; name: string; canonType?: string; canon_type?: string }> }>(`/v1/editorial/canon-records?world_id=${encodeURIComponent(selectedWorldId!)}&limit=300`) });
  const discoveries = query.data?.discoveries ?? [];
  const selected = discoveries.find(item => item.id === selectedId) ?? discoveries[0];
  const selectedSnapshot = snapshotOf(selected);
  const selectedKind = kindOf(selected);
  const selectedStatus = String(selected?.status ?? selected?.decisionStatus ?? "submitted");
  const generated = selectedKind !== "owner_submission";
  const canStart = selectedStatus === "submitted";
  const canDecide = selectedStatus === "in_review";
  const pending = discoveries.filter(item => !["accepted", "rejected"].includes(String(item.status ?? item.decisionStatus))).length;

  const action = useMutation({
    mutationFn: async ({ id, action, body }: { id: string; action: string; body?: JsonObject }) => apiFetch(`/v1/editorial/owner-discoveries/${encodeURIComponent(id)}/${action}`, { method: "POST", body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["editorial/owner-discoveries"] }); setReason(""); setRevisionNote(""); setCanonId(""); },
  });
  const generate = useMutation({
    mutationFn: async () => {
      if (!selectedWorldId) throw new Error("Choose a world first.");
      const [canon, stories] = await Promise.all([
        apiFetch<SuggestionResponse>("/v1/editorial/canon-records/suggest", { method: "POST", body: JSON.stringify({ world_id: selectedWorldId }) }),
        apiFetch<SuggestionResponse>("/v1/editorial/stories/suggest", { method: "POST", body: JSON.stringify({ world_id: selectedWorldId }) }),
      ]);
      const list = (value: SuggestionResponse) => Array.isArray(value.suggestions) ? value.suggestions : [];
      return apiFetch("/v1/editorial/owner-discoveries/generated", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ world_id: selectedWorldId, canon_suggestions: list(canon), story_suggestions: list(stories) }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["editorial/owner-discoveries"] }),
  });
  const updateDraft = (key: string, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const editable = useMemo(() => selectedKind === "canon_idea" ? ["name", "canonType", "narrativeDetails", "rationale"] : ["title", "narrativePromise", "rationale", "recommendedStatus"], [selectedKind]);
  useEffect(() => {
    if (!selected) return;
    const next = snapshotOf(selected);
    setDraft(next);
    if (kindOf(selected) === "canon_idea") {
      setAcceptMode("create");
      setNewCanon(current => ({
        ...current,
        name: String(next.name ?? ""),
        canon_type: String(next.canonType ?? next.canon_type ?? "character"),
        narrative_details: String(next.narrativeDetails ?? next.narrative_details ?? ""),
      }));
    } else {
      setAcceptMode("existing");
    }
  }, [selected?.id]);
  useEditorialPageFilters({ label: "Queue filters", activeCount: status === "all" ? 0 : 1, onClear: () => setStatus("all"), content: <select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs">{statuses.map(item => <option key={item} value={item}>{item === "all" ? "All statuses" : label(item)}</option>)}</select> });

  return <div className="flex h-full min-h-0 flex-col bg-[#FAF9F7]">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-6 py-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C87560]">Editorial</p><h1 className="font-display text-xl font-semibold text-[#1B2A4A]" data-testid="heading-discovery-review">Discovery Review</h1><p className="mt-0.5 text-xs text-gray-500">{pending} item{pending === 1 ? "" : "s"} needing editorial attention</p></div>
      <div className="flex items-center gap-2"><button type="button" data-testid="button-generate-ideas" disabled={!selectedWorldId || generate.isPending} onClick={() => generate.mutate()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#C87560] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />{generate.isPending ? "Generating…" : "Generate ideas"}</button><select data-testid="select-discovery-status-header" value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs">{statuses.map(item => <option key={item} value={item}>{item === "all" ? "All statuses" : label(item)}</option>)}</select></div>
    </header>
    {generate.error && <p className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700">Ideas could not be generated. Try again.</p>}
    {!selectedWorldId ? <div className="p-8 text-sm text-gray-500">Select a world to review discoveries.</div> : <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
      <aside className="border-r border-[#E5E7EB] bg-white p-3">{query.isLoading && <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-[#C87560]" />}{query.error && <p className="p-4 text-xs text-red-600">Unable to load the discovery queue.</p>}{!query.isLoading && !discoveries.length && <p className="p-4 text-xs text-gray-500">No discoveries match this filter.</p>}<div className="space-y-1">{discoveries.map(item => { const k = kindOf(item); const s = String(item.status ?? item.decisionStatus ?? "submitted"); return <button type="button" key={item.id} data-testid={`button-discovery-${item.id}`} onClick={() => { setSelectedId(item.id); setDraft(snapshotOf(item)); }} className={`w-full rounded-lg p-3 text-left ${selected?.id === item.id ? "bg-[#F8EDEA]" : "hover:bg-gray-50"}`}><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-[#C87560]" /><span className="truncate text-sm font-medium text-[#1B2A4A]">{item.title ?? snapshotOf(item).name ?? "Untitled discovery"}</span><ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-400" /></div><div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500"><span className="rounded-full bg-[#F3F4F6] px-1.5 py-0.5">{kindLabel(k)}</span><Clock className="h-3 w-3" />{label(s)}</div></button>; })}</div></aside>
      {selected ? <main className="space-y-4 p-5 lg:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#C87560]">{kindLabel(selectedKind)}</div><h2 className="font-display text-lg font-semibold text-[#1B2A4A]">{selected.title ?? selectedSnapshot.name ?? "Untitled discovery"}</h2><p className="text-xs text-gray-500">Submission {selected.id}</p></div><span data-testid="status-selected-discovery" className="rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-medium text-gray-600">{label(selectedStatus)}</span></div>
        <div className="grid gap-3 md:grid-cols-2"><JsonCard title="Source Canon" value={selected.sourceCanon} /><JsonCard title="Story Moment" value={selected.storyMoment} /><JsonCard title="Owner Context" value={selected.ownerContext ?? selected.owner} /><JsonCard title="Submitted Content" value={selectedSnapshot} /></div><JsonCard title="Revision History" value={selected.revisions} />
        {generated && canDecide && <section className="rounded-xl border border-[#E5E7EB] bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">Review this {selectedKind === "canon_idea" ? "Canon idea" : "storyline idea"}</h3><span className="text-[11px] text-gray-400">AI candidate</span></div><div className="grid gap-3 md:grid-cols-2">{editable.map(key => <label key={key} className="text-xs font-medium text-[#374151]">{label(key)}{key === "narrativeDetails" || key === "narrativePromise" || key === "rationale" ? <textarea value={draft[key] ?? selectedSnapshot[key] ?? ""} onChange={e => updateDraft(key, e.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs" /> : <input value={draft[key] ?? selectedSnapshot[key] ?? ""} onChange={e => updateDraft(key, e.target.value)} className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs" />}</label>)}</div><input value={revisionNote} onChange={e => setRevisionNote(e.target.value)} placeholder="Revision note (optional)" className="mt-3 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs" /><button type="button" disabled={action.isPending} onClick={() => action.mutate({ id: selected.id, action: "revise", body: { snapshot: { ...selectedSnapshot, ...draft, discovery_kind: selectedKind }, revision_note: revisionNote.trim() } })} className="mt-3 rounded-lg border border-[#1B2A4A] px-3 py-2 text-xs font-semibold text-[#1B2A4A]">Revise</button></section>}
        {action.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">Action failed. {action.error instanceof Error ? action.error.message : "The server rejected this action."}</p>}
        {!["accepted", "rejected"].includes(selectedStatus) && <section className="rounded-xl border border-[#E5E7EB] bg-white p-4"><div className="flex flex-wrap gap-2"><button type="button" disabled={action.isPending || !canStart} onClick={() => action.mutate({ id: selected.id, action: "start-review" })} className="rounded-lg border border-[#1B2A4A] px-3 py-2 text-xs font-medium text-[#1B2A4A]">Start review</button>{selectedKind === "storyline_idea" ? <button type="button" disabled={action.isPending || !canDecide} onClick={() => action.mutate({ id: selected.id, action: "accept" })} className="inline-flex items-center gap-1 rounded-lg bg-[#1B2A4A] px-3 py-2 text-xs font-medium text-white"><Check className="h-3.5 w-3.5" />Accept storyline</button> : <button type="button" disabled={action.isPending || !canDecide || (acceptMode === "existing" && !canonId) || (acceptMode === "create" && !(generated ? String(draft.name ?? "").trim() : newCanon.name.trim()))} onClick={() => action.mutate({ id: selected.id, action: "accept", body: acceptMode === "existing" ? { editorial_canon_record_id: canonId } : { create_canon: generated ? { name: draft.name, canon_type: draft.canonType, narrative_details: draft.narrativeDetails } : newCanon } })} className="inline-flex items-center gap-1 rounded-lg bg-[#1B2A4A] px-3 py-2 text-xs font-medium text-white"><Check className="h-3.5 w-3.5" />Accept</button>}{!generated && <button type="button" disabled={action.isPending || !canDecide || !reason.trim()} onClick={() => action.mutate({ id: selected.id, action: "return", body: { reason: reason.trim() } })} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700"><RotateCcw className="h-3.5 w-3.5" />Return</button>}<button type="button" disabled={action.isPending || !canDecide || !reason.trim()} onClick={() => action.mutate({ id: selected.id, action: "reject", body: { reason: reason.trim() } })} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700"><X className="h-3.5 w-3.5" />Reject</button></div>{selectedKind !== "storyline_idea" && <div className="mt-3 grid gap-2 md:grid-cols-[auto_1fr]"><select value={acceptMode} onChange={e => setAcceptMode(e.target.value as "existing" | "create")} className="rounded-lg border border-[#E5E7EB] px-2 py-2 text-xs"><option value="existing">Use Canon ID</option><option value="create">Create Canon</option></select>{acceptMode === "existing" ? <select value={canonId} onChange={e => setCanonId(e.target.value)} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"><option value="">Select an editorial Canon record</option>{(canonQuery.data?.canon_records ?? []).map(record => <option key={record.id} value={record.id}>{record.name} · {record.canonType ?? record.canon_type ?? "record"}</option>)}</select> : !generated && <div className="grid gap-2 md:grid-cols-2">{Object.keys(newCanon).map(key => <input key={key} value={newCanon[key as keyof typeof newCanon]} onChange={e => setNewCanon(current => ({ ...current, [key]: e.target.value }))} placeholder={label(key)} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs" />)}</div>}</div>}<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="A reason is required before rejecting this discovery." aria-describedby="reason-help" className="mt-3 min-h-16 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs" /><p id="reason-help" className="mt-1 text-[11px] text-gray-500">Explain why the idea was declined. Owner submissions also use this note when returned for revision.</p></section>}</main> : <div className="p-8 text-sm text-gray-500">Select a discovery.</div>}
    </div>}
  </div>;
}