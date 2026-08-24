import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Palette } from "lucide-react";
import { apiFetch } from "@/lib/api";

export interface DaybookPalette {
  id: string;
  name: string;
  colors: string[];
  status: "draft" | "live";
}

const COLOR_ROLES = [
  "Accent",
  "Accent dark",
  "Secondary",
  "Tertiary",
  "Ink",
  "Paper",
];

/**
 * The text is deliberately self-contained. World Bible and Style Guide prompts
 * continue to resolve correctly even if a palette is later renamed or retired.
 */
export function paletteReferenceText(palette: DaybookPalette): string {
  const colours = palette.colors
    .slice(0, COLOR_ROLES.length)
    .map((colour, index) => `${COLOR_ROLES[index]}: ${colour}`)
    .join(" · ");

  return `Daybook Palette: ${palette.name}\n${colours}`;
}

export function PaletteLibraryPicker({
  value,
  onApply,
  worldId,
  storeId,
}: {
  value: string;
  onApply: (palette: DaybookPalette) => void;
  worldId?: string | null;
  storeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["world-palette-library", worldId, storeId],
    queryFn: () => apiFetch<{ palettes: DaybookPalette[] }>(
      `/v1/editorial/worlds/${encodeURIComponent(worldId!)}/palette-library`,
      storeId ? { headers: { "x-store-id": storeId } } : undefined,
    ),
    select: result => result.palettes,
    enabled: Boolean(worldId),
    staleTime: 60_000,
  });

  const palettes = data ?? [];

  return (
    <div className="mb-3 rounded-xl border border-[#E7E0D7] bg-[#FAF8F3] p-3">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-[#1B2A4A]">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[#C87560]">
            <Palette className="h-3.5 w-3.5" />
          </span>
          Use a Daybook palette
        </span>
        <ChevronDown className={`h-4 w-4 text-[#7C6F62] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <p className="mt-1 pl-8 text-[11px] leading-relaxed text-[#7C6F62]">
        Pull the named six-colour system from this world&apos;s Daybook Palette Library.
      </p>

      {open && (
        <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {isLoading && (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-[#7C6F62]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading palettes…
            </div>
          )}
          {isError && (
            <p className="px-2 py-3 text-xs text-red-600">
              The Palette Library could not be loaded. You can still enter colours manually.
            </p>
          )}
          {!worldId && (
            <p className="px-2 py-3 text-xs text-[#7C6F62]">
              Select a world to view its Daybook palette library.
            </p>
          )}
          {worldId && !isLoading && !isError && palettes.length === 0 && (
            <p className="px-2 py-3 text-xs text-[#7C6F62]">
              No Daybook palettes are available yet.
            </p>
          )}
          {palettes.map(palette => {
            const selected = value.includes(`Daybook Palette: ${palette.name}`);
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() => {
                  onApply(palette);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-[#C87560]/50"
                style={{
                  borderColor: selected ? "#C87560" : "#E7E0D7",
                  background: selected ? "#FFF7F3" : "white",
                }}
              >
                <span className="flex shrink-0 -space-x-0.5">
                  {palette.colors.slice(0, 6).map((colour, index) => (
                    <span
                      key={`${palette.id}-${index}`}
                      className="h-4 w-4 rounded-full border border-white"
                      style={{ background: colour }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#1B2A4A]">
                  {palette.name}
                </span>
                {palette.status === "draft" && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                    Draft
                  </span>
                )}
                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[#C87560]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}