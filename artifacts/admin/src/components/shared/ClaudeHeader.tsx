/**
 * ClaudeHeader — clay gradient banner shown at the top of every AI Studio page.
 * Signals that Claude is assisting and shows the active model once known.
 */
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClaudeHeaderProps {
  title: string;
  description: string;
  /** Set after a successful AI call to show the active model */
  model?: string;
  provider?: string;
  className?: string;
}

export function ClaudeHeader({
  title,
  description,
  model,
  provider,
  className,
}: ClaudeHeaderProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl px-6 py-5 mb-8",
        className,
      )}
      style={{
        background: "linear-gradient(135deg, #C87560 0%, #A85E4E 55%, #8B4A3A 100%)",
      }}
    >
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(ellipse at 80% 50%, #FFFDF9 0%, transparent 70%)",
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold text-white/95 leading-tight">
            {title}
          </h1>
          <p className="mt-1 text-sm text-white/70 max-w-lg">{description}</p>
        </div>

        <div className="shrink-0 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5 text-white/80" />
          <span className="text-xs font-medium text-white/90 whitespace-nowrap">
            ✦ Claude is assisting
          </span>
          {model && (
            <span className="hidden sm:block text-[10px] text-white/50 ml-1">
              {provider ?? "claude"} · {model}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
