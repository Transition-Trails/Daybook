import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarFooter } from '@/components/ui/sidebar';
import { Home, Palette, Sticker, FileImage, Layers3, BookOpen, Crown, Users, Settings, RefreshCw, BarChart2, Package2, LogOut, Wand2, CalendarDays } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useLogout, useGetMe } from '@workspace/api-client-react';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: Home, href: '/' },
  { label: 'Themes', icon: Palette, href: '/catalog/themes', group: 'Catalog' },
  { label: 'Sticker Packs', icon: Sticker, href: '/catalog/packs', group: 'Catalog' },
  { label: 'Inserts', icon: FileImage, href: '/catalog/inserts', group: 'Catalog' },
  { label: 'Related Products', icon: Package2, href: '/catalog/products', group: 'Catalog' },
  { label: 'Editions', icon: BookOpen, href: '/editions', group: 'Products' },
  { label: 'Plans', icon: Crown, href: '/plans', group: 'Products' },
  { label: 'Planner Builder', icon: Wand2, href: '/planners/builder', group: 'Products' },
  { label: 'Users', icon: Users, href: '/users', group: 'System' },
  { label: 'AI Settings', icon: Settings, href: '/ai-settings', group: 'System' },
  { label: 'Google Sync', icon: RefreshCw, href: '/sync', group: 'System' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar', group: 'System' },
  { label: 'Trend Research', icon: BarChart2, href: '/trends', group: 'System' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = '/login';
      }
    });
  };

  const groups = NAV_ITEMS.reduce((acc, item) => {
    const group = item.group || 'Main';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, typeof NAV_ITEMS>);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar variant="sidebar" className="border-r border-sidebar-border shadow-sm">
        <SidebarHeader className="h-16 flex items-center px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-display font-bold text-lg tracking-tight text-sidebar-foreground">
            <Layers3 className="w-6 h-6 text-primary" />
            <span>Daybook Studio</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="py-4">
          <SidebarMenu>
            {groups['Main']?.map(item => (
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
          
          {Object.entries(groups).filter(([key]) => key !== 'Main').map(([groupName, items]) => (
            <SidebarGroup key={groupName} className="mt-4">
              <SidebarGroupLabel>{groupName}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map(item => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={location.startsWith(item.href) && item.href !== '/'}>
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
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sidebar-foreground">{user?.name}</span>
              <span className="text-xs text-sidebar-foreground/70">{user?.role}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-sidebar-accent rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
