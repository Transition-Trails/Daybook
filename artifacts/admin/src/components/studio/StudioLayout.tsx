/**
 * StudioLayout — the one shell used by all three studio hubs.
 *
 * DRAWER MIGRATION (breaking change from v1):
 *   The right dock is now a global overlay AppDrawer managed by AiDrawerContext.
 *   This component no longer renders an inline right column — it exposes
 *   `hasAssistant` / `hasPreview` props that control the top-bar buttons, which
 *   call openAssistant() / openPreview() on the global drawer.
 *
 * Breakpoint behaviour (measured on the outer wrapper, not viewport):
 *   Wide   ≥ 1200 px  Rail (246) + Center — two columns
 *   Medium  900–1199  Rail (246) + Center — two columns
 *   Narrow   < 900    Center full-width; Rail collapses → ☰ overlay
 *
 * No horizontal page scroll at any width.
 * One scroll context per region — center scrolls; rail scrolls; no third column.
 */
import { useState, useEffect, useRef } from "react";
import { PanelLeft, X, Bot, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import { useFocusTrap } from "@/hooks/useFocusTrap";

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
  /** Synced indicator pill — uses semantic success/error colour */
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
  /**
   * Show the ✦ AI button in the top bar.
   * Calls openAssistant() on the global AiDrawerContext.
   * Default: true.
   */
  hasAssistant?: boolean;
  /**
   * Show the Preview button in the top bar.
   * Calls openPreview() on the global AiDrawerContext.
   * Default: false.
   */
  hasPreview?: boolean;
  /** Center workspace — rendered inside a scrollable, min-width:0 column */
  children: React.ReactNode;
  /** Extra class on the outer wrapper */
  className?: string;
}

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
  hasAssistant = true,
  hasPreview = false,
  children,
  className,
}: StudioLayoutProps) {
  const { openAssistant, openPreview, closeDrawer, open: drawerOpen, tab: drawerTab } = useAiDrawer();

  const [railOpen, setRailOpen] = useState(false);
  const [band,     setBand]     = useState<Band>("wide");

  const wrapperRef   = useRef<HTMLDivElement>(null);
  /** Ref to the narrow-viewport hamburger button — used to restore focus when the rail overlay closes. */
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  /** Ref to the rail overlay panel — focus trap container. */
  const railPanelRef = useRef<HTMLDivElement>(null);

  // ── Measure container width ────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setBand(getBand(w));
    });
    ro.observe(el);
    setBand(getBand(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // ── Auto-close rail overlay when band widens ───────────────────────────────
  useEffect(() => {
    if (band !== "narrow") setRailOpen(false);
  }, [band]);

  // ── ESC to close rail overlay (drawer ESC is handled by AppDrawer) ─────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setRailOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Focus trap for the narrow-viewport rail overlay ───────────────────────
  // Saves focus on open, moves it to the first focusable element inside the
  // overlay, cycles Tab/Shift+Tab within it, and restores to the hamburger
  // button when the overlay closes.
  useFocusTrap(railPanelRef, railOpen, hamburgerRef);

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
            ref={hamburgerRef}
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
        <div className="flex-1 min-w-0 overflow-hidden relative">
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
          {/* Right-edge fade — visible when pills overflow */}
          <div
            className="absolute right-0 inset-y-0 w-8 pointer-events-none"
            style={{ background: "linear-gradient(to left, hsl(var(--card)), transparent)" }}
          />
        </div>

        {/* Right cluster — status + primary action + drawer toggles */}
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

          {/* ✦ AI — toggles global assistant drawer */}
          {hasAssistant && (
            <button
              onClick={drawerOpen && drawerTab === "assistant" ? closeDrawer : openAssistant}
              aria-label={drawerOpen && drawerTab === "assistant" ? "Close AI assistant" : "Open AI assistant"}
              style={{
                cursor: "pointer",
                ...(drawerOpen && drawerTab === "assistant"
                  ? { background: "#1B2A4A", color: "#fff" }
                  : {}),
              }}
              className={cn(
                "flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[12px] font-medium border transition-colors shrink-0",
                drawerOpen && drawerTab === "assistant"
                  ? "border-[#1B2A4A]"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">AI</span>
            </button>
          )}

          {/* Preview — toggles global drawer on preview tab */}
          {hasPreview && (
            <button
              onClick={drawerOpen && drawerTab === "preview" ? closeDrawer : openPreview}
              aria-label={drawerOpen && drawerTab === "preview" ? "Close preview" : "Open preview"}
              style={{
                cursor: "pointer",
                ...(drawerOpen && drawerTab === "preview"
                  ? { background: "#1B2A4A", color: "#fff" }
                  : {}),
              }}
              className={cn(
                "flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[12px] font-medium border transition-colors shrink-0",
                drawerOpen && drawerTab === "preview"
                  ? "border-[#1B2A4A]"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Preview</span>
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
                ref={railPanelRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${scope} panel`}
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
        {/* Single scroll context for the work surface — no nested scrollbars */}
        <main
          className="flex-1 overflow-y-auto bg-background [&::-webkit-scrollbar]:hidden"
          style={{ minWidth: 0, scrollbarWidth: "none" } as React.CSSProperties}
        >
          <div className="p-6" style={{ minWidth: 0 }}>
            {children}
          </div>
        </main>

      </div>
    </div>
  );
}
