/**
 * CatalogPageHeader — consistent header used on every platform catalog page.
 *
 * Structure:
 *   display-serif title + one-line subtitle  |  optional primary CTA
 *   ─────────────────────────────────────────────────────────────────
 *   [filter chip row, if provided]
 *
 * The global ✦ AI pill lives in the Shell top-bar — do NOT add another one here.
 */
interface FilterGroup {
  /** Currently selected value */
  value: string;
  /** All selectable options */
  options: { value: string; label: string }[];
  /** Called when a chip is clicked */
  onChange: (v: string) => void;
}

interface CatalogPageHeaderProps {
  title: string;
  subtitle: string;
  /** Rendered to the right of the title block — typically a <Link> or <Button> */
  primaryCta?: React.ReactNode;
  /** One or more chip-filter groups rendered below the title bar */
  filters?: FilterGroup[];
  /** Optional right-side annotation next to filter chips (e.g. "12 items") */
  filterMeta?: string;
}

export function CatalogPageHeader({
  title, subtitle, primaryCta, filters, filterMeta,
}: CatalogPageHeaderProps) {
  return (
    <div className="mb-8 space-y-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-display font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-[14px]">{subtitle}</p>
        </div>
        {primaryCta && <div className="shrink-0">{primaryCta}</div>}
      </div>

      {/* Filter chip row */}
      {filters && filters.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {filters.map((group, gi) => (
            <div key={gi} className="flex gap-1.5 flex-wrap">
              {group.options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => group.onChange(opt.value)}
                  style={{ cursor: "pointer" }}
                  className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors capitalize ${
                    group.value === opt.value
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
          {filterMeta && (
            <span className="text-[12.5px] text-muted-foreground ml-1">{filterMeta}</span>
          )}
        </div>
      )}
    </div>
  );
}
