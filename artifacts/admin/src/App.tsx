import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
  Redirect,
} from "wouter";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useEffect } from "react";
import { Shell } from "@/components/layout/Shell";
import { SuperAdminShell } from "@/components/layout/SuperAdminShell";
import { StoreAdminShell } from "@/components/layout/StoreAdminShell";
import { AiDrawerProvider } from "@/contexts/AiDrawerContext";
import { RequireStore, RequireSuperAdmin, StoreStudioLoader } from "@/lib/guards";
import { GlobalAiDrawer } from "@/components/layout/GlobalAiDrawer";
import { useConsole } from "@/lib/useConsole";
import { resolveStoreId, inkApi } from "@/lib/api";
import Login from "@/pages/login";
import Unauthorized from "@/pages/unauthorized";
import NotFound from "@/pages/not-found";

// ── Daybook Admin (existing catalog pages) ────────────────────────────────────
import { routes as daybookRoutes } from "@/pages/routes";

// ── Daybook Ink (standalone, no Shell — lazy to keep initial bundle small) ───
import { lazy, Suspense } from "react";
const InkEditor = lazy(() => import("@/pages/planners/InkEditor"));

// ── Customer-facing storefront (public, no auth required) ────────────────────
const StorefrontHome  = lazy(() => import("@/pages/shop/StorefrontHome"));
const ShopEditionDetail = lazy(() => import("@/pages/shop/EditionDetail"));
const StoreBuilder    = lazy(() => import("@/pages/shop/StoreBuilder"));

// Eagerly preload all shop chunks as soon as any shop route mounts so that
// subsequent client-side navigations within the store have zero Suspense delay.
// Called via useEffect (not during render) to keep render functions pure.
function usePreloadShopChunks() {
  useEffect(() => {
    import("@/pages/shop/EditionDetail");
    import("@/pages/shop/StoreBuilder");
    import("@/pages/shop/StorefrontHome");
  }, []);
}

// ── Ink feature-flag gate ─────────────────────────────────────────────────────
// Redirects to the store root when the ink flag is off so a direct URL visit
// doesn't render a broken shell.  Existing annotation data is NEVER touched.
function InkGate({ storeSlug, children }: { storeSlug?: string; children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["ink/enabled", storeSlug ?? ""],
    queryFn:  () => inkApi.enabled(storeSlug),
    staleTime: 60_000,
  });
  if (isLoading) return null;
  if (!data?.enabled) {
    navigate(storeSlug ? `/s/${storeSlug}` : "/");
    return null;
  }
  return <>{children}</>;
}

// ── Super Admin pages ─────────────────────────────────────────────────────────
import SuperDashboard from "@/pages/super/Dashboard";
import SuperStores from "@/pages/super/Stores";
import SuperCatalog from "@/pages/super/GlobalCatalog";
import SuperRevenue from "@/pages/super/Revenue";
import SuperHelp from "@/pages/super/HelpCenter";
import SuperFlags from "@/pages/super/FeatureFlags";
import SuperAudit from "@/pages/super/AuditLog";
import SuperRecipes from "@/pages/super/ProductRecipes";
import NewRecipe from "@/pages/super/NewRecipe";
import SuperSupportInbox from "@/pages/super/SupportInbox";
import StoreSupportInbox from "@/pages/store/SupportInbox";
const ShopSupportPage = lazy(() => import("@/pages/shop/SupportPage"));

// ── Store Admin pages ─────────────────────────────────────────────────────────
import StoreDashboard from "@/pages/store/Dashboard";
import StoreShopCatalog from "@/pages/store/ShopCatalog";
import StorePlannerBuilds from "@/pages/store/PlannerBuilds";
import StoreCustomers from "@/pages/store/Customers";
import StoreStaff from "@/pages/store/StaffRoles";
import StoreHelp from "@/pages/store/StoreHelp";

// ── Store: Manage Owned Content ───────────────────────────────────────────────
import MyContent from "@/pages/store/MyContent";

// ── Store: Sticker Library ────────────────────────────────────────────────────
import Stickers from "@/pages/store/Stickers";

// ── Store AI Studios ──────────────────────────────────────────────────────────
import StoreThemeStudio from "@/pages/store/studios/StoreThemeStudio";
import StoreStudioPage from "@/pages/store/studios/StoreStudioPage";
import StoreEditionStudio from "@/pages/store/studios/StoreEditionStudio";
import StoreTrendResearch from "@/pages/store/studios/StoreTrendResearch";
import MarketingStudio from "@/pages/store/studios/MarketingStudio";
import PlannerStudio from "@/pages/store/studios/PlannerStudio";
import ProductBuilder from "@/pages/build/ProductBuilder";

// ── Store: Widgets ────────────────────────────────────────────────────────────
import StoreWidgets from "@/pages/store/Widgets";

// ── Super Admin: Store Inspector ──────────────────────────────────────────────
import StoreInspector from "@/pages/super/StoreInspector";

// ── Store Settings ────────────────────────────────────────────────────────────
import StoreProfile from "@/pages/store/settings/StoreProfile";
import EmailSettings from "@/pages/store/settings/EmailSettings";
import Deliverability from "@/pages/super/Deliverability";
import StoreSupportPatterns from "@/pages/store/SupportPatterns";
import SuperSupportPatterns from "@/pages/super/SupportPatterns";
import PromoteCatalog from "@/pages/super/PromoteCatalog";
import WorldSmithCompiler from "@/pages/super/WorldSmithCompiler";
import WorldSmithHome from "@/pages/super/WorldSmithHome";
import {
  EditorialShell,
  ReadinessBoard,
  CanonBoard,
  CanonLibrary,
  CanonRecordEditor,
  WorldsmithCanon,
  NewSpecFlow,
  SpecEditor,
  SpecsList,
  StyleGuides,
  NewStyleGuideFlow,
  NewPromptModuleFlow,
  EditorialDocumentEditor,
  PromptModules,
  StoriesStudio,
  StorylineEditor,
  StoryConnections,
  WorldBibleStudio,
} from "@/pages/super/worldsmith-editorial";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry on 401/403 — fail fast so auth redirects fire immediately
      retry: (failureCount, error: any) => {
        const status = error?.status ?? error?.response?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

// ── Root router: determines which console to show ────────────────────────────
function RootRouter() {
  const [location, setLocation] = useLocation();
  const state = useConsole();

  // Once auth resolves to an authenticated role, navigate to the right console.
  // We do NOT redirect to /login here — Login renders inline below instead.
  useEffect(() => {
    if (state.kind === "loading" || state.kind === "unauthenticated") return;
    if (location !== "/") return;
    if (state.kind === "super") { setLocation("/super"); return; }
    if (state.kind === "store" && state.primaryStore) {
      setLocation(`/store/${resolveStoreId(state.primaryStore)}`);
      return;
    }
    if (state.kind === "unauthorized") { setLocation("/unauthorized"); return; }
  }, [state.kind, location, setLocation, state.primaryStore]);

  // Show Login immediately while loading or when unauthenticated.
  // This eliminates the blank→spinner→redirect cycle entirely.
  if (state.kind === "loading" || state.kind === "unauthenticated") {
    return <Login />;
  }

  return (
    <Switch>
      {/* ── Super Admin console ────────────────────────────────── */}
      <Route path="/super">
        <RequireSuperAdmin state={state}>
          <SuperAdminShell>
            <SuperDashboard />
          </SuperAdminShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/stores">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperStores /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/catalog">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperCatalog /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/revenue">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperRevenue /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/help">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperHelp /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/flags">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperFlags /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/recipes/new">
        <RequireSuperAdmin state={state}><SuperAdminShell><NewRecipe /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/recipes">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperRecipes /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/audit">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperAudit /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/support">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperSupportInbox /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/email/deliverability">
        <RequireSuperAdmin state={state}><SuperAdminShell><Deliverability /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/promote">
        <RequireSuperAdmin state={state}><SuperAdminShell><PromoteCatalog /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      <Route path="/super/support/patterns">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperSupportPatterns /></SuperAdminShell></RequireSuperAdmin>
      </Route>
      {/* ── WorldSmith production home (promoted from concept review) ──── */}
      <Route path="/super/worldsmith">
        <RequireSuperAdmin state={state}><WorldSmithHome /></RequireSuperAdmin>
      </Route>
      {/* ── WorldSmith Prompt Compiler (accessible from home) ────────────── */}
      <Route path="/super/worldsmith/compiler">
        <RequireSuperAdmin state={state}><SuperAdminShell><WorldSmithCompiler /></SuperAdminShell></RequireSuperAdmin>
      </Route>

      {/* ── WorldSmith Editorial Suite ────────────────────────────────────── */}
      <Route path="/super/worldsmith/editorial/bible">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="bible"><WorldBibleStudio /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/stories">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="stories"><StoriesStudio /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/stories/new">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="stories"><StorylineEditor /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/stories/:id">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <EditorialShell activePage="stories"><StorylineEditor storyId={p.id!} /></EditorialShell>
          </RequireSuperAdmin>
        )}
      </Route>
      <Route path="/super/worldsmith/editorial/connections">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="connections"><StoryConnections /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/specs">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="specs"><SpecsList /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/specs/new">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="specs"><NewSpecFlow /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/specs/:id">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <EditorialShell activePage="specs">
              <SpecEditor specId={p.id!} />
            </EditorialShell>
          </RequireSuperAdmin>
        )}
      </Route>
      <Route path="/super/worldsmith/editorial/canon/new">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="canon"><CanonRecordEditor /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/canon/:id">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <EditorialShell activePage="canon">
              <CanonRecordEditor recordId={p.id!} />
            </EditorialShell>
          </RequireSuperAdmin>
        )}
      </Route>
      <Route path="/super/worldsmith/editorial/canon">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="canon"><CanonLibrary /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/style-guides/new">
        {() => (
          <RequireSuperAdmin state={state}>
            <EditorialShell activePage="style-guides"><NewStyleGuideFlow /></EditorialShell>
          </RequireSuperAdmin>
        )}
      </Route>
      <Route path="/super/worldsmith/editorial/style-guides/:id">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <EditorialShell activePage="style-guides"><EditorialDocumentEditor kind="style-guide" documentId={p.id!} /></EditorialShell>
          </RequireSuperAdmin>
        )}
      </Route>
      <Route path="/super/worldsmith/editorial/style-guides">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="style-guides"><StyleGuides /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/modules/new">
        {() => (
          <RequireSuperAdmin state={state}>
            <EditorialShell activePage="modules"><NewPromptModuleFlow /></EditorialShell>
          </RequireSuperAdmin>
        )}
      </Route>
      <Route path="/super/worldsmith/editorial/modules/:id">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <EditorialShell activePage="modules"><EditorialDocumentEditor kind="prompt-module" documentId={p.id!} /></EditorialShell>
          </RequireSuperAdmin>
        )}
      </Route>
      <Route path="/super/worldsmith/editorial/modules">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="modules"><PromptModules /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial/board">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="board"><ReadinessBoard /></EditorialShell>
        </RequireSuperAdmin>
      </Route>
      <Route path="/super/worldsmith/editorial">
        <RequireSuperAdmin state={state}>
          <EditorialShell activePage="board"><ReadinessBoard /></EditorialShell>
        </RequireSuperAdmin>
      </Route>

      {/* ── Product Builder ────────────────────────────────────── */}
      <Route path="/store/:storeId/build">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <ProductBuilder storeId={p.storeId!} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store-scoped WorldSmith ─────────────────────────────── */}
      <Route path="/store/:storeId/worldsmith">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <WorldSmithHome storeId={p.storeId!} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store Admin console ────────────────────────────────── */}
      <Route path="/store/:storeId">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreDashboard storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/catalog">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreShopCatalog storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/builds">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StorePlannerBuilds storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/customers">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreCustomers storeId={p.storeId!} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/staff">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStaff storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/help">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreHelp storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store: My Content ───────────────────────────────────── */}
      <Route path="/store/:storeId/my-content">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <MyContent storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store: Sticker Library ──────────────────────────────── */}
      <Route path="/store/:storeId/stickers">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <Stickers storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store AI Studios ─────────────────────────────────────── */}
      <Route path="/store/:storeId/studios/theme">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStudioLoader storeId={p.storeId!} isSuperAdmin={store.role === "super_admin"}>
                  {(aiEnabled) => <StoreThemeStudio storeId={p.storeId!} role={store.role as string} aiEnabled={aiEnabled} />}
                </StoreStudioLoader>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/studios/stickers">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStudioLoader storeId={p.storeId!} isSuperAdmin={store.role === "super_admin"}>
                  {(aiEnabled) => <StoreStudioPage storeId={p.storeId!} role={store.role as string} aiEnabled={aiEnabled} />}
                </StoreStudioLoader>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      {/* Legacy redirect — old /studios/pack path now served by StoreStudioPage */}
      <Route path="/store/:storeId/studios/pack">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStudioLoader storeId={p.storeId!} isSuperAdmin={store.role === "super_admin"}>
                  {(aiEnabled) => <StoreStudioPage storeId={p.storeId!} role={store.role as string} aiEnabled={aiEnabled} />}
                </StoreStudioLoader>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/studios/edition">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStudioLoader storeId={p.storeId!} isSuperAdmin={store.role === "super_admin"}>
                  {(aiEnabled) => <StoreEditionStudio storeId={p.storeId!} role={store.role as string} aiEnabled={aiEnabled} />}
                </StoreStudioLoader>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/studios/trends">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStudioLoader storeId={p.storeId!} isSuperAdmin={store.role === "super_admin"}>
                  {(aiEnabled) => <StoreTrendResearch storeId={p.storeId!} role={store.role as string} aiEnabled={aiEnabled} />}
                </StoreStudioLoader>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/studios/marketing">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStudioLoader storeId={p.storeId!} isSuperAdmin={store.role === "super_admin"}>
                  {(aiEnabled) => (
                    <MarketingStudio
                      storeId={p.storeId!}
                      role={store.role as string}
                      aiEnabled={aiEnabled}
                    />
                  )}
                </StoreStudioLoader>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/studios/planners">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreStudioLoader storeId={p.storeId!} isSuperAdmin={store.role === "super_admin"}>
                  {(aiEnabled) => <PlannerStudio storeId={p.storeId!} role={store.role as string} aiEnabled={aiEnabled} />}
                </StoreStudioLoader>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>
      <Route path="/store/:storeId/settings/profile">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <div className="p-8">
                  <StoreProfile storeId={p.storeId!} role={store.role as string} />
                </div>
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store: Buyer Support Inbox ──────────────────────────── */}
      <Route path="/store/:storeId/support-inbox">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreSupportInbox />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store: Support Patterns ──────────────────────────────── */}
      <Route path="/store/:storeId/support-patterns">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreSupportPatterns />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store: Email Settings ────────────────────────────────── */}
      <Route path="/store/:storeId/email-settings">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <EmailSettings />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Store: Widgets ───────────────────────────────────────── */}
      <Route path="/store/:storeId/widgets">
        {(p) => (
          <RequireStore state={state} storeId={p.storeId}>
            {(store) => (
              <StoreAdminShell store={store} role={store.role as string} allStores={state.stores}>
                <StoreWidgets storeId={p.storeId!} role={store.role as string} />
              </StoreAdminShell>
            )}
          </RequireStore>
        )}
      </Route>

      {/* ── Super Admin: Store Inspector ─────────────────────────── */}
      <Route path="/super/stores/:storeId/inspect">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <SuperAdminShell>
              <StoreInspector storeId={p.storeId!} />
            </SuperAdminShell>
          </RequireSuperAdmin>
        )}
      </Route>

      {/* ── Daybook Ink — full-screen editor, no Shell ───────────── */}
      {/* Standalone entry: /daybook/ink/:id (from Planner Library) */}
      <Route path="/daybook/ink/:id">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <Suspense fallback={<div style={{ minHeight: "100vh", background: "#F7F0E6" }} />}>
              <InkEditor key={p.id} />
            </Suspense>
          </RequireSuperAdmin>
        )}
      </Route>
      {/* Legacy deep-link from Planner Builder: /daybook/planners/:id/ink */}
      <Route path="/daybook/planners/:id/ink">
        {(p) => (
          <RequireSuperAdmin state={state}>
            <Suspense fallback={<div style={{ minHeight: "100vh", background: "#F7F0E6" }} />}>
              <InkEditor key={p.id} />
            </Suspense>
          </RequireSuperAdmin>
        )}
      </Route>

      {/*
       * ── Daybook Admin (catalog authoring, super_admin only) ──────────────
       *
       * IMPORTANT — regexparam 3 constraint (wouter uses regexparam internally):
       * The pattern `/:rest*` generates a regex that requires AT LEAST ONE path
       * segment after the base, so `/:rest*` never matches the bare `/` and
       * `/daybook/:rest*` never matches the bare `/daybook`.
       *
       * Rule: whenever you add a `/:rest*` (or `/:param*`) wildcard route, you
       * MUST also add an explicit bare-base <Route> for the same prefix so that
       * navigating to the base path doesn't produce a blank screen.
       *
       * The two routes below (`/daybook` and `/daybook/:rest*`) are intentionally
       * duplicated for this reason.
       */}
      <Route path="/daybook">
        <RequireSuperAdmin state={state}>
          <WouterRouter base="/daybook">
            <SidebarProvider>
              <Shell>
                <Switch>
                  {daybookRoutes.map((r) => (
                    <Route key={r.path} path={r.path} component={r.component} />
                  ))}
                  <Route component={NotFound} />
                </Switch>
              </Shell>
            </SidebarProvider>
          </WouterRouter>
        </RequireSuperAdmin>
      </Route>
      <Route path="/daybook/(.*)">
        <RequireSuperAdmin state={state}>
          <WouterRouter base="/daybook">
            <SidebarProvider>
              <Shell>
                <Switch>
                  {daybookRoutes.map((r) => (
                    <Route key={r.path} path={r.path} component={r.component} />
                  ))}
                  <Route component={NotFound} />
                </Switch>
              </Shell>
            </SidebarProvider>
          </WouterRouter>
        </RequireSuperAdmin>
      </Route>

      {/* ── Root redirect ──────────────────────────────────────── */}
      <Route path="/">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

// Guards and StoreStudioLoader are exported from @/lib/guards so they can be
// imported in tests and exercised directly. The imports are at the top of this file.

// ── Top-level App ─────────────────────────────────────────────────────────────

/**
 * Visible loading screen shown while a lazy shop chunk is fetching.
 *
 * Root cause of "nothing is clickable": the previous fallback was a plain
 * paper-cream <div> — identical to the storefront background — so when React
 * suspended during the first client-side navigation the page appeared blank
 * and there was literally nothing to click. Users interpreted this as the
 * button not working. The spinner below makes the transition immediately
 * visible and eliminates the perceived unresponsiveness.
 */
function ShopPageLoading() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#F7F0E6",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      fontFamily: "var(--app-font-sans)",
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: "3px solid #E7DCCB",
        borderTopColor: "#C87560",
        borderRadius: "50%",
        animation: "shop-spin 0.8s linear infinite",
      }} />
      <span style={{ fontSize: 13, color: "#7A8FA6", letterSpacing: "0.01em" }}>
        Loading…
      </span>
      <style>{`@keyframes shop-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Thin wrapper rendered by every /s/* route.
 * Calls usePreloadShopChunks() inside a real component lifecycle (useEffect)
 * so the import() side effects never run during render, and all lazy shop
 * modules are fetched in parallel from the very first page visit.
 */
function ShopRouteShell({ children }: { children: React.ReactNode }) {
  usePreloadShopChunks();
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/unauthorized" component={Unauthorized} />

      {/* ── Public customer storefront (/s/:storeSlug) ─────────────────────
       *  Placed BEFORE the /(.*) → RootRouter catch-all so these routes
       *  render without any auth guard.
       *
       *  Navigation uses Wouter <Link href> (renders as real <a href>) rather
       *  than <button onClick={navigate}> — native anchors are reliably
       *  clickable in iframe preview contexts and provide proper browser
       *  affordances (URL in status bar, right-click, keyboard nav).
       */}

      {/* Storefront home */}
      <Route path="/s/:storeSlug">
        {(p) => (
          <ShopRouteShell>
            <Suspense fallback={<ShopPageLoading />}>
              <StorefrontHome key={p.storeSlug} />
            </Suspense>
          </ShopRouteShell>
        )}
      </Route>

      {/* Edition detail */}
      <Route path="/s/:storeSlug/edition/:editionId">
        {(p) => (
          <ShopRouteShell>
            <Suspense fallback={<ShopPageLoading />}>
              <ShopEditionDetail key={`${p.storeSlug}/${p.editionId}`} />
            </Suspense>
          </ShopRouteShell>
        )}
      </Route>

      {/* Store-scoped builder */}
      <Route path="/s/:storeSlug/edition/:editionId/build">
        {(p) => (
          <ShopRouteShell>
            <Suspense fallback={<ShopPageLoading />}>
              <StoreBuilder key={`${p.storeSlug}/${p.editionId}`} />
            </Suspense>
          </ShopRouteShell>
        )}
      </Route>

      {/* Store-scoped support form — public, role-adaptive */}
      <Route path="/s/:storeSlug/support">
        {(p) => (
          <ShopRouteShell>
            <Suspense fallback={<ShopPageLoading />}>
              <ShopSupportPage key={p.storeSlug} />
            </Suspense>
          </ShopRouteShell>
        )}
      </Route>

      {/* Shop-facing Ink editor — gated by per-store inkEnabled flag */}
      <Route path="/s/:storeSlug/ink/:id">
        {(p) => (
          <ShopRouteShell>
            <InkGate storeSlug={p.storeSlug}>
              <Suspense fallback={<ShopPageLoading />}>
                <InkEditor key={p.id} />
              </Suspense>
            </InkGate>
          </ShopRouteShell>
        )}
      </Route>

      {/* /(.*) matches all paths at any depth — /:rest* only matches 1 segment */}
      <Route path="/(.*)" component={RootRouter} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {/* AiDrawerProvider must be inside WouterRouter so GlobalAiDrawer
              can call useLocation() to derive surface-specific AI context. */}
          <AiDrawerProvider>
            <AppRouter />
            {/* Mounted once at app root — never unmounts, so chat history
                survives page navigation. Renders as a fixed overlay. */}
            <GlobalAiDrawer />
          </AiDrawerProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
