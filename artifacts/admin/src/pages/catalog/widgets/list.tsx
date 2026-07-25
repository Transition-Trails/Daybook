/**
 * Platform Widgets — catalog view for platform-level (starter/licensed) widgets.
 *
 * Widgets are functional SVG overlays (habit trackers, checkboxes, time-blocks)
 * that planner sellers drop into page zones. They are currently authored
 * per-store via the Store console (Store Admin → Widgets), and starter sets
 * are seeded by the platform.
 *
 * Platform-level widget management (seeding / licensing across stores) requires
 * a /widgets platform endpoint — see api-server/src/routes/widgets.ts for the
 * store-scoped implementation. A platform route can be added following the
 * same pattern used for /stickers (platform) vs /stores/:id/stickers (store).
 *
 * Until that endpoint is wired, this page surfaces the concept, links to
 * relevant store-level management, and provides a spec reference.
 */
import { Shapes, ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const WIDGET_TYPES = [
  {
    name: "Habit tracker",
    description: "30-circle or 7-day row grids, palette-driven fills. Most popular widget type.",
    status: "Seeded",
  },
  {
    name: "Checkbox set",
    description: "Single, double, and star-check variants. Used in daily spreads and to-do layouts.",
    status: "Seeded",
  },
  {
    name: "Time-block grid",
    description: "Hourly or 15-min interval grids for daily planning. Accepts accent colour slot.",
    status: "Seeded",
  },
  {
    name: "Mood tracker",
    description: "5-point emoji or shape scale for journalling and wellness planners.",
    status: "Planned",
  },
  {
    name: "Budget row",
    description: "Income/expense row with fill-in cells. Adapts to A5 and half-letter layouts.",
    status: "Planned",
  },
  {
    name: "Progress bar",
    description: "Goal progress fill bars in horizontal and circular variants.",
    status: "Planned",
  },
];

export default function PlatformWidgetsList() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-semibold">Widgets</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Platform widgets are functional SVG overlays (habit trackers, checkboxes, time-blocks)
          that sellers can drop into planner page zones. They are palette-aware — all fill slots
          automatically recolour to the buyer's chosen theme.
        </p>
      </div>

      {/* Architecture note */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-3">
        <Shapes className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-900">Platform endpoint not yet wired</p>
          <p className="text-amber-700 mt-0.5">
            Store-scoped widgets already work via{" "}
            <code className="text-xs bg-amber-100 px-1 rounded">GET /stores/:storeId/widgets</code>.
            A platform-level{" "}
            <code className="text-xs bg-amber-100 px-1 rounded">GET /widgets</code> endpoint
            (for seeding starter widgets across all stores) needs to be added to{" "}
            <code className="text-xs bg-amber-100 px-1 rounded">api-server/src/routes/widgets.ts</code>{" "}
            following the same pattern used for platform stickers.
          </p>
        </div>
      </div>

      {/* Widget type catalogue */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Widget types
        </h2>
        <div className="grid gap-3">
          {WIDGET_TYPES.map(w => (
            <div key={w.name} className="border rounded-lg px-5 py-4 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Shapes className="w-4.5 h-4.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{w.name}</p>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      w.status === "Seeded"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-muted text-muted-foreground border"
                    }`}
                  >
                    {w.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{w.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Store management link */}
      <div className="rounded-lg border p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Manage store widgets</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Until the platform endpoint is added, manage widgets from individual store consoles.
            Enter a store from Super Admin → Stores, then go to Widgets in the store sidebar.
          </p>
        </div>
        <a href="/super/stores">
          <Button variant="outline" className="shrink-0 gap-2">
            <ExternalLink className="w-4 h-4" />
            Browse stores
          </Button>
        </a>
      </div>

      {/* Dev reference */}
      <div className="rounded-lg bg-muted/40 border p-5 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Developer reference
        </p>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>
            <span className="font-mono text-xs bg-background border rounded px-1">
              widgetsTable
            </span>{" "}
            — DB table, full CRUD. Fields: id, authoredByStoreId, name, svgData, sizeVariants, paletteSlots, status, origin.
          </li>
          <li>
            <span className="font-mono text-xs bg-background border rounded px-1">
              origin
            </span>{" "}
            — <code className="text-xs">'owned'</code> for store-authored,{" "}
            <code className="text-xs">'starter'</code> for platform-seeded (read-only in store console).
          </li>
          <li>
            <span className="font-mono text-xs bg-background border rounded px-1">
              paletteSlots
            </span>{" "}
            — JSONB array of slot names referenced in svgData via{" "}
            <code className="text-xs">{"{{slot:accent}}"}</code> syntax.
          </li>
          <li className="flex items-center gap-1.5">
            To add the platform endpoint: follow{" "}
            <code className="text-xs bg-background border rounded px-1">GET /stickers</code>{" "}
            in <code className="text-xs bg-background border rounded px-1">routes/catalog.ts</code>{" "}
            as the model.
            <ArrowRight className="w-3.5 h-3.5 inline" />
          </li>
        </ul>
      </div>
    </div>
  );
}
