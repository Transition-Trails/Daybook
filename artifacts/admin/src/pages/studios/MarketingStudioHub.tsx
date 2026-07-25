/**
 * Marketing Studio — workspace for listing copy, social content, mockups, and
 * market trend research.
 *
 * Modes (top-bar tab switcher):
 *   Trends · Listing generator · Social posts · Promo mockups · Listing images
 *
 * Trends uses the existing TrendResearch AI tool.
 * Other modes are coming soon (UI stubs that preserve their intent).
 *
 * Mode held in ?mode=… query param. No backend changes — navigation only.
 */
import { useLocation, useSearch } from "wouter";
import { Megaphone } from "lucide-react";
import StudioTrendResearch from "@/pages/studios/TrendResearch";

// ── Mode definitions ──────────────────────────────────────────────────────────
const MODES = [
  { id: "trends",   label: "Trends" },
  { id: "listing",  label: "Listing generator" },
  { id: "social",   label: "Social posts" },
  { id: "mockups",  label: "Promo mockups" },
  { id: "images",   label: "Listing images" },
] as const;

type ModeId = typeof MODES[number]["id"];

const STUB_DESCRIPTIONS: Partial<Record<ModeId, string>> = {
  listing: "Generate optimised Etsy/Shopify listing titles, descriptions, and tags from your edition spec.",
  social:  "Create platform-ready social copy and caption sets for Instagram, Pinterest, and TikTok.",
  mockups: "Produce lifestyle mockup images by compositing edition covers into scene templates.",
  images:  "Generate on-white and lifestyle product listing images compliant with platform requirements.",
};

function ComingSoon({ mode }: { mode: ModeId }) {
  const modeLabel = MODES.find(m => m.id === mode)?.label ?? mode;
  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <Megaphone className="w-6 h-6 text-muted-foreground" />
      </div>
      <div>
        <h2 className="font-display font-semibold text-xl">{modeLabel}</h2>
        <p className="text-muted-foreground text-sm mt-2 max-w-sm">
          {STUB_DESCRIPTIONS[mode] ?? "This mode is coming soon."}
        </p>
      </div>
      <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground">
        Coming soon
      </span>
    </div>
  );
}

// ── Studio hub ────────────────────────────────────────────────────────────────
export default function MarketingStudioHub() {
  const search = useSearch();
  const [, navigate] = useLocation();

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode = (params.get("mode") ?? "trends") as ModeId;
  const validMode = MODES.some(m => m.id === mode) ? mode : "trends";

  const setMode = (id: ModeId) => navigate(`/studios/marketing?mode=${id}`);

  return (
    <div className="-mx-8 -mt-8 flex flex-col">
      {/* ── Top-bar tab switcher ─────────────────────────────────────────── */}
      <div className="border-b bg-card sticky top-0 z-20 flex items-center px-8 gap-1 shrink-0">
        <span className="font-display font-semibold text-sm text-foreground/60 py-3.5 mr-5 shrink-0 select-none">
          Marketing Studio
        </span>
        <nav className="flex gap-0 overflow-x-auto -mb-px" aria-label="Marketing Studio modes">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                validMode === m.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Mode content ─────────────────────────────────────────────────── */}
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          {validMode === "trends"  && <StudioTrendResearch />}
          {(validMode === "listing" || validMode === "social" ||
            validMode === "mockups" || validMode === "images") && (
            <ComingSoon mode={validMode} />
          )}
        </div>
      </div>
    </div>
  );
}
