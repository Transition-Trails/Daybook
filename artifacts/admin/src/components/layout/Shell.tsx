/**
 * Shell — Daybook Admin layout (catalog authoring, super_admin only).
 * Reskinned with Pixel Perfect Plans tokens.
 */
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Home, Palette, Sticker, FileImage, Layers3, BookOpen,
  Users, Settings, RefreshCw, BarChart2, Package2, LogOut,
  Wand2, CalendarDays, ArrowLeft, Sparkles, TrendingUp, Pen,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";

const NAV_ITEMS = [
  { label: "Dashboard",       icon: Home,        href: "/" },
  { label: "Themes",          icon: Palette,     href: "/catalog/themes",   group: "Catalog" },
  { label: "Stickers",         icon: Sticker,     href: "/catalog/stickers", group: "Catalog" },
  { label: "Packs",            icon: Sticker,     href: "/catalog/packs",    group: "Catalog" },
  { label: "Inserts",         icon: FileImage,   href: "/catalog/inserts",  group: "Catalog" },
  { label: "Related products",icon: Package2,    href: "/catalog/products", group: "Catalog" },
  { label: "Editions",        icon: BookOpen,    href: "/editions",         group: "Products" },
  { label: "Planner builder", icon: Wand2,       href: "/planners/builder", group: "Products" },
  { label: "Ink ✦",          icon: Pen,         href: "/ink",              group: "Products" },
  { label: "Theme Studio",    icon: Palette,     href: "/studios/theme",    group: "AI Studios" },
  { label: "Sticker Studio",  icon: Sticker,     href: "/studios/stickers", group: "AI Studios" },
  { label: "Edition Studio",  icon: BookOpen,    href: "/studios/edition",  group: "AI Studios" },
  { label: "Trend Research",  icon: TrendingUp,  href: "/studios/trends",   group: "AI Studios" },
  { label: "Users",           icon: Users,       href: "/users",            group: "System" },
  { label: "AI settings",     icon: Settings,    href: "/ai-settings",      group: "System" },
  { label: "Google sync",     icon: RefreshCw,   href: "/sync",             group: "System" },
  { label: "Calendar",        icon: CalendarDays,href: "/calendar",         group: "System" },
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
        <SidebarHeader className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-display font-semibold text-base text-sidebar-foreground">
            <Layers3 className="w-5 h-5 text-primary" />
            <span>Daybook admin</span>
          </div>
        </SidebarHeader>

        {/* Back to super admin */}
        <div className="px-2 pt-3 pb-1">
          <Link href="/super">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to super admin
            </span>
          </Link>
        </div>

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
            Catalog authoring
          </span>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
