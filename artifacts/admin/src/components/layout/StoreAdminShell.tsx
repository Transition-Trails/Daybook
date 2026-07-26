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
import { useState } from "react";
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
} from "lucide-react";
import { resolveStoreId, storesApi, type MeStore } from "@/lib/api";

interface StoreAdminShellProps {
  children: React.ReactNode;
  store: MeStore;
  /** The current user's role in this store */
  role: string;
  /** All stores this user belongs to (for switcher) */
  allStores?: MeStore[];
}

export function StoreAdminShell({ children, store, role, allStores = [] }: StoreAdminShellProps) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { openAssistant } = useAiDrawer();
  // When super_admin is browsing a store, they start in read-only mode
  // and can explicitly "take control" to allow mutations.
  const [hasControl, setHasControl] = useState(false);

  const isSuperAdminBrowsing = role === "super_admin";

  const base = `/store/${resolveStoreId(store)}`;
  const storeId = resolveStoreId(store);

  // Fetch flags to determine if AI studios should be shown
  const { data: flags } = useQuery({
    queryKey: ["store-flags", storeId],
    queryFn: () => storesApi.flags.get(storeId),
    staleTime: 60_000,
  });
  const aiEnabled = flags?.aiEnabled ?? false;

  const NAV = [
    { label: "Dashboard",       icon: LayoutDashboard, href: base },
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
        {/* Scope identity: Store: <name> */}
        <div
          className="h-14 flex items-center px-5 gap-2 border-b shrink-0"
          style={{ borderColor: "#E7DCCB" }}
        >
          <BookMarked className="w-5 h-5 text-[#C87560] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-sm truncate leading-tight" style={{ color: "#1B2A4A" }}>
              {store.name}
            </p>
            <p className="text-[10px] leading-tight" style={{ color: "#8A7B6A" }}>
              Store admin
            </p>
          </div>
        </div>

        {/* Super admin quick exit */}
        {isSuperAdminBrowsing && (
          <div className="px-2 pt-2 pb-0">
            <a
              href="/super/stores"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs no-underline transition-colors"
              style={{ background: "hsl(38 80% 55% / 0.15)", color: "hsl(38 80% 72%)" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to super admin
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
            {/* Super admins can always navigate to studios regardless of store plan */}
            {(aiEnabled || isSuperAdminBrowsing) ? (
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
        {/* Super admin impersonation banner */}
        {isSuperAdminBrowsing && (
          <div
            className="px-5 py-2 flex items-center gap-3 shrink-0 border-b text-sm"
            style={{
              background: "hsl(38 90% 55% / 0.12)",
              borderColor: "hsl(38 80% 60% / 0.3)",
              color: "hsl(38 70% 35%)",
            }}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: "hsl(38 80% 50%)" }} />
            <span className="font-medium">Super admin</span>
            <span className="text-muted-foreground">·</span>
            <span>Browsing <strong>{store.name}</strong> — all actions are audited</span>
            {!hasControl ? (
              <button
                className="ml-auto text-xs px-2.5 py-1 rounded border font-medium transition-colors"
                style={{
                  borderColor: "hsl(38 80% 60% / 0.5)",
                  color: "hsl(38 70% 35%)",
                }}
                onClick={() => setHasControl(true)}
                title="Allow mutations in this store — actions will be attributed to super_admin acting as store"
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
              href="/super/stores"
              className="text-xs underline underline-offset-2 ml-2 shrink-0"
              style={{ color: "hsl(38 60% 40%)" }}
            >
              Exit store
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
