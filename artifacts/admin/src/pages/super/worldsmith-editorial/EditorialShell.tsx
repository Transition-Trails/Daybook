/**
 * EditorialShell — persistent left-nav layout for all WorldSmith Editorial pages.
 * Provides world selector, record-type tree navigation, and sync status footer.
 */
import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, BookOpen, Puzzle, Layers,
  ChevronDown, Globe, Plus, ArrowLeft, CheckCircle2,
  Clock, Loader2, RefreshCw,
} from "lucide-react";
import { EditorialProvider, useEditorial } from "@/contexts/EditorialContext";

interface EditorialShellProps {
  children: ReactNode;
  activePage?: "board" | "specs" | "canon" | "style-guides" | "modules";
}

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

  const navItem = (
    label: string,
    Icon: React.ElementType,
    href: string,
    key: string,
    badge?: number,
  ) => {
    const active = activePage === key || location === href || location.startsWith(href + "/");
    return (
      <Link href={href} key={href}>
        <span
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors select-none"
          style={
            active
              ? { background: "rgba(200,117,96,0.15)", color: "#C87560", fontWeight: 500 }
              : { color: "#4B5563" }
          }
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="text-[11px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">
              {badge}
            </span>
          )}
        </span>
      </Link>
    );
  };

  const selectedCollection = collections.find(c => c.id === selectedCollectionId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#FAF8F3" }}>
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col border-r overflow-hidden"
        style={{ width: 260, background: "white", borderColor: "#E5E7EB", flexShrink: 0 }}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b" style={{ borderColor: "#F3F4F6" }}>
          <div className="flex items-center justify-between mb-1">
            <Link href="/super/worldsmith">
              <span className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 cursor-pointer text-xs">
                <ArrowLeft className="w-3 h-3" />
                WorldSmith
              </span>
            </Link>
          </div>
          <div
            className="font-semibold text-[#1B2A4A]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18 }}
          >
            WorldSmith
          </div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">
            Editorial Suite
          </div>

          {/* World selector */}
          <div className="mt-3 relative">
            <button
              onClick={() => { setWorldDropOpen(v => !v); setCollDropOpen(false); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              style={{ background: "#FAF8F3", border: "1px solid #E5E7EB" }}
            >
              <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="flex-1 text-left font-medium truncate">
                {worldsLoading ? "Loading…" : (selectedWorld?.name ?? "Select world")}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>

            {worldDropOpen && !worldsLoading && (
              <div
                className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 py-1"
                style={{ borderColor: "#E5E7EB" }}
              >
                {worlds.map(w => (
                  <button
                    key={w.id}
                    onClick={() => {
                      setSelectedWorldId(w.id);
                      setSelectedCollectionId(null);
                      setWorldDropOpen(false);
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
            <div className="mt-2 relative">
              <button
                onClick={() => { setCollDropOpen(v => !v); setWorldDropOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ border: "1px solid #E5E7EB" }}
              >
                <Layers className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="flex-1 text-left truncate">
                  {selectedCollection?.name ?? "All collections"}
                </span>
                <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
              </button>
              {collDropOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 py-1"
                  style={{ borderColor: "#E5E7EB" }}
                >
                  <button
                    onClick={() => { setSelectedCollectionId(null); setCollDropOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left text-gray-500"
                  >
                    All collections
                    {!selectedCollectionId && <CheckCircle2 className="w-3 h-3 text-[#C87560] ml-auto" />}
                  </button>
                  {collections.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCollectionId(c.id); setCollDropOpen(false); }}
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
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 px-2 mb-2 font-medium">
            Workspace
          </p>
          {navItem("Readiness Board", LayoutDashboard, "/super/worldsmith/editorial/board", "board")}
          {navItem("Production Specs", FileText, "/super/worldsmith/editorial/specs", "specs")}
          {navItem("Canon Records", BookOpen, "/super/worldsmith/editorial/canon", "canon")}
          {navItem("Style Guides", Layers, "/super/worldsmith/editorial/style-guides", "style-guides")}
          {navItem("Prompt Modules", Puzzle, "/super/worldsmith/editorial/modules", "modules")}

          <div className="pt-3">
            <Link href="/super/worldsmith/editorial/specs/new">
              <span
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                style={{ background: "#C87560", color: "white", fontWeight: 500 }}
              >
                <Plus className="w-4 h-4 shrink-0" />
                New Asset
              </span>
            </Link>
          </div>
        </nav>

        {/* Sync status footer */}
        <div className="border-t px-4 py-3" style={{ borderColor: "#F3F4F6" }}>
          <div className="flex items-center gap-2">
            {syncStatus === "synced" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : syncStatus === "pending" ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-red-400 shrink-0" />
            )}
            <span className="text-xs text-gray-500">
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
