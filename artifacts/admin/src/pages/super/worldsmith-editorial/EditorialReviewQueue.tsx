import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, FileText, Loader2, RotateCcw, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useEditorialPageFilters } from "./EditorialShell";

type JsonObject = Record<string, unknown>;
type Discovery = JsonObject & {
  id: string;
  title?: string;
  status?: string;
  decisionStatus?: string;
  decisionReason?: string | null;
  sourceCanon?: unknown;
  promotedCanon?: unknown;
  revisions?: JsonObject[];
  ownerContext?: string | null;
  storyMoment?: string | null;
  immutableSubmissionSnapshot?: JsonObject | null;
  submissionSnapshot?: JsonObject | null;
};

const statuses = ["all", "submitted", "in_review", "returned", "accepted", "rejected"];
const label = (value: unknown) => String(value ?? "").replace(/_/g, " ");

function JsonCard({ title, value }: { title: string; value?: unknown }) {
  if (value == null) return null;
  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-4" data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">{title}</h3>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[#374151]">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export default function EditorialReviewQueue() {
  const { selectedWorldId } = useEditorial();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [acceptMode, setAcceptMode] = useState<"existing" | "create">("existing");
  const [canonId, setCanonId] = useState("");
  const [newCanon, setNewCanon] = useState({ name: "", canon_type: "character", narrative_details: "", historical_context: "", visual_notes: "" });

  const query = useQuery({
    queryKey: ["editorial/owner-discoveries", selectedWorldId, status],
    enabled: Boolean(selectedWorldId),
    queryFn: () => apiFetch<{ discoveries: Discovery[] }>(
      `/v1/editorial/owner-discoveries?world_id=${encodeURIComponent(selectedWorldId!)}${status !== "all" ? `&status=${encodeURIComponent(status)}` : ""}`,
    ),
  });
  const canonQuery = useQuery({
    queryKey: ["editorial/canon-records", selectedWorldId],
    enabled: Boolean(selectedWorldId),
    queryFn: () => apiFetch<{ canon_records: Array<{ id: string; name: string; canonType?: string; canon_type?: string }> }>(
      `/v1/editorial/canon-records?world_id=${encodeURIComponent(selectedWorldId!)}&limit=300`,
    ),
  });
  const discoveries = query.data?.discoveries ?? [];
  const selected = discoveries.find(item => item.id === selectedId) ?? discoveries[0];

  const mutation = useMutation({
    mutationFn: async ({ id, action, body }: { id: string; action: string; body?: JsonObject }) =>
      apiFetch(`/v1/editorial/owner-discoveries/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["editorial/owner-discoveries"] });
      setReason("");
      setCanonId("");
    },
  });

  const pending = discoveries.filter(item => !["accepted", "rejected"].includes(String(item.status ?? item.decisionStatus))).length;
  useEditorialPageFilters({
    label: "Queue filters",
    activeCount: status === "all" ? 0 : 1,
    onClear: () => setStatus("all"),
    content: <select data-testid="select-discovery-status" value={status} onChange={event => setStatus(event.target.value)} className="w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs">
      {statuses.map(item => <option key={item} value={item}>{item === "all" ? "All statuses" : label(item)}</option>)}
    </select>,
  });

  const submittedContent = selected?.immutableSubmissionSnapshot ?? selected?.submissionSnapshot;
  const promotedId = typeof selected?.promotedCanon === "string"
    ? selected.promotedCanon
    : selected?.promotedCanon && typeof selected.promotedCanon === "object"
      ? String((selected.promotedCanon as JsonObject).id ?? "")
      : "";
  const selectedStatus = String(selected?.status ?? selected?.decisionStatus ?? "submitted");
  const canStart = selectedStatus === "submitted";
  const canDecide = selectedStatus === "in_review";
  const acceptBody = acceptMode === "existing"
    ? { editorial_canon_record_id: canonId }
    : { create_canon: newCanon };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FAF9F7]">
      <header className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-6 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C87560]">Editorial</p>
          <h1 className="font-display text-xl font-semibold text-[#1B2A4A]" data-testid="heading-discovery-review">Owner Discovery Review</h1>
          <p className="mt-0.5 text-xs text-gray-500">{pending} item{pending === 1 ? "" : "s"} needing editorial attention</p>
        </div>
        <select data-testid="select-discovery-status-header" value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs">
          {statuses.map(item => <option key={item} value={item}>{item === "all" ? "All statuses" : label(item)}</option>)}
        </select>
      </header>
      {!selectedWorldId ? <div className="p-8 text-sm text-gray-500">Select a world to review owner discoveries.</div> : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)]">
          <aside className="border-r border-[#E5E7EB] bg-white p-3">
            {query.isLoading && <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-[#C87560]" />}
            {query.error && <p className="p-4 text-xs text-red-600">Unable to load the discovery queue.</p>}
            {!query.isLoading && discoveries.length === 0 && <p className="p-4 text-xs text-gray-500">No discoveries match this filter.</p>}
            <div className="space-y-1">
              {discoveries.map(item => {
                const itemStatus = String(item.status ?? item.decisionStatus ?? "submitted");
                return <button type="button" key={item.id} data-testid={`button-discovery-${item.id}`} onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg p-3 text-left transition-colors ${selected?.id === item.id ? "bg-[#F8EDEA]" : "hover:bg-gray-50"}`}>
                  <div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-[#C87560]" /><span className="truncate text-sm font-medium text-[#1B2A4A]">{item.title ?? "Untitled discovery"}</span><ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-400" /></div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500"><Clock className="h-3 w-3" />{label(itemStatus)}</div>
                </button>;
              })}
            </div>
          </aside>
          {selected ? <main className="space-y-4 p-5 lg:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-display text-lg font-semibold text-[#1B2A4A]">{selected.title ?? "Untitled discovery"}</h2><p className="text-xs text-gray-500">Submission {selected.id}</p></div>
              <span data-testid="status-selected-discovery" className="rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-medium text-gray-600">{label(selected.status ?? selected.decisionStatus ?? "submitted")}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <JsonCard title="Source Canon" value={selected.sourceCanon} />
              <JsonCard title="Story Moment" value={selected.storyMoment} />
              <JsonCard title="Owner Context" value={selected.ownerContext ?? selected.owner} />
              <JsonCard title="Submitted Content (immutable)" value={submittedContent} />
            </div>
            <JsonCard title="Revision History" value={selected.revisions} />
            <JsonCard title="Provenance & Decision" value={{ owner: selected.owner, store: selected.store, ownerContext: selected.ownerContext, provenance: selected.provenance, reason: selected.decisionReason, submittedAt: selected.submittedAt, updatedAt: selected.updatedAt }} />
            {promotedId && <a data-testid="link-promoted-canon" href={`/super/worldsmith/editorial/canon/${String(promotedId)}`} className="inline-flex items-center gap-1 text-sm font-medium text-[#C87560] hover:underline">View promoted Canon <ChevronRight className="h-4 w-4" /></a>}
            {mutation.error && <p data-testid="text-mutation-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">Action failed: {mutation.error instanceof Error ? mutation.error.message : "The server rejected this action."}</p>}
            {(!["accepted", "rejected"].includes(selectedStatus)) && <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="button-start-review" disabled={mutation.isPending || !canStart} onClick={() => mutation.mutate({ id: selected.id, action: "start-review" })} className="rounded-lg border border-[#1B2A4A] px-3 py-2 text-xs font-medium text-[#1B2A4A]">Start review</button>
                <button type="button" data-testid="button-accept-discovery" disabled={mutation.isPending || !canDecide || (acceptMode === "existing" && !canonId) || (acceptMode === "create" && !newCanon.name)} onClick={() => mutation.mutate({ id: selected.id, action: "accept", body: acceptBody })} className="inline-flex items-center gap-1 rounded-lg bg-[#1B2A4A] px-3 py-2 text-xs font-medium text-white"><Check className="h-3.5 w-3.5" />Accept</button>
                <button type="button" data-testid="button-return-discovery" disabled={mutation.isPending || !canDecide || !reason.trim()} onClick={() => mutation.mutate({ id: selected.id, action: "return", body: { reason: reason.trim() } })} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700"><RotateCcw className="h-3.5 w-3.5" />Return</button>
                <button type="button" data-testid="button-reject-discovery" disabled={mutation.isPending || !canDecide || !reason.trim()} onClick={() => mutation.mutate({ id: selected.id, action: "reject", body: { reason: reason.trim() } })} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700"><X className="h-3.5 w-3.5" />Reject</button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[auto_1fr]">
                <select data-testid="select-accept-mode" value={acceptMode} onChange={event => setAcceptMode(event.target.value as "existing" | "create")} className="rounded-lg border border-[#E5E7EB] px-2 py-2 text-xs"><option value="existing">Use Canon ID</option><option value="create">Create Canon</option></select>
                {acceptMode === "existing" ? <select data-testid="select-canon-record" value={canonId} onChange={event => setCanonId(event.target.value)} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs"><option value="">Select an editorial Canon record</option>{(canonQuery.data?.canon_records ?? []).map(record => <option key={record.id} value={record.id}>{record.name} · {record.canonType ?? record.canon_type ?? "record"}</option>)}</select> : <div className="grid gap-2 md:grid-cols-2">{Object.keys(newCanon).map(key => <input key={key} data-testid={`input-canon-${key}`} value={newCanon[key as keyof typeof newCanon]} onChange={event => setNewCanon(current => ({ ...current, [key]: event.target.value }))} placeholder={label(key)} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs" />)}</div>}
              </div>
              <textarea data-testid="textarea-decision-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason required for return or reject" className="mt-3 min-h-16 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs" />
            </div>}
          </main> : <div className="p-8 text-sm text-gray-500">Select a discovery.</div>}
        </div>
      )}
    </div>
  );
}