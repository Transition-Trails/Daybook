/**
 * SuperAdminShell — layout for the Super Admin console.
 *
 * Sidebar structure:
 *   PLATFORM group     — all routes reachable with no store selected.
 *   PIXEL PERFECT PLANS group — house store surfaces, linked directly to
 *                        /store/store-house/... with no picker step.
 *   CUSTOMER STORE section — quiet link to enter a customer store for support.
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
  Mail,
  HeadphonesIcon,
  Hammer,
  Palette,
  BookCopy,
  CalendarDays,
  Megaphone,
  Sticker,
  Home,
  ArrowRight,
  ArrowUpFromLine,
} from "lucide-react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";

export const HOUSE_STORE_ID = "store-house";

// ── Platform nav items (no store required) ────────────────────────────────────
const PLATFORM_NAV = [
  { label: "Dashboard",       icon: LayoutDashboard, href: "/super" },
  { label: "Stores",          icon: Store,           href: "/super/stores" },
  { label: "Product recipes", icon: FlaskConical,    href: "/super/recipes" },
  { label: "Global catalog",  icon: Globe,           href: "/super/catalog" },
  { label: "Revenue",         icon: TrendingUp,      href: "/super/revenue" },
  { label: "Feature flags",   icon: ToggleLeft,      href: "/super/flags" },
  { label: "Help center",     icon: BookOpen,        href: "/super/help" },
  { label: "Support inbox",   icon: HeadphonesIcon,  href: "/super/support" },
  { label: "Deliverability",  icon: Mail,            href: "/super/email/deliverability" },
  { label: "Audit log",       icon: ClipboardList,   href: "/super/audit" },
  { label: "Promote content", icon: ArrowUpFromLine, href: "/super/promote" },
];

// ── House-store surfaces — go directly to /store/store-house/... ──────────────
const HOUSE_SURFACES = [
  { label: "Product Builder",  icon: Hammer,      href: `/store/${HOUSE_STORE_ID}/build` },
  { label: "Theme Studio",     icon: Palette,     href: `/store/${HOUSE_STORE_ID}/studios/theme` },
  { label: "Edition Studio",   icon: BookCopy,    href: `/store/${HOUSE_STORE_ID}/studios/edition` },
  { label: "Planner Studio",   icon: CalendarDays,href: `/store/${HOUSE_STORE_ID}/studios/planners` },
  { label: "Sticker Studio",   icon: Sticker,     href: `/store/${HOUSE_STORE_ID}/studios/stickers` },
  { label: "Marketing Studio", icon: Megaphone,   href: `/store/${HOUSE_STORE_ID}/studios/marketing` },
];

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

  const isPlatformActive = (href: string) =>
    href === "/super" ? location === "/super" : location.startsWith(href);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { window.location.href = "/login"; },
    });
  };

  const platformNavItem = (label: string, Icon: React.ElementType, href: string) => {
    const active = isPlatformActive(href);
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
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col overflow-y-auto"
        style={{ background: "hsl(221 46% 17%)" }}
      >
        {/* Scope identity */}
        <div
          className="h-14 flex items-center px-5 gap-2 border-b shrink-0"
          style={{ borderColor: "hsl(221 46% 24%)" }}
        >
          <BookMarked className="w-5 h-5 text-[#C87560] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-[hsl(35_52%_88%)] text-sm leading-tight">Daybook</p>
            <p className="text-[10px] leading-tight" style={{ color: "hsl(12 70% 72%)" }}>Super admin · Platform</p>
          </div>
        </div>

        {/* ── PLATFORM group ──────────────────────────────────────────── */}
        <nav className="py-3 px-2 space-y-0.5">
          <p
            className="px-3 mb-1 text-[10px] uppercase tracking-[0.18em] font-semibold"
            style={{ color: "hsl(35 20% 40%)" }}
          >
            Platform
          </p>
          {PLATFORM_NAV.map(({ label, icon: Icon, href }) =>
            platformNavItem(label, Icon, href),
          )}

          {/* Catalog authoring (daybook shell) */}
          <div className="pt-1">
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
                <span>Catalog authoring</span>
                <ArrowUpRight className="w-3 h-3 ml-auto opacity-50" />
              </span>
            </Link>
          </div>
        </nav>

        {/* ── PIXEL PERFECT PLANS — house store surfaces ──────────────── */}
        <div
          className="mx-2 mb-1 rounded-xl overflow-hidden"
          style={{ border: "1px solid hsl(150 30% 35%)", background: "hsl(150 25% 14%)" }}
        >
          {/* Section header */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: "hsl(150 25% 22%)" }}
          >
            <Home className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(150 45% 55%)" }} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold leading-tight" style={{ color: "hsl(150 40% 55%)" }}>
                Pixel Perfect Plans
              </p>
              <p className="text-[9px] leading-tight mt-0.5" style={{ color: "hsl(150 25% 45%)" }}>
                Your shop
              </p>
            </div>
          </div>
          {/* House store links — active, no picker needed */}
          <div className="py-1 px-1 space-y-0.5">
            {HOUSE_SURFACES.map(({ label, icon: Icon, href }) => {
              const active = location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <span
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                    style={
                      active
                        ? { background: "hsl(150 35% 22%)", color: "hsl(150 55% 75%)" }
                        : { color: "hsl(150 20% 60%)" }
                    }
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "hsl(150 25% 19%)";
                      if (!active) (e.currentTarget as HTMLElement).style.color = "hsl(150 35% 75%)";
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "";
                      if (!active) (e.currentTarget as HTMLElement).style.color = "hsl(150 20% 60%)";
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{label}</span>
                    {active && <ChevronRight className="w-2.5 h-2.5 ml-auto opacity-60" />}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Enter a customer store (support mode) ───────────────────── */}
        <div className="px-2 mb-3">
          <Link href="/super/stores">
            <span
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors"
              style={{ color: "hsl(35 20% 50%)", border: "1px solid hsl(221 46% 25%)" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 22%)";
                (e.currentTarget as HTMLElement).style.color = "hsl(35 35% 70%)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.color = "hsl(35 20% 50%)";
              }}
              title="Enter a customer store in support mode"
            >
              <Store className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span>Enter customer store</span>
              <ArrowRight className="w-3 h-3 ml-auto opacity-50" />
            </span>
          </Link>
        </div>

        {/* ── User footer ─────────────────────────────────────────────── */}
        <div
          className="px-4 py-3 border-t flex items-center gap-3 mt-auto shrink-0"
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
