/**
 * AppDrawer — reusable overlay drawer used for AI Assistant, Preview, and
 * any future right/left panel in the app.
 *
 * Geometry
 * ────────
 * position:fixed; top:0; right/left:0; height:100dvh — covers the full
 * viewport including the app top bar, edge-to-edge vertically. dvh handles
 * mobile browser chrome correctly (vh does not on iOS Safari).
 *
 * Visual separation
 * ─────────────────
 * Inner edge: 1px solid #E7DCCB (warm amber hairline, clearly visible).
 * Shadow: two-layer —  close-in (-2px) + wide spread (-12px) both spilling
 *   left/right so the panel reads as elevated, not floating.
 * Background: #FFFDF9 warm paper. Square corners — flush to the viewport edge.
 *
 * Scroll
 * ──────
 * Body: display:flex; flex-direction:column; overflow:hidden — children manage
 * their own scroll. DockAiAssistant has its own conversation-area scroll.
 * Preview content is wrapped in an overflow-y:auto div by GlobalAiDrawer.
 * → exactly one scrollable region visible at a time.
 *
 * Layout shift prevention
 * ───────────────────────
 * html { scrollbar-gutter: stable } (in index.css) reserves the scrollbar
 * lane always, so setting body overflow:hidden never causes a horizontal jump.
 * The effect also compensates dynamically in case the CSS isn't in effect.
 *
 * Motion
 * ──────
 * Panel slides 240ms ease-out. Scrim fades 240ms ease-out. Both use the
 * same duration so they complete together. No page reflow during animation.
 */
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: string;
  /** Optional chip / badge shown after the title — must truncate gracefully */
  badge?: React.ReactNode;
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
  children,
  width = 400,
}: AppDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Body scroll lock + layout-shift compensation ─────────────────────────────
  // Measuring the scrollbar width before hiding overflow lets us add equal
  // padding so the page content does not jump sideways.
  // html { scrollbar-gutter: stable } in index.css handles this declaratively;
  // this is a belt-and-suspenders fallback for environments where that rule
  // hasn't loaded yet.
  useEffect(() => {
    if (!open) return;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding  = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow     = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [open]);

  // ── ESC to close (highest priority — capture phase) ──────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [open, onClose]);

  // ── Focus trap — cycles Tab/Shift+Tab within the panel while open ────────────
  // Saves the triggering element on open and restores focus to it on close.
  useFocusTrap(panelRef, open);

  const translateOut =
    side === "right" ? "translateX(100%)" : "translateX(-100%)";

  return (
    <>
      {/* ── Scrim ─────────────────────────────────────────────────────────────
          Warm navy at low opacity so page content keeps its colour, just dims.
          Always mounted (pointer-events:none when closed) so the fade transition
          plays on both open and close. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position:      "fixed",
          inset:         0,
          zIndex:        9998,
          background:    "rgba(27,42,74,0.28)",
          opacity:       open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition:    "opacity 240ms ease-out",
        }}
      />

      {/* ── Panel ─────────────────────────────────────────────────────────────
          Always mounted so chat history / scroll position / React state all
          survive open → close → re-open. Hidden by translateX when closed. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          // ── Geometry ───────────────────────────────────────────────────────
          position:      "fixed",
          top:           0,
          [side]:        0,
          // height:100dvh is the primary constraint; bottom:0 is the fallback.
          // Using both ensures coverage on browsers with varying dvh support.
          height:        "100dvh",
          bottom:        0,
          zIndex:        9999,
          width:         `min(${width}px, 100vw)`,

          // ── Surface ────────────────────────────────────────────────────────
          background:    "#FFFDF9",
          // Warm hairline on the inner edge only — flush to viewport = no radius
          borderLeft:    side === "right" ? "1px solid #E7DCCB" : undefined,
          borderRight:   side === "left"  ? "1px solid #E7DCCB" : undefined,
          borderRadius:  0,
          // Two-layer shadow: close-in crispness + wide ambient spill
          boxShadow:     side === "right"
            ? "-2px 0 8px rgba(27,42,74,0.08), -12px 0 48px rgba(27,42,74,0.16)"
            : "2px 0 8px rgba(27,42,74,0.08), 12px 0 48px rgba(27,42,74,0.16)",

          // ── Layout ─────────────────────────────────────────────────────────
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",   // children manage their own scroll
          outline:       "none",

          // ── Motion ─────────────────────────────────────────────────────────
          transform:     open ? "translateX(0)" : translateOut,
          transition:    "transform 240ms ease-out",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            8,
            padding:        "0 4px 0 16px",
            minHeight:      52,
            borderBottom:   "1px solid hsl(37 37% 85%)",
            background:     "#FFFDF9",
            flexShrink:     0,
          }}
        >
          {/* Title + badge — overflow:hidden so badge truncates, not wraps */}
          <div
            style={{
              flex:        1,
              minWidth:    0,
              display:     "flex",
              alignItems:  "center",
              gap:         8,
              overflow:    "hidden",
            }}
          >
            <span
              style={{
                fontWeight:    600,
                fontSize:      13,
                color:         "#1B2A4A",
                whiteSpace:    "nowrap",
                flexShrink:    0,
              }}
            >
              {title}
            </span>
            {/* Badge wrapper: min-width:0 + overflow:hidden enables ellipsis */}
            {badge && (
              <span
                style={{
                  minWidth:     0,
                  overflow:     "hidden",
                  flexShrink:   1,
                  display:      "flex",
                  alignItems:   "center",
                }}
              >
                {badge}
              </span>
            )}
          </div>

          {/* Directional chevron — collapses the panel toward its mounted edge.
              Right panel → ChevronRight (push away to the right).
              Left panel  → ChevronLeft  (push away to the left).
              44 × 44 minimum touch target throughout. */}
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              cursor:         "pointer",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              minWidth:       44,
              minHeight:      44,
              borderRadius:   8,
              color:          "hsl(215 16% 48%)",
              flexShrink:     0,
              background:     "transparent",
              border:         "none",
              transition:     "background 140ms, color 140ms",
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(27,42,74,0.07)";
              b.style.color      = "#1B2A4A";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "transparent";
              b.style.color      = "hsl(215 16% 48%)";
            }}
          >
            {side === "right"
              ? <ChevronRight style={{ width: 18, height: 18 }} />
              : <ChevronLeft  style={{ width: 18, height: 18 }} />
            }
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────────
            flex-col + overflow:hidden — children own their scroll context.
            min-height:0 makes flex-1 children shrink correctly in Safari. */}
        <div
          style={{
            flex:          1,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            minHeight:     0,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
