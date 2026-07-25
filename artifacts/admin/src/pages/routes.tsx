/**
 * Daybook Admin routes — all rendered inside Shell under /daybook/...
 *
 * ── Studio hubs (one per product domain) ─────────────────────────────────────
 * /studios/planner    → PlannerStudioHub   (Build · Editions · Inserts · Theme…)
 * /studios/stickers   → StickerStudioHub   (Library · Create · Packs)
 * /studios/marketing  → MarketingStudioHub (Trends · Listing · Social · Mockups)
 *
 * ── Catalog (platform-level asset types) ─────────────────────────────────────
 * /catalog/themes     Themes list + detail
 * /catalog/palettes   Palettes list
 * /catalog/backgrounds Backgrounds list
 * /catalog/inserts    Inserts list + detail   (also surfaced in Planner Studio)
 * /catalog/widgets    Platform widgets info page
 * /catalog/products   Related products list + detail
 *
 * ── Platform ──────────────────────────────────────────────────────────────────
 * /plans  /users  /ink  /ai-settings  /sync  /calendar
 *
 * ── Backward-compat (no nav entry, still reachable via bookmarks/deep links) ──
 * /catalog/stickers   original platform sticker list  → now Library mode of Sticker Studio
 * /catalog/packs      original packs list             → now Packs mode of Sticker Studio
 * /editions           original editions list          → now Editions mode of Planner Studio
 * /editions/:id       edition detail (linked from Editions mode)
 * /planners/builder   original standalone builder     → now Build mode of Planner Studio
 * /studios/theme      original ThemeStudio            → now Theme mode of Planner Studio
 * /studios/edition    original EditionStudio          → now Editions mode of Planner Studio
 * /studios/trends     original TrendResearch          → now Trends mode of Marketing Studio
 * /studios/pack       legacy alias for /studios/stickers
 */
import Dashboard from '@/pages/dashboard';

// Studio hubs
import PlannerStudioHub from '@/pages/studios/PlannerStudioHub';
import StickerStudioHub from '@/pages/studios/StickerStudioHub';
import MarketingStudioHub from '@/pages/studios/MarketingStudioHub';

// Catalog pages
import ThemesList from '@/pages/catalog/themes/list';
import ThemeDetail from '@/pages/catalog/themes/detail';
import PalettesList from '@/pages/catalog/palettes/list';
import BackgroundsList from '@/pages/catalog/backgrounds/list';
import PlatformStickersList from '@/pages/catalog/stickers/list';
import PacksList from '@/pages/catalog/packs/list';
import PackDetail from '@/pages/catalog/packs/detail';
import InsertsList from '@/pages/catalog/inserts/list';
import InsertDetail from '@/pages/catalog/inserts/detail';
import PlatformWidgetsList from '@/pages/catalog/widgets/list';
import ProductsList from '@/pages/catalog/products/list';
import ProductDetail from '@/pages/catalog/products/detail';

// Products / editions (backward compat — also embedded in Planner Studio)
import EditionsList from '@/pages/editions/list';
import EditionDetail from '@/pages/editions/detail';
import PlansList from '@/pages/plans/index';

// Platform
import UsersList from '@/pages/users/list';
import UserDetail from '@/pages/users/detail';
import AiSettingsPage from '@/pages/ai-settings';
import SyncDashboard from '@/pages/sync';
import CalendarPage from '@/pages/calendar';
import PlannerLibrary from '@/pages/ink/PlannerLibrary';

// Backward-compat standalone pages (no nav entry, routes kept so bookmarks work)
import PlannerBuilder from '@/pages/planners/builder';
import ThemeStudio from '@/pages/studios/ThemeStudio';
import EditionStudio from '@/pages/studios/EditionStudio';
import StudioTrendResearch from '@/pages/studios/TrendResearch';
import StickerStudio from '@/pages/studios/StickerStudio';

export const routes = [
  { path: "/", component: Dashboard },

  // ── Studio hubs ────────────────────────────────────────────────────────────
  { path: "/studios/planner",    component: PlannerStudioHub },
  { path: "/studios/stickers",   component: StickerStudioHub },
  { path: "/studios/marketing",  component: MarketingStudioHub },

  // ── Catalog ────────────────────────────────────────────────────────────────
  { path: "/catalog/themes",           component: ThemesList },
  { path: "/catalog/themes/:id",       component: ThemeDetail },
  { path: "/catalog/palettes",         component: PalettesList },
  { path: "/catalog/backgrounds",      component: BackgroundsList },
  { path: "/catalog/inserts",          component: InsertsList },
  { path: "/catalog/inserts/:id",      component: InsertDetail },
  { path: "/catalog/widgets",          component: PlatformWidgetsList },
  { path: "/catalog/products",         component: ProductsList },
  { path: "/catalog/products/:id",     component: ProductDetail },

  // ── Platform ───────────────────────────────────────────────────────────────
  { path: "/plans",                    component: PlansList },
  { path: "/users",                    component: UsersList },
  { path: "/users/:id",                component: UserDetail },
  { path: "/ink",                      component: PlannerLibrary },
  { path: "/ai-settings",              component: AiSettingsPage },
  { path: "/sync",                     component: SyncDashboard },
  { path: "/calendar",                 component: CalendarPage },

  // ── Backward-compat (bookmarks / deep links — no nav entry) ───────────────
  // These URLs still resolve cleanly but have no nav entry. Each is now a mode
  // inside the appropriate studio hub.
  { path: "/catalog/stickers",         component: PlatformStickersList },  // → Sticker Studio · Library
  { path: "/catalog/packs",            component: PacksList },              // → Sticker Studio · Packs
  { path: "/catalog/packs/:id",        component: PackDetail },
  { path: "/editions",                 component: EditionsList },           // → Planner Studio · Editions
  { path: "/editions/:id",             component: EditionDetail },
  { path: "/planners/builder",         component: PlannerBuilder },         // → Planner Studio · Build
  { path: "/studios/theme",            component: ThemeStudio },            // → Planner Studio · Theme
  { path: "/studios/edition",          component: EditionStudio },          // → Planner Studio · Editions
  { path: "/studios/trends",           component: StudioTrendResearch },    // → Marketing Studio · Trends
  { path: "/studios/pack",             component: StickerStudio },          // legacy alias
];
