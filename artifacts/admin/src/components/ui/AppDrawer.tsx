/**
 * AppDrawer — reusable overlay drawer.
 *
 * - Overlays the page on a scrim; body scroll is locked while open.
 * - Full window height, anchored left or right, configurable width (default 400px).
 * - Fits 100vw below 640px.
 * - Single scroll context inside — the caller provides content with no inner
 *   overflow containers (they would cause nested scrollbars).
 * - Slides in/out 220ms ease-out. Scrim fades.
 * - Dismissible by ×, scrim click, or Escape.
 * - Always mounted so content state (e.g. chat history) survives open/close.
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: string;
  /** Optional chip / badge shown after the title */
  badge?: React.ReactNode;
  /** Extra element(s) rendered before the × button (e.g. tab switcher) */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  /** Width in px at ≥ 640 px. Defaults to 400. */
  width?: number;
}

export function AppDrawer({
  open,
  onClose,
  side = "right",
  title,
  badge,
  headerExtra,
  children,
  width = 400,
}: AppDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Body scroll lock ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── ESC to close ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [open, onClose]);

  // ── Move focus into panel when opened ───────────────────────────────────────
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const translateOut = side === "right" ? "translateX(100%)" : "translateX(-100%)";

  return (
    <>
      {/* ── Scrim ─────────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(27, 42, 74, 0.40)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 220ms ease-out",
        }}
      />

      {/* ── Panel — always mounted so chat history / state survives ───────── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          [side]: 0,
          zIndex: 201,
          width: `min(${width}px, 100vw)`,
          background: "#FFFDF9",
          border: side === "right"
            ? "1px solid hsl(37 37% 84%) transparent transparent transparent"
            : "1px solid transparent hsl(37 37% 84%) transparent transparent",
          borderLeft: side === "right" ? "1px solid hsl(37 37% 84%)" : undefined,
          borderRight: side === "left" ? "1px solid hsl(37 37% 84%)" : undefined,
          boxShadow:
            side === "right"
              ? "-6px 0 32px rgba(27,42,74,0.13)"
              : "6px 0 32px rgba(27,42,74,0.13)",
          transform: open ? "translateX(0)" : translateOut,
          transition: "transform 220ms ease-out",
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        {/* Header ─────────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 8px 0 16px",
            minHeight: 48,
            borderBottom: "1px solid hsl(37 37% 85%)",
            background: "#FFFDF9",
            flexShrink: 0,
          }}
        >
          {/* Title + badge */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: "#1B2A4A",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </span>
            {badge}
          </div>

          {headerExtra}

          {/* × close */}
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 8,
              color: "hsl(var(--muted-foreground, 215 16% 47%))",
              flexShrink: 0,
              background: "transparent",
              border: "none",
              transition: "background 140ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(27,42,74,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body — flex column, overflow hidden so children manage their own scroll.
             DockAiAssistant uses flex-1 + overflow-y:auto internally. Preview
             content is wrapped in an overflow-y:auto div by GlobalAiDrawer.
             This ensures exactly ONE scrollable region is visible at a time. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
