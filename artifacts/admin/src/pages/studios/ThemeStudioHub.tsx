/**
 * ThemeStudioHub — Platform-admin Theme Studio.
 *
 * Three modes: Compose (build a theme bundle slot-by-slot) · Library (browse
 * all themes) · Asset catalog (browse all 9 catalog types in one grid).
 *
 * The left rail shows 9 bundle slot rows with count badges and a completeness
 * progress bar.  The right dock offers an AI bundle composer (Preview tab) and
 * a general Q&A assistant (Assistant tab).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import {
  Sparkles, Check, X, Plus, Minus, ChevronRight,
  Loader2, Save, RefreshCw, BookOpen, Layers3,
  Palette, FileImage, Sticker, Layout, Clapperboard,
  Cpu, Paperclip, Type,
} from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import { aiApi } from "@/lib/ai";
import { apiFetch } from "@/lib/api";
import { useFontLoader } from "@/components/FontSpecimenCard";

// ─── Design tokens ────────────────────────────────────────────────────────────
const CLAY         = "#C87560";  // clay / primary – used for CTA buttons, glyphs
const INK_NAVY     = "#1B2A4A";  // active rail, button fills
const CANVAS_BG    = "#F9F6F2";  // off-white
const SLOT_ACTIVE  = INK_NAVY;
const SUGGESTED_BORDER = CLAY;
const ATTACHED_BORDER  = "#22C55E";  // green-500

// ─── Slot definitions (9 slots = the theme bundle) ────────────────────────────
const SLOT_DEFS = [
  { id: "palettes",    label: "Colour palettes",  glyph: "🎨", desc: "Primary and accent colour sets that drive fills, ink, and highlights throughout every page." },
  { id: "backgrounds", label: "Backgrounds",       glyph: "🖼️", desc: "Texture or colour washes applied behind page content, from subtle linen to bold gradient sweeps." },
  { id: "packs",       label: "Sticker packs",     glyph: "✦",  desc: "Curated sets of decorative stickers sellers can apply to any spread in the planner." },
  { id: "inserts",     label: "Inserts",            glyph: "📄", desc: "Pre-built PDF content pages (trackers, dashboards, journaling sheets) included in the theme." },
  { id: "widgets",     label: "Widgets",            glyph: "⚙️", desc: "Interactive overlay components (habit rings, countdown timers, mood trackers) for digital use." },
  { id: "covers",      label: "Cover art",          glyph: "🎁", desc: "Hero cover designs that set the theme's first-impression look — usually a coordinated insert." },
  { id: "hardware",    label: "Binding hardware",   glyph: "🔩", desc: "Coil, disc, twin-loop, or ring styles photographed for realistic physical planner previews." },
  { id: "accessories", label: "Accessories",        glyph: "📎", desc: "Coordinating clips, tabs, bookmarks, and page-markers sold or shown alongside the planner." },
  { id: "fonts",       label: "Font pairings",      glyph: "Aa", desc: "Named typeface combinations (heading + body + accent) that govern all typographic choices." },
] as const;
type SlotId = typeof SLOT_DEFS[number]["id"];

const SLOT_IDS = SLOT_DEFS.map(s => s.id) as SlotId[];

// ─── Mode definitions ─────────────────────────────────────────────────────────
const MODES = [
  { id: "compose",       label: "Compose" },
  { id: "library",       label: "Library" },
  { id: "asset-catalog", label: "Asset catalog" },
] as const;
type ModeId = typeof MODES[number]["id"];

// ─── Types ────────────────────────────────────────────────────────────────────
type BundleState = Record<SlotId, string[]>;

const EMPTY_BUNDLE: BundleState = {
  palettes: [], backgrounds: [], packs: [], inserts: [],
  widgets: [], covers: [], hardware: [], accessories: [], fonts: [],
};

interface CatalogItem {
  id: string;
  name: string;
  colors?: string[];   // palettes only
  kind?: string;       // backgrounds (color/texture/image), hardware kind, accessory kind
  type?: string;       // backgrounds: color | texture | image
  position?: number;
}

interface AllCatalog {
  palettes:    CatalogItem[];
  backgrounds: CatalogItem[];
  packs:       CatalogItem[];
  inserts:     CatalogItem[];
  widgets:     CatalogItem[];
  covers:      CatalogItem[];
  hardware:    CatalogItem[];
  accessories: CatalogItem[];
  fonts:       CatalogItem[];
}

const EMPTY_CATALOG: AllCatalog = {
  palettes: [], backgrounds: [], packs: [], inserts: [],
  widgets: [], covers: [], hardware: [], accessories: [], fonts: [],
};

interface RichTheme {
  id: string;
  name: string;
  status: string;
  colors?: string[];
  fontPairing?: { heading?: string; subheading?: string; body?: string; accent?: string } | null;
  palettes:    CatalogItem[];
  backgrounds: CatalogItem[];
  packs:       CatalogItem[];
  inserts:     CatalogItem[];
  widgets:     CatalogItem[];
  covers:      CatalogItem[];
  hardware:    CatalogItem[];
  accessories: CatalogItem[];
  fonts:       CatalogItem[];
}

interface AssetTypeDescriptor {
  slot: string;
  label: string;
  glyph: string;
  count: number;
  studios: string[];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchAllThemes(): Promise<RichTheme[]> {
  return apiFetch<RichTheme[]>("/themes");
}

async function fetchTheme(id: string): Promise<RichTheme> {
  return apiFetch<RichTheme>(`/themes/${id}`);
}

async function createTheme(name: string): Promise<RichTheme> {
  // themes.id has no server-side default — generate client-side.
  // themes.colors is notNull jsonb — supply an empty array so the row is valid.
  const id = crypto.randomUUID();
  return apiFetch<RichTheme>("/themes", {
    method: "POST",
    body: JSON.stringify({ id, name, status: "draft", colors: [] }),
  });
}

async function patchTheme(id: string, data: Partial<RichTheme>): Promise<RichTheme> {
  return apiFetch<RichTheme>(`/themes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * PUT /themes/:id/:slot — three legacy slots need object-array payloads;
 * the six new slots accept flat string[].
 */
async function putSlot(themeId: string, slot: SlotId, ids: string[]): Promise<void> {
  let body: unknown;
  if (slot === "palettes") {
    body = ids.map((paletteId, position) => ({ paletteId, isPrimary: position === 0, position }));
  } else if (slot === "backgrounds") {
    body = ids.map((backgroundId, position) => ({ backgroundId, position }));
  } else if (slot === "packs") {
    body = ids.map((packId, position) => ({ packId, position }));
  } else {
    // inserts · widgets · covers · hardware · accessories · fonts — accept string[]
    body = ids;
  }
  await apiFetch<void>(`/themes/${themeId}/${slot}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function fetchCatalogItems(slot: SlotId): Promise<CatalogItem[]> {
  const path = slot === "covers" ? "/inserts" : `/${slot}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await apiFetch<any[]>(path);
  return rows.map(r => ({
    id:     r.id,
    name:   r.name ?? r.familyName ?? r.family_name ?? r.id,
    colors: r.colors,
    kind:   r.kind,
    type:   r.type,
  }));
}

async function fetchAssetTypes(): Promise<AssetTypeDescriptor[]> {
  return apiFetch<AssetTypeDescriptor[]>("/catalog/asset-types");
}

// ─── Palette swatch stack ─────────────────────────────────────────────────────
function PaletteSwatch({ colors, size = 48 }: { colors: string[]; size?: number }) {
  const bands = colors.slice(0, 5);
  const bw    = size / (bands.length || 1);
  return (
    <div
      className="rounded overflow-hidden shrink-0"
      style={{ width: size, height: size, display: "flex" }}
    >
      {bands.map((c, i) => (
        <div key={i} style={{ background: c, width: bw, height: size }} />
      ))}
      {bands.length === 0 && (
        <div style={{ width: size, height: size, background: "#e5e7eb" }} />
      )}
    </div>
  );
}

// ─── Part card (three states: ATTACHED · SUGGESTED · NEUTRAL) ─────────────────
type PartState = "attached" | "suggested" | "neutral";

function getPartState(id: string, attached: string[], staged: string[]): PartState {
  if (attached.includes(id)) return "attached";
  if (staged.includes(id))   return "suggested";
  return "neutral";
}

interface PartCardProps {
  item:      CatalogItem;
  slotId:    SlotId;
  state:     PartState;
  onAttach:  (id: string) => void;
  onRemove:  (id: string) => void;
}

function PartCard({ item, slotId, state, onAttach, onRemove }: PartCardProps) {
  const borderColor = state === "attached"  ? ATTACHED_BORDER
                    : state === "suggested" ? SUGGESTED_BORDER
                    : "#E4DDD5";
  const isAttached  = state === "attached";
  const isSuggested = state === "suggested";

  return (
    <div
      className="rounded-lg p-3 bg-white flex flex-col gap-2 transition-shadow hover:shadow-sm"
      style={{ border: `1.5px solid ${borderColor}` }}
    >
      {/* Top: swatch / glyph + badges */}
      <div className="flex items-center gap-2">
        {slotId === "palettes" && item.colors?.length ? (
          <PaletteSwatch colors={item.colors} size={36} />
        ) : (
          <div
            className="rounded shrink-0 flex items-center justify-center text-lg"
            style={{ width: 36, height: 36, background: CANVAS_BG }}
          >
            {SLOT_DEFS.find(s => s.id === slotId)?.glyph ?? "•"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-foreground leading-tight truncate">{item.name}</p>
          {item.kind && (
            <p className="text-[10px] text-muted-foreground capitalize">{item.kind}</p>
          )}
        </div>
        {isAttached && (
          <span
            className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ background: "#DCFCE7", color: "#16A34A" }}
          >
            IN THEME
          </span>
        )}
        {isSuggested && (
          <span
            className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ background: `${CLAY}22`, color: CLAY }}
          >
            ✦ AI PICK
          </span>
        )}
      </div>
      {/* Action */}
      {isAttached ? (
        <button
          onClick={() => onRemove(item.id)}
          className="w-full text-[11px] py-1 rounded border transition-colors"
          style={{ borderColor: "#E4DDD5", color: "#6B7280" }}
        >
          Remove
        </button>
      ) : (
        <button
          onClick={() => onAttach(item.id)}
          className="w-full text-[11px] py-1 rounded transition-colors text-white font-medium"
          style={{ background: isSuggested ? CLAY : INK_NAVY }}
        >
          {isSuggested ? "✦ Add suggested" : "Add to theme"}
        </button>
      )}
    </div>
  );
}

// ─── Font-specific part card ──────────────────────────────────────────────────
// Loads the Google Font for item.name so the "Aa" specimen tile and the part
// name label actually render in the correct typeface.

function FontPartCard({ item, state, onAttach, onRemove }: PartCardProps) {
  const loaded      = useFontLoader([item.name]);
  const borderColor = state === "attached"  ? ATTACHED_BORDER
                    : state === "suggested" ? SUGGESTED_BORDER
                    : "#E4DDD5";
  const isAttached  = state === "attached";
  const isSuggested = state === "suggested";

  return (
    <div
      className="rounded-lg p-3 bg-white flex flex-col gap-2 transition-shadow hover:shadow-sm"
      style={{ border: `1.5px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-2">
        {/* 44 × 44 specimen tile — "Aa" in the actual typeface */}
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            width:      44,
            height:     44,
            borderRadius: 8,
            background: CANVAS_BG,
            border:     "1px solid #E4DDD5",
            fontFamily: `'${item.name}', Georgia, serif`,
            fontSize:   19,
            fontWeight: 600,
            color:      INK_NAVY,
            opacity:    loaded ? 1 : 0.35,
            transition: "opacity 200ms",
          }}
          aria-hidden
        >
          Aa
        </div>

        <div className="flex-1 min-w-0">
          {/* Part name in the heading face */}
          <p
            className="leading-tight truncate"
            style={{
              fontFamily: `'${item.name}', Georgia, serif`,
              fontSize:   14,
              fontWeight: 600,
              color:      INK_NAVY,
            }}
          >
            {item.name}
          </p>
          {item.kind && (
            <p
              className="capitalize"
              style={{
                fontFamily: `'${item.name}', system-ui, sans-serif`,
                fontSize:   10,
                color:      "#9CA3AF",
              }}
            >
              {item.kind}
            </p>
          )}
        </div>

        {isAttached && (
          <span
            className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: "#DCFCE7", color: "#16A34A" }}
          >
            IN THEME
          </span>
        )}
        {isSuggested && (
          <span
            className="text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: `${CLAY}22`, color: CLAY }}
          >
            ✦ AI PICK
          </span>
        )}
      </div>

      {isAttached ? (
        <button
          onClick={() => onRemove(item.id)}
          className="w-full text-[11px] py-1 rounded border transition-colors"
          style={{ borderColor: "#E4DDD5", color: "#6B7280" }}
        >
          Remove
        </button>
      ) : (
        <button
          onClick={() => onAttach(item.id)}
          className="w-full text-[11px] py-1 rounded transition-colors text-white font-medium"
          style={{ background: isSuggested ? CLAY : INK_NAVY }}
        >
          {isSuggested ? "✦ Add suggested" : "Add to theme"}
        </button>
      )}
    </div>
  );
}

// ─── Bundle-summary font row ──────────────────────────────────────────────────
// Shows the font family name in its own typeface inside the theme preview panel.

function BundleFontRow({ familyName }: { familyName: string }) {
  const loaded = useFontLoader([familyName]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-14 shrink-0">Font</span>
      <span
        style={{
          fontFamily: `'${familyName}', Georgia, serif`,
          fontSize:   12,
          fontWeight: 500,
          color:      INK_NAVY,
          opacity:    loaded ? 1 : 0.4,
          transition: "opacity 200ms",
        }}
      >
        {familyName}
      </span>
    </div>
  );
}

// ─── Suggestion banner ────────────────────────────────────────────────────────
interface SuggestionBannerProps {
  slotId:      SlotId;
  stagedIds:   string[];
  catalog:     CatalogItem[];
  onAcceptAll: () => void;
  onDismiss:   () => void;
}

function SuggestionBanner({ slotId, stagedIds, catalog, onAcceptAll, onDismiss }: SuggestionBannerProps) {
  if (!stagedIds.length) return null;
  const names = stagedIds
    .map(id => catalog.find(c => c.id === id)?.name ?? id)
    .slice(0, 3);
  const extra = stagedIds.length - names.length;
  return (
    <div
      className="rounded-lg px-4 py-3 flex items-start gap-3 mb-4"
      style={{ background: `${CLAY}12`, border: `1px solid ${CLAY}44` }}
    >
      <Sparkles size={16} className="shrink-0 mt-0.5" style={{ color: CLAY }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold" style={{ color: CLAY }}>
          AI suggested {stagedIds.length} {slotId === "palettes" ? "palette" : "item"}{stagedIds.length !== 1 ? "s" : ""} for this slot
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {names.join(" · ")}{extra > 0 ? ` + ${extra} more` : ""}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onAcceptAll}
          className="text-[11px] px-3 py-1 rounded font-medium text-white"
          style={{ background: INK_NAVY }}
        >
          Accept all
        </button>
        <button
          onClick={onDismiss}
          className="text-[11px] px-2 py-1 rounded border"
          style={{ borderColor: CLAY, color: CLAY }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Compose center ───────────────────────────────────────────────────────────
interface ComposeCenterProps {
  activeSlot:    SlotId;
  bundle:        BundleState;
  staged:        BundleState;
  catalog:       AllCatalog;
  onAttach:      (slot: SlotId, id: string) => void;
  onRemove:      (slot: SlotId, id: string) => void;
  onAcceptAll:   (slot: SlotId) => void;
  onDismissAll:  (slot: SlotId) => void;
  onSuggest:     () => void;
}

function ComposeCenter({
  activeSlot, bundle, staged, catalog,
  onAttach, onRemove, onAcceptAll, onDismissAll, onSuggest,
}: ComposeCenterProps) {
  const slotDef    = SLOT_DEFS.find(s => s.id === activeSlot)!;
  const slotItems  = catalog[activeSlot] ?? [];
  const attached   = bundle[activeSlot]  ?? [];
  const stagedIds  = staged[activeSlot]  ?? [];

  // Sort: attached first, then suggested, then neutral
  const sorted = [...slotItems].sort((a, b) => {
    const sa = getPartState(a.id, attached, stagedIds);
    const sb = getPartState(b.id, attached, stagedIds);
    const order = { attached: 0, suggested: 1, neutral: 2 };
    return order[sa] - order[sb];
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Slot header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2
            className="font-display text-[22px] font-bold leading-tight"
            style={{ color: INK_NAVY }}
          >
            {slotDef.glyph} {slotDef.label}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1 max-w-md">{slotDef.desc}</p>
        </div>
        <button
          onClick={onSuggest}
          className="flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-lg text-white shrink-0"
          style={{ background: CLAY }}
        >
          <Sparkles size={13} />
          Suggest parts
        </button>
      </div>

      {/* Suggestion banner */}
      <SuggestionBanner
        slotId={activeSlot}
        stagedIds={stagedIds}
        catalog={slotItems}
        onAcceptAll={() => onAcceptAll(activeSlot)}
        onDismiss={() => onDismissAll(activeSlot)}
      />

      {/* Parts grid */}
      {slotItems.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-16 text-center"
          style={{ borderColor: "#E4DDD5" }}
        >
          <span className="text-4xl mb-3">{slotDef.glyph}</span>
          <p className="text-[13px] font-medium text-muted-foreground">No {slotDef.label.toLowerCase()} in catalog yet</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">Add items in the Asset catalog tab, then return here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {sorted.map(item =>
              activeSlot === "fonts" ? (
                <FontPartCard
                  key={item.id}
                  item={item}
                  slotId={activeSlot}
                  state={getPartState(item.id, attached, stagedIds)}
                  onAttach={id => onAttach(activeSlot, id)}
                  onRemove={id => onRemove(activeSlot, id)}
                />
              ) : (
                <PartCard
                  key={item.id}
                  item={item}
                  slotId={activeSlot}
                  state={getPartState(item.id, attached, stagedIds)}
                  onAttach={id => onAttach(activeSlot, id)}
                  onRemove={id => onRemove(activeSlot, id)}
                />
              )
            )}
          </div>

          {/* Pull more footer */}
          <div
            className="mt-4 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 py-4 cursor-pointer hover:bg-white/50 transition-colors"
            style={{ borderColor: "#E4DDD5" }}
          >
            <Plus size={14} className="text-muted-foreground" />
            <span className="text-[12px] text-muted-foreground">Pull more from catalog</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Library center ───────────────────────────────────────────────────────────
interface LibraryCenterProps {
  themes:          RichTheme[];
  activeThemeId:   string | null;
  onSelectTheme:   (id: string) => void;
  isLoading:       boolean;
}

function LibraryCenter({ themes, activeThemeId, onSelectTheme, isLoading }: LibraryCenterProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-[22px] font-bold" style={{ color: INK_NAVY }}>
          Theme library
        </h2>
        <span className="text-[11px] text-muted-foreground">{themes.length} themes</span>
      </div>
      {themes.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-20 text-center"
          style={{ borderColor: "#E4DDD5" }}
        >
          <Palette size={40} className="mb-3 text-muted-foreground/40" />
          <p className="text-[13px] font-medium text-muted-foreground">No themes yet</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Switch to Compose mode to build the first theme.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {themes.map(theme => {
            const total  = SLOT_IDS.reduce((n, s) => n + (theme[s]?.length ?? 0), 0);
            const filled = SLOT_IDS.filter(s => (theme[s]?.length ?? 0) > 0).length;
            const pct    = Math.round((filled / 9) * 100);
            const primaryPalette = theme.palettes?.[0];
            const colors = primaryPalette?.colors ?? theme.colors ?? [];
            const isActive = theme.id === activeThemeId;

            return (
              <button
                key={theme.id}
                onClick={() => onSelectTheme(theme.id)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:shadow-sm"
                style={{
                  background:   isActive ? `${INK_NAVY}10` : "white",
                  border:       `1.5px solid ${isActive ? INK_NAVY : "#E4DDD5"}`,
                }}
              >
                {/* Palette band (three colors) */}
                <div className="flex rounded overflow-hidden shrink-0" style={{ width: 48, height: 46 }}>
                  {colors.slice(0, 3).map((c, i) => (
                    <div key={i} style={{ background: c, flex: 1, height: 46 }} />
                  ))}
                  {colors.length === 0 && (
                    <div style={{ width: 48, height: 46, background: "#E4DDD5" }} />
                  )}
                </div>
                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{theme.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {total} parts · {filled}/9 slots · {pct}% complete
                  </p>
                </div>
                {/* Status pill */}
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    background: theme.status === "live"  ? "#DCFCE7"
                               : theme.status === "draft" ? "#FEF9C3"
                               : "#F3F4F6",
                    color:      theme.status === "live"  ? "#16A34A"
                               : theme.status === "draft" ? "#CA8A04"
                               : "#6B7280",
                  }}
                >
                  {theme.status}
                </span>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Asset catalog center ─────────────────────────────────────────────────────
interface AssetCatalogCenterProps {
  types:     AssetTypeDescriptor[];
  isLoading: boolean;
}

function AssetCatalogCenter({ types, isLoading }: AssetCatalogCenterProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-[22px] font-bold" style={{ color: INK_NAVY }}>
          Asset catalog
        </h2>
        <span className="text-[11px] text-muted-foreground">9 asset types</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {types.map(t => (
          <div
            key={t.slot}
            className="rounded-xl bg-white p-4 flex flex-col gap-2"
            style={{ border: "1.5px solid #E4DDD5" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{t.glyph}</span>
              <span
                className="text-[20px] font-display font-bold"
                style={{ color: INK_NAVY }}
              >
                {t.count}
              </span>
            </div>
            <p className="text-[12px] font-semibold text-foreground">{t.label}</p>
            <div className="flex flex-wrap gap-1">
              {t.studios.map(s => (
                <span
                  key={s}
                  className="text-[9px] px-2 py-0.5 rounded-full"
                  style={{ background: s === "Theme Studio" ? `${CLAY}18` : "#F3F4F6", color: s === "Theme Studio" ? CLAY : "#6B7280" }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
        {/* Placeholder slots if API returns fewer than 9 */}
        {Array.from({ length: Math.max(0, 9 - types.length) }).map((_, i) => (
          <div
            key={`ph-${i}`}
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: "#F9F6F2", border: "1.5px dashed #E4DDD5" }}
          >
            <div className="w-8 h-8 rounded bg-[#E4DDD5]" />
            <div className="w-24 h-2 rounded bg-[#E4DDD5]" />
            <div className="w-16 h-2 rounded bg-[#E4DDD5]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Theme rail (left panel) ──────────────────────────────────────────────────
interface ThemeRailProps {
  themeName:     string;
  onNameChange:  (v: string) => void;
  activeSlot:    SlotId;
  onSlotChange:  (slot: SlotId) => void;
  bundle:        BundleState;
  completeness:  number;
  isSaving:      boolean;
  saveError:     string | null;
  onSave:        () => void;
  mode:          ModeId;
}

function ThemeRail({
  themeName, onNameChange, activeSlot, onSlotChange,
  bundle, completeness, isSaving, saveError, onSave, mode,
}: ThemeRailProps) {
  return (
    <div className="flex flex-col h-full" style={{ background: CANVAS_BG }}>
      {/* Theme name section */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: "1px solid #E4DDD5" }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          This theme
        </p>
        <input
          value={themeName}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Untitled theme…"
          className="w-full bg-transparent font-display text-[18px] font-bold outline-none placeholder:text-muted-foreground/40"
          style={{ color: INK_NAVY }}
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          {SLOT_IDS.reduce((n, s) => n + bundle[s].length, 0)} parts across {SLOT_IDS.filter(s => bundle[s].length > 0).length} slots
        </p>
      </div>

      {/* Slot nav — only shown in Compose mode */}
      {mode === "compose" && (
        <div className="flex-1 overflow-y-auto py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 mb-2">
            Bundle slots
          </p>
          {SLOT_DEFS.map(slot => {
            const count    = bundle[slot.id as SlotId].length;
            const isActive = slot.id === activeSlot;
            return (
              <button
                key={slot.id}
                onClick={() => onSlotChange(slot.id as SlotId)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                style={{
                  background:  isActive ? `${SLOT_ACTIVE}10` : "transparent",
                  borderLeft:  isActive ? `3px solid ${SLOT_ACTIVE}` : "3px solid transparent",
                }}
              >
                <span className="text-base shrink-0">{slot.glyph}</span>
                <span
                  className="flex-1 text-[12px] font-medium truncate"
                  style={{ color: isActive ? INK_NAVY : "#374151" }}
                >
                  {slot.label}
                </span>
                {count > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                    style={{
                      background: isActive ? INK_NAVY     : `${CLAY}20`,
                      color:      isActive ? "white"      : CLAY,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Spacer when not in compose mode */}
      {mode !== "compose" && <div className="flex-1" />}

      {/* Completeness + save — pinned bottom */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid #E4DDD5" }}>
        <div className="flex items-end justify-between mb-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Completeness</span>
          <span className="font-display text-[20px] font-bold" style={{ color: INK_NAVY }}>{completeness}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "#E4DDD5" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${completeness}%`, background: completeness === 100 ? "#22C55E" : INK_NAVY }}
          />
        </div>
        <button
          onClick={onSave}
          disabled={isSaving || !themeName.trim()}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: INK_NAVY }}
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {isSaving ? "Saving…" : "Save theme"}
        </button>
        {saveError && (
          <p className="mt-2 text-[11px] text-red-600 leading-tight">{saveError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Preview + bundle composer (rendered in Preview dock tab) ─────────────────
interface PreviewAndBundleTabProps {
  bundle:         BundleState;
  staged:         BundleState;
  onStagedChange: (s: BundleState) => void;
  themeName:      string;
  catalog:        AllCatalog;
}

function PreviewAndBundleTab({
  bundle, staged, onStagedChange, themeName, catalog,
}: PreviewAndBundleTabProps) {
  const [prompt, setPrompt]           = useState("");
  const [response, setResponse]       = useState<string | null>(null);
  const [parsedBundle, setParsedBundle] = useState<Partial<BundleState> | null>(null);
  const [isLoading, setIsLoading]     = useState(false);

  // Build a terse catalog summary for the system prompt
  const catalogContext = useMemo(() => {
    const lines: string[] = [];
    for (const slot of SLOT_DEFS) {
      const items = catalog[slot.id as SlotId];
      if (items.length) {
        lines.push(`${slot.label}: ${items.slice(0, 12).map(i => `${i.id}="${i.name}"`).join(", ")}${items.length > 12 ? ` (+ ${items.length - 12} more)` : ""}`);
      }
    }
    return lines.join("\n");
  }, [catalog]);

  const BUNDLE_SYSTEM_PROMPT = `You are a Daybook theme designer. Your job is to propose a complete 9-slot theme bundle for a planner/notebook catalog system.

The 9 slots are:
- palettes (colour palettes with hex color arrays)
- backgrounds (texture/color/image backgrounds)
- packs (sticker packs)
- inserts (functional PDF content pages)
- widgets (interactive overlay components)
- covers (cover art pages)
- hardware (binding hardware: coil, discs, twin-loop, 3-ring)
- accessories (clips, tabs, bookmarks, page-markers)
- fonts (font family pairing candidates)

Available catalog items:
${catalogContext || "(no catalog items loaded yet — add items first)"}

When the user describes a theme concept, reply with:
1. A short paragraph explaining your design reasoning.
2. Specific item choices with reasons.
3. A JSON object inside <bundle> tags mapping slot names to arrays of item IDs from the catalog above.

Example bundle format:
<bundle>
{
  "palettes": ["pal_id1", "pal_id2"],
  "backgrounds": ["bg_id1"],
  "packs": ["pk_id1"],
  "inserts": [],
  "widgets": [],
  "covers": [],
  "hardware": [],
  "accessories": [],
  "fonts": ["font_id1"]
}
</bundle>

Only include IDs that exist in the catalog above. Leave slots empty ([]) if nothing fits. Be specific and opinionated — choose the best match even if imperfect.`;

  const composeSuggestion = async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setResponse(null);
    setParsedBundle(null);
    try {
      const result = await aiApi.complete(BUNDLE_SYSTEM_PROMPT, prompt);
      setResponse(result.text);
      // Parse <bundle>...</bundle>
      const m = result.text.match(/<bundle>([\s\S]*?)<\/bundle>/);
      if (m) {
        const parsed = JSON.parse(m[1].trim()) as Partial<BundleState>;
        setParsedBundle(parsed);
      }
    } catch (err) {
      setResponse("Sorry, the AI could not generate a bundle right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const acceptAll = () => {
    if (!parsedBundle) return;
    const next: BundleState = { ...EMPTY_BUNDLE };
    for (const slot of SLOT_IDS) {
      next[slot] = [...(bundle[slot] ?? [])];
      const suggested = (parsedBundle[slot] ?? []).filter(id => !next[slot].includes(id));
      next[slot].push(...suggested);
    }
    onStagedChange(next);
    setParsedBundle(null);
    setResponse(null);
    setPrompt("");
  };

  // Count total staged parts
  const totalSuggested = parsedBundle
    ? SLOT_IDS.reduce((n, s) => n + (parsedBundle[s]?.length ?? 0), 0)
    : 0;

  // Primary palette for preview
  const primaryPalette = catalog.palettes.find(p => bundle.palettes[0] === p.id)
    ?? catalog.palettes[0];
  const previewColors  = primaryPalette?.colors ?? ["#C87560", "#1B2A4A", "#F9F6F2"];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Bundle composer ── */}
      <div className="p-4" style={{ borderBottom: "1px solid #E4DDD5" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          ✦ Compose bundle with AI
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe a theme concept… e.g. 'cosy autumn woodland with warm terracotta tones'"
          rows={3}
          className="w-full text-[12px] resize-none rounded-lg p-2.5 outline-none"
          style={{ background: CANVAS_BG, border: "1px solid #E4DDD5" }}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) composeSuggestion(); }}
        />
        <button
          onClick={composeSuggestion}
          disabled={isLoading || !prompt.trim()}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
          style={{ background: CLAY }}
        >
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {isLoading ? "Composing…" : "Suggest full bundle"}
        </button>
      </div>

      {/* ── AI response ── */}
      {response && (
        <div className="p-4 overflow-y-auto flex-1" style={{ borderBottom: "1px solid #E4DDD5" }}>
          {/* Reasoning text (strip bundle tag) */}
          <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {response.replace(/<bundle>[\s\S]*?<\/bundle>/, "").trim()}
          </p>
          {/* Bundle accept UI */}
          {parsedBundle && totalSuggested > 0 && (
            <div
              className="mt-4 rounded-lg p-3 flex items-center gap-3"
              style={{ background: `${CLAY}12`, border: `1px solid ${CLAY}44` }}
            >
              <Sparkles size={16} style={{ color: CLAY }} />
              <div className="flex-1">
                <p className="text-[12px] font-semibold" style={{ color: CLAY }}>
                  {totalSuggested} parts ready to stage
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Across {SLOT_IDS.filter(s => (parsedBundle[s]?.length ?? 0) > 0).length} slots
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={acceptAll}
                  className="text-[11px] px-3 py-1.5 rounded font-semibold text-white"
                  style={{ background: INK_NAVY }}
                >
                  Accept all
                </button>
                <button
                  onClick={() => setParsedBundle(null)}
                  className="text-[11px] px-2 py-1.5 rounded border"
                  style={{ borderColor: "#E4DDD5" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {parsedBundle && totalSuggested === 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground italic">
              No matching catalog items found for this concept. Add more items to the catalog first.
            </p>
          )}
        </div>
      )}

      {/* ── Theme visual preview ── */}
      <div className="p-4 flex-1 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Theme preview
        </p>
        {/* Cover card */}
        <div
          className="rounded-xl overflow-hidden mb-4"
          style={{ height: 120, background: previewColors[1] ?? "#1B2A4A", position: "relative" }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span
              className="font-display text-[14px] font-bold text-center px-4 leading-tight"
              style={{ color: previewColors[2] ?? "white", opacity: 0.9 }}
            >
              {themeName || "Untitled theme"}
            </span>
            {bundle.covers.length > 0 && (
              <span
                className="text-[10px] opacity-60"
                style={{ color: previewColors[2] ?? "white" }}
              >
                {bundle.covers.length} cover{bundle.covers.length !== 1 ? "s" : ""} attached
              </span>
            )}
          </div>
          {/* Decorative palette band at bottom */}
          <div className="absolute bottom-0 left-0 right-0 flex h-3">
            {previewColors.map((c, i) => (
              <div key={i} style={{ flex: 1, background: c, opacity: 0.5 }} />
            ))}
          </div>
        </div>

        {/* Palette swatches */}
        {bundle.palettes.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-muted-foreground mb-2">Palettes ({bundle.palettes.length})</p>
            <div className="flex flex-wrap gap-2">
              {bundle.palettes.map(id => {
                const pal = catalog.palettes.find(p => p.id === id);
                return pal ? (
                  <PaletteSwatch key={id} colors={pal.colors ?? []} size={32} />
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Type roles table — each font name rendered in its own typeface */}
        {(bundle.fonts.length > 0) && (
          <div className="mb-4">
            <p className="text-[10px] text-muted-foreground mb-2">Font pairing</p>
            <div className="flex flex-col gap-1">
              {bundle.fonts.slice(0, 3).map(id => {
                const font = catalog.fonts.find(f => f.id === id);
                return font ? <BundleFontRow key={id} familyName={font.name} /> : null;
              })}
            </div>
          </div>
        )}

        {/* Sticker checkerboard */}
        {bundle.packs.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] text-muted-foreground mb-2">Sticker packs ({bundle.packs.length})</p>
            <div
              className="rounded h-8"
              style={{
                background: "repeating-conic-gradient(#E4DDD5 0% 25%, transparent 0% 50%) 0 0 / 12px 12px",
              }}
            />
          </div>
        )}

        {/* Summary line */}
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid #E4DDD5" }}>
          {SLOT_IDS.map(slot => {
            const count = bundle[slot].length;
            if (!count) return null;
            const def = SLOT_DEFS.find(s => s.id === slot)!;
            return (
              <div key={slot} className="flex items-center justify-between py-1">
                <span className="text-[11px] text-muted-foreground">{def.glyph} {def.label}</span>
                <span className="text-[11px] font-medium" style={{ color: INK_NAVY }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main hub ─────────────────────────────────────────────────────────────────
export default function ThemeStudioHub() {
  const search            = useSearch();
  const [location, setLocation] = useLocation();
  const { setAiContext, clearAiContext, openPreview } = useAiDrawer();

  // Parse URL params
  const params     = new URLSearchParams(search);
  const themeIdParam = params.get("themeId") ?? null;
  const modeParam    = (params.get("mode") ?? "compose") as ModeId;

  const validMode = MODES.find(m => m.id === modeParam)?.id ?? "compose";

  // ── Local state ────────────────────────────────────────────────────────────
  const [mode,        setMode]        = useState<ModeId>(validMode);
  const [activeSlot,  setActiveSlot]  = useState<SlotId>("palettes");
  const [themeId,     setThemeId]     = useState<string | null>(themeIdParam);
  const [themeName,   setThemeName]   = useState("Untitled theme");
  const [bundle,      setBundle]      = useState<BundleState>({ ...EMPTY_BUNDLE });
  const [staged,      setStaged]      = useState<BundleState>({ ...EMPTY_BUNDLE });
  const [catalog,     setCatalog]     = useState<AllCatalog>(EMPTY_CATALOG);
  const [themes,      setThemes]      = useState<RichTheme[]>([]);
  const [assetTypes,  setAssetTypes]  = useState<AssetTypeDescriptor[]>([]);
  const [isSaving,    setIsSaving]    = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingThemes,  setIsLoadingThemes]  = useState(false);
  const [isLoadingTypes,   setIsLoadingTypes]   = useState(false);

  // ── URL sync ───────────────────────────────────────────────────────────────
  const updateUrl = useCallback((newMode: ModeId, newThemeId: string | null) => {
    const p = new URLSearchParams();
    if (newMode !== "compose") p.set("mode", newMode);
    if (newThemeId) p.set("themeId", newThemeId);
    setLocation(`/studios/theme-builder${p.toString() ? `?${p}` : ""}`);
  }, [setLocation]);

  const handleModeChange = (m: ModeId) => {
    setMode(m);
    updateUrl(m, themeId);
  };

  // ── Load catalog items for all 9 slots ────────────────────────────────────
  useEffect(() => {
    setIsLoadingCatalog(true);
    Promise.all(SLOT_IDS.map(s => fetchCatalogItems(s)))
      .then(results => {
        const next: AllCatalog = { ...EMPTY_CATALOG };
        SLOT_IDS.forEach((slot, i) => { next[slot] = results[i]; });
        setCatalog(next);
      })
      .catch(() => { /* silent – catalog stays empty */ })
      .finally(() => setIsLoadingCatalog(false));
  }, []);

  // ── Load theme list for library mode ──────────────────────────────────────
  useEffect(() => {
    setIsLoadingThemes(true);
    fetchAllThemes()
      .then(setThemes)
      .catch(() => {})
      .finally(() => setIsLoadingThemes(false));
  }, []);

  // ── Load asset types for asset-catalog mode ───────────────────────────────
  useEffect(() => {
    setIsLoadingTypes(true);
    fetchAssetTypes()
      .then(setAssetTypes)
      .catch(() => {})
      .finally(() => setIsLoadingTypes(false));
  }, []);

  // ── Load theme detail when themeId changes ────────────────────────────────
  useEffect(() => {
    if (!themeIdParam) return;
    fetchTheme(themeIdParam).then(theme => {
      setThemeId(theme.id);
      setThemeName(theme.name);
      const next: BundleState = { ...EMPTY_BUNDLE };
      for (const slot of SLOT_IDS) {
        next[slot] = (theme[slot] as { id: string }[] ?? []).map(i => i.id);
      }
      setBundle(next);
    }).catch(() => {});
  }, [themeIdParam]);

  // ── Completeness ──────────────────────────────────────────────────────────
  const completeness = Math.round(
    (SLOT_IDS.filter(s => bundle[s].length > 0).length / 9) * 100,
  );

  // ── Attach / remove / accept / dismiss ───────────────────────────────────
  const handleAttach = useCallback((slot: SlotId, id: string) => {
    setBundle(prev => ({
      ...prev,
      [slot]: prev[slot].includes(id) ? prev[slot] : [...prev[slot], id],
    }));
    // Remove from staged if it was suggested
    setStaged(prev => ({ ...prev, [slot]: prev[slot].filter(i => i !== id) }));
  }, []);

  const handleRemove = useCallback((slot: SlotId, id: string) => {
    setBundle(prev => ({ ...prev, [slot]: prev[slot].filter(i => i !== id) }));
  }, []);

  const handleAcceptAll = useCallback((slot: SlotId) => {
    const toAdd = staged[slot].filter(id => !bundle[slot].includes(id));
    setBundle(prev => ({ ...prev, [slot]: [...prev[slot], ...toAdd] }));
    setStaged(prev => ({ ...prev, [slot]: [] }));
  }, [bundle, staged]);

  const handleDismissAll = useCallback((slot: SlotId) => {
    setStaged(prev => ({ ...prev, [slot]: [] }));
  }, []);

  // onStagedChange from AI bundle composer — bulk-replaces staged
  const handleStagedChange = useCallback((newStaged: BundleState) => {
    // "Accept all" in PreviewTab means: add all to bundle directly
    setBundle(newStaged);
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!themeName.trim() || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      let tid = themeId;
      if (!tid) {
        const created = await createTheme(themeName);
        tid = created.id;
        setThemeId(tid);
        updateUrl(mode, tid);
      } else {
        await patchTheme(tid, { name: themeName });
      }
      // Save all slots in parallel
      await Promise.all(SLOT_IDS.map(slot => putSlot(tid!, slot, bundle[slot])));
      // Refresh theme list
      fetchAllThemes().then(setThemes).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed — please try again.";
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  }, [themeName, themeId, bundle, isSaving, mode, updateUrl]);

  // ── Select theme from library ─────────────────────────────────────────────
  const handleSelectTheme = useCallback((id: string) => {
    updateUrl("compose", id);
    setMode("compose");
  }, [updateUrl]);

  // ── "Suggest parts" → open Preview dock ──────────────────────────────────
  const handleSuggest = useCallback(() => {
    openPreview();
  }, [openPreview]);

  // ── AI context injection (updates whenever bundle/catalog/name change) ────
  const previewContent = useMemo(() => (
    <PreviewAndBundleTab
      bundle={bundle}
      staged={staged}
      onStagedChange={handleStagedChange}
      themeName={themeName}
      catalog={catalog}
    />
  ), [bundle, staged, handleStagedChange, themeName, catalog]);

  useEffect(() => {
    setAiContext({
      systemPrompt: `You are a Daybook platform theme designer helping a super-admin build and curate theme bundles. A theme bundle has 9 slots: colour palettes, backgrounds, sticker packs, inserts, widgets, cover art, binding hardware, accessories, and font pairings. The current theme is "${themeName}" with ${completeness}% bundle completeness. Answer questions about theme design, catalog curation, and planner aesthetics.`,
      examplePrompts: [
        "What makes a well-balanced theme bundle?",
        "How should I choose between backgrounds for a seasonal theme?",
        "Which font pairings work best for a minimalist planner?",
        "Should a theme have one primary palette or multiple options?",
      ],
      contextLabel: "Theme Studio",
      previewContent,
    });
    return () => clearAiContext();
  }, [setAiContext, clearAiContext, themeName, completeness, previewContent]);

  // ── Left rail ─────────────────────────────────────────────────────────────
  const leftRail = (
    <ThemeRail
      themeName={themeName}
      onNameChange={setThemeName}
      activeSlot={activeSlot}
      onSlotChange={setActiveSlot}
      bundle={bundle}
      completeness={completeness}
      isSaving={isSaving}
      saveError={saveError}
      onSave={handleSave}
      mode={mode}
    />
  );

  // ── Center content ────────────────────────────────────────────────────────
  let center: React.ReactNode;
  if (mode === "compose") {
    center = (
      <ComposeCenter
        activeSlot={activeSlot}
        bundle={bundle}
        staged={staged}
        catalog={catalog}
        onAttach={handleAttach}
        onRemove={handleRemove}
        onAcceptAll={handleAcceptAll}
        onDismissAll={handleDismissAll}
        onSuggest={handleSuggest}
      />
    );
  } else if (mode === "library") {
    center = (
      <LibraryCenter
        themes={themes}
        activeThemeId={themeId}
        onSelectTheme={handleSelectTheme}
        isLoading={isLoadingThemes}
      />
    );
  } else {
    center = (
      <AssetCatalogCenter
        types={assetTypes}
        isLoading={isLoadingTypes}
      />
    );
  }

  return (
    <StudioLayout
      scope="Theme Studio"
      modes={MODES}
      activeMode={mode}
      onModeChange={(id) => handleModeChange(id as ModeId)}
      leftRail={leftRail}
      hasAssistant
      hasPreview
    >
      {center}
    </StudioLayout>
  );
}
