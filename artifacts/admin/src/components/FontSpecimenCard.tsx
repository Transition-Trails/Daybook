/**
 * FontSpecimenCard — renders a planner-relevant font specimen for a given
 * heading + body font pairing, loading the typefaces from Google Fonts via a
 * dynamically-injected stylesheet.
 *
 * Falls back to a pulse skeleton while the Google Fonts stylesheet loads, then
 * reveals the actual text. If the load fails (offline, blocked, etc.) the
 * component still renders gracefully using system-serif / system-sans-serif.
 */

import { useEffect, useState } from "react";
import { Type } from "lucide-react";

export interface FontPairing {
  heading?: string;
  body?: string;
  accent?: string;
  subheading?: string;
}

// ── Font-loader hook ──────────────────────────────────────────────────────────

/**
 * Injects a Google Fonts CSS2 stylesheet for the given families into
 * <head> (idempotent — won't add the same stylesheet twice).
 * Returns `true` once the stylesheet has loaded or settled.
 */
function useFontLoader(families: string[]): boolean {
  const relevant = families.filter(Boolean);
  const [loaded, setLoaded] = useState(relevant.length === 0);

  useEffect(() => {
    if (!relevant.length) { setLoaded(true); return; }

    const id = `gf-specimen-${relevant
      .map((f) => f.replace(/\s+/g, "-").toLowerCase())
      .join("-")}`;

    // Already injected in a previous render — mark immediately loaded.
    if (document.getElementById(id)) { setLoaded(true); return; }

    const link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${relevant
      .map((f) => `family=${encodeURIComponent(f)}:wght@400;700`)
      .join("&")}&display=swap`;

    let settled = false;
    const settle = () => { if (!settled) { settled = true; setLoaded(true); } };

    // Resolve after 1 s even if the load event never fires (strict CSP, network
    // timeout, etc.) so the UI never stays in skeleton state forever.
    const timer = setTimeout(settle, 1000);

    link.addEventListener("load",  settle);
    link.addEventListener("error", settle);
    document.head.appendChild(link);

    return () => {
      clearTimeout(timer);
      link.removeEventListener("load",  settle);
      link.removeEventListener("error", settle);
      // Note: we intentionally leave the <link> in <head> so other card
      // instances sharing the same fonts don't reload the stylesheet.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevant.join("|")]);

  return loaded;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FontSpecimenCardProps {
  fontPairing: FontPairing;
  /** Optional theme name shown as a label above the specimen. */
  themeName?: string;
  /** Slightly tighter layout for use inside dense list items. */
  compact?: boolean;
}

export function FontSpecimenCard({ fontPairing, themeName, compact = false }: FontSpecimenCardProps) {
  const heading = fontPairing?.heading?.trim() || undefined;
  const body    = fontPairing?.body?.trim()    || undefined;

  const loaded = useFontLoader([heading, body].filter(Boolean) as string[]);

  // Nothing to show if neither slot is set.
  if (!heading && !body) return null;

  return (
    <div
      className={`rounded-lg border bg-card overflow-hidden ${compact ? "p-3 space-y-1.5" : "p-4 space-y-2"}`}
      aria-label={`Font specimen: ${[heading, body].filter(Boolean).join(" / ")}`}
    >
      {/* Label row */}
      {themeName && (
        <div className="flex items-center gap-1.5">
          <Type className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">
            {themeName}
          </span>
        </div>
      )}

      {/* Specimen text or skeleton */}
      {loaded ? (
        <div className="space-y-1">
          {heading && (
            <p
              className={`font-bold leading-tight text-foreground ${compact ? "text-lg" : "text-2xl"}`}
              style={{ fontFamily: `'${heading}', Georgia, 'Times New Roman', serif` }}
            >
              January · Week 1
            </p>
          )}
          {body && (
            <p
              className={`leading-snug text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
              style={{ fontFamily: `'${body}', system-ui, -apple-system, sans-serif` }}
            >
              Monday · Plan your week with intention and clarity.
            </p>
          )}
        </div>
      ) : (
        /* Pulse skeleton while stylesheet loads */
        <div className="space-y-2 animate-pulse">
          <div className={`bg-muted rounded ${compact ? "h-5 w-3/4" : "h-7 w-3/4"}`} />
          <div className={`bg-muted rounded ${compact ? "h-3 w-full" : "h-4 w-full"}`} />
        </div>
      )}

      {/* Font name labels */}
      {loaded && (heading || body) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1.5 border-t border-muted/60">
          {heading && (
            <span className="text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground/70">{heading}</span>
              {" "}— heading
            </span>
          )}
          {body && body !== heading && (
            <span className="text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground/70">{body}</span>
              {" "}— body
            </span>
          )}
        </div>
      )}
    </div>
  );
}
