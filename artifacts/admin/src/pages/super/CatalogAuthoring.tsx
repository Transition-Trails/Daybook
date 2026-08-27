import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, FileImage, Layers3, Palette, Plus, Shapes, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ErrorState, PageHeader, Pill, SkeletonRows } from "@/components/shared";
import { Button } from "@/components/ui/button";

type CatalogRow = { status?: string; updatedAt?: string; name?: string; title?: string };

const TABLES = [
  { key: "themes", label: "Themes", icon: Palette, href: "/super/catalog/themes", endpoint: "/themes" },
  { key: "backgrounds", label: "Backgrounds", icon: FileImage, href: "/super/catalog/backgrounds", endpoint: "/backgrounds" },
  { key: "inserts", label: "Inserts", icon: Layers3, href: "/super/catalog/inserts", endpoint: "/inserts" },
  { key: "widgets", label: "Widgets", icon: Shapes, href: "/super/catalog/widgets", endpoint: "/widgets" },
] as const;

export default function CatalogAuthoring() {
  const catalogQuery = useQuery({
    queryKey: ["catalog-authoring-counts"],
    queryFn: async () => {
      const entries = await Promise.all(TABLES.map(async (table) => {
        const rows = await apiFetch<CatalogRow[]>(table.endpoint);
        return [table.key, Array.isArray(rows) ? rows : []] as const;
      }));
      return Object.fromEntries(entries) as Record<string, CatalogRow[]>;
    },
  });
  const data = catalogQuery.data ?? {};

  const recent = Object.values(data)
    .flat()
    .filter((item) => item.updatedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 5);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Catalog authoring"
        description="Build the platform parts stores use to create and sell products."
        actions={
          <>
            <Button variant="outline" size="sm"><Upload className="mr-1.5 h-4 w-4" />Import assets</Button>
            <Link href="/super/catalog/themes">
              <Button size="sm" className="bg-[#C87560] text-white hover:bg-[#A85B48]">
                <Plus className="mr-1.5 h-4 w-4" />New theme
              </Button>
            </Link>
          </>
        }
      />

      <div className="rounded-xl border-l-[3px] border-[#C87560] bg-[#FFFDF9] px-5 py-4 text-sm text-[#5C4E3E] shadow-[0_1px_3px_rgba(27,42,74,.06)]">
        Catalog authoring now lives inside the platform admin. Your role and audit trail stay in place while you move between tables and studios.
      </div>

      {catalogQuery.isLoading ? <SkeletonRows rows={2} cols={4} /> :
        catalogQuery.isError ? <ErrorState message="Catalog counts couldn't be loaded. No totals are being shown." onRetry={() => catalogQuery.refetch()} /> :
      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#8A7A66]">Catalog tables</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {TABLES.map((table) => {
            const rows = data[table.key] ?? [];
            const live = rows.filter((item) => item.status === "live").length;
            const draft = rows.filter((item) => item.status === "draft").length;
            const Icon = table.icon;
            return (
              <Link key={table.key} href={table.href}>
                <article className="group min-h-36 cursor-pointer rounded-xl border border-[#E7DCCB] bg-[#FFFDF9] p-4 shadow-[0_1px_2px_rgba(27,42,74,.05)] transition-[box-shadow,background] duration-200 hover:bg-white hover:shadow-[0_4px_14px_rgba(27,42,74,.09)]">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3E4DF] text-[#A85B48]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#A2937E] transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#1B2A4A]">{table.label}</p>
                      <p className="font-display text-[19px] font-semibold text-[#1B2A4A]">{rows.length}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Pill tone="live">{live} live</Pill>
                      <Pill tone={draft ? "draft" : "off"}>{draft} draft</Pill>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      </section>}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] p-5 shadow-[0_1px_3px_rgba(27,42,74,.06)]">
          <h2 className="font-display text-base font-semibold text-[#1B2A4A]">Recently edited</h2>
          {recent.length ? (
            <ul className="mt-3 divide-y divide-[#F2EAE0]">
              {recent.map((item, index) => (
                <li key={`${item.name ?? item.title}-${index}`} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium text-[#1B2A4A]">{item.name ?? item.title ?? "Untitled item"}</span>
                  <Pill tone={item.status === "live" ? "live" : "draft"}>{item.status ?? "draft"}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[#7A6A57]">Edited catalog items will appear here.</p>
          )}
        </section>
        <section className="rounded-[14px] border border-[#E7DCCB] bg-[#FBF6EE] p-5">
          <h2 className="font-display text-base font-semibold text-[#1B2A4A]">Where things live now</h2>
          <div className="mt-3 space-y-3 text-sm text-[#5C4E3E]">
            <p><strong className="text-[#1B2A4A]">Catalog</strong> holds reusable parts and assets.</p>
            <p><strong className="text-[#1B2A4A]">Recipes</strong> define what a studio can build.</p>
            <p><strong className="text-[#1B2A4A]">Studios</strong> turn those recipes into sellable products.</p>
          </div>
        </section>
      </div>
    </div>
  );
}