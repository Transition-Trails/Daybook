/**
 * SuperAdminShell — layout for the Super Admin console.
 * Scope: Platform operations (stores, revenue, flags, audit).
 *
 * Cross-console navigation:
 *  • Daybook admin  → /daybook  (platform catalog authoring)
 *  • Enter a store  → /super/stores → pick any store → /store/:id
 *  • Store inspector → /super/stores/:id/inspect (read-only support view)
 */
import { Link, useLocation } from "wouter";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Store,
  Globe,
  TrendingUp,
  BookOpen,
  ToggleLeft,
  ClipboardList,
  LogOut,
  BookMarked,
  ChevronRight,
  Layers3,
  ArrowUpRight,
  Sparkles,
  FlaskConical,
} from "lucide-react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";

const NAV = [
  { label: "Dashboard",       icon: LayoutDashboard, href: "/super" },
  { label: "Stores",          icon: Store,           href: "/super/stores" },
  { label: "Product recipes", icon: FlaskConical,    href: "/super/recipes" },
  { label: "Global catalog",  icon: Globe,           href: "/super/catalog" },
  { label: "Revenue",         icon: TrendingUp,      href: "/super/revenue" },
  { label: "Help center",     icon: BookOpen,        href: "/super/help" },
  { label: "Feature flags",   icon: ToggleLeft,      href: "/super/flags" },
  { label: "Audit log",       icon: ClipboardList,   href: "/super/audit" },
];

// ── AI button shared style ────────────────────────────────────────────────────
const aiBtnStyle: React.CSSProperties = {
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
};

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const { openAssistant } = useAiDrawer();

  const isActive = (href: string) =>
    href === "/super" ? location === "/super" : location.startsWith(href);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { window.location.href = "/login"; },
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col"
        style={{ background: "hsl(221 46% 17%)" }}
      >
        {/* Scope identity */}
        <div
          className="h-14 flex items-center px-5 gap-2 border-b"
          style={{ borderColor: "hsl(221 46% 24%)" }}
        >
          <BookMarked className="w-5 h-5 text-[#C87560] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-[hsl(35_52%_88%)] text-sm leading-tight">Daybook</p>
            <p className="text-[10px] leading-tight" style={{ color: "hsl(12 70% 72%)" }}>Super admin · Platform</p>
          </div>
        </div>

        {/* Main nav */}
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

          {/* ── Cross-console section ──────────────────────────────── */}
          <div className="pt-4 pb-1">
            <p
              className="px-3 mb-1.5 text-[10px] uppercase tracking-wider"
              style={{ color: "hsl(35 20% 40%)" }}
            >
              Switch console
            </p>

            {/* Enter a store — links to Stores picker which has "Enter store" buttons */}
            <Link href="/super/stores">
              <span
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
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
                <Store className="w-4 h-4 shrink-0 opacity-70" />
                <span>Enter a store</span>
                <ArrowUpRight className="w-3 h-3 ml-auto opacity-50" />
              </span>
            </Link>

            {/* Daybook admin (platform catalog) */}
            <Link href="/daybook">
              <span
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
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
                <Layers3 className="w-4 h-4 shrink-0 opacity-70" />
                <span>Daybook admin</span>
                <ArrowUpRight className="w-3 h-3 ml-auto opacity-50" />
              </span>
            </Link>
          </div>
        </nav>

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
              {user?.email}
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
            <button
              onClick={openAssistant}
              style={aiBtnStyle}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,117,96,0.22)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,117,96,0.13)"; }}
            >
              <Sparkles style={{ width: 12, height: 12 }} />
              AI
            </button>
            <span
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                background: "hsl(35 52% 94%)",
                borderColor: "hsl(37 37% 85%)",
                color: "hsl(216 27% 40%)",
              }}
            >
              Super admin · Platform
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
