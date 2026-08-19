/**
 * EditorialShell — persistent left-nav layout for all WorldSmith Editorial pages.
 * Provides world selector, record-type tree navigation, sync status, and a
 * persistent holistic co-write right drawer.
 */
import { type ReactNode, useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, BookOpen, Puzzle, Layers,
  ChevronDown, Globe, Plus, ArrowLeft, CheckCircle2,
  Loader2, RefreshCw, Sparkles, Network, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { EditorialProvider, useEditorial, type WorldRecord } from "@/contexts/EditorialContext";
import { CopilotPanel, type RecordSuggestion } from "@/components/CopilotPanel";
import { apiFetch } from "@/lib/api";

interface EditorialShellProps {
  children: ReactNode;
  activePage?: "board" | "stories" | "connections" | "specs" | "canon" | "style-guides" | "modules";
}

// ── Holistic editorial copilot ────────────────────────────────────────────────

interface RecordSummary { name: string; canonType: string | null; canonStability: string | null; }

const PAGE_LABELS: Record<string, string> = {
  board: "Readiness Board",
  stories: "Storylines",
  connections: "Story Map",
  specs: "Production Specs",
  canon: "Canon Records",
  "style-guides": "Style Guides",
  modules: "Prompt Modules",
};

function EditorialCopilot({
  worldId,
  world,
  activePage,
  onClose,
}: {
  worldId: string;
  world: WorldRecord;
  activePage: string;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["editorial-copilot-records", worldId],
    queryFn: () =>
      apiFetch<{ canon_records: RecordSummary[] }>(
        `/v1/editorial/canon-records?world_id=${encodeURIComponent(worldId)}&limit=300`,
      ),
    staleTime: 60_000,
  });
  const records = data?.canon_records ?? [];

  const recordsByType = records.reduce<Record<string, string[]>>((acc, r) => {
    const t = r.canonType ?? "other";
    (acc[t] ??= []).push(r.name);
    return acc;
  }, {});

  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{ width: 380, borderLeft: "1px solid #DDD4C4", background: "#FDFAF7" }}
    >
      <CopilotPanel
        isOpen
        onClose={onClose}
        storageKey={`copilot-editorial-${worldId}`}
        title="Co-write partner"
        activeFieldLabel={isLoading ? world.name : `${world.name} · ${records.length} records`}
        greeting={
          `I have the full picture for ${world.name} — ${records.length} canon record${records.length !== 1 ? "s" : ""} across your world. ` +
          `Tell me what you want to develop, refine, or connect. I can spot inconsistencies, draft prose, ` +
          `suggest missing records, connect storylines to canon, or turn a digital moment into a physical piece.`
        }
        onSend={async (message, history) =>
          apiFetch<{ reply: string }>("/v1/worldsmith/copilot", {
            method: "POST",
            body: JSON.stringify({
              surface: "editorial",
              worldId,
              field: "world",
              fieldLabel: world.name,
              message,
              history,
              context: {
                worldName: world.name,
                worldBible: {
                  description: world.description,
                  visualPalette: world.visualPalette,
                  proseVoice: world.proseVoice,
                  atmosphericNotes: world.atmosphericNotes,
                  materialWorld: world.materialWorld,
                  worldRules: world.worldRules,
                },
                recordsByType,
                totalRecords: records.length,
                currentPage: PAGE_LABELS[activePage] ?? activePage,
              },
            }),
          })
        }
        onCaptureTarget={() => ({ key: "world", label: world.name })}
        onCreateRecord={(s: RecordSuggestion) => {
          const params = new URLSearchParams({
            new: "1",
            name: s.name,
            type: s.canonType,
            narrative: s.narrative ?? "",
          });
          navigate(`/super/worldsmith/editorial/canon?${params.toString()}`);
        }}
        panelStyle={{
          width: "100%",
          height: "100%",
          maxHeight: "100%",
          minHeight: 0,
          borderRadius: 0,
          border: "none",
          position: "relative",
          top: 0,
        }}
        className="!static !rounded-none !w-full flex-1 !max-h-none"
      />
    </div>
  );
}

// ── Shell inner ───────────────────────────────────────────────────────────────

function ShellInner({ children, activePage = "board" }: EditorialShellProps) {
  const [location] = useLocation();
  const {
    worlds, worldsLoading,
    selectedWorldId, setSelectedWorldId, selectedWorld,
    collections, selectedCollectionId, setSelectedCollectionId,
    syncStatus, lastSyncedAt,
  } = useEditorial();
  const [worldDropOpen, setWorldDropOpen] = useState(false);
  const [collDropOpen, setCollDropOpen] = useState(false);
  const worldSelectorRef = useRef<HTMLButtonElement>(null);
  const collectionSelectorRef = useRef<HTMLButtonElement>(null);
  const worldMenuRef = useRef<HTMLDivElement>(null);
  const collectionMenuRef = useRef<HTMLDivElement>(null);
  const [drawerCollapsed, setDrawerCollapsed] = useState(() => {
    try { return localStorage.getItem("ws:editorial:drawer-collapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try {
      localStorage.setItem("ws:editorial:drawer-collapsed", drawerCollapsed ? "true" : "false");
    } catch { /* storage may be unavailable */ }
  }, [drawerCollapsed]);

  useEffect(() => {
    if (worldDropOpen) {
      worldMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
    }
  }, [worldDropOpen]);

  useEffect(() => {
    if (collDropOpen) {
      collectionMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
    }
  }, [collDropOpen]);

  // Copilot open/closed — persisted across navigation
  const [copilotOpen, setCopilotOpen] = useState(() => {
    try { return localStorage.getItem("ws:editorial:copilot") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("ws:editorial:copilot", copilotOpen ? "true" : "false"); } catch { /* ok */ }
  }, [copilotOpen]);

  const navItem = (
    label: string,
    Icon: React.ElementType,
    href: string,
    key: string,
    badge?: number,
  ) => {
    const active = activePage === key || location === href || location.startsWith(href + "/");
    return (
      <Link
        href={href}
        key={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        title={drawerCollapsed ? label : undefined}
      >
        <span
          className={[
            "flex items-center rounded-lg text-sm cursor-pointer transition-colors select-none",
            drawerCollapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C87560] focus-visible:ring-offset-1",
          ].join(" ")}
          style={
            active
              ? {
                  background: "rgba(200,117,96,0.15)",
                  color: "#C87560",
                  fontWeight: 500,
                  ...(drawerCollapsed ? { boxShadow: "inset 3px 0 0 #C87560" } : {}),
                }
              : { color: "#4B5563" }
          }
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className={drawerCollapsed ? "sr-only" : "flex-1"}>{label}</span>
          {!drawerCollapsed && badge !== undefined && badge > 0 && (
            <span className="text-[11px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">
              {badge}
            </span>
          )}
        </span>
      </Link>
    );
  };

  const selectedCollection = collections.find(c => c.id === selectedCollectionId) ?? null;
  const collectionLabel = selectedCollection?.name ?? "All collections";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#FAF8F3" }}>
      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <aside
        data-testid="editorial-drawer"
        className="relative flex flex-col border-r overflow-visible transition-[width] duration-200 ease-in-out"
        style={{
          width: drawerCollapsed ? 72 : 260,
          background: "white",
          borderColor: "#E5E7EB",
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <div
          className={`${drawerCollapsed ? "px-2 py-3" : "px-4 py-4"} border-b`}
          style={{ borderColor: "#F3F4F6" }}
        >
          <div className={`flex items-center ${drawerCollapsed ? "justify-center" : "justify-between mb-1"}`}>
            <Link href="/super/worldsmith" aria-label="Back to WorldSmith" title="Back to WorldSmith">
              <span className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 cursor-pointer text-xs">
                <ArrowLeft className="w-3 h-3" />
                <span className={drawerCollapsed ? "sr-only" : undefined}>WorldSmith</span>
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setDrawerCollapsed(collapsed => !collapsed);
                  setWorldDropOpen(false);
                  setCollDropOpen(false);
                }}
                title={drawerCollapsed ? "Reopen editorial navigation" : "Collapse editorial navigation"}
                aria-label={drawerCollapsed ? "Reopen editorial navigation" : "Collapse editorial navigation"}
                aria-expanded={!drawerCollapsed}
                data-testid="editorial-drawer-toggle"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C87560] focus-visible:ring-offset-1"
              >
                {drawerCollapsed
                  ? <PanelLeftOpen className="w-4 h-4" />
                  : <PanelLeftClose className="w-4 h-4" />}
              </button>
              {/* Co-write toggle */}
              <button
                type="button"
                onClick={() => setCopilotOpen(o => !o)}
                title={copilotOpen ? "Close co-write panel" : "Open holistic co-write"}
                aria-label={copilotOpen ? "Close co-write panel" : "Open holistic co-write"}
                className={[
                  "flex items-center gap-1 rounded-lg text-[11px] font-semibold transition-all",
                  drawerCollapsed ? "justify-center w-7 h-7 px-0" : "px-2 py-1",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C87560] focus-visible:ring-offset-1",
                ].join(" ")}
                style={
                  copilotOpen
                    ? { background: "#1B2A4A", color: "white" }
                    : { background: "transparent", color: "#9CA3AF", border: "1px solid #E5E7EB" }
                }
              >
                <Sparkles className="w-3 h-3" style={{ color: copilotOpen ? "#C87560" : undefined }} />
                <span className={drawerCollapsed ? "sr-only" : undefined}>Co-write</span>
              </button>
            </div>
          </div>
          {!drawerCollapsed && (
            <>
              <div
                className="font-semibold text-[#1B2A4A]"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18 }}
              >
                WorldSmith
              </div>
              <div className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">
                Editorial Studio
              </div>
            </>
          )}

          {/* World selector */}
          <div className={`${drawerCollapsed ? "mt-3 flex justify-center" : "mt-3"} relative`}>
            <button
              type="button"
              ref={worldSelectorRef}
              onClick={() => { setWorldDropOpen(v => !v); setCollDropOpen(false); }}
              onKeyDown={event => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setWorldDropOpen(true);
                  setCollDropOpen(false);
                }
              }}
              title={drawerCollapsed ? `Select world${selectedWorld ? ` · ${selectedWorld.name}` : ""}` : undefined}
              aria-label={`Select world${selectedWorld ? ` · ${selectedWorld.name}` : ""}`}
              aria-haspopup="menu"
              aria-controls="editorial-world-menu"
              aria-expanded={worldDropOpen}
              className={[
                "flex items-center rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C87560] focus-visible:ring-offset-1",
                drawerCollapsed ? "justify-center w-10 h-10 px-0" : "w-full gap-2 px-2.5 py-1.5",
              ].join(" ")}
              style={{ background: "#FAF8F3", border: "1px solid #E5E7EB" }}
            >
              <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className={drawerCollapsed ? "sr-only" : "flex-1 text-left font-medium truncate"}>
                {worldsLoading ? "Loading…" : (selectedWorld?.name ?? "Select world")}
              </span>
              <ChevronDown className={drawerCollapsed ? "hidden" : "w-3.5 h-3.5 text-gray-400 shrink-0"} />
            </button>

            {worldDropOpen && !worldsLoading && (
              <div
                ref={worldMenuRef}
                id="editorial-world-menu"
                role="menu"
                aria-label="Worlds"
                onKeyDown={event => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setWorldDropOpen(false);
                    worldSelectorRef.current?.focus();
                  }
                }}
                onBlur={event => {
                  const nextFocus = event.relatedTarget as Node | null;
                  if (!event.currentTarget.contains(nextFocus) && nextFocus !== worldSelectorRef.current) {
                    setWorldDropOpen(false);
                  }
                }}
                className={[
                  "absolute bg-white border rounded-lg shadow-lg z-50 py-1",
                  drawerCollapsed ? "left-full top-0 ml-2 w-60" : "top-full left-0 right-0 mt-1",
                ].join(" ")}
                style={{ borderColor: "#E5E7EB" }}
              >
                {worlds.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={w.id === selectedWorldId}
                    onClick={() => {
                      setSelectedWorldId(w.id);
                      setSelectedCollectionId(null);
                      setWorldDropOpen(false);
                      worldSelectorRef.current?.focus();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: w.status === "active" ? "#10B981" : "#D1D5DB" }}
                    />
                    <span className="flex-1 truncate text-gray-700">{w.name}</span>
                    {w.id === selectedWorldId && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#C87560]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Collection selector */}
          {collections.length > 0 && (
            <div className={`${drawerCollapsed ? "mt-2 flex justify-center" : "mt-2"} relative`}>
              <button
                type="button"
                ref={collectionSelectorRef}
                onClick={() => { setCollDropOpen(v => !v); setWorldDropOpen(false); }}
                onKeyDown={event => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setCollDropOpen(true);
                    setWorldDropOpen(false);
                  }
                }}
                title={drawerCollapsed ? `Select collection · ${collectionLabel}` : undefined}
                aria-label={`Select collection · ${collectionLabel}`}
                aria-haspopup="menu"
                aria-controls="editorial-collection-menu"
                aria-expanded={collDropOpen}
                className={[
                  "flex items-center rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C87560] focus-visible:ring-offset-1",
                  drawerCollapsed ? "justify-center w-10 h-10 px-0" : "w-full gap-2 px-2.5 py-1.5",
                ].join(" ")}
                style={{ border: "1px solid #E5E7EB" }}
              >
                <Layers className="w-3 h-3 text-gray-400 shrink-0" />
                <span className={drawerCollapsed ? "sr-only" : "flex-1 text-left truncate"}>
                  {collectionLabel}
                </span>
                <ChevronDown className={drawerCollapsed ? "hidden" : "w-3 h-3 text-gray-400 shrink-0"} />
              </button>
              {collDropOpen && (
                <div
                  ref={collectionMenuRef}
                  id="editorial-collection-menu"
                  role="menu"
                  aria-label="Collections"
                  onKeyDown={event => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setCollDropOpen(false);
                      collectionSelectorRef.current?.focus();
                    }
                  }}
                  onBlur={event => {
                    const nextFocus = event.relatedTarget as Node | null;
                    if (!event.currentTarget.contains(nextFocus) && nextFocus !== collectionSelectorRef.current) {
                      setCollDropOpen(false);
                    }
                  }}
                  className={[
                    "absolute bg-white border rounded-lg shadow-lg z-50 py-1",
                    drawerCollapsed ? "left-full top-0 ml-2 w-60" : "top-full left-0 right-0 mt-1",
                  ].join(" ")}
                  style={{ borderColor: "#E5E7EB" }}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={!selectedCollectionId}
                    onClick={() => {
                      setSelectedCollectionId(null);
                      setCollDropOpen(false);
                      collectionSelectorRef.current?.focus();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left text-gray-500"
                  >
                    All collections
                    {!selectedCollectionId && <CheckCircle2 className="w-3 h-3 text-[#C87560] ml-auto" />}
                  </button>
                  {collections.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={c.id === selectedCollectionId}
                      onClick={() => {
                        setSelectedCollectionId(c.id);
                        setCollDropOpen(false);
                        collectionSelectorRef.current?.focus();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left text-gray-700"
                    >
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.id === selectedCollectionId && (
                        <CheckCircle2 className="w-3 h-3 text-[#C87560]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 min-h-0 overflow-y-auto py-3 space-y-0.5 ${drawerCollapsed ? "px-2" : "px-3"}`} aria-label="Editorial destinations">
          {!drawerCollapsed && (
            <p className="text-[10px] uppercase tracking-widest text-gray-400 px-2 mb-2 font-medium">
              Create & connect
            </p>
          )}
          {navItem("Readiness Board", LayoutDashboard, "/super/worldsmith/editorial/board", "board")}
          {navItem("Storylines", BookOpen, "/super/worldsmith/editorial/stories", "stories")}
          {navItem("Story Map", Network, "/super/worldsmith/editorial/connections", "connections")}
          {navItem("Canon Records", BookOpen, "/super/worldsmith/editorial/canon", "canon")}

          {!drawerCollapsed && (
            <p className="text-[10px] uppercase tracking-widest text-gray-400 px-2 pt-5 mb-2 font-medium">
              Make it real
            </p>
          )}
          {navItem("Production Specs", FileText, "/super/worldsmith/editorial/specs", "specs")}
          {navItem("Style Guides", Layers, "/super/worldsmith/editorial/style-guides", "style-guides")}
          {navItem("Prompt Modules", Puzzle, "/super/worldsmith/editorial/modules", "modules")}
        </nav>

        {/* Sync status footer */}
        <div
          className={`border-t ${drawerCollapsed ? "px-2 py-3" : "px-4 py-3"}`}
          style={{ borderColor: "#F3F4F6" }}
        >
          <div
            className={`flex items-center gap-2 ${drawerCollapsed ? "justify-center" : ""}`}
            title={drawerCollapsed ? (syncStatus === "synced" && lastSyncedAt
              ? `All synced · ${formatRelativeTime(lastSyncedAt)}`
              : syncStatus === "pending" ? "Syncing…" : "Sync error") : undefined}
            aria-label={syncStatus === "synced" && lastSyncedAt
              ? `All synced · ${formatRelativeTime(lastSyncedAt)}`
              : syncStatus === "pending" ? "Syncing…" : "Sync error"}
          >
            {syncStatus === "synced" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : syncStatus === "pending" ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-red-400 shrink-0" />
            )}
            <span className={drawerCollapsed ? "sr-only" : "text-xs text-gray-500"}>
              {syncStatus === "synced" && lastSyncedAt
                ? `All synced · ${formatRelativeTime(lastSyncedAt)}`
                : syncStatus === "pending"
                ? "Syncing…"
                : "Sync error"}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </main>

      {/* ── Persistent holistic co-write drawer ──────────────────────────────── */}
      {copilotOpen && selectedWorldId && selectedWorld && (
        <EditorialCopilot
          worldId={selectedWorldId}
          world={selectedWorld}
          activePage={activePage}
          onClose={() => setCopilotOpen(false)}
        />
      )}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

export default function EditorialShell(props: EditorialShellProps) {
  return (
    <EditorialProvider>
      <ShellInner {...props} />
    </EditorialProvider>
  );
}
