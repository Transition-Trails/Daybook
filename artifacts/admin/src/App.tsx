import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { useConsole } from "@/lib/useConsole";
import { resolveStoreId } from "@/lib/api";
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

// Eagerly preload the two secondary shop chunks so that the first client-side
// navigation has no Suspense delay. Called in each shop route render (idempotent).
function preloadShopChunks() {
  import("@/pages/shop/EditionDetail");
  import("@/pages/shop/StoreBuilder");
  import("@/pages/shop/StorefrontHome");
}

// ── Super Admin pages ─────────────────────────────────────────────────────────
import SuperDashboard from "@/pages/super/Dashboard";
import SuperStores from "@/pages/super/Stores";
import SuperCatalog from "@/pages/super/GlobalCatalog";
import SuperRevenue from "@/pages/super/Revenue";
import SuperHelp from "@/pages/super/HelpCenter";
import SuperFlags from "@/pages/super/FeatureFlags";
import SuperAudit from "@/pages/super/AuditLog";

// ── Store Admin pages ─────────────────────────────────────────────────────────
import StoreDashboard from "@/pages/store/Dashboard";
import StoreShopCatalog from "@/pages/store/ShopCatalog";
import StorePlannerBuilds from "@/pages/store/PlannerBuilds";
import StoreCustomers from "@/pages/store/Customers";
import StoreStaff from "@/pages/store/StaffRoles";
import StoreHelp from "@/pages/store/StoreHelp";

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
      <Route path="/super/audit">
        <RequireSuperAdmin state={state}><SuperAdminShell><SuperAudit /></SuperAdminShell></RequireSuperAdmin>
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

// ── Guards ────────────────────────────────────────────────────────────────────
function RequireSuperAdmin({
  state,
  children,
}: {
  state: ReturnType<typeof useConsole>;
  children: React.ReactNode;
}) {
  if (state.kind === "super") return <>{children}</>;
  return <Redirect to="/unauthorized" />;
}

function RequireStore({
  state,
  storeId,
  children,
}: {
  state: ReturnType<typeof useConsole>;
  storeId: string | undefined;
  children: (store: ReturnType<typeof useConsole>["stores"][number]) => React.ReactNode;
}) {
  // super_admin can access any store
  if (state.kind === "super" && storeId) {
    const store = state.stores.find(
      (s) => (s.storeId ?? (s as any).id) === storeId,
    ) ?? { storeId, id: storeId, name: storeId, role: "super_admin" } as any;
    return <>{children(store)}</>;
  }

  if (state.kind === "store") {
    const store = state.stores.find(
      (s) => (s.storeId ?? (s as any).id) === storeId,
    );
    if (store) return <>{children(store)}</>;
  }

  return <Redirect to="/unauthorized" />;
}

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

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/unauthorized" component={Unauthorized} />

      {/* ── Public customer storefront (/s/:storeSlug) ─────────────────────
       *  These routes are intentionally BEFORE the /(.*) → RootRouter catch-all
       *  so they render without any auth guard. Each page handles its own auth
       *  state (sign-in prompt on the builder page, public browsing elsewhere).
       *
       *  preloadShopChunks() is called in every shop route render so that all
       *  three lazy modules are fetched in parallel on first visit. By the time
       *  the user clicks through to a second page the chunk is already cached —
       *  Suspense window collapses to near-zero after the first page load.
       */}

      {/* Storefront home */}
      <Route path="/s/:storeSlug">
        {(p) => {
          preloadShopChunks();
          return (
            <Suspense fallback={<ShopPageLoading />}>
              <StorefrontHome key={p.storeSlug} />
            </Suspense>
          );
        }}
      </Route>

      {/* Edition detail */}
      <Route path="/s/:storeSlug/edition/:editionId">
        {(p) => {
          preloadShopChunks();
          return (
            <Suspense fallback={<ShopPageLoading />}>
              <ShopEditionDetail key={`${p.storeSlug}/${p.editionId}`} />
            </Suspense>
          );
        }}
      </Route>

      {/* Store-scoped builder */}
      <Route path="/s/:storeSlug/edition/:editionId/build">
        {(p) => {
          preloadShopChunks();
          return (
            <Suspense fallback={<ShopPageLoading />}>
              <StoreBuilder key={`${p.storeSlug}/${p.editionId}`} />
            </Suspense>
          );
        }}
      </Route>

      {/* Shop-facing Ink editor — auth-only (not super_admin) */}
      <Route path="/s/:storeSlug/ink/:id">
        {(p) => (
          <Suspense fallback={<ShopPageLoading />}>
            <InkEditor key={p.id} />
          </Suspense>
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
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
