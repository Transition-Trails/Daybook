/**
 * Platform Widgets — catalog view for platform-level widgets.
 *
 * The platform-wide management endpoint is not yet available.
 * This page shows a clean informational state and links to store-level management.
 * No developer reference, implementation detail, or endpoint path is shown here.
 */
import { Shapes, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";

const WIDGET_TYPES = [
  {
    name: "Habit tracker",
    description: "30-circle or 7-day row grids that recolour automatically to the buyer's chosen palette.",
  },
  {
    name: "Checkbox set",
    description: "Single, double, and star-check variants for daily spreads and to-do layouts.",
  },
  {
    name: "Time-block grid",
    description: "Hourly or 15-minute interval grids for daily planning. Accepts accent colour slot.",
  },
];

export default function PlatformWidgetsList() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Widgets"
        subtitle="Functional SVG overlays — habit trackers, checkboxes, and time-block grids — that sellers can drop into planner page zones. All fill slots recolour automatically to the buyer's chosen theme."
      />

      {/* Seeded widget types */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Available widget types
        </p>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {WIDGET_TYPES.map(w => (
            <div
              key={w.name}
              className="border rounded-[14px] px-5 py-4 flex items-start gap-4 bg-card"
            >
              <div className="w-10 h-10 rounded-[10px] bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Shapes className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[13.5px] text-foreground">{w.name}</p>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-relaxed">{w.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Store management link */}
      <div className="rounded-[14px] border p-5 flex items-center justify-between gap-4 bg-card">
        <div>
          <p className="font-semibold text-[13.5px]">Manage widgets per store</p>
          <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-relaxed">
            Widget libraries are managed from individual store consoles. Enter a store from Super Admin → Stores, then go to Widgets in the store sidebar.
          </p>
        </div>
        <a href="/super/stores" className="shrink-0">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" />
            Browse stores
          </Button>
        </a>
      </div>
    </div>
  );
}
