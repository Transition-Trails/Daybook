/**
 * ReadinessBoard — swimlane view of all Production Specs grouped by pipeline stage.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle, Plus, RefreshCw, Loader2, Clock,
  CheckCircle2, Zap, BookOpen, FileText, Circle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";

interface SpecCard {
  id: string;
  productionItem: string;
  specId?: string | null;
  componentType: string;
  status: string;
  readinessScore: number;
  canonDependency: string;
  canonRecordIds: string[];
  updatedAt: string;
  collectionId?: string | null;
}

interface BoardResponse {
  board: Record<string, SpecCard[]>;
  summary: { total: number; errors: number; awaiting_canon: number };
}

const COLUMNS: Array<{
  key: string;
  label: string;
  headerBg: string;
  headerText: string;
  badgeBg: string;
}> = [
  { key: "draft",        label: "Drafts",        headerBg: "bg-gray-100",    headerText: "text-gray-600",   badgeBg: "bg-gray-200 text-gray-600" },
  { key: "payload_ready",label: "Payload Ready",  headerBg: "bg-blue-50",     headerText: "text-blue-700",   badgeBg: "bg-blue-100 text-blue-700" },
  { key: "canon_clear",  label: "Canon Clear",    headerBg: "bg-violet-50",   headerText: "text-violet-700", badgeBg: "bg-violet-100 text-violet-700" },
  { key: "compiled",     label: "Compiled",       headerBg: "bg-teal-50",     headerText: "text-teal-700",   badgeBg: "bg-teal-100 text-teal-700" },
  { key: "published",    label: "Published",      headerBg: "bg-emerald-50",  headerText: "text-emerald-700",badgeBg: "bg-emerald-100 text-emerald-700" },
  { key: "blocked",      label: "Blocked",        headerBg: "bg-red-50",      headerText: "text-red-700",    badgeBg: "bg-red-100 text-red-700" },
];

const COMPONENT_COLORS: Record<string, { bg: string; text: string }> = {
  "Hero Paper":         { bg: "rgba(200,117,96,0.12)", text: "#C87560" },
  "Decorative Paper":   { bg: "rgba(59,130,246,0.12)", text: "#3B82F6" },
  "Journal Card":       { bg: "rgba(139,92,246,0.12)", text: "#8B5CF6" },
  "Coordinating Paper": { bg: "rgba(16,185,129,0.12)", text: "#10B981" },
  "Ephemera Sheet":     { bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
};

function ReadinessCircle({ score }: { score: number }) {
  const r = 11;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 80 ? "#0D9488" : score >= 50 ? "#F59E0B" : "#9CA3AF";
  return (
    <svg width="28" height="28" className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#E5E7EB" strokeWidth="2.5" />
      <circle
        cx="14" cy="14" r={r} fill="none"
        stroke={color} strokeWidth="2.5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
      />
      <text x="14" y="18" textAnchor="middle" fontSize="7" fill={color} fontWeight="600">{score}</text>
    </svg>
  );
}

function SpecCardItem({ spec }: { spec: SpecCard }) {
  const compColor = COMPONENT_COLORS[spec.componentType] ?? { bg: "#F3F4F6", text: "#6B7280" };
  const needsCanon =
    (spec.canonDependency === "Canon Reference" || spec.canonDependency === "Canon Defining") &&
    (spec.canonRecordIds ?? []).length === 0;

  const updatedAgo = (() => {
    const diff = Date.now() - new Date(spec.updatedAt).getTime();
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    return "just now";
  })();

  return (
    <Link href={`/super/worldsmith/editorial/specs/${spec.id}`}>
      <div
        className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 mb-2 hover:border-[#C87560] hover:shadow-md transition-all cursor-pointer"
        style={spec.status === "blocked" ? { borderColor: "#FCA5A5" } : {}}
      >
        {/* Component type + readiness */}
        <div className="flex items-start justify-between mb-1.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
            style={{ background: compColor.bg, color: compColor.text }}
          >
            {spec.componentType}
          </span>
          <ReadinessCircle score={spec.readinessScore} />
        </div>

        {/* Title */}
        <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 mb-2">
          {spec.productionItem}
          {spec.specId && (
            <span className="text-gray-400 font-normal ml-1 text-[11px]">· {spec.specId}</span>
          )}
        </p>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {updatedAgo}
          </span>
          <div className="flex items-center gap-1">
            {needsCanon && (
              <span title="Canon record required">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
              </span>
            )}
            {spec.status === "compiled" && (
              <span className="text-[10px] text-teal-600 flex items-center gap-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Ready
              </span>
            )}
            {spec.status === "blocked" && (
              <span className="text-[10px] text-red-500 font-medium">Blocked</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ReadinessBoard() {
  const { selectedWorldId, selectedCollectionId, selectedWorld } = useEditorial();

  const params = new URLSearchParams();
  if (selectedWorldId) params.set("world_id", selectedWorldId);
  if (selectedCollectionId) params.set("collection_id", selectedCollectionId);

  const { data, isLoading, error, refetch } = useQuery<BoardResponse>({
    queryKey: ["editorial-board", selectedWorldId, selectedCollectionId],
    queryFn: () => apiFetch<BoardResponse>(`/v1/editorial/board?${params}`),
    enabled: !!selectedWorldId,
    staleTime: 15_000,
  });

  const board = data?.board ?? {};
  const summary = data?.summary ?? { total: 0, errors: 0, awaiting_canon: 0 };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="text-gray-400">WorldSmith</span>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">{selectedWorld?.name ?? "All worlds"}</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700">Readiness Board</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Summary stats */}
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{summary.total} spec{summary.total !== 1 ? "s" : ""}</span>
            {summary.errors > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {summary.errors} error{summary.errors !== 1 ? "s" : ""}
              </span>
            )}
            {summary.awaiting_canon > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {summary.awaiting_canon} awaiting canon
              </span>
            )}
          </div>

          <button
            onClick={() => refetch()}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <Link href="/super/worldsmith/editorial/specs/new">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: "#1B2A4A" }}
            >
              <Plus className="w-4 h-4" />
              New Spec
            </button>
          </Link>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-4">
        {!selectedWorldId ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a world to view the readiness board.</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">
            Failed to load board. <button onClick={() => refetch()} className="underline ml-1">Retry</button>
          </div>
        ) : (
          <div className="flex gap-3 h-full" style={{ minWidth: COLUMNS.length * 240 }}>
            {COLUMNS.map(col => {
              const specs = board[col.key] ?? [];
              return (
                <div key={col.key} className="flex flex-col" style={{ width: 224, minWidth: 224 }}>
                  {/* Column header */}
                  <div
                    className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${col.headerBg}`}
                  >
                    <span className={`text-xs font-semibold ${col.headerText}`}>{col.label}</span>
                    <span
                      className={`text-[11px] font-medium rounded-full px-1.5 py-0.5 ${col.badgeBg}`}
                    >
                      {specs.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div
                    className="flex-1 overflow-y-auto pt-2 rounded-b-lg"
                    style={{ background: "rgba(0,0,0,0.02)" }}
                  >
                    {specs.length === 0 ? (
                      col.key === "draft" ? (
                        <div className="flex flex-col items-center justify-center py-6 px-3 text-center gap-1.5">
                          <p className="text-[11px] text-gray-400 leading-snug">
                            No drafts yet —{" "}
                            <Link href="/super/worldsmith/editorial/specs/new">
                              <span className="underline cursor-pointer hover:text-gray-600">
                                create a spec
                              </span>
                            </Link>{" "}
                            to get started
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-6 text-gray-300">
                          <Circle className="w-4 h-4" />
                        </div>
                      )
                    ) : (
                      specs.map(spec => <SpecCardItem key={spec.id} spec={spec} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
