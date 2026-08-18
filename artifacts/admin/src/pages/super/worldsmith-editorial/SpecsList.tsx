/**
 * SpecsList — sortable, filterable list of all Production Specs.
 * Replaces the previous redirect from /editorial/specs → board.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Search, X, Plus, RefreshCw, Loader2, FileText,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductionSpec {
  id: string;
  productionItem: string;
  componentType: string;
  status: string;
  readinessScore: number;
  updatedAt: string;
  specId?: string | null;
  collectionId?: string | null;
  worldId?: string | null;
}

type SortKey = "productionItem" | "componentType" | "status" | "readinessScore" | "updatedAt";
type SortDir = "asc" | "desc";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  draft:         { label: "Draft",         bg: "#F3F4F6", text: "#6B7280" },
  payload_ready: { label: "Payload Ready", bg: "#DBEAFE", text: "#1D4ED8" },
  canon_clear:   { label: "Canon Clear",   bg: "#EDE9FE", text: "#6D28D9" },
  compiled:      { label: "Compiled",      bg: "#CCFBF1", text: "#0F766E" },
  published:     { label: "Published",     bg: "#D1FAE5", text: "#065F46" },
  blocked:       { label: "Blocked",       bg: "#FEE2E2", text: "#B91C1C" },
};

const ALL_STATUSES = Object.keys(STATUS_META);

function statusLabel(s: string) {
  return STATUS_META[s]?.label ?? s;
}

// ── Readiness circle (same as ReadinessBoard) ─────────────────────────────────

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
      <text x="14" y="18" textAnchor="middle" fontSize="7" fill={color} fontWeight="600">
        {score}
      </text>
    </svg>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortHeader({
  label, col, sort, onSort,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (col: SortKey) => void;
}) {
  const active = sort.key === col;
  const Icon = active ? (sort.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      onClick={() => onSort(col)}
      className="flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors group"
    >
      {label}
      <Icon className={`w-3.5 h-3.5 ${active ? "text-[#C87560]" : "text-gray-400 group-hover:text-gray-600"}`} />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SpecsList() {
  const [, navigate] = useLocation();
  const { selectedWorldId, selectedCollectionId } = useEditorial();

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [componentFilter, setComponentFilter] = useState<string>("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "updatedAt",
    dir: "desc",
  });

  // ── Fetch specs ─────────────────────────────────────────────────────────────

  const params = new URLSearchParams();
  if (selectedWorldId) params.set("world_id", selectedWorldId);
  if (selectedCollectionId) params.set("collection_id", selectedCollectionId);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ specs: ProductionSpec[] }>({
    queryKey: ["editorial/specs/list", selectedWorldId, selectedCollectionId],
    queryFn: () => apiFetch(`/v1/editorial/specs?${params.toString()}`),
    staleTime: 30_000,
  });

  const specs = data?.specs ?? [];

  // ── Derive unique component types for filter pill row ──────────────────────

  const componentTypes = useMemo(() => {
    const set = new Set<string>();
    for (const s of specs) if (s.componentType) set.add(s.componentType);
    return Array.from(set).sort();
  }, [specs]);

  // ── Client-side filter + sort ───────────────────────────────────────────────

  const filtered = useMemo(() => {
    let rows = specs;
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      rows = rows.filter(s =>
        s.productionItem.toLowerCase().includes(term) ||
        s.componentType.toLowerCase().includes(term) ||
        (s.specId ?? "").toLowerCase().includes(term),
      );
    }
    if (statusFilter) rows = rows.filter(s => s.status === statusFilter);
    if (componentFilter) rows = rows.filter(s => s.componentType === componentFilter);

    // Sort
    const { key, dir } = sort;
    rows = [...rows].sort((a, b) => {
      let av: string | number = a[key] ?? "";
      let bv: string | number = b[key] ?? "";
      if (key === "readinessScore") {
        av = Number(av);
        bv = Number(bv);
      } else {
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
      }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [specs, q, statusFilter, componentFilter, sort]);

  function toggleSort(col: SortKey) {
    setSort(prev =>
      prev.key === col
        ? { key: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col, dir: "asc" },
    );
  }

  const hasFilters = !!q || !!statusFilter || !!componentFilter;

  function clearFilters() {
    setQ("");
    setStatusFilter("");
    setComponentFilter("");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "#E5E7EB", background: "white" }}
      >
        <div>
          <h1
            className="font-semibold text-[#1B2A4A]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20 }}
          >
            Production Specs
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isLoading ? "Loading…" : `${filtered.length} of ${specs.length} spec${specs.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button
            onClick={() => navigate("/super/worldsmith/editorial/specs/new")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "#C87560" }}
          >
            <Plus className="w-4 h-4" />
            New Spec
          </button>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div
        className="px-6 py-3 border-b flex flex-col gap-2"
        style={{ borderColor: "#E5E7EB", background: "#FAFAF9" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by name or spec ID…"
              className="w-full pl-8 pr-8 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-1"
              style={{ borderColor: "#E5E7EB" }}
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1"
            style={{ borderColor: "#E5E7EB" }}
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>

          {/* Component type filter */}
          {componentTypes.length > 0 && (
            <select
              value={componentFilter}
              onChange={e => setComponentFilter(e.target.value)}
              className="text-sm border rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1"
              style={{ borderColor: "#E5E7EB" }}
            >
              <option value="">All types</option>
              {componentTypes.map(ct => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          )}

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Loading specs…</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
            <RefreshCw className="w-6 h-6" />
            <p className="text-sm">Failed to load specs</p>
            <button
              onClick={() => refetch()}
              className="text-sm text-[#C87560] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
            <FileText className="w-8 h-8 text-gray-300" />
            {hasFilters ? (
              <>
                <p className="text-sm">No specs match your filters</p>
                <button
                  onClick={clearFilters}
                  className="text-sm text-[#C87560] hover:underline"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-500">No production specs yet</p>
                <p className="text-xs text-gray-400">Create your first spec to get started</p>
                <button
                  onClick={() => navigate("/super/worldsmith/editorial/specs/new")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white mt-1"
                  style={{ background: "#C87560" }}
                >
                  <Plus className="w-4 h-4" />
                  New Spec
                </button>
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                <th className="px-6 py-3 text-left">
                  <SortHeader label="Production Item" col="productionItem" sort={sort} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader label="Component Type" col="componentType" sort={sort} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader label="Status" col="status" sort={sort} onSort={toggleSort} />
                </th>
                <th className="px-4 py-3 text-left">
                  <SortHeader label="Readiness" col="readinessScore" sort={sort} onSort={toggleSort} />
                </th>
                <th className="px-6 py-3 text-left">
                  <SortHeader label="Last Updated" col="updatedAt" sort={sort} onSort={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((spec, i) => {
                const meta = STATUS_META[spec.status] ?? { label: spec.status, bg: "#F3F4F6", text: "#6B7280" };
                const isEven = i % 2 === 0;
                return (
                  <tr
                    key={spec.id}
                    onClick={() => navigate(`/super/worldsmith/editorial/specs/${spec.id}`)}
                    className="cursor-pointer transition-colors hover:bg-[#FAF5F3]"
                    style={{ background: isEven ? "white" : "#FAFAF9", borderBottom: "1px solid #F3F4F6" }}
                  >
                    {/* Production Item */}
                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-[#1B2A4A] leading-snug truncate max-w-[280px]">
                          {spec.productionItem}
                        </span>
                        {spec.specId && (
                          <span className="text-[11px] text-gray-400 font-mono">{spec.specId}</span>
                        )}
                      </div>
                    </td>

                    {/* Component Type */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(200,117,96,0.10)", color: "#C87560" }}
                      >
                        {spec.componentType}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: meta.bg, color: meta.text }}
                      >
                        {meta.label}
                      </span>
                    </td>

                    {/* Readiness score */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ReadinessCircle score={spec.readinessScore ?? 0} />
                        <span className="text-xs text-gray-500">{spec.readinessScore ?? 0}%</span>
                      </div>
                    </td>

                    {/* Last updated */}
                    <td className="px-6 py-3 text-xs text-gray-500">
                      {spec.updatedAt
                        ? new Date(spec.updatedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
