/**
 * Marketing Studio — workspace for listing copy, social content, mockups, and
 * market trend research.
 *
 * Three-column layout via StudioLayout:
 *   LEFT RAIL  — mode context (active brief, market signals, channel)
 *   CENTER     — mode content (Trends, stubs for Listing / Social / Mockups / Images)
 *   RIGHT DOCK — AI Assistant + Publish panel
 *
 * Modes (top-bar pill switcher):
 *   Trends · Listing generator · Social posts · Promo mockups · Listing images
 */
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Megaphone, Sparkles, ExternalLink } from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  SectionLabel, ChipRow, SegmentedControl, EmptyState, RailCard, DockAiAssistant,
} from "@/components/studio/primitives";
import StudioTrendResearch from "@/pages/studios/TrendResearch";

// ── Modes ─────────────────────────────────────────────────────────────────────

const MODES = [
  { id: "trends",  label: "Trends" },
  { id: "listing", label: "Listing generator" },
  { id: "social",  label: "Social posts" },
  { id: "mockups", label: "Promo mockups" },
  { id: "images",  label: "Listing images" },
] as const;

type ModeId = typeof MODES[number]["id"];

const STUB_DESCRIPTIONS: Partial<Record<ModeId, { title: string; body: string; action?: string }>> = {
  listing: {
    title: "Listing generator",
    body:  "Generate optimised Etsy/Shopify listing titles, descriptions, and tags from your edition spec. Titles are keyword-rich and within character limits; descriptions follow the platform's proven structure.",
    action: "Pick an edition to generate listing copy",
  },
  social: {
    title: "Social posts",
    body:  "Create platform-ready social copy and caption sets for Instagram, Pinterest, and TikTok. Each post matches your brand voice and includes relevant hashtag stacks.",
    action: "Select a product to draft posts",
  },
  mockups: {
    title: "Promo mockups",
    body:  "Produce lifestyle mockup images by compositing edition covers into scene templates. Choose from desk, hand-held, and flat-lay scenes.",
    action: "Choose a scene template",
  },
  images: {
    title: "Listing images",
    body:  "Generate on-white and lifestyle product listing images compliant with Etsy and Shopify requirements. Images are sized at 2000×2000px with correct margins.",
    action: "Select an edition to generate images",
  },
};

// ── Coming soon stub ──────────────────────────────────────────────────────────

function ComingSoon({ mode }: { mode: ModeId }) {
  const info = STUB_DESCRIPTIONS[mode];
  return (
    <EmptyState
      icon={<Megaphone className="w-5 h-5 text-muted-foreground" />}
      title={info?.title ?? mode}
      description={info?.body}
      action={info?.action ? { label: info.action, onClick: () => {} } : undefined}
    />
  );
}

// ── Left rail: Trends ─────────────────────────────────────────────────────────

function TrendsRail({ market, setMarket, period, setPeriod }: {
  market: string; setMarket: (v: string) => void;
  period: string; setPeriod: (v: string) => void;
}) {
  return (
    <div className="p-4 space-y-5">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Trend research</p>
          <p className="text-[11px] text-muted-foreground">
            Generate market analysis cards with seasonal signals and specific product ideas.
            Each card ends in a quick-jump button to the relevant studio.
          </p>
        </div>
      </RailCard>

      <div className="space-y-2">
        <SectionLabel>Market</SectionLabel>
        <ChipRow
          options={[
            {value:"etsy",label:"Etsy"},
            {value:"shopify",label:"Shopify"},
            {value:"instagram",label:"Instagram"},
            {value:"pinterest",label:"Pinterest"},
          ]}
          value={market} onChange={setMarket}
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>Period</SectionLabel>
        <SegmentedControl
          options={[{value:"now",label:"Now"},{value:"q1",label:"Q1"},{value:"q2",label:"Q2"},{value:"q3",label:"Q3"},{value:"q4",label:"Q4"}]}
          value={period} onChange={setPeriod}
        />
      </div>
    </div>
  );
}

// ── Left rail: Listing ────────────────────────────────────────────────────────

function ListingRail({ platform, setPlatform }: { platform: string; setPlatform: (v: string) => void }) {
  return (
    <div className="p-4 space-y-5">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Listing generator</p>
          <p className="text-[11px] text-muted-foreground">
            Pick a platform, select an edition, and generate a full listing optimised for that platform's search algorithm.
          </p>
        </div>
      </RailCard>
      <div className="space-y-2">
        <SectionLabel>Platform</SectionLabel>
        <ChipRow
          options={[{value:"etsy",label:"Etsy"},{value:"shopify",label:"Shopify"},{value:"gumroad",label:"Gumroad"}]}
          value={platform} onChange={setPlatform}
        />
      </div>
    </div>
  );
}

// ── Left rail: Social ─────────────────────────────────────────────────────────

function SocialRail({ channel, setChannel }: { channel: string; setChannel: (v: string) => void }) {
  return (
    <div className="p-4 space-y-5">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Social posts</p>
          <p className="text-[11px] text-muted-foreground">
            Draft platform-native captions with hashtag stacks, optimal character counts, and call-to-action hooks.
          </p>
        </div>
      </RailCard>
      <div className="space-y-2">
        <SectionLabel>Channel</SectionLabel>
        <ChipRow
          options={[{value:"instagram",label:"Instagram"},{value:"pinterest",label:"Pinterest"},{value:"tiktok",label:"TikTok"}]}
          value={channel} onChange={setChannel}
        />
      </div>
    </div>
  );
}

// ── Publish dock panel ────────────────────────────────────────────────────────

function PublishDock() {
  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Publish
      </div>
      <div className="space-y-2">
        {[
          { label: "Etsy listing", href: "https://etsy.com", status: "Not connected" },
          { label: "Shopify store", href: "https://shopify.com", status: "Not connected" },
          { label: "Google Drive", href: "#", status: "Connected" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3 rounded-xl border p-3">
            <div style={{ display: "flex", flexDirection: "column", width: "100%", minWidth: 0, gap: 2 }}>
              <p className="text-[12.5px] font-semibold text-foreground truncate">{item.label}</p>
              <p
                className="text-[11px] font-medium"
                style={{ color: item.status === "Connected" ? "#3f6b4c" : "hsl(var(--muted-foreground))" }}
              >
                {item.status}
              </p>
            </div>
            <a href={item.href} target="_blank" rel="noreferrer"
               className="shrink-0 text-muted-foreground hover:text-foreground">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2">
        <button
          style={{ cursor: "pointer", width: "100%" }}
          className="flex items-center justify-center gap-2 py-2.5 rounded-full border text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          Connect a channel
        </button>
      </div>
    </div>
  );
}

// ── Main hub ──────────────────────────────────────────────────────────────────

export default function MarketingStudioHub() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode = (params.get("mode") ?? "trends") as ModeId;
  const validMode: ModeId = MODES.some(m => m.id === mode) ? mode : "trends";

  const setMode = (id: string) => navigate(`/studios/marketing?mode=${id}`);

  // Mode-specific local state
  const [market, setMarket]     = useState("etsy");
  const [period, setPeriod]     = useState("now");
  const [platform, setPlatform] = useState("etsy");
  const [channel, setChannel]   = useState("instagram");

  // ── Left rail ───────────────────────────────────────────────────────────
  const leftRail = (() => {
    if (validMode === "trends")  return <TrendsRail market={market} setMarket={setMarket} period={period} setPeriod={setPeriod} />;
    if (validMode === "listing") return <ListingRail platform={platform} setPlatform={setPlatform} />;
    if (validMode === "social")  return <SocialRail channel={channel} setChannel={setChannel} />;
    // Stubs
    return (
      <div className="p-4">
        <RailCard>
          <p className="text-[12px] text-muted-foreground">Configure options for this mode here.</p>
        </RailCard>
      </div>
    );
  })();

  // ── Right dock ──────────────────────────────────────────────────────────
  const rightDock = {
    assistant: (
      <DockAiAssistant
        systemPrompt={
          validMode === "trends"
            ? "You are a market trend analyst for the stationery and planner industry. Generate specific, actionable insights with concrete product ideas. Cite seasonal patterns, buyer psychology, and platform-specific SEO signals."
            : validMode === "listing"
            ? "You are an Etsy/Shopify SEO expert for digital planner products. Write listing copy that converts: keyword-rich titles (under 140 chars), structured descriptions with social proof, and tag sets optimised for discoverability."
            : validMode === "social"
            ? "You are a social media expert for stationery and planner sellers. Write platform-native content with hooks, visual cues, hashtag stacks, and CTAs that drive saves and click-throughs."
            : "You are a marketing creative director for digital planner products. Provide specific, visual, actionable suggestions."
        }
        placeholder={
          validMode === "trends" ? "Describe your niche and I'll find trending opportunities…"
            : validMode === "listing" ? "Paste your product name and description to generate listing copy…"
            : "Describe your product for this social post…"
        }
        examplePrompts={
          validMode === "trends"
            ? [
                "What planner themes are trending on Etsy for Q4?",
                "What buyer segment is growing fastest for digital planners?",
                "Which sticker styles have the highest sell-through rate?",
              ]
            : validMode === "listing"
            ? [
                "Write an Etsy title for a minimalist A5 weekly planner",
                "Generate 13 SEO tags for a digital bullet journal",
                "Write a description for a productivity planner with habit tracker",
              ]
            : [
                "Write 3 Instagram captions for a new sticker pack launch",
                "Suggest hashtag stacks for a planner unboxing reel",
                "Write a Pinterest description for a digital planner flat-lay",
              ]
        }
      />
    ),
    preview: <PublishDock />,
  };

  // ── Center content ──────────────────────────────────────────────────────
  const center = (() => {
    if (validMode === "trends") return <StudioTrendResearch />;
    return <ComingSoon mode={validMode} />;
  })();

  // ── Primary action ──────────────────────────────────────────────────────
  const primaryAction = (() => {
    if (validMode === "trends")
      return { label: "Research trends", icon: <Sparkles className="w-3.5 h-3.5" />, onClick: () => {} };
    if (validMode === "listing")
      return { label: "Generate listing", icon: <Sparkles className="w-3.5 h-3.5" />, onClick: () => {} };
    if (validMode === "social")
      return { label: "Draft posts", icon: <Sparkles className="w-3.5 h-3.5" />, onClick: () => {} };
    return undefined;
  })();

  return (
    <StudioLayout
      scope="Marketing Studio"
      modes={MODES}
      activeMode={validMode}
      onModeChange={setMode}
      status={{ label: "Platform", ok: true }}
      primaryAction={primaryAction}
      leftRail={leftRail}
      rightDock={rightDock}
    >
      {center}
    </StudioLayout>
  );
}
