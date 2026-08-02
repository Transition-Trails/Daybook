/**
 * PROTOTYPE_DATA — WorldSmith Concepts comparison page.
 * /super/worldsmith/concepts — shows all three concepts with descriptions
 * and a structured feedback form for reviewers.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Sparkles, ArrowRight, Check } from "lucide-react";

// ── Concept metadata ──────────────────────────────────────────────────────────

const CONCEPTS = [
  {
    id: "command-center",
    href: "/super/worldsmith/concepts/command-center",
    name: "Command Center",
    tagline: "Dense operational cockpit",
    philosophy: "Built for users who need to understand the entire system in one view. Leads with aggregated metrics, a prioritized action center, integration health, and a World health table — all visible above the fold on a wide display.",
    strengths: [
      "Maximum operational visibility at a glance",
      "Cross-World triage is fast",
      "Role-aware metric ordering keeps the most urgent signals prominent",
      "Pipeline visualization reveals production bottlenecks",
    ],
    risks: [
      "Information density may overwhelm first-time users",
      "Individual World context requires scrolling to the table",
      "Mobile experience is necessarily more condensed",
    ],
    accentColor: "#1B2A4A",
    thumbnail: <CommandCenterThumbnail />,
  },
  {
    id: "world-gallery",
    href: "/super/worldsmith/concepts/world-gallery",
    name: "World Gallery",
    tagline: "Visual, World-first browsing",
    philosophy: "Treats each World as a living creative portfolio. The default view is a gallery of World cards. Clicking one transforms the page into a focused World workspace — production, reviews, integrations, and activity all scoped to that World.",
    strengths: [
      "Strong visual identity and brand sense",
      "Easy to browse and compare Worlds side by side",
      "Focused World view prevents cross-World noise",
      "Supports gallery and list modes for different preferences",
    ],
    risks: [
      "Cross-World operational issues require returning to the gallery",
      "Users managing many Worlds may need extra navigation",
      "Canvas-filling card images require real cover art to work well",
    ],
    accentColor: "#C87560",
    thumbnail: <WorldGalleryThumbnail />,
  },
  {
    id: "guided-workspace",
    href: "/super/worldsmith/concepts/guided-workspace",
    name: "Guided Workspace",
    tagline: "Action-oriented, role-driven",
    philosophy: "Leads every session with a personalized greeting and one dominant next action computed from the user's role and system state. A World progress journey strip makes it easy to see where each World sits in the pipeline. Designed for focus over breadth.",
    strengths: [
      "Highly approachable for new and infrequent users",
      "Primary action surface ensures nothing is missed",
      "World journey strip is visual and instantly scannable",
      "Activity stream is curated — no raw system noise",
    ],
    risks: [
      "Full operational picture requires additional clicks",
      "Power users may want more information above the fold",
      "Primary action algorithm needs careful tuning in production",
    ],
    accentColor: "#4A6080",
    thumbnail: <GuidedWorkspaceThumbnail />,
  },
];

// ── Comparison feedback ───────────────────────────────────────────────────────

interface ComparisonFeedback {
  preferred_overall: string;
  preferred_navigation: string;
  preferred_world_view: string;
  preferred_action_center: string;
  preferred_setup_experience: string;
  comments: string;
}

const DEFAULT_COMPARISON: ComparisonFeedback = {
  preferred_overall: "", preferred_navigation: "", preferred_world_view: "",
  preferred_action_center: "", preferred_setup_experience: "", comments: "",
};

const COMPARISON_LS_KEY = "ws-proto:comparison";

function loadComparison(): ComparisonFeedback {
  try {
    const raw = localStorage.getItem(COMPARISON_LS_KEY);
    return raw ? { ...DEFAULT_COMPARISON, ...JSON.parse(raw) } : { ...DEFAULT_COMPARISON };
  } catch { return { ...DEFAULT_COMPARISON }; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConceptsIndex() {
  const [comparison, setComparison] = useState<ComparisonFeedback>(loadComparison);
  const [saved, setSaved] = useState(false);

  const updateComparison = (field: keyof ComparisonFeedback, value: string) => {
    setComparison(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    try { localStorage.setItem(COMPARISON_LS_KEY, JSON.stringify(comparison)); } catch { /* noop */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const CONCEPT_OPTIONS = [
    { value: "", label: "No preference yet" },
    ...CONCEPTS.map(c => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-10">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "hsl(221 46% 20%)" }}>
            <Sparkles className="w-3.5 h-3.5 text-[#C87560]" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">WorldSmith · Design Review</p>
        </div>
        <h1 className="font-display font-semibold text-2xl text-foreground">Landing Page Concepts</h1>
        <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
          Three materially different information architectures for the WorldSmith home page. Open each prototype to explore the full interactive experience.
          Each supports all three personas — Creative Director, Store User, and Daybook Admin — via the role switcher.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Link href="/super/worldsmith">
            <span className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              ← WorldSmith Compiler
            </span>
          </Link>
          <span className="text-[11px] text-muted-foreground border border-amber-300 bg-amber-50 rounded-full px-2.5 py-0.5">
            PROTOTYPE — not production
          </span>
        </div>
      </div>

      {/* ── Concept cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" role="list" aria-label="Design concepts">
        {CONCEPTS.map(concept => (
          <ConceptCard key={concept.id} concept={concept} />
        ))}
      </div>

      {/* ── Reviewer feedback ─────────────────────────────────────── */}
      <section aria-label="Reviewer feedback form">
        <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1">Reviewer feedback</p>
            <p className="text-[12.5px] text-muted-foreground">After exploring the prototypes, record your preferences below. Saved locally to this browser.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { field: "preferred_overall" as const,         label: "Preferred overall concept" },
              { field: "preferred_navigation" as const,      label: "Preferred navigation" },
              { field: "preferred_world_view" as const,      label: "Preferred World view" },
              { field: "preferred_action_center" as const,   label: "Preferred action center" },
              { field: "preferred_setup_experience" as const,label: "Preferred setup experience" },
            ].map(({ field, label }) => (
              <div key={field}>
                <label className="block text-[11.5px] font-medium text-foreground mb-1.5">{label}</label>
                <select
                  value={comparison[field]}
                  onChange={e => updateComparison(field, e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-foreground/30 transition-colors"
                  aria-label={label}
                >
                  {CONCEPT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {comparison[field] && (
                  <p className="mt-1 text-[10.5px] text-green-700 flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" /> {CONCEPTS.find(c => c.id === comparison[field])?.name}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[11.5px] font-medium text-foreground mb-1.5">Additional notes</label>
            <textarea
              value={comparison.comments}
              onChange={e => updateComparison("comments", e.target.value)}
              rows={4}
              placeholder="Overall observations, elements to carry forward, concerns, or specific preferences not captured above…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/30 transition-colors resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">Feedback saved locally — not sent to any server.</p>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: saved ? "#22c55e" : "#1B2A4A" }}
            >
              {saved ? "Saved ✓" : "Save preferences"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Concept card ──────────────────────────────────────────────────────────────

function ConceptCard({ concept }: { concept: typeof CONCEPTS[number] }) {
  return (
    <article
      className="rounded-xl border border-border bg-card overflow-hidden flex flex-col"
      role="listitem"
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-muted overflow-hidden border-b border-border">
        {concept.thumbnail}
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{concept.tagline}</p>
          <h2 className="font-display font-semibold text-lg text-foreground mt-0.5">{concept.name}</h2>
          <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">{concept.philosophy}</p>
        </div>

        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-green-700 mb-1">Strengths</p>
          <ul className="space-y-0.5">
            {concept.strengths.map((s, i) => (
              <li key={i} className="text-[11.5px] text-foreground flex items-start gap-1.5">
                <Check className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-amber-700 mb-1">Potential risks</p>
          <ul className="space-y-0.5">
            {concept.risks.map((r, i) => (
              <li key={i} className="text-[11.5px] text-muted-foreground flex items-start gap-1.5">
                <span className="text-amber-500 mt-0.5 shrink-0 text-[10px]">⚠</span>
                {r}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto pt-3">
          <Link href={concept.href}>
            <span
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 cursor-pointer"
              style={{ background: concept.accentColor }}
            >
              Open Prototype <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}

// ── CSS-composed thumbnails ───────────────────────────────────────────────────

function CommandCenterThumbnail() {
  return (
    <div className="w-full h-full p-3 flex flex-col gap-1.5" style={{ background: "hsl(35 52% 94%)" }}>
      {/* Top bar */}
      <div className="h-4 rounded bg-[#1B2A4A] flex items-center px-2 gap-1.5">
        <div className="w-2 h-1.5 rounded-sm bg-[#C87560]" />
        <div className="flex-1 h-1 rounded bg-white/10" />
        <div className="w-8 h-1.5 rounded-full bg-[#C87560]/80" />
      </div>
      {/* Metric row */}
      <div className="grid grid-cols-6 gap-1">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded bg-card border border-border h-6 flex flex-col items-center justify-center gap-0.5">
            <div className="w-3 h-1 rounded-sm bg-[#1B2A4A]" />
            <div className="w-4 h-0.5 rounded bg-muted" />
          </div>
        ))}
      </div>
      {/* Two-col row */}
      <div className="grid grid-cols-2 gap-1 flex-1">
        <div className="rounded bg-card border border-border p-1 space-y-0.5">
          {[40, 60, 80, 50].map((w, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-amber-400" />
              <div className="h-0.5 rounded bg-muted/60" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        <div className="rounded bg-card border border-border p-1 space-y-0.5">
          {["connected", "warning", "connected", "connected"].map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`w-1 h-1 rounded-full ${s === "connected" ? "bg-green-500" : "bg-amber-400"}`} />
              <div className="h-0.5 rounded bg-muted/60 flex-1" />
            </div>
          ))}
        </div>
      </div>
      {/* Table */}
      <div className="rounded bg-card border border-border p-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-1 py-0.5">
            <div className="w-1 h-1 rounded-full bg-[#C87560]" />
            <div className="h-0.5 rounded bg-muted/60 flex-1" />
            <div className="w-4 h-1 rounded-sm bg-green-500/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

function WorldGalleryThumbnail() {
  const COVERS = [
    "linear-gradient(135deg, #2D4A2A, #7A9B6A)",
    "linear-gradient(135deg, #1A3A4A, #4A8A9A)",
    "linear-gradient(135deg, #3A2A1A, #9A7A4A)",
  ];
  return (
    <div className="w-full h-full p-3 flex flex-col gap-1.5" style={{ background: "hsl(35 52% 94%)" }}>
      {/* Top bar */}
      <div className="h-4 rounded bg-card border border-border flex items-center px-2 gap-1.5">
        <div className="w-2 h-1.5 rounded-sm bg-[#1B2A4A]" />
        <div className="flex-1 h-1 rounded bg-muted" />
        <div className="w-6 h-2 rounded-full bg-[#C87560]" />
      </div>
      {/* Gallery grid */}
      <div className="grid grid-cols-3 gap-1.5 flex-1">
        {COVERS.map((c, i) => (
          <div key={i} className="rounded-lg overflow-hidden border border-border bg-card flex flex-col">
            <div className="h-10 w-full" style={{ background: c }} />
            <div className="p-1 space-y-0.5">
              <div className="h-1 rounded bg-muted w-full" />
              <div className="h-0.5 rounded bg-muted/50 w-3/4" />
              <div className="h-0.5 rounded bg-[#C87560]/40 w-1/2 mt-0.5" />
            </div>
          </div>
        ))}
      </div>
      {/* "New World" button placeholder */}
      <div className="rounded border-2 border-dashed border-border h-5 flex items-center justify-center">
        <div className="w-2 h-2 rounded-sm bg-[#C87560]/40" />
      </div>
    </div>
  );
}

function GuidedWorkspaceThumbnail() {
  return (
    <div className="w-full h-full p-3 flex flex-col gap-1.5" style={{ background: "hsl(35 52% 94%)" }}>
      {/* Welcome banner */}
      <div className="rounded-lg h-12 p-2 flex flex-col justify-between" style={{ background: "#1B2A4A" }}>
        <div className="w-8 h-1 rounded bg-white/30" />
        <div className="w-16 h-1.5 rounded bg-white/60" />
        <div className="w-12 h-0.5 rounded bg-white/30" />
      </div>
      {/* Primary action card */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 flex flex-col gap-1">
        <div className="w-10 h-0.5 rounded bg-muted" />
        <div className="w-20 h-1.5 rounded bg-foreground/20" />
        <div className="w-8 h-2.5 rounded-md bg-[#1B2A4A]" />
      </div>
      {/* Secondary actions grid */}
      <div className="grid grid-cols-2 gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded bg-card border border-border h-6 p-1 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#C87560]" />
            <div className="h-0.5 rounded bg-muted/60 flex-1" />
          </div>
        ))}
      </div>
      {/* Journey strip */}
      <div className="rounded bg-card border border-border p-1.5">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5, 6].map((i, idx) => (
            <div key={i} className="flex items-center flex-1">
              <div className={`w-2 h-2 rounded-full shrink-0 ${idx < 3 ? "bg-[#1B2A4A]" : idx === 3 ? "bg-[#C87560]" : "bg-muted"}`} />
              {idx < 5 && <div className={`flex-1 h-px ${idx < 3 ? "bg-[#1B2A4A]" : "bg-muted"}`} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
