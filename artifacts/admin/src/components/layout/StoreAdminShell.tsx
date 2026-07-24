/**
 * StoreAdminShell — layout for the Store Admin console.
 * Same Ink Navy sidebar, store-scoped pill, role-aware nav.
 */
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
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
    { label: "Dashboard",    icon: LayoutDashboard, href: base },
    { label: "Shop catalog", icon: ShoppingBag,     href: `${base}/catalog` },
    { label: "Planner builds", icon: BookCopy,      href: `${base}/builds` },
    { label: "Customers",    icon: Users,            href: `${base}/customers` },
    { label: "Staff & roles", icon: UserCog,        href: `${base}/staff` },
    { label: "Help",         icon: HelpCircle,       href: `${base}/help` },
  ];

  const STUDIO_NAV = [
    { label: "Theme Studio",   icon: Palette,     href: `${base}/studios/theme` },
    { label: "Pack Studio",    icon: Sticker,     href: `${base}/studios/pack` },
    { label: "Edition Studio", icon: BookOpen,    href: `${base}/studios/edition` },
    { label: "Trend Research", icon: TrendingUp,  href: `${base}/studios/trends` },
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

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col"
        style={{ background: "hsl(221 46% 17%)" }}
      >
        {/* Logo + store */}
        <div
          className="h-14 flex items-center px-5 gap-2 border-b"
          style={{ borderColor: "hsl(221 46% 24%)" }}
        >
          <BookMarked className="w-5 h-5 text-[#C87560] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-[hsl(35_52%_88%)] text-sm truncate">
              {store.name}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ label, icon: Icon, href }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href}>
                <span
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                  style={
                    active
                      ? { background: "hsl(12 49% 58% / 0.2)", color: "hsl(12 70% 80%)" }
                      : { color: "hsl(35 30% 70%)" }
                  }
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 23%)";
                    if (!active) (e.currentTarget as HTMLElement).style.color = "hsl(35 50% 88%)";
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "";
                    if (!active) (e.currentTarget as HTMLElement).style.color = "hsl(35 30% 70%)";
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                  {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                </span>
              </Link>
            );
          })}

          {/* AI Studios section */}
          <div className="pt-3 pb-1">
            <div className="flex items-center gap-1.5 px-3 mb-1">
              <Sparkles className="w-3 h-3" style={{ color: "hsl(35 20% 45%)" }} />
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "hsl(35 20% 45%)" }}>
                AI Studios
              </p>
            </div>
            {aiEnabled ? (
              STUDIO_NAV.map(({ label, icon: Icon, href }) => {
                const active = isActive(href);
                return (
                  <Link key={href} href={href}>
                    <span
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                      style={
                        active
                          ? { background: "hsl(12 49% 58% / 0.2)", color: "hsl(12 70% 80%)" }
                          : { color: "hsl(35 30% 70%)" }
                      }
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 23%)";
                        if (!active) (e.currentTarget as HTMLElement).style.color = "hsl(35 50% 88%)";
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = "";
                        if (!active) (e.currentTarget as HTMLElement).style.color = "hsl(35 30% 70%)";
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{label}</span>
                      {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                    </span>
                  </Link>
                );
              })
            ) : (
              <span
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm opacity-40 cursor-default"
                style={{ color: "hsl(35 30% 70%)" }}
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
          <div className="px-2 py-2 border-t" style={{ borderColor: "hsl(221 46% 24%)" }}>
            <p className="px-3 mb-1 text-[10px] uppercase tracking-wider" style={{ color: "hsl(35 20% 45%)" }}>
              My stores
            </p>
            {allStores.filter(s => resolveStoreId(s) !== resolveStoreId(store)).map(s => (
              <Link key={resolveStoreId(s)} href={`/store/${resolveStoreId(s)}`}>
                <span
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                  style={{ color: "hsl(35 20% 55%)" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 23%)";
                    (e.currentTarget as HTMLElement).style.color = "hsl(35 40% 78%)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "";
                    (e.currentTarget as HTMLElement).style.color = "hsl(35 20% 55%)";
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
          className="px-4 py-3 border-t flex items-center gap-3"
          style={{ borderColor: "hsl(221 46% 24%)" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "hsl(35 50% 85%)" }}>
              {user?.name}
            </p>
            <p className="text-xs truncate" style={{ color: "hsl(35 20% 55%)" }}>
              {rolePretty[role] ?? role}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "hsl(35 20% 55%)" }}
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top bar */}
        <header
          className="h-14 flex items-center px-6 border-b bg-card shrink-0"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <div className="flex-1" />
          <div className="flex items-center gap-2">
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
              {store.name}
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
