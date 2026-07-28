/**
 * Step 1 — What are you making?
 *
 * 1. "Next year" fast-path card (most common job, appears first)
 * 2. OR START SOMETHING NEW divider
 * 3. 2×2 recipe grid driven by the live product_recipes table
 * 4. Claude "not on this list" card
 *
 * Zero product-type branches. The recipe data drives everything.
 */
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Sparkles, ArrowRight } from "lucide-react";
import { recipesApi, type ProductRecipe, type OwnedList } from "@/lib/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK    = "#1B2A4A";
const CLAY   = "#C87560";
const BORDER = "#E7DCCB";
const CARD   = "#FFFDF9";
const MUTED  = "#4A6080";
const EYEBROW: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
  textTransform: "uppercase", color: MUTED,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function recipeGlyph(recipe: ProductRecipe): string {
  const n = recipe.name.toLowerCase();
  if (n.includes("dated") || n.includes("planner")) return "📓";
  if (n.includes("advent"))                          return "🎁";
  if (n.includes("journal"))                         return "📔";
  if (n.includes("notebook"))                        return "📗";
  return "📦";
}

function isNewRecipe(recipe: ProductRecipe): boolean {
  const rel = recipe.release as { month?: number; year?: number } | null;
  if (!rel?.month || !rel?.year) return false;
  const releaseMs = new Date(rel.year, rel.month - 1).getTime();
  return Date.now() - releaseMs < 90 * 24 * 60 * 60 * 1000;
}

function exclusionLine(recipe: ProductRecipe): string {
  const cb = recipe.claudeBrief as Record<string, unknown> | null;
  if (!cb) return "";
  if (typeof cb.exclusion === "string") return cb.exclusion;
  const asks = cb.asks;
  if (Array.isArray(asks) && typeof asks[0] === "string") return asks[0];
  return "";
}

function recipeBlurb(recipe: ProductRecipe): string {
  const cb = recipe.claudeBrief as Record<string, unknown> | null;
  if (typeof cb?.generates === "string") return cb.generates;
  return "";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PartChip({ label }: { label: string }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: "rgba(200,117,96,0.10)", color: CLAY,
        whiteSpace: "nowrap", border: `1px solid ${BORDER}`,
      }}
    >
      {label}
    </span>
  );
}

function RecipeCard({ recipe, onClick }: { recipe: ProductRecipe; onClick: () => void }) {
  const excl = exclusionLine(recipe);
  const blurb = recipeBlurb(recipe);
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-5 transition-shadow hover:shadow-md w-full"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}
    >
      <div className="flex items-start gap-3 mb-2">
        <span className="text-2xl leading-none mt-0.5 shrink-0">{recipeGlyph(recipe)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: INK }}>{recipe.name}</span>
            {isNewRecipe(recipe) && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "hsl(12 70% 90%)", color: CLAY, letterSpacing: "0.06em" }}>
                NEW
              </span>
            )}
          </div>
          {blurb && (
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: MUTED }}>{blurb}</p>
          )}
        </div>
      </div>

      {/* Part chips — white-space:nowrap already on each chip */}
      <div className="flex flex-wrap gap-1.5 mt-3 mb-2">
        {(recipe.parts ?? []).map((p) => (
          <PartChip key={p} label={p.replace(/-/g, " ")} />
        ))}
      </div>

      {/* Exclusion line */}
      {excl && (
        <p className="text-[11px] leading-relaxed mt-1" style={{ color: MUTED, fontStyle: "italic" }}>
          {excl}
        </p>
      )}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  ownedList: OwnedList | null;
  onSelectRecipe: (recipe: ProductRecipe) => void;
}

export function Step1Product({ ownedList, onSelectRecipe }: Props) {
  const { data: recipes = [], isLoading } = useQuery<ProductRecipe[]>({
    queryKey: ["platform-recipes"],
    queryFn:  () => recipesApi.list(),
    staleTime: 60_000,
  });

  const liveRecipes = recipes.filter((r) => r.status === "live");
  const editionCount = ownedList?.editions?.length ?? 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">

        <p style={EYEBROW} className="mb-2">Step 1 of 3</p>
        <h1 className="font-display font-semibold text-3xl mb-1.5" style={{ color: INK }}>
          What are you making?
        </h1>
        <p className="text-sm mb-8" style={{ color: MUTED }}>
          Each product asks only for the parts it actually uses. Pick one and the rest of the builder shapes itself around it.
        </p>

        {/* ── Fast path ───────────────────────────────────────── */}
        <button
          className="w-full text-left rounded-xl p-5 mb-8 flex items-start gap-4 transition-shadow hover:shadow-md"
          style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${INK}` }}
          onClick={() => { /* Round 2: roll-year flow */ }}
        >
          <RefreshCw className="w-5 h-5 mt-0.5 shrink-0" style={{ color: INK }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: INK }}>
                Next year of something you already sell
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: INK, color: "#fff", letterSpacing: "0.06em" }}>
                FASTEST
              </span>
            </div>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: MUTED }}>
              Carries every setting forward and rolls the dates. Your 2026 Daily becomes the 2027 Daily — nothing to re-decide.
            </p>
          </div>
          {editionCount > 0 && (
            <div className="shrink-0 flex items-center gap-1 text-xs font-medium whitespace-nowrap" style={{ color: CLAY }}>
              {editionCount} edition{editionCount !== 1 ? "s" : ""} ready
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          )}
        </button>

        {/* ── Divider ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px" style={{ background: BORDER }} />
          <p style={EYEBROW}>Or start something new</p>
          <div className="flex-1 h-px" style={{ background: BORDER }} />
        </div>

        {/* ── Recipe grid ─────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl h-44 animate-pulse" style={{ background: BORDER }} />
            ))}
          </div>
        ) : liveRecipes.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: MUTED }}>
            No live recipes yet — publish one in the Recipes admin to see it here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {liveRecipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} onClick={() => onSelectRecipe(recipe)} />
            ))}
          </div>
        )}

        {/* ── Claude card ─────────────────────────────────────── */}
        <div
          className="mt-6 rounded-xl p-5 flex items-start gap-3"
          style={{ background: "rgba(200,117,96,0.06)", border: "1px solid rgba(200,117,96,0.25)" }}
        >
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: CLAY }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: INK }}>Something not on this list?</p>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              New product types arrive as recipes — you don't wait for an update.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
