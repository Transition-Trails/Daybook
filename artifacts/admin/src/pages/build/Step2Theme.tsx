/**
 * Step 2 — Start from a theme.
 *
 * LEFT:  list of the store's themes (owned + starter + licensed)
 * RIGHT: "WHAT THIS FILLS IN" payoff panel for the hovered/selected theme
 *
 * Zero product-type branches. The payoff panel rows are generated from
 * `recipe.parts.map(id => resolveThemeDefault(id, theme, ownedList))`.
 */
import { useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { type ProductRecipe, type OwnedTheme, type OwnedList } from "@/lib/api";
import { SECTION_LIBRARY, resolveThemeDefault } from "./section-library";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK    = "#1B2A4A";
const CLAY   = "#C87560";
const PAPER  = "#F7F0E6";
const BORDER = "#E7DCCB";
const CARD   = "#FFFDF9";
const MUTED  = "#4A6080";
const GREEN  = "#22A66B";
const EYEBROW: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
  textTransform: "uppercase", color: MUTED,
};

// ── Colour-stack swatch ───────────────────────────────────────────────────────

function ColourStack({ colors }: { colors: string[] }) {
  const show = colors.slice(0, 4);
  return (
    <div className="flex rounded overflow-hidden shrink-0" style={{ width: 32, height: 32 }}>
      {show.length === 0 ? (
        <div className="w-full h-full" style={{ background: BORDER }} />
      ) : show.map((c, i) => (
        <div
          key={i}
          style={{ background: c, flex: 1, height: "100%" }}
        />
      ))}
    </div>
  );
}

// ── Origin badge ──────────────────────────────────────────────────────────────

function OriginBadge({ origin }: { origin: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    owned:    { label: "Yours",    bg: "rgba(27,42,74,0.1)",  color: INK   },
    starter:  { label: "Starter",  bg: "rgba(200,117,96,0.1)", color: CLAY  },
    licensed: { label: "Licensed", bg: "rgba(74,96,128,0.1)", color: MUTED },
  };
  const { label, bg, color } = map[origin] ?? map.owned;
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: bg, color, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

// ── Good-fit badge ────────────────────────────────────────────────────────────

function GoodFitBadge() {
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: "hsl(142 50% 90%)", color: GREEN, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      Good fit
    </span>
  );
}

// ── Theme row ─────────────────────────────────────────────────────────────────

function ThemeRow({
  theme,
  isSelected,
  isHovered,
  onMouseEnter,
  onClick,
}: {
  theme: OwnedTheme;
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const active = isSelected || isHovered;
  const fp = theme.fontPairing;
  const fontLine = [fp?.heading, fp?.body].filter(Boolean).join(" / ") || null;
  const palCount = theme.palettes?.length ?? 0;

  const contentsLine = [
    palCount > 0 ? `${palCount} palette${palCount !== 1 ? "s" : ""}` : null,
    fontLine,
  ].filter(Boolean).join(" · ");

  return (
    <button
      className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors"
      style={{
        background: active ? "rgba(200,117,96,0.08)" : "transparent",
        borderLeft: active ? `3px solid ${CLAY}` : "3px solid transparent",
      }}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <ColourStack colors={theme.colors ?? []} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm truncate" style={{ color: INK, whiteSpace: "nowrap" }}>
            {theme.name}
          </span>
          <OriginBadge origin={theme.origin ?? "owned"} />
          <GoodFitBadge />
        </div>
        {contentsLine && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: MUTED }}>{contentsLine}</p>
        )}
      </div>
      {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: CLAY }} />}
    </button>
  );
}

// ── Payoff panel ──────────────────────────────────────────────────────────────

function PayoffPanel({
  theme,
  recipe,
  ownedList,
  onUse,
}: {
  theme: OwnedTheme;
  recipe: ProductRecipe;
  ownedList: OwnedList | null;
  onUse: () => void;
}) {
  return (
    <div
      className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{ border: `1px solid ${BORDER}`, background: CARD }}
    >
      <div className="px-5 pt-4 pb-3 border-b shrink-0" style={{ borderColor: BORDER }}>
        <p style={EYEBROW} className="mb-1">What this fills in</p>
        <p className="font-display font-semibold text-xl" style={{ color: INK }}>{theme.name}</p>
        {theme.desc && (
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>{theme.desc}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {recipe.parts.map((sectionId) => {
          const def = resolveThemeDefault(sectionId, theme, ownedList);
          const section = SECTION_LIBRARY[sectionId];
          const label = section?.title ?? sectionId;
          return (
            <div key={sectionId} className="flex items-center justify-between py-2 border-b last:border-0"
              style={{ borderColor: BORDER }}>
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 shrink-0" style={{ color: GREEN }} />
                <span className="text-sm" style={{ color: INK }}>{label}</span>
              </div>
              <span className="text-xs font-medium" style={{ color: MUTED, whiteSpace: "nowrap" }}>
                {def?.label ?? "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-5 pt-3 shrink-0">
        <p className="text-xs mb-3" style={{ color: MUTED }}>
          All {recipe.parts.length} parts filled in. Confirm each one, change what you like,
          or accept the lot in one click.
        </p>
        <button
          className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: CLAY, color: "#fff" }}
          onClick={onUse}
        >
          Use this theme →
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  recipe: ProductRecipe;
  ownedList: OwnedList | null;
  onSelectTheme: (theme: OwnedTheme) => void;
  onSkipTheme: () => void;
  onBack: () => void;
}

export function Step2Theme({ recipe, ownedList, onSelectTheme, onSkipTheme, onBack }: Props) {
  const themes = ownedList?.themes ?? [];
  const [hovered, setHovered] = useState<string | null>(themes[0]?.id ?? null);
  const [selected, setSelected] = useState<string | null>(null);

  const activeId = selected ?? hovered ?? themes[0]?.id ?? null;
  const activeTheme = themes.find((t) => t.id === activeId) ?? themes[0] ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Step header */}
      <div className="px-6 pt-8 pb-4 shrink-0">
        <button
          className="flex items-center gap-1 text-xs mb-4 transition-opacity hover:opacity-70"
          style={{ color: MUTED }}
          onClick={onBack}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <p style={{ ...EYEBROW, display: "block" }} className="mb-1">Step 2 of 3 · {recipe.name}</p>
        <h1 className="font-display font-semibold text-3xl" style={{ color: INK }}>
          Start from a theme
        </h1>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          A theme fills in {recipe.parts.length} of the parts this {recipe.name.toLowerCase()} needs. You confirm each one next and change anything you like.
        </p>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 gap-6 px-6 pb-8 overflow-hidden min-h-0">

        {/* LEFT: theme list */}
        <div className="w-80 shrink-0 flex flex-col rounded-xl overflow-hidden"
          style={{ border: `1px solid ${BORDER}`, background: CARD }}>
          <div className="flex-1 overflow-y-auto divide-y divide-[#E7DCCB]">
            {themes.length === 0 && (
              <p className="text-sm text-center py-10 px-4" style={{ color: MUTED }}>
                No themes yet — create one in Theme Studio first.
              </p>
            )}
            {themes.map((theme) => (
              <ThemeRow
                key={theme.id}
                theme={theme}
                isSelected={selected === theme.id}
                isHovered={hovered === theme.id && selected === null}
                onMouseEnter={() => setHovered(theme.id)}
                onClick={() => {
                  setSelected(theme.id);
                  setHovered(null);
                }}
              />
            ))}
          </div>

          {/* Start without a theme */}
          <button
            className="w-full text-left px-4 py-3 text-sm transition-colors hover:bg-[rgba(0,0,0,0.03)]"
            style={{ borderTop: `1px dashed ${BORDER}`, color: MUTED }}
            onClick={onSkipTheme}
          >
            Start without a theme
            <span className="block text-[11px] mt-0.5">You'll choose every part yourself. Slower, and nothing is pre-matched.</span>
          </button>
        </div>

        {/* RIGHT: payoff panel */}
        <div className="flex-1 min-w-0">
          {activeTheme ? (
            <PayoffPanel
              theme={activeTheme}
              recipe={recipe}
              ownedList={ownedList}
              onUse={() => onSelectTheme(activeTheme)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center rounded-xl h-full"
              style={{ border: `1px dashed ${BORDER}` }}>
              <p className="text-sm" style={{ color: MUTED }}>Hover a theme to see what it fills in</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
