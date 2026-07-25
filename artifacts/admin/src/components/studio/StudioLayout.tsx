/**
 * StudioLayout — the one shell used by all three studio hubs.
 *
 * Structure
 * ┌─[TOP BAR 48px]──────────────────────────────────────────────────────────┐
 * │ scope-label  [● pill ○ pill ○ pill]  ·  [status]  [primary action]      │
 * ├─[LEFT RAIL 246px]──[CENTER minmax(0,1fr)]──[RIGHT DOCK 340px]───────────┤
 * │ context card  │ scrollable workspace   │ ┌AI ASSISTANT┐ ┌PREVIEW┐       │
 * │ tool list     │                        │ │            │ │       │        │
 * │               │                        │                                 │
 * │ voice/tone ▼  │                        │ dock content (tabs)             │
 * └───────────────┴────────────────────────┴─────────────────────────────────┘
 *
 * Rules:
 * - Center column uses minmax(0,1fr) — prevents min-content overflow.
 * - Both rail and dock are independently scrollable.
 * - Mode pills: active = bg-primary / text-primary-foreground (navy+white, passes 4.5:1).
 * - Status pill: never accent text on accent-soft — uses semantic success/error colours.
 */
import { useState } from "react";
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
  const [dockTab, setDockTab] = useState<DockTab>("assistant");
  const hasBothTabs = !!(rightDock?.assistant && rightDock?.preview);
  const hasAssistant = !!rightDock?.assistant;
  const hasPreview = !!rightDock?.preview;
  const hasDock = hasAssistant || hasPreview;

  // Which content shows in the dock right now
  const dockContent = hasBothTabs
    ? (dockTab === "assistant" ? rightDock!.assistant : rightDock!.preview)
    : (rightDock?.assistant ?? rightDock?.preview);

  return (
    // Escape Shell's p-8 / max-w-6xl wrapper
    <div className={cn("-mx-8 -mt-8 flex flex-col", className)}>
      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div
        className="h-12 border-b bg-card flex items-center gap-2 px-5 shrink-0"
        style={{ minHeight: 48 }}
      >
        {/* Scope label */}
        <span className="font-display font-semibold text-[12.5px] text-foreground/55 select-none mr-3 shrink-0">
          {scope}
        </span>

        {/* Mode pills — active = Ink Navy #1B2A4A + white = 16:1 ✓
            (--primary is clay/coral ≈ 3.5:1 on white — do NOT use bg-primary here) */}
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

        {/* Spacer */}
        <div className="flex-1 min-w-2" />

        {/* Status pill — #3f6b4c on #edf4f0 = 5.26:1 ✓ | #b23b3b on #fdf0f0 ✓ */}
        {status && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] shrink-0"
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
            style={{ cursor: primaryAction.disabled ? "not-allowed" : "pointer", background: "#1B2A4A", color: "#fff" }}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
          >
            {primaryAction.loading ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
            ) : (
              primaryAction.icon
            )}
            {primaryAction.label}
          </button>
        )}
      </div>

      {/* ── THREE-COLUMN BODY ────────────────────────────────────────────── */}
      {/*
        Height: viewport - Shell top bar (56px / 3.5rem) - Studio top bar (48px / 3rem)
        Each column scrolls independently; center uses minmax(0,1fr) to floor at 0.
      */}
      <div
        className="flex overflow-hidden"
        style={{ height: "calc(100dvh - 3.5rem - 3rem)" }}
      >
        {/* LEFT RAIL
            bg-[#FFFDF9] — warm white (contrasts with card/background without the dark-navy
            sidebar.  Hairline right border visually separates from the workspace.
            overflow-hidden prevents a second scrollbar when rail content has its own
            flex-1 overflow-y-auto (build-rail pattern).  Rail content owns its scroll. */}
        <aside
          className="border-r overflow-hidden flex flex-col shrink-0"
          style={{
            width: 246, minWidth: 246,
            background: "#FFFDF9",
            borderColor: "hsl(var(--border))",
            /* Thin, hover-fading scrollbar for webkit — keeps rail uncluttered */
          }}
        >
          {leftRail}
        </aside>

        {/* CENTER WORKSPACE */}
        <main
          className="flex-1 overflow-y-auto bg-background"
          style={{ minWidth: 0 }}
        >
          <div className="p-6" style={{ minWidth: 0 }}>
            {children}
          </div>
        </main>

        {/* RIGHT DOCK */}
        {hasDock && (
          <aside
            className="border-l bg-card overflow-hidden flex flex-col shrink-0"
            style={{ width: 340, minWidth: 340 }}
          >
            {/* Dock tab bar — only shown when both tabs are present */}
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

            {/* Single-tab label when only one tab type */}
            {!hasBothTabs && (hasAssistant || hasPreview) && (
              <div className="border-b px-4 py-2.5 bg-card shrink-0">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {hasAssistant ? "AI Assistant" : "Preview"}
                </span>
              </div>
            )}

            {/* Dock content */}
            <div className="flex-1 overflow-y-auto">{dockContent}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
