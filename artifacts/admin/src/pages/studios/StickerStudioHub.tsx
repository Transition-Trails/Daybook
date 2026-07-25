/**
 * Sticker Studio — unified workspace for the sticker product domain.
 *
 * Modes (top-bar tab switcher):
 *   Library · Create a sticker · Assemble a pack
 *
 * Library = the searchable/filterable platform sticker management grid.
 * Create  = AI-assisted sticker concept generator + upload-to-cutout flow.
 * Packs   = sticker pack assembly, pricing, and publish management.
 *
 * Mode held in ?mode=… query param. No backend changes — navigation only.
 */
import { useLocation, useSearch } from "wouter";
import PlatformStickersList from "@/pages/catalog/stickers/list";
import StickerStudio from "@/pages/studios/StickerStudio";
import PacksList from "@/pages/catalog/packs/list";

// ── Mode definitions ──────────────────────────────────────────────────────────
const MODES = [
  { id: "library", label: "Library" },
  { id: "create",  label: "Create a sticker" },
  { id: "packs",   label: "Assemble a pack" },
] as const;

type ModeId = typeof MODES[number]["id"];

// ── Studio hub ────────────────────────────────────────────────────────────────
export default function StickerStudioHub() {
  const search = useSearch();
  const [, navigate] = useLocation();

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode = (params.get("mode") ?? "library") as ModeId;
  const validMode = MODES.some(m => m.id === mode) ? mode : "library";

  const setMode = (id: ModeId) => navigate(`/studios/stickers?mode=${id}`);

  return (
    <div className="-mx-8 -mt-8 flex flex-col">
      {/* ── Top-bar tab switcher ─────────────────────────────────────────── */}
      <div className="border-b bg-card sticky top-0 z-20 flex items-center px-8 gap-1 shrink-0">
        <span className="font-display font-semibold text-sm text-foreground/60 py-3.5 mr-5 shrink-0 select-none">
          Sticker Studio
        </span>
        <nav className="flex gap-0 overflow-x-auto -mb-px" aria-label="Sticker Studio modes">
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
          {validMode === "library" && <PlatformStickersList />}
          {validMode === "create"  && <StickerStudio />}
          {validMode === "packs"   && <PacksList />}
        </div>
      </div>
    </div>
  );
}
