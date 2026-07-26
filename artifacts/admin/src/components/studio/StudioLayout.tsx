/**
 * StudioLayout — the one shell used by all three studio hubs.
 *
 * Breakpoint behaviour (measured on the outer wrapper, not viewport):
 *   Wide   ≥ 1200 px  Rail (246) + Center + Dock (340) — static three columns;
 *                     dock defaults OPEN on first visit (no stored preference)
 *   Medium  900–1199  Rail (246) + Center; Dock collapses inline (animated width)
 *                     defaults CLOSED on first visit
 *   Narrow   < 900    Center full-width; Rail collapses → ☰ overlay;
 *                     Dock collapses → fixed full-height overlay (translateX)
 *                     defaults CLOSED on first visit
 *
 * Dock state persisted to localStorage under key "studio:dock:v1".
 * Hard rule: no horizontal page scroll at any width.
 */
import { useState, useEffect, useRef } from "react";
import { PanelLeft, X, Bot, Eye, ChevronRight } from "lucide-react";
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

// ── localStorage helpers ───────────────────────────────────────────────────────

const DOCK_KEY = "studio:dock:v1";

interface DockStorage {
  /** null = not yet set by user; fall back to band default */
  open: boolean | null;
  tab: DockTab;
}

function readDock(): DockStorage {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    if (!raw) return { open: null, tab: "assistant" };
    const parsed = JSON.parse(raw) as Partial<DockStorage>;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : null,
      tab:  parsed.tab === "preview" ? "preview" : "assistant",
    };
  } catch {
    return { open: null, tab: "assistant" };
  }
}

function writeDock(state: DockStorage) {
  try {
    localStorage.setItem(DOCK_KEY, JSON.stringify(state));
  } catch { /* quota / private mode — ignore */ }
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
  // Read storage once at component init (safe: runs before effects)
  const stored = useRef<DockStorage>(readDock());

  const [dockTab,  setDockTab]  = useState<DockTab>(stored.current.tab);
  // Start with stored preference; fall back to false — band-default kicks in on first ResizeObserver fire
  const [dockOpen, setDockOpen] = useState<boolean>(stored.current.open ?? false);
  const [railOpen, setRailOpen] = useState(false);
  const [band,     setBand]     = useState<Band>("wide");

  // Tracks whether user has ever set an explicit preference (so band-default only applies on first visit)
  const userSetDock = useRef<boolean>(stored.current.open !== null);

  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Measure container width ────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      const newBand = getBand(w);
      setBand(newBand);
      // Apply band default only if the user has never explicitly toggled the dock
      if (!userSetDock.current) {
        setDockOpen(newBand === "wide");
      }
    });
    ro.observe(el);
    // Sync immediately so first render has the right band
    const initialBand = getBand(el.clientWidth);
    setBand(initialBand);
    if (!userSetDock.current) {
      setDockOpen(initialBand === "wide");
    }
    return () => ro.disconnect();
  }, []);

  // ── Auto-close rail overlay when band widens ───────────────────────────────
  useEffect(() => {
    if (band !== "narrow") setRailOpen(false);
    // Note: dock state intentionally NOT reset on band change — user preference persists
  }, [band]);

  // ── ESC to close any open overlay ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRailOpen(false);
      // Only close dock on ESC if it's in overlay mode (narrow) or inline
      setDockOpen(false);
      userSetDock.current = true;
      writeDock({ open: false, tab: stored.current.tab });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Dock toggle helpers ────────────────────────────────────────────────────
  const hasBothTabs  = !!(rightDock?.assistant && rightDock?.preview);
  const hasAssistant = !!rightDock?.assistant;
  const hasPreview   = !!rightDock?.preview;
  const hasDock      = hasAssistant || hasPreview;

  /**
   * Toggle the dock for the given tab:
   *  - If dock is open on THIS tab → close
   *  - If dock is closed OR open on the OTHER tab → open on this tab
   */
  const handleDockTabToggle = (tab: DockTab) => {
    userSetDock.current = true;
    if (dockOpen && dockTab === tab) {
      setDockOpen(false);
      const next: DockStorage = { open: false, tab };
      stored.current = next;
      writeDock(next);
    } else {
      setDockTab(tab);
      setDockOpen(true);
      const next: DockStorage = { open: true, tab };
      stored.current = next;
      writeDock(next);
    }
  };

  /** Close from inside the dock header */
  const closeDock = () => {
    userSetDock.current = true;
    setDockOpen(false);
    const next: DockStorage = { open: false, tab: dockTab };
    stored.current = next;
    writeDock(next);
  };

  // ── Dock content ──────────────────────────────────────────────────────────
  const dockContent = hasBothTabs
    ? (dockTab === "assistant" ? rightDock!.assistant : rightDock!.preview)
    : (rightDock?.assistant ?? rightDock?.preview);

  // ── Inner dock JSX (shared between inline aside and narrow overlay) ───────
  const dockInner = (
    <div className="flex flex-col h-full" style={{ width: 340, minWidth: 340 }}>
      {/* Tab bar — both tabs present */}
      {hasBothTabs && (
        <div className="border-b flex items-center shrink-0 bg-card">
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
          {/* ChevronRight: closes dock from within the header */}
          <button
            onClick={closeDock}
            aria-label="Collapse dock"
            style={{ cursor: "pointer" }}
            className="flex items-center justify-center w-9 h-9 mr-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Single-tab label + close button */}
      {!hasBothTabs && (hasAssistant || hasPreview) && (
        <div className="border-b flex items-center justify-between pl-4 pr-1 bg-card shrink-0" style={{ minHeight: 40 }}>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {hasAssistant ? "AI Assistant" : "Preview"}
          </span>
          <button
            onClick={closeDock}
            aria-label="Collapse dock"
            style={{ cursor: "pointer" }}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">{dockContent}</div>
    </div>
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

        {/* Right cluster — status + primary action + dock toggles */}
        <div className="flex items-center gap-1.5 shrink-0">
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

          {/* AI dock toggle — shown whenever a dock with assistant content exists */}
          {hasDock && hasAssistant && (
            <button
              onClick={() => handleDockTabToggle("assistant")}
              aria-label={dockOpen && dockTab === "assistant" ? "Collapse AI dock" : "Open AI dock"}
              style={{
                cursor: "pointer",
                ...(dockOpen && dockTab === "assistant"
                  ? { background: "#1B2A4A", color: "#fff" }
                  : {}),
              }}
              className={cn(
                "flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[12px] font-medium border transition-colors shrink-0",
                dockOpen && dockTab === "assistant"
                  ? "border-[#1B2A4A]"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">AI</span>
              <ChevronRight
                className="w-3 h-3 shrink-0 transition-transform duration-200"
                style={{
                  transform: dockOpen && dockTab === "assistant" ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
          )}

          {/* Preview dock toggle — shown whenever a dock with preview content exists */}
          {hasDock && hasPreview && (
            <button
              onClick={() => handleDockTabToggle("preview")}
              aria-label={dockOpen && dockTab === "preview" ? "Collapse preview dock" : "Open preview dock"}
              style={{
                cursor: "pointer",
                ...(dockOpen && dockTab === "preview"
                  ? { background: "#1B2A4A", color: "#fff" }
                  : {}),
              }}
              className={cn(
                "flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[12px] font-medium border transition-colors shrink-0",
                dockOpen && dockTab === "preview"
                  ? "border-[#1B2A4A]"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Preview</span>
              <ChevronRight
                className="w-3 h-3 shrink-0 transition-transform duration-200"
                style={{
                  transform: dockOpen && dockTab === "preview" ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
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
          band !== "narrow" ? (
            /*
             * Wide + Medium: inline animated aside.
             * The outer aside animates its width (340 → 0, 260 ms ease-out).
             * The inner div is fixed-width (340 px) so content is never squished mid-animation.
             */
            <aside
              className="border-l bg-card overflow-hidden flex flex-col shrink-0"
              style={{
                width: dockOpen ? 340 : 0,
                minWidth: 0,
                transition: "width 260ms ease-out",
              }}
            >
              {dockInner}
            </aside>
          ) : (
            /*
             * Narrow: always-mounted fixed overlay so AI chat history survives band changes.
             * Animates via translateX (260 ms ease-out). Scrim fades in/out.
             */
            <>
              {/* Scrim — fade opacity */}
              <div
                className="fixed inset-0 z-40 transition-opacity"
                style={{
                  background: "rgba(0,0,0,0.2)",
                  transitionDuration: "260ms",
                  opacity: dockOpen ? 1 : 0,
                  pointerEvents: dockOpen ? "auto" : "none",
                }}
                onClick={closeDock}
              />
              {/* Dock panel — slide in/out */}
              <div
                role="dialog"
                aria-modal="true"
                className="fixed inset-y-0 right-0 z-50 bg-card border-l shadow-xl overflow-hidden"
                style={{
                  width: 340,
                  transform: dockOpen ? "translateX(0)" : "translateX(100%)",
                  transition: "transform 260ms ease-out",
                }}
              >
                {dockInner}
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
