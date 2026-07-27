/**
 * Shell — Daybook Admin layout (platform catalog authoring, super_admin only).
 *
 * Sidebar collapses to icon-only rail (64 px) via collapsible="icon".
 * State is persisted to localStorage under the key "admin_sidebar_collapsed".
 * Active-item indicator (data-[active=true]) is always visible in both states.
 *
 * ── Nav structure ─────────────────────────────────────────────────────────────
 * STUDIOS  · Planner · Sticker · Marketing
 * CATALOG  · Themes · Palettes · Backgrounds · Inserts · Widgets
 * PLATFORM · Plans · Users · Ink · AI settings · Google sync · Calendar
 */
import { useState } from "react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarFooter, SidebarProvider, SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Home, Palette, FileImage, Layers3, BookOpen,
  Users, Settings, RefreshCw, BarChart2, LogOut,
  CalendarDays, ArrowLeft, Pen, Image, Sticker,
  Store, Megaphone, LayoutTemplate, Shapes, Brush,
  Link2, Paperclip, Type,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";

// ── Nav definition ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Dashboard",          icon: Home,           href: "/" },
  { label: "Planner Studio",     icon: LayoutTemplate, href: "/studios/planner",       group: "Studios" },
  { label: "Sticker Studio",     icon: Sticker,        href: "/studios/stickers",      group: "Studios" },
  { label: "Marketing Studio",   icon: Megaphone,      href: "/studios/marketing",     group: "Studios" },
  { label: "Theme Studio",       icon: Brush,          href: "/studios/theme-builder", group: "Studios" },
  { label: "Themes",             icon: Palette,        href: "/catalog/themes",     group: "Catalog" },
  { label: "Backgrounds",        icon: Image,          href: "/catalog/backgrounds",group: "Catalog" },
  { label: "Inserts",            icon: FileImage,      href: "/catalog/inserts",    group: "Catalog" },
  { label: "Widgets",            icon: Shapes,         href: "/catalog/widgets",    group: "Catalog" },
  { label: "Palettes",           icon: BarChart2,      href: "/catalog/palettes",   group: "Parts" },
  { label: "Hardware",           icon: Link2,          href: "/catalog/hardware",   group: "Parts" },
  { label: "Accessories",        icon: Paperclip,      href: "/catalog/accessories",group: "Parts" },
  { label: "Fonts",              icon: Type,           href: "/catalog/fonts",      group: "Parts" },
  { label: "Plans",              icon: BookOpen,       href: "/plans",              group: "Platform" },
  { label: "Users",              icon: Users,          href: "/users",              group: "Platform" },
  { label: "Ink ✦",             icon: Pen,            href: "/ink",                group: "Platform" },
  { label: "AI settings",        icon: Settings,       href: "/ai-settings",        group: "Platform" },
  { label: "Google sync",        icon: RefreshCw,      href: "/sync",               group: "Platform" },
  { label: "Calendar",           icon: CalendarDays,   href: "/calendar",           group: "Platform" },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

// ── NavItem — tooltip only when sidebar is collapsed ──────────────────────────
// Must be a separate component so useSidebar() runs inside SidebarProvider tree.

function NavItemRow({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const { state } = useSidebar();

  const button = (
    <SidebarMenuButton asChild isActive={isActive}>
      <Link href={item.href} className="flex items-center gap-3">
        <item.icon className="w-4 h-4" />
        <span>{item.label}</span>
      </Link>
    </SidebarMenuButton>
  );

  return (
    <SidebarMenuItem>
      {state === "collapsed" ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      ) : button}
    </SidebarMenuItem>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { openAssistant } = useAiDrawer();

  // Persist collapse state to localStorage (true = expanded)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("admin_sidebar_collapsed") !== "true"; }
    catch { return true; }
  });

  const handleOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    try { localStorage.setItem("admin_sidebar_collapsed", open ? "false" : "true"); }
    catch { /* ignore private-browsing exceptions */ }
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { window.location.href = "/login"; },
    });
  };

  const groups = NAV_ITEMS.reduce((acc, item) => {
    const group = (item as { group?: string }).group || "Main";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item as NavItem);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    // SidebarProvider manages collapsed/expanded state and CSS vars.
    // It renders its own flex wrapper, replacing the old outer div.
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleOpenChange}
      className="bg-background text-foreground"
      style={{ minHeight: "100svh" }}
    >
      {/* ── Left rail ── */}
      <Sidebar
        collapsible="icon"
        variant="sidebar"
        className="border-r border-sidebar-border shadow-sm"
      >
        <SidebarHeader className="border-b border-sidebar-border">
          {/* Scope identity — icon always visible; text hides when collapsed */}
          <div className="px-4 h-14 flex items-center gap-2">
            <Layers3 className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="font-display font-semibold text-base text-sidebar-foreground leading-tight">
                Daybook admin
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 leading-tight">Platform catalog</p>
            </div>
          </div>

          {/* Back to super admin — hidden when collapsed */}
          <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
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
          {/* Dashboard (ungrouped) */}
          <SidebarMenu>
            {groups["Main"]?.map(item => (
              <NavItemRow key={item.href} item={item} isActive={location === item.href} />
            ))}
          </SidebarMenu>

          {/* Grouped sections */}
          {(["Studios", "Catalog", "Parts", "Platform"] as const).map(groupName => {
            const items = groups[groupName];
            if (!items?.length) return null;
            return (
              <SidebarGroup key={groupName} className="mt-3">
                <SidebarGroupLabel>{groupName}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map(item => (
                      <NavItemRow
                        key={item.href}
                        item={item}
                        isActive={location.startsWith(item.href) && item.href !== "/"}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}

          {/* Store console pointer — hidden when collapsed */}
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
              <p className="px-3 pt-1 pb-2 text-[10px] text-sidebar-foreground/40 leading-snug group-data-[collapsible=icon]:hidden">
                Per-store Planner, Sticker, and Marketing Studios are accessed by entering a store from Super Admin.
              </p>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
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

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center px-4 gap-3 border-b bg-card shrink-0 border-border">
          {/* Collapse toggle — left side of header */}
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <div className="flex-1" />
          {/*
            ✦ AI pill — shown on non-studio pages only.
            Studio pages (StudioLayout) render their own AI toggle in the studio
            top bar; showing both creates a duplicate. The shell pill is the entry
            point for catalog / platform pages; studios own theirs.
          */}
          {!location.startsWith("/studios") && (
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
          )}
        </header>
        {/*
          Content wrapper — two modes:
          · Studio pages: overflow-hidden, no padding, no max-width. StudioLayout
            owns both scroll and height via its own internal flex structure.
            The studio's -mx-8 -mt-8 trick compensates for p-8; removing the
            padding here also removes that need, but keeping overflow-hidden is
            what truly eliminates the outer scrollbar.
          · All other pages: scrollable, padded, constrained to max-w-6xl.
        */}
        {location.startsWith("/studios") ? (
          /*
           * Studio pages: keep p-8 on top+sides so StudioLayout's -mx-8 -mt-8
           * bleed-out still cancels the padding correctly, but strip bottom padding
           * (the -mb-8 is missing from StudioLayout because the bottom never needs
           * compensating — the studio body has an explicit viewport-anchored height).
           * overflow-hidden kills the outer scrollbar; the studio center has its
           * own overflow-y-auto scroll context.
           */
          <div className="flex-1 overflow-hidden pt-8 px-8">
            {children}
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-6xl mx-auto">{children}</div>
          </div>
        )}
      </main>
    </SidebarProvider>
  );
}
