/**
 * Step 3 — Confirm each part.
 *
 * Layout:
 *   LEFT RAIL  — independent scroll: checklist + progress + exclusion footer
 *   CENTRE     — independent scroll: current section editor
 *
 * Zero product-type branches. Every section is rendered from SECTION_LIBRARY
 * using the IDs in recipe.parts. The layout adapts to any number of parts.
 */
import { Check, Sparkles, RotateCcw, ChevronLeft } from "lucide-react";
import {
  SECTION_LIBRARY,
  resolveThemeDefault,
  resolveDynamicOptions,
  type SectionOption,
} from "./section-library";
import type { BuildState, SectionState } from "./use-build-state";
import type { OwnedList } from "@/lib/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK    = "#1B2A4A";
const CLAY   = "#C87560";
const PAPER  = "var(--admin-paper)";
const BORDER = "var(--admin-border)";
const CARD   = "var(--admin-card)";
const MUTED  = "var(--admin-slate)";
const GREEN  = "#22A66B";
const BLUSH  = "rgba(200,117,96,0.08)";
const EYEBROW: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
  textTransform: "uppercase", color: MUTED,
};

// ── Palette swatch renderer ───────────────────────────────────────────────────

function SwatchDot({ swatch, size = 20 }: { swatch: string; size?: number }) {
  if (swatch.startsWith("palette:")) {
    const colors = swatch.slice(8).split(",").filter(Boolean).slice(0, 4);
    return (
      <div className="flex rounded overflow-hidden shrink-0"
        style={{ width: size, height: size, border: `1px solid ${BORDER}` }}>
        {colors.map((c, i) => (
          <div key={i} style={{ background: c, flex: 1, height: "100%" }} />
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-full shrink-0"
      style={{ width: size, height: size, background: swatch, border: `1px solid rgba(0,0,0,0.08)` }} />
  );
}

// ── Left rail ─────────────────────────────────────────────────────────────────

function RailRow({
  idx, sectionId, sel, isActive, total,
  onClick,
}: {
  idx: number;
  sectionId: string;
  sel: SectionState | undefined;
  isActive: boolean;
  total: number;
  onClick: () => void;
}) {
  const section = SECTION_LIBRARY[sectionId];
  const label = section?.title ?? sectionId;
  const confirmed = sel?.confirmed ?? false;
  const isEdited = sel?.isEdited ?? false;
  const optionId = sel?.optionId ?? "";
  // Friendly option name: find it in the section's options list
  const optionName = section?.options.find((o) => o.id === optionId)?.name ?? optionId;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-2.5 px-4 py-2.5 transition-colors"
      style={{
        background: isActive ? "rgba(200,117,96,0.08)" : "transparent",
        borderLeft: isActive ? `3px solid ${CLAY}` : "3px solid transparent",
      }}
    >
      {/* Number/check tile */}
      <div
        className="flex items-center justify-center rounded shrink-0 text-[11px] font-bold"
        style={{
          width: 22, height: 22, marginTop: 1,
          background: confirmed ? GREEN : isActive ? CLAY : "transparent",
          border: confirmed || isActive ? "none" : `1.5px solid ${BORDER}`,
          color: confirmed || isActive ? "#fff" : MUTED,
        }}
      >
        {confirmed ? <Check className="w-3 h-3" /> : idx + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold truncate" style={{ color: INK }}>{label}</span>
          {isEdited && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded"
              style={{ background: "hsl(12 70% 90%)", color: CLAY, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              EDITED
            </span>
          )}
        </div>
        {optionName && (
          <p className="text-[11px] truncate mt-0.5" style={{ color: MUTED }}>{optionName}</p>
        )}
      </div>
    </button>
  );
}

// ── Options grid ─────────────────────────────────────────────────────────────

function OptionCard({
  option, isSelected, isThemeDefault, onClick,
}: {
  option: SectionOption;
  isSelected: boolean;
  isThemeDefault: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-4 transition-all"
      style={{
        background: isSelected ? "rgba(200,117,96,0.08)" : CARD,
        border: isSelected ? `2px solid ${CLAY}` : `1px solid ${BORDER}`,
        outline: "none",
      }}
    >
      <div className="flex items-start gap-3">
        <SwatchDot swatch={option.swatch} size={18} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: INK }}>{option.name}</span>
            {isThemeDefault && (
              <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                style={{ background: "rgba(200,117,96,0.15)", color: CLAY, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                THEME
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{option.desc}</p>
        </div>
        {isSelected && (
          <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: CLAY }} />
        )}
      </div>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  state: BuildState;
  confirmedCount: number;
  totalSections: number;
  allConfirmed: boolean;
  ownedList: OwnedList | null;
  onSelectOption: (sectionId: string, optionId: string) => void;
  onConfirmAndAdvance: (sectionId: string) => void;
  onAcceptAllRemaining: () => void;
  onRevertToThemeDefault: (sectionId: string) => void;
  onGoToSection: (idx: number) => void;
  onBack: () => void;
  onBackToStep1: () => void;
}

export function Step3Confirm({
  state,
  confirmedCount,
  totalSections,
  allConfirmed,
  ownedList,
  onSelectOption,
  onConfirmAndAdvance,
  onAcceptAllRemaining,
  onRevertToThemeDefault,
  onGoToSection,
  onBack,
  onBackToStep1,
}: Props) {
  const { recipe, theme, currentIdx, selections } = state;
  if (!recipe) return null;

  const parts = recipe.parts;
  const sectionId = parts[currentIdx] ?? parts[0];
  const section = SECTION_LIBRARY[sectionId];
  const sel = selections[sectionId];
  const selectedOptionId = sel?.optionId ?? "";
  const isEdited = sel?.isEdited ?? false;
  const isOnLast = currentIdx === parts.length - 1;

  // Resolve options (static or dynamic)
  const options: SectionOption[] = section?.dynamic
    ? resolveDynamicOptions(sectionId, ownedList, theme)
    : (section?.options ?? []);

  // The theme default for this section
  const themeDefault = resolveThemeDefault(sectionId, theme, ownedList);
  const themeDefaultOptionId = themeDefault?.optionId ?? null;

  // Exclusion line for the "NOT USED" card
  const cb = recipe.claudeBrief as Record<string, unknown> | null;
  const exclusionLine =
    typeof cb?.exclusion === "string"
      ? cb.exclusion
      : Array.isArray(cb?.asks) && typeof (cb?.asks as unknown[])[0] === "string"
        ? (cb!.asks as string[])[0]
        : null;

  const progressPct = totalSections > 0 ? (confirmedCount / totalSections) * 100 : 0;
  const nounLabel = recipe.name.toLowerCase();
  const leftToConfirm = totalSections - confirmedCount;

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">

      {/* ── LEFT RAIL ──────────────────────────────────────────── */}
      <div
        className="w-64 flex flex-col flex-shrink-0 overflow-hidden"
        style={{ borderRight: `1px solid ${BORDER}`, background: CARD }}
      >
        {/* Rail header */}
        <div className="px-4 pt-5 pb-3 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p style={EYEBROW} className="mb-2">Step 3 of 3</p>

          {/* Recipe + change */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold truncate" style={{ color: INK }}>{recipe.name}</span>
            <button className="text-[11px] ml-2 shrink-0 transition-opacity hover:opacity-70"
              style={{ color: CLAY }} onClick={onBackToStep1}>Change</button>
          </div>

          {/* Theme + change */}
          {theme ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] truncate" style={{ color: MUTED }}>
                Pre-filled from {theme.name}
              </span>
              <button className="text-[11px] ml-2 shrink-0 transition-opacity hover:opacity-70"
                style={{ color: CLAY }} onClick={onBack}>Change</button>
            </div>
          ) : (
            <span className="text-[11px]" style={{ color: MUTED }}>No theme</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-1.5">
            <p style={EYEBROW}>Parts confirmed</p>
            <span className="text-xs font-semibold" style={{ color: INK }}>{confirmedCount}/{totalSections}</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 4, background: BORDER }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, background: CLAY }}
            />
          </div>
        </div>

        {/* Section checklist */}
        <div className="flex-1 overflow-y-auto py-1">
          {parts.map((id, i) => (
            <RailRow
              key={id}
              idx={i}
              sectionId={id}
              sel={selections[id]}
              isActive={i === currentIdx}
              total={parts.length}
              onClick={() => onGoToSection(i)}
            />
          ))}
        </div>

        {/* "Not used" footer */}
        {exclusionLine && (
          <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
            <p style={EYEBROW} className="mb-1">Not used by this product</p>
            <p className="text-[11px] leading-relaxed" style={{ color: MUTED, fontStyle: "italic" }}>
              {exclusionLine}
            </p>
          </div>
        )}

        {/* Generate button */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button
            disabled={!allConfirmed}
            className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity"
            style={{
              background: allConfirmed ? CLAY : BORDER,
              color: allConfirmed ? "#fff" : MUTED,
              cursor: allConfirmed ? "pointer" : "not-allowed",
              opacity: allConfirmed ? 1 : 0.7,
            }}
          >
            Generate the {nounLabel}
          </button>
          {!allConfirmed && (
            <p className="text-[11px] text-center mt-1.5" style={{ color: MUTED }}>
              {leftToConfirm} part{leftToConfirm !== 1 ? "s" : ""} left to confirm
            </p>
          )}
        </div>
      </div>

      {/* ── CENTRE PANE ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto px-8 py-7">

          {/* Eyebrow */}
          <p style={EYEBROW} className="mb-1">
            Part {currentIdx + 1} of {parts.length}
          </p>

          {/* Section heading */}
          <h2 className="font-display font-semibold text-3xl mb-2" style={{ color: INK }}>
            {section?.title ?? sectionId}
          </h2>

          {/* Description */}
          {section?.description && (
            <p className="text-sm mb-1 leading-relaxed" style={{ color: MUTED }}>
              {section.description}
            </p>
          )}
          {section?.limitNote && (
            <p className="text-xs mb-3 font-medium" style={{ color: MUTED }}>
              {section.limitNote}
            </p>
          )}

          {/* Ask Claude button */}
          <button
            className="flex items-center gap-1.5 text-xs font-medium mt-2 mb-5 rounded-full px-3 py-1.5 transition-opacity hover:opacity-80"
            style={{ background: "rgba(200,117,96,0.08)", color: CLAY, border: `1px solid rgba(200,117,96,0.2)` }}
          >
            <Sparkles className="w-3 h-3" /> Ask Claude about this section
          </button>

          {/* FROM YOUR THEME card */}
          {theme && themeDefault && (
            <div
              className="rounded-xl p-4 mb-5"
              style={{ background: BLUSH, border: `1px solid rgba(200,117,96,0.25)` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p style={EYEBROW} className="mb-0.5">From your theme · {theme.name}</p>
                  <p className="text-sm font-semibold" style={{ color: INK }}>{themeDefault.label}</p>
                  {section?.themeRationale && (
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: MUTED }}>
                      {section.themeRationale}
                    </p>
                  )}
                </div>
                {isEdited && (
                  <button
                    className="shrink-0 flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-70"
                    style={{ color: CLAY, whiteSpace: "nowrap" }}
                    onClick={() => onRevertToThemeDefault(sectionId)}
                  >
                    <RotateCcw className="w-3 h-3" /> Put it back
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options grid label */}
          {section && (
            <div className="mb-2">
              <p style={EYEBROW}>{section.optionGroupLabel}</p>
              {section.optionGroupNote && (
                <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{section.optionGroupNote}</p>
              )}
            </div>
          )}

          {/* Options grid */}
          {options.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: MUTED }}>
              No options available — add {sectionId === "palette" ? "palettes" : "packs"} in your store first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {options.map((opt) => (
                <OptionCard
                  key={opt.id}
                  option={opt}
                  isSelected={selectedOptionId === opt.id}
                  isThemeDefault={opt.id === themeDefaultOptionId}
                  onClick={() => onSelectOption(sectionId, opt.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div
          className="shrink-0 px-8 py-4 flex items-center gap-3"
          style={{ borderTop: `1px solid ${BORDER}`, background: CARD }}
        >
          <button
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              background: selectedOptionId ? CLAY : BORDER,
              color: selectedOptionId ? "#fff" : MUTED,
              cursor: selectedOptionId ? "pointer" : "not-allowed",
            }}
            disabled={!selectedOptionId}
            onClick={() => onConfirmAndAdvance(sectionId)}
          >
            {isOnLast ? "Confirm · done" : "Confirm · next part →"}
          </button>

          <button
            className="px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-70"
            style={{ border: `1px solid ${BORDER}`, color: MUTED, background: CARD, whiteSpace: "nowrap" }}
            onClick={onAcceptAllRemaining}
          >
            Accept the rest as-is
          </button>
        </div>
      </div>
    </div>
  );
}
