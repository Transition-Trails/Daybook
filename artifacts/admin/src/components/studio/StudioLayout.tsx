/**
 * StudioLayout — the one shell used by all three studio hubs.
 *
 * Breakpoint behaviour (measured on the outer wrapper, not viewport):
 *   Wide   ≥ 1200 px  Rail (246) + Center + Dock (340) — static three columns
 *   Medium  900–1199   Rail (246) + Center; Dock collapses → toggle in top bar,
 *                      opens as right-anchored fixed overlay (340 px, z-50)
 *   Narrow   < 900     Center full-width; Rail collapses → ☰ toggle in top bar,
 *                      opens as left-anchored fixed overlay (280 px, z-50);
 *                      Dock overlay same as medium
 *
 * Hard rule: no horizontal page scroll at any width.
 */
import { useState, useEffect, useRef } from "react";
import { PanelLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StudioMode {
  id: string;
  label: string;
}

export interface StudioLayoutProps {
  /** Short label shown left of the mode pills, e.g. "Planner Studio" */
  scope: string;
  modes: ReadonlyArray<StudioMode>;
  activeMode: string;
  onModeChange: (id: string) => void;
  /** Synced indicator pill — uses semantic success/error colour, never accent-soft */
  status?: { label: string; ok?: boolean };
  /** Primary action button in the top bar */
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
  };
  /** Left rail content (context card + tools + voice/tone pinned at bottom) */
  leftRail: React.ReactNode;
  /** Right dock tabs. Omit to hide the dock entirely. */
  rightDock?: {
    assistant?: React.ReactNode;
    preview?: React.ReactNode;
  };
  /** Center workspace — rendered inside a scrollable, min-width:0 column */
  children: React.ReactNode;
  /** Extra class on the outer wrapper */
  className?: string;
}

type DockTab = "assistant" | "preview";
type Band = "wide" | "medium" | "narrow";

function getBand(w: number): Band {
  if (w >= 1200) return "wide";
  if (w >= 900) return "medium";
  return "narrow";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StudioLayout({
  scope,
  modes,
  activeMode,
  onModeChange,
  status,
  primaryAction,
  leftRail,
  rightDock,
  children,
  className,
}: StudioLayoutProps) {
  const [dockTab,   setDockTab]   = useState<DockTab>("assistant");
  const [dockOpen,  setDockOpen]  = useState(false); // overlay toggle for medium/narrow
  const [railOpen,  setRailOpen]  = useState(false); // overlay toggle for narrow
  const [band,      setBand]      = useState<Band>("wide");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Measure container width via ResizeObserver ─────────────────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setBand(getBand(w));
    });
    ro.observe(el);
    setBand(getBand(el.clientWidth)); // initial sync
    return () => ro.disconnect();
  }, []);

  // ── Auto-close overlays when band widens ───────────────────────────────────
  useEffect(() => {
    if (band !== "narrow") setRailOpen(false);
    if (band === "wide")   setDockOpen(false);
  }, [band]);

  // ── ESC to close any open overlay ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRailOpen(false);
      setDockOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Dock helpers ───────────────────────────────────────────────────────────
  const hasBothTabs  = !!(rightDock?.assistant && rightDock?.preview);
  const hasAssistant = !!rightDock?.assistant;
  const hasPreview   = !!rightDock?.preview;
  const hasDock      = hasAssistant || hasPreview;

  const dockContent = hasBothTabs
    ? (dockTab === "assistant" ? rightDock!.assistant : rightDock!.preview)
    : (rightDock?.assistant ?? rightDock?.preview);

  // Icon shown on the dock toggle button when collapsed
  const dockToggleEmoji = dockTab === "assistant" ? "🤖" : "👁";

  // Inner dock JSX — shared between static aside and overlay
  const dockInner = (
    <>
      {/* Tab bar — only when both tabs are present */}
      {hasBothTabs && (
        <div className="border-b flex shrink-0 bg-card">
          {(["assistant", "preview"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDockTab(tab)}
              style={{ cursor: "pointer" }}
              className={cn(
                "flex-1 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] transition-colors border-b-2",
                dockTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === "assistant" ? "AI Assistant" : "Preview"}
            </button>
          ))}
        </div>
      )}

      {/* Single-tab label */}
      {!hasBothTabs && (hasAssistant || hasPreview) && (
        <div className="border-b px-4 py-2.5 bg-card shrink-0">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {hasAssistant ? "AI Assistant" : "Preview"}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">{dockContent}</div>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className={cn("-mx-8 -mt-8 flex flex-col", className)}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div
        className="h-12 border-b bg-card flex items-center gap-2 px-5 shrink-0"
        style={{ minHeight: 48 }}
      >
        {/* Narrow: rail hamburger (44×44 touch target) */}
        {band === "narrow" && (
          <button
            onClick={() => setRailOpen((v) => !v)}
            aria-label={railOpen ? "Close panel" : "Open panel"}
            style={{ cursor: "pointer" }}
            className={cn(
              "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-colors shrink-0",
              railOpen
                ? "bg-[#1B2A4A]/10 text-[#1B2A4A]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {/* Scope label */}
        <span className="font-display font-semibold text-[12.5px] text-foreground/55 select-none mr-1 shrink-0">
          {scope}
        </span>

        {/* Mode pills — flex-1 min-w-0 so they never push the right cluster off-screen */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => onModeChange(m.id)}
                style={{
                  cursor: "pointer",
                  ...(activeMode === m.id ? { background: "#1B2A4A", color: "#fff" } : {}),
                }}
                className={cn(
                  "px-3.5 py-1 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors shrink-0",
                  activeMode === m.id
                    ? ""
                    : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right cluster — status + primary action + dock toggle (medium/narrow) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status pill */}
          {status && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={
                status.ok !== false
                  ? { background: "#edf4f0", color: "#3f6b4c" }
                  : { background: "#fdf0f0", color: "#b23b3b" }
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: status.ok !== false ? "#3f6b4c" : "#b23b3b" }}
              />
              {status.label}
            </span>
          )}

          {/* Primary action */}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.loading}
              style={{
                cursor: primaryAction.disabled ? "not-allowed" : "pointer",
                background: "#1B2A4A",
                color: "#fff",
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {primaryAction.loading ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              ) : (
                primaryAction.icon
              )}
              {primaryAction.label}
            </button>
          )}

          {/* Medium + Narrow: dock toggle (44×44) — only when a dock exists */}
          {hasDock && band !== "wide" && (
            <button
              onClick={() => setDockOpen((v) => !v)}
              aria-label={dockOpen ? "Close dock" : "Open dock"}
              style={{ cursor: "pointer" }}
              className={cn(
                "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-[15px] transition-colors",
                dockOpen
                  ? "bg-[#1B2A4A]/10 text-[#1B2A4A]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {dockToggleEmoji}
            </button>
          )}
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      {/* Height = 100dvh - Shell top bar (3.5rem) - Studio top bar (3rem) */}
      <div
        className="flex overflow-hidden"
        style={{ height: "calc(100dvh - 3.5rem - 3rem)" }}
      >

        {/* LEFT RAIL ─────────────────────────────────────────────────────── */}
        {band !== "narrow" ? (
          /* Wide + Medium: static aside */
          <aside
            className="border-r overflow-hidden flex flex-col shrink-0"
            style={{
              width: 246,
              minWidth: 246,
              background: "#FFFDF9",
              borderColor: "hsl(var(--border))",
            }}
          >
            {leftRail}
          </aside>
        ) : (
          /* Narrow: fixed overlay */
          <>
            {railOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/20"
                onClick={() => setRailOpen(false)}
              />
            )}
            {railOpen && (
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-y-0 left-0 z-50 flex flex-col bg-[#FFFDF9] border-r shadow-xl"
                style={{ width: 280 }}
              >
                {/* Rail overlay header */}
                <div className="flex items-center justify-between px-4 border-b shrink-0" style={{ minHeight: 48 }}>
                  <span className="font-display font-semibold text-[12.5px] text-foreground/55 select-none">
                    {scope}
                  </span>
                  <button
                    onClick={() => setRailOpen(false)}
                    aria-label="Close panel"
                    style={{ cursor: "pointer" }}
                    className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">{leftRail}</div>
              </div>
            )}
          </>
        )}

        {/* CENTER WORKSPACE ───────────────────────────────────────────────── */}
        <main
          className="flex-1 overflow-y-auto bg-background"
          style={{ minWidth: 0 }}
        >
          <div className="p-6" style={{ minWidth: 0 }}>
            {children}
          </div>
        </main>

        {/* RIGHT DOCK ─────────────────────────────────────────────────────── */}
        {hasDock && (
          band === "wide" ? (
            /* Wide: static aside */
            <aside
              className="border-l bg-card overflow-hidden flex flex-col shrink-0"
              style={{ width: 340, minWidth: 340 }}
            >
              {dockInner}
            </aside>
          ) : (
            /* Medium + Narrow: fixed overlay */
            <>
              {dockOpen && (
                <div
                  className="fixed inset-0 z-40 bg-black/20"
                  onClick={() => setDockOpen(false)}
                />
              )}
              {dockOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-y-0 right-0 z-50 flex flex-col bg-card border-l shadow-xl"
                  style={{ width: 340 }}
                >
                  {/* Dock overlay close button row */}
                  <div
                    className="flex items-center justify-end px-2 shrink-0 border-b"
                    style={{ minHeight: 44 }}
                  >
                    <button
                      onClick={() => setDockOpen(false)}
                      aria-label="Close dock"
                      style={{ cursor: "pointer" }}
                      className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {dockInner}
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
