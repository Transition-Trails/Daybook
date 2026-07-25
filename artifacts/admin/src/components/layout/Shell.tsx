/**
 * Shell — Daybook Admin layout (platform catalog authoring, super_admin only).
 *
 * Scope: Platform catalog. All routes here live under /daybook/... and are
 * accessible only to super_admin. Store-scoped studios (Planner, Marketing, etc.)
 * live under /store/:storeId/... — see the "Store console" section at the bottom.
 */
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Home, Palette, FileImage, Layers3, BookOpen,
  Users, Settings, RefreshCw, BarChart2, Package2, LogOut,
  Wand2, CalendarDays, ArrowLeft, Sparkles, TrendingUp, Pen,
  Image, Sticker, Store, ExternalLink,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";

// ── Nav definition ─────────────────────────────────────────────────────────────
// Catalog group follows the canonical order:
//   Themes → Palettes → Backgrounds → Stickers → Sticker packs → Inserts → Related products
//
// "Planner builder" removed — superseded by the per-store Planner Studio
//   (Store console → AI Studios → Planner Studio).
// "Editions" kept here because editions are PLATFORM catalog items that stores reference.

const NAV_ITEMS = [
  { label: "Dashboard",        icon: Home,        href: "/" },
  // ── Catalog ──────────────────────────────────────────────────────────────
  { label: "Themes",           icon: Palette,     href: "/catalog/themes",       group: "Catalog" },
  { label: "Palettes",         icon: BarChart2,   href: "/catalog/palettes",     group: "Catalog" },
  { label: "Backgrounds",      icon: Image,       href: "/catalog/backgrounds",  group: "Catalog" },
  { label: "Stickers",         icon: Sticker,     href: "/catalog/stickers",     group: "Catalog" },
  { label: "Sticker packs",    icon: Sticker,     href: "/catalog/packs",        group: "Catalog" },
  { label: "Inserts",          icon: FileImage,   href: "/catalog/inserts",      group: "Catalog" },
  { label: "Related products", icon: Package2,    href: "/catalog/products",     group: "Catalog" },
  // ── Products ─────────────────────────────────────────────────────────────
  { label: "Editions",         icon: BookOpen,    href: "/editions",             group: "Products" },
  { label: "Ink ✦",           icon: Pen,         href: "/ink",                  group: "Products" },
  // ── AI Studios (platform) ────────────────────────────────────────────────
  { label: "Theme Studio",     icon: Palette,     href: "/studios/theme",        group: "AI Studios" },
  { label: "Sticker Studio",   icon: Sticker,     href: "/studios/stickers",     group: "AI Studios" },
  { label: "Edition Studio",   icon: BookOpen,    href: "/studios/edition",      group: "AI Studios" },
  { label: "Trend Research",   icon: TrendingUp,  href: "/studios/trends",       group: "AI Studios" },
  // ── System ───────────────────────────────────────────────────────────────
  { label: "Users",            icon: Users,       href: "/users",                group: "System" },
  { label: "AI settings",      icon: Settings,    href: "/ai-settings",          group: "System" },
  { label: "Google sync",      icon: RefreshCw,   href: "/sync",                 group: "System" },
  { label: "Calendar",         icon: CalendarDays,href: "/calendar",             group: "System" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { window.location.href = "/login"; },
    });
  };

  const groups = NAV_ITEMS.reduce((acc, item) => {
    const group = item.group || "Main";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, typeof NAV_ITEMS>);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar variant="sidebar" className="border-r border-sidebar-border shadow-sm">
        <SidebarHeader className="border-b border-sidebar-border">
          {/* Scope identity: Platform catalog */}
          <div className="px-4 h-14 flex items-center gap-2">
            <Layers3 className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-base text-sidebar-foreground leading-tight">
                Daybook admin
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 leading-tight">Platform catalog</p>
            </div>
          </div>

          {/* Back to super admin — uses native <a> to escape the /daybook base router */}
          <div className="px-2 pb-2">
            <a href="/super" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent no-underline">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to super admin
            </a>
          </div>
        </SidebarHeader>

        <SidebarContent className="py-2">
          <SidebarMenu>
            {groups["Main"]?.map(item => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={location === item.href}>
                  <Link href={item.href} className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>

          {Object.entries(groups).filter(([key]) => key !== "Main").map(([groupName, items]) => (
            <SidebarGroup key={groupName} className="mt-3">
              <SidebarGroupLabel>{groupName}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map(item => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.startsWith(item.href) && item.href !== "/"}
                      >
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {/* Store console pointer ─────────────────────────────────────────
              Planner Studio, Marketing Studio, and other per-store AI studios
              live under the Store console (/store/:storeId/...).
              Access them by entering a store from Super Admin → Stores.       */}
          <SidebarGroup className="mt-3">
            <SidebarGroupLabel>Store console</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/super/stores" className="flex items-center gap-3 text-sidebar-foreground/60 hover:text-sidebar-foreground">
                      <Store className="w-4 h-4" />
                      <span>Browse stores</span>
                      <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <p className="px-3 pt-1 pb-2 text-[10px] text-sidebar-foreground/40 leading-snug">
                Planner Studio, Marketing Studio, and store-scoped AI studios are accessed by entering a store from Super Admin.
              </p>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.name}
              </span>
              <span className="text-xs text-sidebar-foreground/50">Super admin</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-sidebar-accent rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center px-6 border-b bg-card shrink-0 border-border">
          <div className="flex-1" />
          <span
            className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
            style={{
              background: "hsl(35 52% 94%)",
              borderColor: "hsl(37 37% 85%)",
              color: "hsl(216 27% 40%)",
            }}
          >
            Platform catalog
          </span>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
