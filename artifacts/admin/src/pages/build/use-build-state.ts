/**
 * useBuildState — wizard state for Product Builder.
 *
 * Persists the in-progress build to localStorage on every change so
 * closing the tab never loses work.
 */
import { useState, useCallback, useEffect } from "react";
import type { ProductRecipe, OwnedTheme, OwnedList } from "@/lib/api";
import { resolveThemeDefault } from "./section-library";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectionState {
  optionId: string;
  confirmed: boolean;
  /** True when the user explicitly changed from the theme's default value. */
  isEdited: boolean;
}

export interface BuildState {
  recipe: ProductRecipe | null;
  theme: OwnedTheme | null;
  noTheme: boolean;
  step: 1 | 2 | 3;
  currentIdx: number;
  selections: Record<string, SectionState>;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const DRAFT_KEY = "daybook_product_builder_draft";

const EMPTY: BuildState = {
  recipe: null,
  theme: null,
  noTheme: false,
  step: 1,
  currentIdx: 0,
  selections: {},
};

function loadDraft(): BuildState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as BuildState) };
  } catch {
    return EMPTY;
  }
}

function saveDraft(s: BuildState) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds the initial selections map for a recipe + theme combination.
 * When prevSelections is supplied (theme change), explicitly edited sections
 * are preserved and only unedited ones get the new theme's default.
 */
function buildSelections(
  recipe: ProductRecipe,
  theme: OwnedTheme | null,
  ownedList: OwnedList | null,
  prev: Record<string, SectionState> = {},
): Record<string, SectionState> {
  const out: Record<string, SectionState> = {};
  for (const sectionId of recipe.parts) {
    const prevSel = prev[sectionId];
    const def = resolveThemeDefault(sectionId, theme, ownedList);
    if (prevSel?.isEdited) {
      // User explicitly changed this — keep even after a theme swap
      out[sectionId] = { ...prevSel, confirmed: false };
    } else if (def) {
      out[sectionId] = { optionId: def.optionId, confirmed: false, isEdited: false };
    } else {
      out[sectionId] = prevSel ?? { optionId: "", confirmed: false, isEdited: false };
    }
  }
  return out;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBuildState(ownedList: OwnedList | null) {
  const [state, setState] = useState<BuildState>(loadDraft);

  useEffect(() => { saveDraft(state); }, [state]);

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Step 1 → Step 2: pick a recipe, reset everything else. */
  const setRecipe = useCallback((recipe: ProductRecipe) => {
    setState({ ...EMPTY, recipe, step: 2 });
  }, []);

  /** Step 2 → Step 3: pick a theme, apply defaults (preserve prior edits). */
  const setTheme = useCallback((theme: OwnedTheme) => {
    setState((prev) => {
      if (!prev.recipe) return prev;
      return {
        ...prev,
        theme,
        noTheme: false,
        step: 3,
        currentIdx: 0,
        selections: buildSelections(prev.recipe, theme, ownedList, prev.selections),
      };
    });
  }, [ownedList]);

  /** Step 2 → Step 3: skip the theme, no defaults. */
  const skipTheme = useCallback(() => {
    setState((prev) => {
      if (!prev.recipe) return prev;
      return {
        ...prev,
        theme: null,
        noTheme: true,
        step: 3,
        currentIdx: 0,
        selections: buildSelections(prev.recipe, null, ownedList),
      };
    });
  }, [ownedList]);

  /** Update which option is selected for a section (without confirming). */
  const setSelection = useCallback((sectionId: string, optionId: string) => {
    setState((prev) => {
      const def = resolveThemeDefault(sectionId, prev.theme, ownedList);
      const isEdited = !!def && optionId !== def.optionId;
      return {
        ...prev,
        selections: {
          ...prev.selections,
          [sectionId]: {
            optionId,
            confirmed: prev.selections[sectionId]?.confirmed ?? false,
            isEdited,
          },
        },
      };
    });
  }, [ownedList]);

  /** Confirm the current section and advance to the next one in the list. */
  const confirmAndAdvance = useCallback((sectionId: string) => {
    setState((prev) => {
      if (!prev.recipe) return prev;
      const sel = prev.selections[sectionId];
      const optionId = sel?.optionId ?? "";
      const def = resolveThemeDefault(sectionId, prev.theme, ownedList);
      const isEdited = !!def && !!optionId && optionId !== def.optionId;

      const newSelections = {
        ...prev.selections,
        [sectionId]: { optionId, confirmed: true, isEdited },
      };

      const parts = prev.recipe.parts;
      const nextIdx =
        prev.currentIdx + 1 < parts.length ? prev.currentIdx + 1 : prev.currentIdx;

      return { ...prev, selections: newSelections, currentIdx: nextIdx };
    });
  }, [ownedList]);

  /** Revert a section to the theme's default (clears EDITED). */
  const revertToThemeDefault = useCallback((sectionId: string) => {
    setState((prev) => {
      const def = resolveThemeDefault(sectionId, prev.theme, ownedList);
      if (!def) return prev;
      return {
        ...prev,
        selections: {
          ...prev.selections,
          [sectionId]: { optionId: def.optionId, confirmed: false, isEdited: false },
        },
      };
    });
  }, [ownedList]);

  /** Confirm every remaining unconfirmed section in one click. */
  const acceptAllRemaining = useCallback(() => {
    setState((prev) => {
      if (!prev.recipe) return prev;
      const updated = { ...prev.selections };
      for (const sectionId of prev.recipe.parts) {
        if (!updated[sectionId]?.confirmed) {
          const sel = updated[sectionId];
          updated[sectionId] = {
            optionId: sel?.optionId ?? "",
            confirmed: true,
            isEdited: sel?.isEdited ?? false,
          };
        }
      }
      return { ...prev, selections: updated };
    });
  }, []);

  const goToStep = useCallback((step: 1 | 2 | 3) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const goToSection = useCallback((idx: number) => {
    setState((prev) => ({ ...prev, currentIdx: idx }));
  }, []);

  /** Full reset — clears draft. Caller is responsible for any warning modal. */
  const reset = useCallback(() => {
    clearDraft();
    setState(EMPTY);
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────

  const parts = state.recipe?.parts ?? [];
  const confirmedCount = parts.filter((id) => state.selections[id]?.confirmed).length;
  const totalSections = parts.length;
  const allConfirmed = totalSections > 0 && confirmedCount === totalSections;
  const hasEdits = Object.values(state.selections).some((s) => s.isEdited);

  return {
    state,
    confirmedCount,
    totalSections,
    allConfirmed,
    hasEdits,
    setRecipe,
    setTheme,
    skipTheme,
    setSelection,
    confirmAndAdvance,
    revertToThemeDefault,
    acceptAllRemaining,
    goToStep,
    goToSection,
    reset,
  };
}
