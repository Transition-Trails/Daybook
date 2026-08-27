import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import {
  BookCopy,
  BookMarked,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileText,
  Flag,
  Globe2,
  Home,
  LayoutDashboard,
  MailCheck,
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
  RefreshCw,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import {
  resolveStoreId,
  storesApi,
  type MeStore,
  type StoreImpersonation,
} from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeaderTargetContext } from "@/components/shared/page-header-context";
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
  content: true,
  settings: true,
  catalog: true,
  studios: true,
  support: true,
  shop: true,
  build: true,
  manage: true,
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

function NavItemLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const ItemIcon = item.icon;
  return (
    <Link href={item.href} aria-label={item.label} title={item.label}>
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
          const isConsoleRoot = item.href === "/super" || /^\/store\/[^/]+$/.test(item.href);
          const active =
            isConsoleRoot
              ? location === item.href
              : location === item.href || location.startsWith(`${item.href}/`);
          return <NavItemLink key={`${item.href}-${item.label}`} item={item} active={active} />;
        })}
      </div>
    </section>
  );
}

function ImpersonationBanner({
  storeName,
  onExit,
  exiting,
}: {
  storeName: string;
  onExit: () => void;
  exiting: boolean;
}) {
  return (
    <div className="admin-impersonation" role="status">
      <span className="admin-impersonation__tag">Viewing as</span>
      <span className="truncate">
        You are inside <strong>{storeName}</strong> as super admin. Edits are logged to the audit trail.
      </span>
      <button
        type="button"
        className="admin-impersonation__exit"
        onClick={onExit}
        disabled={exiting}
      >
        {exiting ? "Exiting…" : "Exit store"}
      </button>
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
  const [location, navigate] = useLocation();
  const { data: user } = useGetMe();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { openAssistant } = useAiDrawer();
  const [groups, setGroups] = useState(readGroupState);
  const [pageHeaderTarget, setPageHeaderTarget] = useState<HTMLDivElement | null>(null);
  const storeId = store ? resolveStoreId(store) : "";

  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify(groups));
    } catch {
      // Storage may be unavailable in private browsing; navigation still works.
    }
  }, [groups]);

  const impersonation = (user as typeof user & {
    impersonation?: StoreImpersonation | null;
  } | undefined)?.impersonation ?? null;
  const isImpersonating =
    role === "owner" &&
    impersonation?.storeId === storeId;
  const exitImpersonation = useMutation({
    mutationFn: storesApi.impersonation.exit,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], (current: unknown) => (
        current && typeof current === "object"
          ? { ...current, impersonation: null }
          : current
      ));
      navigate("/super");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
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
            { label: "Revenue", href: "/super/revenue", icon: DollarSign },
          ],
        },
        {
          id: "platform",
          label: "Platform",
          items: [
            { label: "Stores", href: "/super/stores", icon: Store },
            { label: "Feature flags", href: "/super/flags", icon: Flag },
            { label: "Releases", href: "/super/releases", icon: Rocket },
            { label: "Audit log", href: "/super/audit", icon: ClipboardList },
            { label: "Deliverability", href: "/super/email/deliverability", icon: MailCheck },
          ],
        },
        {
          id: "content",
          label: "Content",
          items: [
            { label: "Promote content", href: "/super/promote", icon: Megaphone },
            { label: "Planner interiors", href: "/super/planner-interiors", icon: BookCopy },
            { label: "Ink library", href: "/super/ink", icon: FileText },
          ],
        },
        {
          id: "settings",
          label: "Settings",
          items: [
            { label: "Plans", href: "/super/plans", icon: BookOpen },
            { label: "Users", href: "/super/users", icon: Users },
            { label: "AI settings", href: "/super/settings/ai", icon: Settings2 },
            { label: "Google sync", href: "/super/settings/google", icon: RefreshCw },
            { label: "Calendar", href: "/super/settings/calendar", icon: CalendarDays },
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
            { label: "Support patterns", href: "/super/support/patterns", icon: ClipboardList },
          ],
        },
      ];
    }
    const base = `/store/${storeId}`;
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
          ...(canPublish ? [{ label: "All studios", href: `${base}/studios`, icon: Sparkles }] : []),
        ],
      },
      {
        id: "manage",
        label: "Manage",
        items: [
          ...(canPublish ? [
            { label: "Planner builds", href: `${base}/builds`, icon: FileText },
            { label: "Sticker library", href: `${base}/stickers`, icon: Tags },
            { label: "Widgets", href: `${base}/widgets`, icon: WandSparkles },
          ] : []),
          { label: "Store profile", href: `${base}/settings/profile`, icon: Settings2 },
          ...(canPublish ? [{ label: "Email settings", href: `${base}/email-settings`, icon: Receipt }] : []),
        ],
      },
      {
        id: "support",
        label: "Support",
        items: [
          ...(canPublish ? [
            { label: "Buyer support inbox", href: `${base}/support-inbox`, icon: Users },
            { label: "Support patterns", href: `${base}/support-patterns`, icon: ClipboardList },
          ] : []),
          { label: "Help center", href: `${base}/help`, icon: CircleHelp },
        ],
      },
    ];
  }, [role, storeId, storeRole]);

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
        {isImpersonating && (
          <ImpersonationBanner
            storeName={store?.name ?? storeId}
            onExit={() => exitImpersonation.mutate()}
            exiting={exitImpersonation.isPending}
          />
        )}
        <header className="admin-page-header">
          <div ref={setPageHeaderTarget} className="admin-page-header__page-slot">
            <span className="admin-page-header__title-context">
              {titleContext ?? (role === "super" ? "Platform" : store?.name)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="admin-ai-button" onClick={openAssistant}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI assistant
            </button>
            <span className="admin-role-pill">{roleLabel}</span>
          </div>
        </header>
        <PageHeaderTargetContext.Provider value={pageHeaderTarget}>
          <main className="admin-content">
            <div className={cn("admin-content__inner", location.includes("/studios/") && "admin-content__inner--studio")}>
              {children}
            </div>
          </main>
        </PageHeaderTargetContext.Provider>
      </div>
    </div>
  );
}

export { ImpersonationBanner };
