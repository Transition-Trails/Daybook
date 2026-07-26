/**
 * Shell — Daybook Admin layout (platform catalog authoring, super_admin only).
 *
 * Scope: Platform catalog. All routes here live under /daybook/... and are
 * accessible only to super_admin.
 *
 * ── Nav structure ─────────────────────────────────────────────────────────────
 *
 * STUDIOS  (one workspace per product domain — AI generation is a dock inside
 *           each studio, not a separate nav destination)
 *   Planner Studio   — Build · Editions · Inserts & widgets · Cover · Dividers
 *                      · Theme · Paper & binding · Quality check
 *   Sticker Studio   — Library · Create a sticker · Assemble a pack
 *   Marketing Studio — Trends · Listing generator · Social posts · Promo mockups
 *
 * CATALOG  (platform-level asset types shared across studios)
 *   Themes · Palettes · Backgrounds · Inserts · Widgets · Related products
 *
 * PLATFORM
 *   Plans · Users · Ink · AI settings · Google sync · Calendar
 */
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Home, Palette, FileImage, Layers3, BookOpen,
  Users, Settings, RefreshCw, BarChart2, Package2, LogOut,
  CalendarDays, ArrowLeft, Pen, Image, Sticker, Store,
  Megaphone, LayoutTemplate, Shapes,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";

// ── Nav definition ─────────────────────────────────────────────────────────────
// Studios = one entry per product domain. AI generation lives as a mode inside
// each studio's dock — there is no separate "AI Studios" section.
// Catalog = platform-level shared asset types.
// Platform = system / ops / tooling entries.

const NAV_ITEMS = [
  { label: "Dashboard",          icon: Home,           href: "/" },
  // ── Studios ──────────────────────────────────────────────────────────────
  { label: "Planner Studio",     icon: LayoutTemplate, href: "/studios/planner",    group: "Studios" },
  { label: "Sticker Studio",     icon: Sticker,        href: "/studios/stickers",   group: "Studios" },
  { label: "Marketing Studio",   icon: Megaphone,      href: "/studios/marketing",  group: "Studios" },
  // ── Catalog ──────────────────────────────────────────────────────────────
  // Shared platform asset types referenced by the studios above.
  { label: "Themes",             icon: Palette,        href: "/catalog/themes",     group: "Catalog" },
  { label: "Palettes",           icon: BarChart2,      href: "/catalog/palettes",   group: "Catalog" },
  { label: "Backgrounds",        icon: Image,          href: "/catalog/backgrounds",group: "Catalog" },
  { label: "Inserts",            icon: FileImage,      href: "/catalog/inserts",    group: "Catalog" },
  { label: "Widgets",            icon: Shapes,         href: "/catalog/widgets",    group: "Catalog" },
  // Related products merged into Planner Studio (Editions) — no longer a separate nav entry.
  // ── Platform ─────────────────────────────────────────────────────────────
  { label: "Plans",              icon: BookOpen,       href: "/plans",              group: "Platform" },
  { label: "Users",              icon: Users,          href: "/users",              group: "Platform" },
  { label: "Ink ✦",             icon: Pen,            href: "/ink",                group: "Platform" },
  { label: "AI settings",        icon: Settings,       href: "/ai-settings",        group: "Platform" },
  { label: "Google sync",        icon: RefreshCw,      href: "/sync",               group: "Platform" },
  { label: "Calendar",           icon: CalendarDays,   href: "/calendar",           group: "Platform" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { openAssistant } = useAiDrawer();

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
            <a
              href="/super"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent no-underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to super admin
            </a>
          </div>
        </SidebarHeader>

        <SidebarContent className="py-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
          {/* Dashboard (ungrouped, always first) */}
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

          {/* Grouped sections — Studios first, then Catalog, then Platform */}
          {(["Studios", "Catalog", "Platform"] as const).map(groupName => {
            const items = groups[groupName];
            if (!items?.length) return null;
            return (
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
            );
          })}

          {/* Store console pointer */}
          <SidebarGroup className="mt-3">
            <SidebarGroupLabel>Store console</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a
                      href="/super/stores"
                      className="flex items-center gap-3 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                    >
                      <Store className="w-4 h-4" />
                      <span>Browse stores</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <p className="px-3 pt-1 pb-2 text-[10px] text-sidebar-foreground/40 leading-snug">
                Per-store Planner, Sticker, and Marketing Studios are accessed by entering a store from Super Admin.
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
          <div className="flex items-center gap-2">
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
                background: "rgba(200,117,96,0.13)",
                color: "#C87560",
                border: "1px solid rgba(200,117,96,0.28)",
                transition: "background 140ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,117,96,0.22)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,117,96,0.13)"; }}
            >
              ✦ AI
            </button>
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
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
