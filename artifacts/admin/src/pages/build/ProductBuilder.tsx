/**
 * ProductBuilder — 3-step recipe-driven wizard.
 *
 * Renders the top bar + routes to Step 1, 2, or 3 based on wizard state.
 * No product-type logic anywhere in this file — the steps handle that via
 * recipe.parts + SECTION_LIBRARY.
 *
 * The component is mounted directly inside StoreAdminShell's content area
 * (or SuperAdminShell for platform test runs). It manages its own header
 * rather than relying on the shell's standard page header.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { storeStudiosApi, type OwnedList } from "@/lib/api";
import { useBuildState } from "./use-build-state";
import { Step1Product } from "./Step1Product";
import { Step2Theme } from "./Step2Theme";
import { Step3Confirm } from "./Step3Confirm";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK    = "#1B2A4A";
const CLAY   = "#C87560";
const BORDER = "var(--admin-border)";
const MUTED  = "var(--admin-slate)";

// ── Top bar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  storeId?: string;
  recipeName?: string;
  themeName?: string;
  step: 1 | 2 | 3;
  onClickRecipe: () => void;
  onClickTheme: () => void;
}

function BuildTopBar({ storeId, recipeName, themeName, step, onClickRecipe, onClickTheme }: TopBarProps) {
  const backHref = storeId ? `/store/${storeId}` : "/super";
  return (
    <div
      className="flex items-center gap-2 px-5 py-3 shrink-0 text-sm"
      style={{ borderBottom: `1px solid ${BORDER}`, background: "#FFFDF9" }}
    >
      {/* Back link */}
      <Link href={backHref}
        className="flex items-center gap-1 font-medium transition-opacity hover:opacity-70"
        style={{ color: MUTED, textDecoration: "none" }}>
        <ChevronLeft className="w-3.5 h-3.5" />
        {storeId ? "Store admin" : "Super admin"}
      </Link>

      <ChevronRight className="w-3.5 h-3.5" style={{ color: BORDER }} />

      <span className="font-semibold" style={{ color: INK }}>Product Builder</span>

      {/* Breadcrumb segments */}
      {step >= 2 && recipeName && (
        <>
          <ChevronRight className="w-3.5 h-3.5" style={{ color: BORDER }} />
          <button
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: step === 2 ? INK : MUTED }}
            onClick={onClickRecipe}
          >
            {recipeName}
          </button>
        </>
      )}

      {step === 3 && (
        <>
          {themeName && (
            <>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: BORDER }} />
              <button
                className="font-medium transition-opacity hover:opacity-70"
                style={{ color: MUTED }}
                onClick={onClickTheme}
              >
                {themeName}
              </button>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5" style={{ color: BORDER }} />
          <span className="font-semibold" style={{ color: INK }}>Confirm parts</span>
        </>
      )}
    </div>
  );
}

// ── Warning modal ─────────────────────────────────────────────────────────────

function DiscardModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(27,42,74,0.5)" }}
    >
      <div className="rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl"
        style={{ background: "#FFFDF9", border: `1px solid ${BORDER}` }}>
        <h3 className="font-display font-semibold text-xl mb-2" style={{ color: INK }}>
          Discard this build?
        </h3>
        <p className="text-sm mb-5" style={{ color: MUTED }}>
          You've changed at least one part. Going back to Step 1 resets everything — the sections and any edits you've made.
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
            style={{ background: "#E84040", color: "#fff" }}
            onClick={onConfirm}
          >
            Discard & start over
          </button>
          <button
            className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ border: `1px solid ${BORDER}`, color: MUTED }}
            onClick={onCancel}
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  /** When provided, the builder is store-scoped and shows the full 3 steps. */
  storeId?: string;
}

export default function ProductBuilder({ storeId }: Props) {
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);

  // Fetch store's owned catalog items (needed for Step 2 themes + Step 3 dynamic options)
  const { data: ownedList = null } = useQuery<OwnedList>({
    queryKey: ["store-owned", storeId ?? ""],
    queryFn: () => storeStudiosApi.list(storeId!),
    enabled: !!storeId,
    staleTime: 60_000,
  });

  const {
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
  } = useBuildState(ownedList);

  const { step, recipe, theme } = state;

  // ── Navigation guards ──────────────────────────────────────────────────────

  function handleBackToStep1() {
    if (hasEdits) {
      setPendingReset(true);
      setShowDiscardModal(true);
    } else {
      reset();
    }
  }

  function handleDiscardConfirm() {
    setShowDiscardModal(false);
    setPendingReset(false);
    reset();
  }

  // Go back to step 2 (theme picker) — preserves edits
  function handleBackToStep2() {
    goToStep(2);
  }

  // ── Platform-only mode (no storeId): just show Step 1 with a prompt ────────
  if (!storeId) {
    return (
      <div className="flex flex-col h-full" style={{ background: "#F7F0E6" }}>
        <BuildTopBar
          step={1}
          recipeName={recipe?.name}
          themeName={theme?.name}
          onClickRecipe={handleBackToStep1}
          onClickTheme={handleBackToStep2}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {step === 1 && (
            <Step1Product ownedList={null} onSelectRecipe={setRecipe} />
          )}
          {step !== 1 && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: MUTED }}>
                Select a store to continue past Step 1.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#F7F0E6" }}>
      {/* Top bar with growing breadcrumb */}
      <BuildTopBar
        storeId={storeId}
        step={step}
        recipeName={recipe?.name}
        themeName={theme?.name}
        onClickRecipe={handleBackToStep1}
        onClickTheme={handleBackToStep2}
      />

      {/* Step switcher */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        {step === 1 && (
          <Step1Product ownedList={ownedList} onSelectRecipe={setRecipe} />
        )}

        {step === 2 && recipe && (
          <Step2Theme
            recipe={recipe}
            ownedList={ownedList}
            onSelectTheme={setTheme}
            onSkipTheme={skipTheme}
            onBack={handleBackToStep1}
          />
        )}

        {step === 3 && recipe && (
          <Step3Confirm
            state={state}
            confirmedCount={confirmedCount}
            totalSections={totalSections}
            allConfirmed={allConfirmed}
            ownedList={ownedList}
            onSelectOption={setSelection}
            onConfirmAndAdvance={confirmAndAdvance}
            onAcceptAllRemaining={acceptAllRemaining}
            onRevertToThemeDefault={revertToThemeDefault}
            onGoToSection={goToSection}
            onBack={handleBackToStep2}
            onBackToStep1={handleBackToStep1}
          />
        )}
      </div>

      {/* Discard warning modal */}
      {showDiscardModal && (
        <DiscardModal
          onConfirm={handleDiscardConfirm}
          onCancel={() => { setShowDiscardModal(false); setPendingReset(false); }}
        />
      )}
    </div>
  );
}
