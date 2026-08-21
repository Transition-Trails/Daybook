/**
 * CanonBoard — Kanban view of Canon Records grouped by workflow status.
 * Proposed → Under Review → Accepted → Superseded / Rejected
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Loader2, RefreshCw, BookOpen, CheckCircle2,
  Clock, ArrowRight, AlertTriangle, X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";

interface CanonRecord {
  id: string;
  worldId: string;
  name: string;
  status: string;
  canonType?: string | null;
  narrativeDetails: string;
  specRefCount: number;
  updatedAt: string;
}

interface CanonBoardResponse {
  board: Record<string, CanonRecord[]>;
  total: number;
}

interface CreateCanonModalProps {
  worldId: string;
  onClose: () => void;
  onCreated: () => void;
}

const COLUMNS: Array<{
  key: string;
  label: string;
  headerBg: string;
  headerText: string;
  badgeBg: string;
  nextStatus?: string;
  nextLabel?: string;
}> = [
  { key: "proposed",     label: "Proposed",     headerBg: "bg-gray-100",   headerText: "text-gray-600",    badgeBg: "bg-gray-200 text-gray-600",   nextStatus: "under_review", nextLabel: "Send for Review" },
  { key: "under_review", label: "Under Review",  headerBg: "bg-amber-50",   headerText: "text-amber-700",   badgeBg: "bg-amber-100 text-amber-700", nextStatus: "accepted",     nextLabel: "Accept" },
  { key: "accepted",     label: "Accepted",      headerBg: "bg-emerald-50", headerText: "text-emerald-700", badgeBg: "bg-emerald-100 text-emerald-700" },
  { key: "superseded",   label: "Superseded",    headerBg: "bg-gray-50",    headerText: "text-gray-500",    badgeBg: "bg-gray-100 text-gray-500" },
  { key: "rejected",     label: "Rejected",      headerBg: "bg-red-50",     headerText: "text-red-600",     badgeBg: "bg-red-100 text-red-600" },
];

const CANON_TYPE_COLORS: Record<string, string> = {
  character:   "#8B5CF6",
  location:    "#3B82F6",
  object:      "#F59E0B",
  event:       "#EC4899",
  lore:        "#10B981",
  atmosphere:  "#C87560",
  material:    "#6B7280",
};

function CanonCardItem({
  record,
  nextStatus,
  nextLabel,
  onTransition,
  isTransitioning,
}: {
  record: CanonRecord;
  nextStatus?: string;
  nextLabel?: string;
  onTransition: (id: string, status: string) => void;
  isTransitioning: boolean;
}) {
  const typeColor = CANON_TYPE_COLORS[record.canonType ?? ""] ?? "#9CA3AF";
  const updatedAgo = (() => {
    const diff = Date.now() - new Date(record.updatedAt).getTime();
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    return "just now";
  })();

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 mb-2 group">
      {/* Type badge */}
      {record.canonType && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 mb-2 inline-block"
          style={{ background: `${typeColor}18`, color: typeColor }}
        >
          {record.canonType}
        </span>
      )}

      {/* Name */}
      <p className="text-sm font-medium text-gray-800 mb-1.5 leading-snug">{record.name}</p>

      {/* Narrative preview */}
      {record.narrativeDetails && (
        <p className="text-[11px] text-gray-500 line-clamp-2 mb-2">{record.narrativeDetails}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <Clock className="w-2.5 h-2.5" />
          {updatedAgo}
          {record.specRefCount > 0 && (
            <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
              {record.specRefCount} spec{record.specRefCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {nextStatus && nextLabel && (
          <button
            onClick={() => onTransition(record.id, nextStatus)}
            disabled={isTransitioning}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded transition-all"
            style={{ background: "#1B2A4A", color: "white" }}
          >
            {isTransitioning ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <ArrowRight className="w-2.5 h-2.5" />
            )}
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function CreateCanonModal({ worldId, onClose, onCreated }: CreateCanonModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [canonType, setCanonType] = useState("location");
  const [narrativeDetails, setNarrativeDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/v1/editorial/canon-records", {
        method: "POST",
        body: JSON.stringify({ world_id: worldId, name, canon_type: canonType, narrative_details: narrativeDetails }),
      });
      toast({ title: "Canon record created" });
      onCreated();
      onClose();
    } catch {
      toast({ title: "Failed to create canon record", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#1B2A4A]">New Canon Record</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#C87560]"
              placeholder="e.g. The Library Athenaeum"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Canon Type</label>
            <select
              value={canonType}
              onChange={e => setCanonType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none"
            >
              {Object.keys(CANON_TYPE_COLORS).map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Narrative Details</label>
            <textarea
              value={narrativeDetails}
              onChange={e => setNarrativeDetails(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#C87560] resize-none"
              rows={3}
              placeholder="Describe this canon element…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#C87560" }}
          >
            {saving ? "Creating…" : "Create Record"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CanonBoard() {
  const { selectedWorldId, selectedWorld } = useEditorial();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<CanonBoardResponse>({
    queryKey: ["editorial-canon-board", selectedWorldId],
    queryFn: () => apiFetch<CanonBoardResponse>(`/v1/editorial/canon-board?world_id=${selectedWorldId}`),
    enabled: !!selectedWorldId,
    staleTime: 15_000,
  });

  const handleTransition = async (id: string, status: string) => {
    setTransitioning(id);
    try {
      await apiFetch(`/v1/editorial/canon-records/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      qc.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("editorial-canon"),
      });
      toast({ title: `Moved to ${status.replace("_", " ")}` });
    } catch {
      toast({ title: "Transition failed", variant: "destructive" });
    } finally {
      setTransitioning(null);
    }
  };

  const board = data?.board ?? {};

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="text-gray-400">WorldSmith</span>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">{selectedWorld?.name ?? "—"}</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700">Canon Approval Board</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {selectedWorldId && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ background: "#1B2A4A" }}
            >
              <Plus className="w-4 h-4" />
              New Canon Record
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-4">
        {!selectedWorldId ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a world to view the canon board.</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="flex gap-3 h-full" style={{ minWidth: COLUMNS.length * 240 }}>
            {COLUMNS.map(col => {
              const records = board[col.key] ?? [];
              return (
                <div key={col.key} className="flex flex-col" style={{ width: 224, minWidth: 224 }}>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${col.headerBg}`}>
                    <span className={`text-xs font-semibold ${col.headerText}`}>{col.label}</span>
                    <span className={`text-[11px] font-medium rounded-full px-1.5 py-0.5 ${col.badgeBg}`}>
                      {records.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto pt-2 rounded-b-lg" style={{ background: "rgba(0,0,0,0.02)" }}>
                    {records.length === 0 ? (
                      <div className="flex items-center justify-center py-6 text-gray-300 text-xs">
                        No records
                      </div>
                    ) : (
                      records.map(record => (
                        <CanonCardItem
                          key={record.id}
                          record={record}
                          nextStatus={col.nextStatus}
                          nextLabel={col.nextLabel}
                          onTransition={handleTransition}
                          isTransitioning={transitioning === record.id}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && selectedWorldId && (
        <CreateCanonModal
          worldId={selectedWorldId}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({
            predicate: (q) => String(q.queryKey[0] ?? "").startsWith("editorial-canon"),
          })}
        />
      )}
    </div>
  );
}
