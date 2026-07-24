/**
 * Platform Sticker Library — /catalog/stickers
 *
 * Super-admin read-only cross-store view of all stickers in the system.
 * Filters: search (name/tag), origin, functionType, storeId, status.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  SlidersHorizontal,
  ImageOff,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { platformApi, STICKER_FUNCTION_TYPES, type LibrarySticker } from "@/lib/api";

// ── Types & constants ────────────────────────────────────────────────────────

const FUNCTION_TYPE_LABELS: Record<string, string> = {
  checkbox:    "Checkbox",
  flag:        "Flag",
  habit:       "Habit",
  "time-block": "Time Block",
  tab:         "Tab",
  date:        "Date",
  banner:      "Banner",
  decorative:  "Decorative",
};

const ORIGIN_LABELS: Record<string, string> = {
  owned:    "Store-owned",
  licensed: "Licensed",
  starter:  "Starter",
};

const ORIGIN_COLORS: Record<string, string> = {
  owned:    "bg-blue-50 text-blue-700 border-blue-200",
  licensed: "bg-purple-50 text-purple-700 border-purple-200",
  starter:  "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ── Small components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return status === "live" ? (
    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] px-1.5 py-0 font-medium">
      Live
    </Badge>
  ) : (
    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] px-1.5 py-0 font-medium">
      Draft
    </Badge>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${ORIGIN_COLORS[origin] ?? ""}`}>
      {ORIGIN_LABELS[origin] ?? origin}
    </Badge>
  );
}

function FunctionBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground border-border">
      {FUNCTION_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

function StickerThumb({ src }: { src?: string | null }) {
  if (!src) {
    return (
      <div className="w-10 h-10 rounded border border-dashed border-border flex items-center justify-center bg-muted/30 shrink-0">
        <ImageOff className="w-3.5 h-3.5 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-10 h-10 rounded border border-border object-contain bg-muted/20 shrink-0"
    />
  );
}

// ── Fetch ────────────────────────────────────────────────────────────────────

interface PlatformSticker extends LibrarySticker {
  authoredByStoreId: string | null;
}

function usePlatformStickers(params: { q?: string; origin?: string; functionType?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params.q)            q.set("q", params.q);
  if (params.origin && params.origin !== "all")       q.set("origin", params.origin);
  if (params.functionType && params.functionType !== "all") q.set("functionType", params.functionType);
  if (params.status && params.status !== "all")       q.set("status", params.status);

  return useQuery<PlatformSticker[]>({
    queryKey: ["platform-stickers", params],
    queryFn: () => platformApi.stickers({
      q: params.q,
      origin: params.origin !== "all" ? params.origin : undefined,
      functionType: params.functionType !== "all" ? params.functionType : undefined,
      status: params.status !== "all" ? params.status : undefined,
    }) as Promise<PlatformSticker[]>,
    staleTime: 30_000,
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlatformStickersList() {
  const [search, setSearch]           = useState("");
  const [filterOrigin, setFilterOrigin]       = useState("all");
  const [filterType, setFilterType]           = useState("all");
  const [filterStatus, setFilterStatus]       = useState("all");

  const { data: stickers, isLoading, error } = usePlatformStickers({
    q: search || undefined,
    origin: filterOrigin,
    functionType: filterType,
    status: filterStatus,
  });

  const total = stickers?.length ?? 0;

  // Group counts by origin for the summary chips
  const byCounts = (stickers ?? []).reduce<Record<string, number>>((acc, s) => {
    acc[s.origin] = (acc[s.origin] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Sticker Library</h1>
        <p className="text-muted-foreground mt-1">
          All stickers across every store — starter, licensed, and store-owned.
        </p>
      </div>

      {/* Summary chips */}
      {!isLoading && stickers && stickers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{total} sticker{total !== 1 ? "s" : ""}</span>
          {Object.entries(byCounts).map(([origin, n]) => (
            <button
              key={origin}
              onClick={() => setFilterOrigin(filterOrigin === origin ? "all" : origin)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                filterOrigin === origin
                  ? ORIGIN_COLORS[origin] + " ring-1 ring-offset-1 ring-current"
                  : ORIGIN_COLORS[origin] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {ORIGIN_LABELS[origin] ?? origin}: {n}
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search name or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={filterOrigin} onValueChange={setFilterOrigin}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All origins</SelectItem>
            <SelectItem value="owned">Store-owned</SelectItem>
            <SelectItem value="licensed">Licensed</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {STICKER_FUNCTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{FUNCTION_TYPE_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-destructive border border-dashed rounded-lg gap-2">
          <p className="text-sm font-medium">Failed to load stickers</p>
          <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
        </div>
      )}
      {!isLoading && !error && stickers && stickers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg gap-1">
          <ImageOff className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm font-medium text-foreground/70">No stickers match this filter</p>
          <p className="text-xs">Try clearing the search or changing the origin filter.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && stickers && stickers.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider w-12" />
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Origin</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Store</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stickers.map((s) => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <StickerThumb src={s.processedImageData} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{s.name}</span>
                    <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">{s.id}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <FunctionBadge type={s.functionType} />
                  </td>
                  <td className="px-4 py-2.5">
                    <OriginBadge origin={s.origin} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-muted-foreground font-mono">
                      {s.authoredByStoreId ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(s.tags as string[] ?? []).slice(0, 4).map((t) => (
                        <span key={t} className="text-[10px] bg-muted/60 text-muted-foreground rounded px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
