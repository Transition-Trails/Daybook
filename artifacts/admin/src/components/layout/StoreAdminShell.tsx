/**
 * StoreAdminShell — layout for the Store Admin console.
 *
 * Scope label: "Store: <name>" (always visible in sidebar header).
 *
 * Super admin banner: when a super_admin enters a store (/store/:id accessible
 * via RequireStore which grants super_admin access to any store), a persistent
 * amber banner appears:
 *   "Super admin · Viewing [Store Name] — all actions are audited · Exit"
 *
 * Read-only enforcement and explicit "Take control" step are tracked with
 * local state: the default is read-only mode (forms show a warning on submit),
 * and "Take control" allows mutations.
 *
 * Note: actual form-level read-only guards are a TODO; the banner and state
 * hook are in place so any form can check `useSuperAdminBrowsing()`.
 */
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import {
  LayoutDashboard,
  ShoppingBag,
  BookCopy,
  Users,
  UserCog,
  HelpCircle,
  LogOut,
  BookMarked,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Palette,
  Sticker,
  BookOpen,
  TrendingUp,
  LibraryBig,
  Megaphone,
  UserCircle2,
  Settings2,
  CalendarDays,
  Shapes,
  AlertTriangle,
  ShieldAlert,
  WifiOff,
  RotateCcw,
  X,
  Hammer,
} from "lucide-react";
import { resolveStoreId, storesApi, flagsQueryOptions, type MeStore } from "@/lib/api";

interface StoreAdminShellProps {
  children: React.ReactNode;
  store: MeStore;
  /** The current user's role in this store */
  role: string;
  /** All stores this user belongs to (for switcher) */
  allStores?: MeStore[];
}

/** The platform's own shop. Super admins operate here as normal store owners. */
const HOUSE_STORE_ID = "store-house";

export function StoreAdminShell({ children, store, role, allStores = [] }: StoreAdminShellProps) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { openAssistant } = useAiDrawer();
  // When super_admin is browsing a customer store, they start in read-only mode.
  const [hasControl, setHasControl] = useState(false);

  const base = `/store/${resolveStoreId(store)}`;
  const storeId = resolveStoreId(store);

  // Visual mode detection:
  //   isHouseStoreView  — super admin in their own house store (normal, quiet)
  //   isSuperAdminBrowsing — super admin entered a customer store (support mode, warning)
  const isActingSuperAdmin = (user as any)?.platformRole === "super_admin";
  const isHouseStore = storeId === HOUSE_STORE_ID;
  const isHouseStoreView = isActingSuperAdmin && isHouseStore;
  // role === "super_admin" only when RequireStore synthesised a store object for a
  // non-member store.  When the super admin IS a store_owner of the house store
  // their role comes back as "store_owner", so isHouseStoreView handles that case.
  const isSuperAdminBrowsing = role === "super_admin" && !isHouseStore;

  // Fetch flags to determine if AI studios should be shown.
  // Uses shared flagsQueryOptions: 8 s AbortController + retry:1/retryDelay:1 s.
  const { data: flags, isLoading: flagsLoading, isError: flagsError, refetch: refetchFlags } = useQuery(
    flagsQueryOptions(storeId),
  );
  const aiEnabled = flags?.aiEnabled ?? false;

  // 4-second soft deadline: show "unavailable" banner if flags haven't arrived
  // yet.  Does NOT block the studio page — aiEnabled just stays false.
  // Once flags arrive (even after 4 s) the banner disappears automatically.
  const [flagsTimedOut, setFlagsTimedOut] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    if (!flagsLoading) { setFlagsTimedOut(false); return; }
    const timer = setTimeout(() => setFlagsTimedOut(true), 4_000);
    return () => clearTimeout(timer);
  }, [flagsLoading]);
  // Reset dismissed state whenever a new refetch resolves successfully
  useEffect(() => {
    if (!flagsLoading && !flagsError) setBannerDismissed(false);
  }, [flagsLoading, flagsError]);

  const showAiBanner = !isSuperAdminBrowsing && !isHouseStoreView && !bannerDismissed && (flagsError || flagsTimedOut);

  const NAV = [
    { label: "Dashboard",       icon: LayoutDashboard, href: base },
    { label: "Product Builder", icon: Hammer,          href: `${base}/build` },
    { label: "Shop catalog",    icon: ShoppingBag,     href: `${base}/catalog` },
    { label: "Planner builds",  icon: BookCopy,        href: `${base}/builds` },
    { label: "My content",      icon: LibraryBig,      href: `${base}/my-content` },
    { label: "Sticker library", icon: Sticker,         href: `${base}/stickers` },
    { label: "Widgets",         icon: Shapes,          href: `${base}/widgets` },
    { label: "Customers",       icon: Users,           href: `${base}/customers` },
    { label: "Staff & roles",   icon: UserCog,         href: `${base}/staff` },
    { label: "Help",            icon: HelpCircle,      href: `${base}/help` },
  ];

  const STUDIO_NAV = [
    { label: "Theme Studio",      icon: Palette,       href: `${base}/studios/theme` },
    { label: "Sticker Studio",    icon: Sticker,       href: `${base}/studios/stickers` },
    { label: "Edition Studio",    icon: BookOpen,      href: `${base}/studios/edition` },
    { label: "Planner Studio",    icon: CalendarDays,  href: `${base}/studios/planners` },
    { label: "Trend Research",    icon: TrendingUp,    href: `${base}/studios/trends` },
    { label: "Marketing Studio",  icon: Megaphone,     href: `${base}/studios/marketing` },
  ];

  const SETTINGS_NAV = [
    { label: "Store Profile & Voice", icon: UserCircle2, href: `${base}/settings/profile` },
  ];

  const isActive = (href: string) =>
    href === base ? location === base : location.startsWith(href);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { window.location.href = "/login"; },
    });
  };

  const rolePretty: Record<string, string> = {
    store_owner: "Owner",
    store_staff: "Staff",
    support:     "Support",
    super_admin: "Super admin",
  };

  const navItem = (label: string, Icon: React.ElementType, href: string) => {
    const active = isActive(href);
    return (
      <Link key={href} href={href}>
        <span
          className="flex items-center gap-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
          style={
            active
              ? {
                  background: "rgba(200, 117, 96, 0.10)",
                  color: "#1B2A4A",
                  borderLeft: "3px solid #C87560",
                  paddingLeft: "calc(0.75rem - 3px)",
                  paddingRight: "0.75rem",
                  fontWeight: 600,
                }
              : {
                  color: "#4A6080",
                  paddingLeft: "0.75rem",
                  paddingRight: "0.75rem",
                }
          }
          onMouseEnter={e => {
            if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)";
            if (!active) (e.currentTarget as HTMLElement).style.color = "#1B2A4A";
          }}
          onMouseLeave={e => {
            if (!active) (e.currentTarget as HTMLElement).style.background = "";
            if (!active) (e.currentTarget as HTMLElement).style.color = "#4A6080";
          }}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span>{label}</span>
          {active && <ChevronRight className="w-3 h-3 ml-auto" style={{ color: "#C87560", opacity: 0.8 }} />}
        </span>
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col"
        style={{ background: "#F7F0E6", borderRight: "1px solid #E7DCCB" }}
      >
        {/* Scope identity */}
        <div
          className="h-14 flex items-center px-5 gap-2 border-b shrink-0"
          style={{
            borderColor: isHouseStoreView ? "hsl(150 40% 80%)" : "#E7DCCB",
            background: isHouseStoreView ? "hsl(150 30% 97%)" : undefined,
          }}
        >
          <BookMarked className="w-5 h-5 shrink-0" style={{ color: isHouseStoreView ? "hsl(150 45% 40%)" : "#C87560" }} />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-sm truncate leading-tight" style={{ color: "#1B2A4A" }}>
              {store.name}
            </p>
            <p className="text-[10px] leading-tight" style={{ color: isHouseStoreView ? "hsl(150 40% 40%)" : "#8A7B6A" }}>
              {isHouseStoreView ? "Your shop" : "Store admin"}
            </p>
          </div>
        </div>

        {/* Platform link — house store gets a quiet link; customer store gets amber quick-exit */}
        {isHouseStoreView && (
          <div className="px-2 pt-2 pb-0">
            <a
              href="/super"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs no-underline transition-colors"
              style={{ color: "hsl(150 40% 42%)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "hsl(150 30% 93%)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Platform console
            </a>
          </div>
        )}
        {isSuperAdminBrowsing && (
          <div className="px-2 pt-2 pb-0">
            <a
              href="/super"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs no-underline transition-colors"
              style={{ background: "hsl(38 80% 55% / 0.15)", color: "hsl(38 80% 72%)" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to platform
            </a>
          </div>
        )}

        {/* Nav */}
        <nav
          className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(0,0,0,0.10) transparent",
          } as React.CSSProperties}
        >
          {NAV.map(({ label, icon: Icon, href }) => navItem(label, Icon, href))}

          {/* Settings section */}
          <div className="pt-3 pb-1">
            <div className="flex items-center gap-1.5 px-3 mb-1">
              <Settings2 className="w-3 h-3" style={{ color: "#A89880" }} />
              <p className="text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color: "#A89880" }}>
                Settings
              </p>
            </div>
            {SETTINGS_NAV.map(({ label, icon: Icon, href }) => navItem(label, Icon, href))}
          </div>

          {/* AI Studios section */}
          <div className="pt-3 pb-1">
            <div className="flex items-center gap-1.5 px-3 mb-1">
              <Sparkles className="w-3 h-3" style={{ color: "#A89880" }} />
              <p className="text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color: "#A89880" }}>
                AI Studios
              </p>
            </div>

            {/* Quiet banner: flags slow / unavailable — non-blocking */}
            {showAiBanner && (
              <div
                className="mx-2 mb-2 rounded-lg px-2.5 py-2 text-[11px] leading-snug"
                style={{
                  background: "rgba(200,117,96,0.08)",
                  border: "1px solid rgba(200,117,96,0.22)",
                  color: "#7A5040",
                }}
              >
                <div className="flex items-start gap-2">
                  <WifiOff className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="flex-1">AI features unavailable</span>
                  <button
                    onClick={() => setBannerDismissed(true)}
                    aria-label="Dismiss"
                    className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => { setBannerDismissed(false); void refetchFlags(); }}
                  className="mt-1.5 flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline transition-all"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Retry
                </button>
              </div>
            )}

            {/* Super admins can always navigate to studios regardless of store plan */}
            {(aiEnabled || isSuperAdminBrowsing || isHouseStoreView) ? (
              STUDIO_NAV.map(({ label, icon: Icon, href }) => navItem(label, Icon, href))
            ) : (
              <span
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm opacity-40 cursor-default"
                style={{ color: "#4A6080" }}
                title="AI studios aren't enabled for your plan"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Studios (not enabled)</span>
              </span>
            )}
          </div>
        </nav>

        {/* Store switcher (if member of multiple stores) */}
        {allStores.length > 1 && (
          <div className="px-2 py-2 border-t" style={{ borderColor: "#E7DCCB" }}>
            <p className="px-3 mb-1 text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color: "#A89880" }}>
              My stores
            </p>
            {allStores.filter(s => resolveStoreId(s) !== resolveStoreId(store)).map(s => (
              <Link key={resolveStoreId(s)} href={`/store/${resolveStoreId(s)}`}>
                <span
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                  style={{ color: "#4A6080" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)";
                    (e.currentTarget as HTMLElement).style.color = "#1B2A4A";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "";
                    (e.currentTarget as HTMLElement).style.color = "#4A6080";
                  }}
                >
                  <ArrowLeft className="w-3 h-3" />
                  {s.name}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* User footer */}
        <div
          className="px-4 py-3 border-t flex items-center gap-3 shrink-0"
          style={{ borderColor: "#E7DCCB" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "#1B2A4A" }}>
              {user?.name}
            </p>
            <p className="text-xs truncate" style={{ color: "#8A7B6A" }}>
              {rolePretty[role] ?? role}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md transition-colors hover:bg-black/5"
            style={{ color: "#8A7B6A" }}
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Super admin support-mode banner — persistent, cannot be dismissed */}
        {isSuperAdminBrowsing && (
          <div
            className="px-4 py-2 flex items-center gap-2.5 shrink-0 border-b text-sm flex-wrap"
            style={{
              background: "hsl(38 90% 55% / 0.12)",
              borderColor: "hsl(38 80% 60% / 0.3)",
              color: "hsl(38 70% 35%)",
            }}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: "hsl(38 80% 50%)" }} />
            <span>
              Viewing <strong>{store.name}</strong> as super admin
            </span>
            <span style={{ color: "hsl(38 40% 60%)" }}>·</span>
            <span className="text-xs" style={{ color: "hsl(38 55% 45%)" }}>
              All mutations are recorded as admin actions in the audit log
            </span>
            {!hasControl ? (
              <button
                className="ml-auto text-xs px-2.5 py-1 rounded border font-medium transition-colors"
                style={{
                  borderColor: "hsl(38 80% 60% / 0.5)",
                  color: "hsl(38 70% 35%)",
                }}
                onClick={() => setHasControl(true)}
                title="Enable write access — mutations will be attributed to super_admin acting in this store's scope"
              >
                Take control
              </button>
            ) : (
              <span
                className="ml-auto text-xs px-2.5 py-1 rounded border font-medium"
                style={{
                  borderColor: "hsl(22 80% 55% / 0.5)",
                  color: "hsl(22 70% 40%)",
                  background: "hsl(22 80% 55% / 0.1)",
                }}
              >
                ✦ Control active
              </span>
            )}
            <a
              href="/super"
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border no-underline transition-colors shrink-0"
              style={{
                borderColor: "hsl(38 60% 55% / 0.45)",
                color: "hsl(38 65% 35%)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "hsl(38 80% 55% / 0.15)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.background = "";
              }}
              title="Return to the platform console"
            >
              ← Leave store
            </a>
          </div>
        )}

        {/* Top bar */}
        <header
          className="h-14 flex items-center px-6 border-b bg-card shrink-0"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          {/* ✦ AI — app-wide assistant opens in a right overlay drawer */}
          {/* Placed in render scope via hook below */}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {/* ✦ AI — opens the global AI assistant drawer */}
            <button
              onClick={openAssistant}
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(200,117,96,0.10)",
                color: "#C87560",
                border: "1px solid rgba(200,117,96,0.25)",
                transition: "background 140ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,117,96,0.20)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,117,96,0.10)"; }}
            >
              ✦ AI
            </button>
            {role !== "store_owner" && (
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
                style={{
                  background: "hsl(37 37% 88%)",
                  borderColor: "hsl(37 37% 80%)",
                  color: "hsl(216 27% 40%)",
                }}
              >
                {rolePretty[role] ?? role} view
              </span>
            )}
            <span
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                background: "hsl(35 52% 94%)",
                borderColor: "hsl(37 37% 85%)",
                color: "hsl(216 27% 40%)",
              }}
            >
              Store: {store.name}
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
