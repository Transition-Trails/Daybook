/**
 * PromoteCatalog — manage promotion of Pixel Perfect Plans content
 * into the platform catalog.
 *
 * Owned items can be promoted to 'starter' (free for all) or 'licensed'
 * (available while a store's subscription is active).
 *
 * Promoted items can be demoted back to 'owned' only while no other store
 * has adopted them.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  promoteCatalogApi,
  type HouseOwnedItem,
  type CatalogItemType,
} from "@/lib/api";
import { PageHeader, ErrorState } from "@/components/shared";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpFromLine, ArrowDownToLine, ChevronDown, Tag, Unlock } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<CatalogItemType, string> = {
  theme: "Theme", pack: "Sticker Pack", insert: "Insert", edition: "Edition",
  palette: "Palette", background: "Background", widget: "Widget",
  hardware: "Hardware", accessory: "Accessory",
};

const ORIGIN_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  owned:    { bg: "hsl(35 40% 93%)", text: "hsl(35 30% 45%)", label: "Owned" },
  starter:  { bg: "hsl(150 40% 92%)", text: "hsl(150 45% 35%)", label: "Starter · Free for all" },
  licensed: { bg: "hsl(220 40% 92%)", text: "hsl(220 40% 38%)", label: "Licensed · Subscription" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PromoteCatalog() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: ["house-owned"],
    queryFn: promoteCatalogApi.listHouseOwned,
  });

  // Inline promote form state: itemId → pending target origin
  const [promoteTarget, setPromoteTarget] = useState<Record<string, "starter" | "licensed">>({});
  const [promoteOpen, setPromoteOpen] = useState<string | null>(null);

  const promoteMutation = useMutation({
    mutationFn: ({ itemType, itemId, targetOrigin }: { itemType: CatalogItemType; itemId: string; targetOrigin: "starter" | "licensed" }) =>
      promoteCatalogApi.promote(itemType, itemId, targetOrigin),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["house-owned"] });
      setPromoteOpen(null);
      toast({ title: `Promoted to platform catalog`, description: `${updated.name} is now ${ORIGIN_STYLE[updated.origin]?.label ?? updated.origin}` });
    },
    onError: (err: Error) => toast({ title: "Promotion failed", description: err.message, variant: "destructive" }),
  });

  const demoteMutation = useMutation({
    mutationFn: ({ itemType, itemId }: { itemType: CatalogItemType; itemId: string }) =>
      promoteCatalogApi.demote(itemType, itemId),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["house-owned"] });
      toast({ title: "Demoted to owned", description: `${updated.name} is back to store-only.` });
    },
    onError: (err: Error) => {
      // Parse ADOPTION_BLOCK errors into a friendly message
      let msg = err.message;
      try {
        const parsed = JSON.parse(err.message) as { error?: string; adopters?: { name: string }[] };
        msg = parsed.error ?? msg;
        if (parsed.adopters?.length) {
          msg += ` (${parsed.adopters.map((a) => a.name).join(", ")})`;
        }
      } catch { /* raw string message is fine */ }
      toast({ title: "Cannot demote", description: msg, variant: "destructive" });
    },
  });

  const owned    = items.filter((i) => i.origin === "owned");
  const promoted = items.filter((i) => i.origin !== "owned");

  // Group by type
  const groupBy = (list: HouseOwnedItem[]) => {
    const map = new Map<CatalogItemType, HouseOwnedItem[]>();
    for (const item of list) {
      if (!map.has(item.itemType)) map.set(item.itemType, []);
      map.get(item.itemType)!.push(item);
    }
    return map;
  };

  const BG  = "#F7F0E6";
  const BDR = "#E7DCCB";
  const INK = "#1B2A4A";
  const MUTED = "#8A7B6A";

  const ItemCard = ({ item }: { item: HouseOwnedItem }) => {
    const os = ORIGIN_STYLE[item.origin] ?? ORIGIN_STYLE.owned;
    const isOwned = item.origin === "owned";
    const isOpen = promoteOpen === item.id;

    return (
      <div
        className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
        style={{ borderColor: BDR }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: INK }}>{item.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: os.bg, color: os.text }}
            >
              {os.label}
            </span>
            <span className="text-[10px]" style={{ color: MUTED }}>
              {TYPE_LABEL[item.itemType]} · {item.status}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isOwned ? (
            /* Promote — inline origin picker */
            <div className="relative">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: "hsl(221 46% 17%)", color: "hsl(35 50% 82%)" }}
                onClick={() => setPromoteOpen(isOpen ? null : item.id)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 24%)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 17%)"; }}
              >
                <ArrowUpFromLine className="w-3 h-3" />
                Promote
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
              {isOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-64 rounded-xl shadow-lg z-20 overflow-hidden"
                  style={{ background: "#fff", border: `1px solid ${BDR}` }}
                >
                  <div className="px-3 pt-3 pb-2">
                    <p className="text-xs font-semibold mb-1" style={{ color: INK }}>Promote to platform catalog as…</p>
                    <p className="text-[11px] leading-snug" style={{ color: MUTED }}>
                      This changes the commercial tier. Generated planners are never affected.
                    </p>
                  </div>
                  {(["starter", "licensed"] as const).map((tier) => {
                    const ts = ORIGIN_STYLE[tier];
                    return (
                      <button
                        key={tier}
                        className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors border-t"
                        style={{ borderColor: BDR, background: promoteTarget[item.id] === tier ? ts.bg : undefined }}
                        onClick={() => {
                          promoteMutation.mutate({ itemType: item.itemType, itemId: item.id, targetOrigin: tier });
                        }}
                        disabled={promoteMutation.isPending}
                      >
                        {tier === "starter" ? (
                          <Unlock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ts.text }} />
                        ) : (
                          <Tag className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ts.text }} />
                        )}
                        <div>
                          <p className="text-xs font-semibold" style={{ color: ts.text }}>
                            {tier === "starter" ? "Starter — free for all stores" : "Licensed — requires subscription"}
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                            {tier === "starter"
                              ? "Every store gets this immediately, no plan gate."
                              : "Available to stores while their subscription is active."}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                  <div className="p-2 border-t" style={{ borderColor: BDR }}>
                    <button
                      className="w-full text-xs py-1.5 rounded-lg transition-colors"
                      style={{ color: MUTED }}
                      onClick={() => setPromoteOpen(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Demote — with adoption-check feedback via toast */
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
              style={{ borderColor: BDR, color: MUTED }}
              onClick={() => {
                if (!confirm(`Demote "${item.name}" back to owned? This will remove it from the platform catalog. Other stores that have adopted it will block the demotion.`)) return;
                demoteMutation.mutate({ itemType: item.itemType, itemId: item.id });
              }}
              disabled={demoteMutation.isPending}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
              title="Return to owned (blocked if any store has adopted this item)"
            >
              <ArrowDownToLine className="w-3 h-3" />
              Demote
            </button>
          )}
        </div>
      </div>
    );
  };

  const Section = ({ title, subtitle, list }: { title: string; subtitle: string; list: HouseOwnedItem[] }) => {
    if (list.length === 0) return (
      <div className="rounded-xl border p-8 text-center" style={{ borderColor: BDR, background: BG }}>
        <p className="text-sm" style={{ color: MUTED }}>{subtitle} — nothing here yet.</p>
      </div>
    );
    const grouped = groupBy(list);
    return (
      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([type, typeItems]) => (
          <div key={type} className="rounded-xl border overflow-hidden bg-card" style={{ borderColor: BDR }}>
            <div className="px-4 py-2.5 border-b" style={{ background: BG, borderColor: BDR }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                {TYPE_LABEL[type]}s ({typeItems.length})
              </p>
            </div>
            {typeItems.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300" onClick={() => setPromoteOpen(null)}>
      <PageHeader
        title="Promote content"
        description="Move Pixel Perfect Plans content into the platform catalog. Promoted items become available to other stores. Demotion is blocked once a store has adopted an item."
        scopeLabel="Platform"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <ErrorState message="Could not load house store content." onRetry={() => refetch()} />
      ) : (
        <>
          {/* Owned items — ready to promote */}
          <div>
            <h2 className="text-base font-semibold mb-3" style={{ color: INK }}>
              Owned — ready to promote ({owned.length})
            </h2>
            <Section
              title="Owned content"
              subtitle="No owned content from Pixel Perfect Plans"
              list={owned}
            />
          </div>

          {/* Already promoted */}
          <div>
            <h2 className="text-base font-semibold mb-3" style={{ color: INK }}>
              In platform catalog ({promoted.length})
            </h2>
            <Section
              title="Platform catalog"
              subtitle="No promoted content yet"
              list={promoted}
            />
          </div>
        </>
      )}
    </div>
  );
}
