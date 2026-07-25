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

import { useState } from "react";
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
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setResponse(null);
    setError(null);
    try {
      const result: AiResult = await aiApi.complete(systemPrompt, text.trim());
      setResponse(result.text);
    } catch (e) {
      setError((e as Error).message ?? "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Response area */}
      <div className="flex-1 overflow-y-auto">
        {!response && !loading && !error && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <p className="text-[12.5px] font-semibold text-foreground">AI Assistant</p>
                <p className="text-[11px] text-muted-foreground">Ask anything or pick a suggestion</p>
              </div>
            </div>
            {examplePrompts?.map((p) => (
              <button
                key={p}
                onClick={() => { setPrompt(p); submit(p); }}
                style={{ cursor: "pointer" }}
                className="w-full text-left px-3 py-2.5 rounded-xl border bg-background text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-[11px] text-muted-foreground">Thinking…</p>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl p-3 text-[12px]"
            style={{ background: "#fdf0f0", color: "#b23b3b" }}
          >
            <p className="font-semibold mb-0.5">Generation failed</p>
            <p>{error}</p>
            <button
              onClick={() => submit(prompt)}
              style={{ cursor: "pointer" }}
              className="mt-2 text-[11px] font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {response && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-2">
              Response
            </div>
            <div
              className="rounded-xl border p-3 text-[12.5px] text-foreground bg-background leading-relaxed whitespace-pre-wrap"
            >
              {response}
            </div>
            <button
              onClick={() => { setResponse(null); setPrompt(""); }}
              style={{ cursor: "pointer" }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Start over
            </button>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border rounded-xl bg-background overflow-hidden shrink-0">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(prompt); } }}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none p-3 text-[12.5px] bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
        />
        <div className="flex justify-end px-3 pb-2">
          <button
            onClick={() => submit(prompt)}
            disabled={!prompt.trim() || loading}
            style={{ cursor: !prompt.trim() || loading ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG, color: "#fff" }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send className="w-3 h-3" />
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
