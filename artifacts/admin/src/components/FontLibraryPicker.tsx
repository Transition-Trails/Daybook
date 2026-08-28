import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Type, X } from "lucide-react";
import { apiFetch } from "@/lib/api";

export interface DaybookFont {
  id: string;
  familyName: string;
  variants: unknown[];
  notes?: string | null;
  curatedPairings: Array<{ role: string; family: string; weight?: string }>;
  status: "draft" | "live";
}

export interface TypographyChoice {
  fontId: string;
  family: string;
  roles: Array<{ role: string; weight?: string }>;
}

export function toggleTypographyChoice(
  value: TypographyChoice[],
  font: DaybookFont,
): TypographyChoice[] {
  if (value.some((choice) => choice.fontId === font.id)) {
    return value.filter((choice) => choice.fontId !== font.id);
  }
  return [...value, {
    fontId: font.id,
    family: font.familyName,
    roles: font.curatedPairings.map(({ role, weight }) => ({ role, weight })),
  }];
}

export function FontLibraryPicker({
  value = [],
  onChange,
  worldId,
  storeId,
}: {
  value?: TypographyChoice[] | null;
  onChange: (choices: TypographyChoice[]) => void;
  worldId?: string | null;
  storeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["world-font-library", worldId, storeId],
    queryFn: async () => {
      if (!worldId) {
        // Editorial's super-admin-only documents are not store-scoped. Keep
        // their existing catalog request while World Bible calls use the
        // scoped route above.
        return apiFetch<DaybookFont[]>("/fonts");
      }
      const result = await apiFetch<{ fonts: DaybookFont[] }>(
        `/v1/worldsmith/worlds/${encodeURIComponent(worldId)}/font-library`,
        {
          headers: storeId ? { "x-store-id": storeId } : undefined,
        },
      );
      return result.fonts;
    },
    staleTime: 60_000,
  });
  const fonts = data ?? [];
  const selectedChoices = value ?? [];

  const handleToggle = (font: DaybookFont) => {
    onChange(toggleTypographyChoice(selectedChoices, font));
  };

  const handleRemove = (fontId: string) => {
    onChange(selectedChoices.filter(c => c.fontId !== fontId));
  };

  return (
    <div className="mb-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-3">
      {selectedChoices.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedChoices.map(choice => (
            <div key={choice.fontId} className="flex items-center gap-1.5 rounded-full border border-[#C87560]/30 bg-[#FFF7F3] pl-2.5 pr-1 py-1 shadow-sm">
              <span className="text-xs font-medium text-[#1B2A4A]" style={{ fontFamily: `"${choice.family}", Georgia, serif` }}>
                {choice.family}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(choice.fontId)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[#C87560] hover:bg-[#C87560]/10 transition-colors"
                aria-label={`Remove ${choice.family}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-[#1B2A4A]">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[#C87560]">
            <Type className="h-3.5 w-3.5" />
          </span>
          Use a Daybook font
        </span>
        <ChevronDown className={`h-4 w-4 text-[#7C6F62] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {!selectedChoices.length && (
        <p className="mt-1 pl-8 text-[11px] leading-relaxed text-[#7C6F62]">
          Select fonts from the Daybook catalog to attach them to this document.
        </p>
      )}

      {open && (
        <div className="mt-3 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {isLoading && (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-[#7C6F62]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading fonts…
            </div>
          )}
          {isError && (
            <p className="px-2 py-3 text-xs text-red-600">
              The Daybook Fonts catalog could not be loaded.
            </p>
          )}
          {!worldId && (
            <p className="px-2 py-3 text-xs text-[#7C6F62]">
              Select a world to view its Daybook font library.
            </p>
          )}
          {worldId && !isLoading && !isError && fonts.length === 0 && (
            <p className="px-2 py-3 text-xs text-[#7C6F62]">No Daybook fonts are available yet.</p>
          )}
          {fonts.map(font => {
            const selected = selectedChoices.some(c => c.fontId === font.id);
            const roles = [...new Set(font.curatedPairings.map(pairing => pairing.role))];
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => handleToggle(font)}
                className="flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-[#C87560]/50"
                style={{
                  borderColor: selected ? "#C87560" : "var(--admin-border)",
                  background: selected ? "#FFF7F3" : "white",
                }}
              >
                <span className="w-28 shrink-0 truncate text-sm text-[#1B2A4A]" style={{ fontFamily: `"${font.familyName}", Georgia, serif` }}>
                  {font.familyName}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {roles.map(role => (
                    <span key={role} className="rounded-full bg-[#EEF4FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#2456A6]">
                      {role}
                    </span>
                  ))}
                </span>
                {font.status === "draft" && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">Draft</span>
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
