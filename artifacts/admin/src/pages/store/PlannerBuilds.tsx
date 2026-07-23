import { useQuery } from "@tanstack/react-query";
import { storesApi, catalogApi, type CatalogItem, type StoreCatalogEntry } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { BookCopy, CalendarDays } from "lucide-react";

interface Props {
  storeId: string;
  role: string;
}

export default function StorePlannerBuilds({ storeId, role }: Props) {
  const { data: storeItems = [], isLoading: storeLoading } = useQuery({
    queryKey: ["store-catalog", storeId],
    queryFn: () => storesApi.catalog.list(storeId),
  });

  const { data: allEditions = [], isLoading: editionsLoading } = useQuery({
    queryKey: ["catalog", "editions"],
    queryFn: catalogApi.editions,
  });

  const enabledEditionIds = new Set(
    storeItems.filter((e) => e.itemType === "edition").map((e) => e.itemId),
  );

  const enabledEditions = allEditions.filter((e) => enabledEditionIds.has(e.id));

  const isLoading = storeLoading || editionsLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Planner builds"
        description="Editions your store offers to customers."
      />

      {isLoading ? (
        <SkeletonRows rows={4} cols={3} />
      ) : enabledEditions.length === 0 ? (
        <EmptyState
          title="No editions enabled yet"
          description="Go to the shop catalog to enable planner editions for your store."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enabledEditions.map((edition) => (
            <EditionCard key={edition.id} edition={edition} />
          ))}
        </div>
      )}
    </div>
  );
}

function EditionCard({ edition }: { edition: CatalogItem }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "hsl(35 52% 90%)" }}>
          <BookCopy className="w-5 h-5 text-[#C87560]" />
        </div>
        <StatusPill status={edition.status} />
      </div>
      <h3 className="font-display font-semibold text-foreground">{edition.name}</h3>
      <p className="text-xs text-muted-foreground font-mono mt-1">{edition.id}</p>
      {(edition as any).year && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
          <CalendarDays className="w-3.5 h-3.5" />
          Year: {(edition as any).year}
        </p>
      )}
      {(edition as any).tier && (
        <div className="mt-2">
          <StatusPill status={(edition as any).tier === "pro" ? "pro" : "starter"} />
        </div>
      )}
    </div>
  );
}
