/**
 * Studio primitives — define once, reuse everywhere.
 *
 * Component vocabulary (from spec):
 *   SectionLabel  — 10.5-11px / weight 700 / uppercase / tracking .12em / text-muted
 *   ChipRow       — single-select pill chips (replaces ≤6-option selects)
 *   MultiChipRow  — multi-select variant
 *   SegmentedControl — two-option inline toggle (e.g. Mon/Sun, A5/HalfLetter)
 *   EmptyState    — icon + title + description + CTA button (every insight → button)
 *   ErrorState    — error message + retry (severity #b23b3b on #fdf0f0)
 *   SkeletonRows  — loading placeholder; never blank panels
 *   RailCard      — left-rail context card (surface-card / 14px radius / shadow-sm)
 *   StatusPill    — semantic colour pill (never accent-text on accent-soft)
 *   ActionChip    — visible row action button (replaces hidden "..." menus)
 *
 * Contrast requirements (all pass WCAG AA 4.5:1 at normal size):
 *   Active chip fill: Ink Navy #1B2A4A + white = ~16:1 ✓
 *   NOTE: --primary = clay #C87560 (12 49% 58%) + white ≈ 3.5:1 — FAILS.
 *         Never use bg-primary/text-primary-foreground for active chips.
 *         Use CHIP_ACTIVE_CLS / CHIP_ACTIVE_STYLE constants below instead.
 *   Inactive chip: text-muted-foreground on bg-muted ≈ 5.3:1 ✓
 *   Success: #3f6b4c on #edf4f0 = 5.26:1 ✓
 *   Error: #b23b3b on #fdf0f0 = 5.1:1 ✓
 */

/** Ink Navy — passes white-text contrast at 16:1. Use for ALL active-chip fills. */
export const CHIP_ACTIVE_BG  = "#1B2A4A";
export const CHIP_ACTIVE_CLS = "text-white border-[#1B2A4A]";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";

// ── SectionLabel ──────────────────────────────────────────────────────────────

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

// ── ChipRow (single-select) ───────────────────────────────────────────────────

export interface ChipOption {
  value: string;
  label: string;
}

export function ChipRow({
  options,
  value,
  onChange,
  className,
}: {
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1.5 flex-wrap", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            cursor: "pointer",
            ...(value === o.value ? { background: CHIP_ACTIVE_BG } : {}),
          }}
          className={cn(
            "px-3 py-1 rounded-full text-[12px] font-medium border transition-colors",
            value === o.value
              ? `${CHIP_ACTIVE_CLS} border-[#1B2A4A]`
              : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── MultiChipRow (multi-select) ───────────────────────────────────────────────

export function MultiChipRow({
  options,
  value,
  onChange,
  className,
}: {
  options: ChipOption[];
  value: string[];
  onChange: (v: string[]) => void;
  className?: string;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className={cn("flex gap-1.5 flex-wrap", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => toggle(o.value)}
          style={{
            cursor: "pointer",
            ...(value.includes(o.value) ? { background: CHIP_ACTIVE_BG } : {}),
          }}
          className={cn(
            "px-3 py-1 rounded-full text-[12px] font-medium border transition-colors",
            value.includes(o.value)
              ? `${CHIP_ACTIVE_CLS} border-[#1B2A4A]`
              : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── SegmentedControl ──────────────────────────────────────────────────────────

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: {
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border bg-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{ cursor: "pointer" }}
          className={cn(
            "px-3 py-1 rounded-md text-[12.5px] font-medium transition-colors",
            value === o.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
// "Every insight ends in a button" — action is always present for empty states.

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-8 gap-3",
        className,
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-1">
          {icon}
        </div>
      )}
      {/* Two-line text block: explicit flex-col + width:100% — prevents sibling overlap */}
      <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center", gap: 4 }}>
        <p className="font-display font-semibold text-[15px] text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground max-w-xs" style={{ width: "100%" }}>
            {description}
          </p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          style={{ cursor: "pointer", background: CHIP_ACTIVE_BG }}
          className="mt-1 px-5 py-2 rounded-full text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── ErrorState ────────────────────────────────────────────────────────────────

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-8 gap-3",
        className,
      )}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
        style={{ background: "#fdf0f0" }}
      >
        <AlertCircle className="w-5 h-5" style={{ color: "#b23b3b" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center", gap: 4 }}>
        <p className="font-display font-semibold text-[15px] text-foreground">
          Something went wrong
        </p>
        {message && (
          <p className="text-sm max-w-xs" style={{ color: "#b23b3b", width: "100%" }}>
            {message}
          </p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{ cursor: "pointer" }}
          className="mt-1 flex items-center gap-2 px-4 py-2 rounded-full border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}

// ── SkeletonRows ──────────────────────────────────────────────────────────────

export function SkeletonRows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-xl border"
          style={{ opacity: 1 - i * 0.15 }}
        >
          <div className="w-10 h-10 rounded-lg bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5 min-w-0">
            <div
              className="h-3 bg-muted animate-pulse rounded-full"
              style={{ width: `${60 + (i % 3) * 15}%` }}
            />
            <div
              className="h-2.5 bg-muted animate-pulse rounded-full"
              style={{ width: `${40 + (i % 2) * 20}%` }}
            />
          </div>
          <div className="w-16 h-7 bg-muted animate-pulse rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ── RailCard ──────────────────────────────────────────────────────────────────
// surface-card / 14px radius / shadow-sm / 16-20px padding

export function RailCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-[14px] border bg-card shadow-sm", className)}
      style={{ padding: "16px" }}
    >
      {children}
    </div>
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────────

type StatusKind = "success" | "error" | "warning" | "info" | "neutral";

const STATUS_STYLES: Record<StatusKind, { bg: string; color: string; dot: string }> = {
  success: { bg: "#edf4f0", color: "#3f6b4c", dot: "#3f6b4c" },
  error:   { bg: "#fdf0f0", color: "#b23b3b", dot: "#b23b3b" },
  warning: { bg: "#fdf5ee", color: "#7d4e28", dot: "#c8713f" },
  info:    { bg: "#eef2f9", color: "#1e3a5f", dot: "#1e3a5f" },
  neutral: { bg: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", dot: "hsl(var(--muted-foreground))" },
};

export function StatusPill({
  label,
  kind = "neutral",
  className,
}: {
  label: string;
  kind?: StatusKind;
  className?: string;
}) {
  const s = STATUS_STYLES[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]",
        className,
      )}
      style={{ background: s.bg, color: s.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {label}
    </span>
  );
}

// ── ActionChip ────────────────────────────────────────────────────────────────
// Visible action button on list rows. Never hidden in "..." menus for primary actions.

export function ActionChip({
  label,
  onClick,
  variant = "secondary",
  icon,
  disabled,
  className,
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        ...(variant === "primary" ? { background: CHIP_ACTIVE_BG } : {}),
      }}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border transition-colors shrink-0 disabled:opacity-40",
        variant === "primary" &&
          "text-white border-[#1B2A4A] hover:opacity-90",
        variant === "secondary" &&
          "bg-background text-foreground border-border hover:bg-muted",
        variant === "danger" &&
          "bg-background border-border text-[#b23b3b] hover:bg-[#fdf0f0] hover:border-[#b23b3b]",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── DockAiAssistant ───────────────────────────────────────────────────────────
// Generic AI chat panel for the right dock. Receives a system prompt and
// lets the user type a question; streams through aiApi.complete.

import { useState, useRef } from "react";
import { Sparkles, Send } from "lucide-react";
import { aiApi, type AiResult } from "@/lib/ai";

export function DockAiAssistant({
  systemPrompt,
  placeholder = "Ask the AI anything…",
  examplePrompts,
}: {
  systemPrompt: string;
  placeholder?: string;
  examplePrompts?: string[];
}) {
  const [prompt,   setPrompt]   = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const taRef       = useRef<HTMLTextAreaElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);

  // ── Auto-grow textarea ───────────────────────────────────────────────────────
  // Resets height to auto so scrollHeight reflects content, then clamps at 140px
  // (≈ 6 rows). overflowY toggles to show scrollbar only when clamped.
  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height    = "auto";
    const next          = Math.min(el.scrollHeight, 140);
    el.style.height    = `${next}px`;
    el.style.overflowY = el.scrollHeight > 140 ? "auto" : "hidden";
  };

  const submit = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setResponse(null);
    setError(null);
    try {
      const result: AiResult = await aiApi.complete(systemPrompt, text.trim());
      setResponse(result.text);
      // Scroll to show response
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }, 50);
    } catch (e) {
      setError((e as Error).message ?? "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const hasInput = prompt.trim().length > 0 && !loading;

  return (
    // flex:1 + minHeight:0 (NOT height:100%) — the only reliable pattern for a
    // nested scrollable flex child. height:100% through a flex chain resolves
    // inconsistently across browsers and collapses the div to content size,
    // which pushes the dead space outside the scroll container.
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* ── Scrollable conversation area ───────────────────────────────────── */}
      {/* When empty: intro + chips at TOP; the flex:1 area IS the "dead space"
          — the empty scroll area between chips and the composer below is
          intentional layout, not a gap between components. */}
      <div
        ref={scrollRef}
        style={{
          flex:          1,
          overflowY:     "auto",
          minHeight:     0,
          padding:       "20px 16px 12px",
          scrollbarWidth:"thin",
          scrollbarColor:"hsl(37 30% 78%) transparent",
        } as React.CSSProperties}
      >
        {/* Empty state — intro + suggestion chips */}
        {!response && !loading && !error && (
          <div>
            {/* AI identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 16, flexShrink: 0,
                  background: "rgba(200,117,96,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Sparkles style={{ width: 14, height: 14, color: "#C87560" }} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1B2A4A", lineHeight: 1.3 }}>
                  AI Assistant
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "hsl(215 16% 52%)", lineHeight: 1.4 }}>
                  Ask anything or pick a suggestion
                </p>
              </div>
            </div>

            {/* Suggestion chips */}
            {examplePrompts && examplePrompts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {examplePrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPrompt(p); submit(p); }}
                    style={{
                      cursor:      "pointer",
                      textAlign:   "left",
                      padding:     "10px 13px",
                      borderRadius: 10,
                      border:      "1px solid hsl(37 30% 82%)",
                      background:  "#fff",
                      fontSize:    12,
                      lineHeight:  1.45,
                      color:       "hsl(215 16% 42%)",
                      transition:  "border-color 140ms, color 140ms, background 140ms",
                    }}
                    onMouseEnter={(e) => {
                      const b = e.currentTarget as HTMLButtonElement;
                      b.style.borderColor = "#C87560";
                      b.style.color       = "#1B2A4A";
                      b.style.background  = "rgba(200,117,96,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      const b = e.currentTarget as HTMLButtonElement;
                      b.style.borderColor = "hsl(37 30% 82%)";
                      b.style.color       = "hsl(215 16% 42%)";
                      b.style.background  = "#fff";
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 0" }}>
            <div
              className="animate-spin"
              style={{
                width: 20, height: 20, borderRadius: 10,
                border: "2.5px solid rgba(200,117,96,0.25)",
                borderTopColor: "#C87560",
              }}
            />
            <p style={{ margin: 0, fontSize: 11, color: "hsl(215 16% 52%)" }}>Thinking…</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{ borderRadius: 12, padding: "12px 14px", background: "#fdf0f0", color: "#b23b3b", fontSize: 12 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Generation failed</p>
            <p style={{ margin: 0 }}>{error}</p>
            <button
              onClick={() => submit(prompt)}
              style={{
                cursor: "pointer", marginTop: 8, fontSize: 11, fontWeight: 600,
                textDecoration: "underline", background: "none", border: "none",
                color: "#b23b3b", padding: 0,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Response */}
        {response && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{
              margin: 0, fontSize: 10.5, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.12em",
              color: "hsl(215 16% 52%)",
            }}>
              Response
            </p>
            <div style={{
              borderRadius: 12, border: "1px solid hsl(37 30% 82%)",
              padding: "12px 14px", fontSize: 12.5, lineHeight: 1.65,
              whiteSpace: "pre-wrap", color: "#1B2A4A", background: "#fff",
            }}>
              {response}
            </div>
            <button
              onClick={() => { setResponse(null); setPrompt(""); }}
              style={{
                cursor: "pointer", fontSize: 11, color: "hsl(215 16% 52%)",
                textDecoration: "underline", background: "none", border: "none",
                padding: 0, textAlign: "left",
              }}
            >
              Start over
            </button>
          </div>
        )}
      </div>

      {/* ── Composer — always pinned to bottom ─────────────────────────────── */}
      {/* Separated from conversation area by a hairline. The composer card has
          its own subtle shadow so it reads as elevated above the scroll area. */}
      <div
        style={{
          flexShrink:  0,
          padding:     "8px 12px 16px",
          borderTop:   "1px solid hsl(37 37% 88%)",
          background:  "#FFFDF9",
        }}
      >
        <div
          style={{
            border:       "1px solid hsl(37 30% 78%)",
            borderRadius: 12,
            overflow:     "hidden",
            background:   "#fff",
            boxShadow:    "0 1px 4px rgba(27,42,74,0.06)",
          }}
        >
          {/* Auto-growing textarea — starts at 2 rows, grows to ~6 */}
          <textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(prompt);
              }
            }}
            placeholder={placeholder}
            rows={2}
            style={{
              display:     "block",
              width:       "100%",
              boxSizing:   "border-box",
              resize:      "none",
              padding:     "11px 13px 5px",
              fontSize:    12.5,
              lineHeight:  1.55,
              background:  "transparent",
              border:      "none",
              outline:     "none",
              color:       "#1B2A4A",
              overflowY:   "hidden",  // toggled by autoGrow when clamped
              minHeight:   44,
              maxHeight:   140,
              fontFamily:  "inherit",
            }}
          />
          {/* Send row */}
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 10px 9px" }}>
            {/*
              NOT using the HTML `disabled` attribute — browsers apply native
              opacity (Safari ~0.3, others ~0.5) on top of our explicit styles,
              making the button look gray even when styled clay.
              Instead: aria-disabled for a11y + onClick guard + explicit opacity:1.
            */}
            <button
              type="button"
              aria-disabled={!hasInput}
              onClick={() => { if (hasInput) submit(prompt); }}
              style={{
                cursor:         !hasInput ? "not-allowed" : "pointer",
                display:        "flex",
                alignItems:     "center",
                gap:            5,
                padding:        "5px 14px",
                borderRadius:   20,
                fontSize:       11.5,
                fontWeight:     600,
                border:         "none",
                opacity:        1,           // always 1 — no browser override
                // Clay (#C87560) when there is input; warm paper-muted when empty
                background:     hasInput ? "#C87560" : "hsl(37 18% 87%)",
                color:          hasInput ? "#fff"    : "hsl(215 10% 60%)",
                transition:     "background 160ms, color 160ms",
              }}
              onMouseEnter={(e) => {
                if (!hasInput) return;
                (e.currentTarget as HTMLButtonElement).style.background = "#A85B48";
              }}
              onMouseLeave={(e) => {
                if (!hasInput) return;
                (e.currentTarget as HTMLButtonElement).style.background = "#C87560";
              }}
            >
              {loading ? (
                <span
                  className="animate-spin"
                  style={{
                    display: "inline-block", width: 11, height: 11,
                    borderRadius: 6, border: "1.5px solid currentColor",
                    borderTopColor: "transparent",
                  }}
                />
              ) : (
                <Send style={{ width: 11, height: 11 }} />
              )}
              Generate
            </button>
          </div>
        </div>
        <p style={{ margin: "6px 4px 0", fontSize: 10, color: "hsl(215 12% 62%)", lineHeight: 1.4 }}>
          ↵ Enter to send · Shift+↵ for newline
        </p>
      </div>
    </div>
  );
}
