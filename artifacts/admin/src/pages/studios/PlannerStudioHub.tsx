/**
 * Planner Studio — unified workspace for the planner product domain.
 *
 * Modes (top-bar tab switcher):
 *   Build a planner · Editions · Inserts & widgets · Cover · Dividers & tabs
 *   · Theme · Paper & binding · Quality check
 *
 * Each mode renders an existing page component (or a "coming soon" stub).
 * No backend routes are changed — this is pure navigation composition.
 * Mode is held in the ?mode=… query param so it's bookmarkable.
 */
import { useLocation, useSearch } from "wouter";
import { Hammer } from "lucide-react";
import PlannerBuilder from "@/pages/planners/builder";
import EditionsList from "@/pages/editions/list";
import InsertsList from "@/pages/catalog/inserts/list";
import ThemeStudio from "@/pages/studios/ThemeStudio";

// ── Mode definitions ──────────────────────────────────────────────────────────
const MODES = [
  { id: "build",    label: "Build a planner" },
  { id: "editions", label: "Editions" },
  { id: "inserts",  label: "Inserts & widgets" },
  { id: "cover",    label: "Cover" },
  { id: "dividers", label: "Dividers & tabs" },
  { id: "theme",    label: "Theme" },
  { id: "paper",    label: "Paper & binding" },
  { id: "quality",  label: "Quality check" },
] as const;

type ModeId = typeof MODES[number]["id"];

const STUB_DESCRIPTIONS: Partial<Record<ModeId, string>> = {
  cover:    "Design and manage front/back cover layouts, foil-stamp options, and cover-image slots.",
  dividers: "Define tab rail configurations, divider page templates, and multi-edge tab sets.",
  paper:    "Set default paper weight, binding type, cover lamination, and print-spec overrides per edition.",
  quality:  "Run automated print-readiness checks: bleed, DPI, colour-space, and font embedding.",
};

function ComingSoon({ mode }: { mode: ModeId }) {
  const modeLabel = MODES.find(m => m.id === mode)?.label ?? mode;
  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <Hammer className="w-6 h-6 text-muted-foreground" />
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
export default function PlannerStudioHub() {
  const search = useSearch();
  const [, navigate] = useLocation();

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode = (params.get("mode") ?? "build") as ModeId;
  const validMode = MODES.some(m => m.id === mode) ? mode : "build";

  const setMode = (id: ModeId) => navigate(`/studios/planner?mode=${id}`);

  return (
    // Escape Shell's p-8 / max-w-6xl wrapper for the sticky tab bar
    <div className="-mx-8 -mt-8 flex flex-col">
      {/* ── Top-bar tab switcher ─────────────────────────────────────────── */}
      <div className="border-b bg-card sticky top-0 z-20 flex items-center px-8 gap-1 shrink-0">
        <span className="font-display font-semibold text-sm text-foreground/60 py-3.5 mr-5 shrink-0 select-none">
          Planner Studio
        </span>
        <nav className="flex gap-0 overflow-x-auto -mb-px" aria-label="Planner Studio modes">
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
          {validMode === "build"    && <PlannerBuilder />}
          {validMode === "editions" && <EditionsList />}
          {validMode === "inserts"  && <InsertsList />}
          {validMode === "theme"    && <ThemeStudio />}
          {(validMode === "cover" || validMode === "dividers" ||
            validMode === "paper" || validMode === "quality") && (
            <ComingSoon mode={validMode} />
          )}
        </div>
      </div>
    </div>
  );
}
