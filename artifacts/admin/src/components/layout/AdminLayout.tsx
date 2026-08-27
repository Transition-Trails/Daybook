import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import {
  Activity,
  BookCopy,
  BookMarked,
  BookOpen,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileText,
  Flag,
  Globe2,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Palette,
  Receipt,
  Rocket,
  Settings2,
  Shield,
  Sparkles,
  Store,
  Tags,
  Users,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import { resolveStoreId, flagsQueryOptions, type MeStore } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

type ShellRole = "super" | "owner";
type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string | number;
  external?: boolean;
};
type NavGroup = { id: string; label: string; items: NavItem[] };

const NAV_KEY = "daybook.nav.groups";
const NAV_DEFAULTS = {
  overview: true,
  platform: true,
  catalog: true,
  studios: true,
  support: true,
  shop: true,
  build: true,
  account: true,
};

function readGroupState(): Record<string, boolean> {
  if (typeof window === "undefined") return NAV_DEFAULTS;
  try {
    const parsed = JSON.parse(localStorage.getItem(NAV_KEY) ?? "{}");
    return { ...NAV_DEFAULTS, ...parsed };
  } catch {
    return NAV_DEFAULTS;
  }
}

function NavGroupView({
  group,
  open,
  onToggle,
  location,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  location: string;
}) {
  return (
    <section className="admin-nav-group">
      <button
        type="button"
        className="admin-nav-group__header"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{group.label}</span>
        <ChevronDown className={cn("admin-nav-group__caret", open && "is-open")} aria-hidden="true" />
      </button>
      <div className={cn("admin-nav-group__items", !open && "is-collapsed")}>
        {group.items.map((item) => {
          const active =
            item.href === "/super" || item.href.startsWith("/store/")
              ? location === item.href
              : location === item.href || location.startsWith(`${item.href}/`);
          const ItemIcon = item.icon;
          return (
            <Link key={`${item.href}-${item.label}`} href={item.href}>
              <span
                className={cn("admin-nav-item", active && "is-active")}
                aria-current={active ? "page" : undefined}
              >
                <ItemIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && <span className="admin-nav-badge">{item.badge}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ImpersonationBanner({ storeName }: { storeName: string }) {
  return (
    <div className="admin-impersonation" role="status">
      <span className="admin-impersonation__tag">Viewing as</span>
      <span className="truncate">
        You are inside <strong>{storeName}</strong> as super admin. Edits are logged to the audit trail.
      </span>
      <Link href="/super">
        <span className="admin-impersonation__exit">
          <span className="sr-only">Leave store</span>
          Exit store
        </span>
      </Link>
    </div>
  );
}

export interface AdminLayoutProps {
  children: React.ReactNode;
  role: ShellRole;
  storeRole?: string;
  store?: MeStore;
  allStores?: MeStore[];
  titleContext?: string;
}

export function AdminLayout({ children, role, storeRole, store, allStores = [], titleContext }: AdminLayoutProps) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { openAssistant } = useAiDrawer();
  const [groups, setGroups] = useState(readGroupState);
  const storeId = store ? resolveStoreId(store) : "";
  const { data: flags } = useQuery({
    ...flagsQueryOptions(storeId),
    enabled: role === "owner" && Boolean(storeId),
  });

  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify(groups));
    } catch {
      // Storage may be unavailable in private browsing; navigation still works.
    }
  }, [groups]);

  const isImpersonating = role === "owner" && store?.role === "super_admin" && storeId !== "store-house";
  const roleLabel = role === "super" || storeRole === "super_admin"
    ? "Super admin"
    : storeRole === "store_owner"
      ? "Store owner"
      : storeRole === "store_staff"
        ? "Store staff"
        : storeRole === "support"
          ? "Support"
          : "Customer";

  const navGroups = useMemo<NavGroup[]>(() => {
    if (role === "super") {
      return [
        {
          id: "overview",
          label: "Overview",
          items: [
            { label: "Dashboard", href: "/super", icon: LayoutDashboard },
            { label: "Revenue", href: "/super/revenue", icon: Activity },
          ],
        },
        {
          id: "platform",
          label: "Platform",
          items: [
            { label: "Stores", href: "/super/stores", icon: Store },
            { label: "Feature flags", href: "/super/flags", icon: Flag },
            { label: "Releases", href: "/super/releases", icon: Rocket },
            { label: "Promote content", href: "/super/promote", icon: Megaphone },
            { label: "Deliverability", href: "/super/email/deliverability", icon: Receipt },
            { label: "Audit log", href: "/super/audit", icon: ClipboardList },
          ],
        },
        {
          id: "catalog",
          label: "Catalog",
          items: [
            { label: "Catalog authoring", href: "/super/catalog", icon: Package },
            { label: "Product recipes", href: "/super/recipes", icon: WandSparkles },
            { label: "Global catalog", href: "/super/catalog/global", icon: Globe2 },
          ],
        },
        {
          id: "studios",
          label: "Studios",
          items: [
            { label: "All studios", href: "/super/studios", icon: Sparkles },
            { label: "WorldSmith Studio", href: "/super/worldsmith", icon: BookOpen },
          ],
        },
        {
          id: "support",
          label: "Support",
          items: [
            { label: "Help center", href: "/super/help", icon: CircleHelp },
            { label: "Support inbox", href: "/super/support", icon: Users },
          ],
        },
      ];
    }
    const base = `/store/${storeId}`;
    const studioEnabled = Boolean(flags?.aiEnabled) || store?.role === "super_admin" || storeId === "store-house";
    const canPublish = storeRole === "store_owner" || storeRole === "store_staff" || storeRole === "super_admin";
    return [
      {
        id: "shop",
        label: "Your shop",
        items: [
          { label: "Home", href: base, icon: Home },
          ...(canPublish ? [{ label: "Products", href: `${base}/catalog`, icon: Package }] : []),
          { label: "Orders", href: `${base}/orders`, icon: Receipt },
          ...(canPublish ? [
            { label: "Customers", href: `${base}/customers`, icon: Users },
            { label: "Staff & roles", href: `${base}/staff`, icon: Shield },
          ] : []),
        ],
      },
      {
        id: "build",
        label: "Build",
        items: [
          ...(canPublish ? [{ label: "Themes & assets", href: `${base}/my-content`, icon: Palette }] : []),
          ...(canPublish && studioEnabled ? [
            { label: "All studios", href: `${base}/studios/edition`, icon: Sparkles },
            { label: "Theme Studio", href: `${base}/studios/theme`, icon: Palette },
            { label: "Sticker Studio", href: `${base}/studios/stickers`, icon: Tags },
            { label: "Edition Studio", href: `${base}/studios/edition`, icon: BookCopy },
            { label: "Planner Studio", href: `${base}/studios/planners`, icon: FileText },
            { label: "Trend Research", href: `${base}/studios/trends`, icon: Activity },
            { label: "Marketing Studio", href: `${base}/studios/marketing`, icon: Megaphone },
            { label: "Product Builder", href: `${base}/build`, icon: WandSparkles },
          ] : canPublish ? [{ label: "Studios (not enabled)", href: `${base}#studios-disabled`, icon: Sparkles }] : []),
        ],
      },
      {
        id: "account",
        label: "Account",
        items: [
          { label: "Plan & billing", href: `${base}/settings/profile`, icon: Shield },
          { label: "Help center", href: `${base}/help`, icon: CircleHelp },
        ],
      },
    ];
  }, [flags?.aiEnabled, role, store?.role, storeId, storeRole]);

  const toggleGroup = (id: string) => setGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => { window.location.href = "/login"; } });
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__header">
          <BookMarked className="h-5 w-5 shrink-0 text-[#C87560]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="admin-brand">Daybook</p>
            <p className="admin-scope">{role === "super" ? "Platform admin" : store?.name ?? "Store admin"}</p>
          </div>
        </div>

        {isImpersonating && (
          <div className="px-3 pt-3">
            <Link href="/super">
              <span className="admin-store-entry mb-0">← Back to platform</span>
            </Link>
          </div>
        )}

        <nav className="admin-sidebar__nav" aria-label="Admin navigation">
          {navGroups.map((group) => (
            <NavGroupView
              key={group.id}
              group={group}
              open={groups[group.id] ?? true}
              onToggle={() => toggleGroup(group.id)}
              location={location}
            />
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          {role === "super" && (
            <Link href="/super/stores">
              <span className="admin-store-entry">
                <Store className="h-3.5 w-3.5" aria-hidden="true" />
                Enter a customer store
              </span>
            </Link>
          )}
          {role === "owner" && allStores.length > 1 && (
            <div className="admin-store-switcher">
              <span className="admin-eyebrow">My stores</span>
              {allStores.filter((item) => resolveStoreId(item) !== storeId).map((item) => (
                <Link key={resolveStoreId(item)} href={`/store/${resolveStoreId(item)}`}>
                  <span className="admin-store-switcher__item">{item.name}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="admin-user">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name ?? "Daybook user"}</p>
              <p className="truncate text-xs text-[#8FA0BC]">{roleLabel}</p>
            </div>
            <button type="button" onClick={handleLogout} className="admin-icon-button" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        {isImpersonating && <ImpersonationBanner storeName={store?.name ?? storeId} />}
        <header className="admin-page-header">
          <div className="flex items-center gap-2">
            <span className="admin-page-header__title-context">{titleContext ?? (role === "super" ? "Platform" : store?.name)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="admin-ai-button" onClick={openAssistant}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI assistant
            </button>
            <span className="admin-role-pill">{roleLabel}</span>
          </div>
        </header>
        <main className="admin-content">
          <div className={cn("admin-content__inner", location.includes("/studios/") && "admin-content__inner--studio")}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { ImpersonationBanner };