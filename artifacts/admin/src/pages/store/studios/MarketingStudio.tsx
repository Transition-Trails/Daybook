/**
 * Marketing Studio — workbench + guided copilot.
 *
 * Layout: left tool rail + product picker │ center editable fields │ right copilot dock
 *
 * Three tools:
 *   Listing  — Etsy-ready title (char count), description, tags/SEO.
 *   Social   — Captions + hashtags per channel (Instagram, Pinterest, TikTok).
 *   Mockup   — AI-described scene frames (SIMULATED placeholder until real image model wired).
 *
 * Copilot dock: "Guide me" flow walks through questions; "Draft it all" runs
 * all three tools in sequence. Both modes share generated content.
 *
 * Only aiEnabled stores see this. Only owners can save assets.
 */
import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, ShoppingBag, Share2, ImageIcon, Bot, Send, Save,
  ChevronRight, Copy, Check, AlertTriangle, Sparkles, RefreshCw,
  BookOpen, Package, FileText, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  marketingApi,
  storeProfileApi,
  storeStudiosApi,
  copilotApi,
  type MarketingListingResult,
  type MarketingSocialPost,
  type MarketingMockupFrame,
  type StoreProfileVoice,
} from "@/lib/api";
import { AiDisabledState, SuperAdminAiBanner } from "./AiDisabledState";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = "listing" | "social" | "mockup";
type Channel = "etsy" | "tiktok" | "storefront";
type SocialChannel = "instagram" | "pinterest" | "tiktok";

interface SelectedProduct {
  type: "edition" | "pack";
  id: string;
  name: string;
}

interface CopilotMessage {
  role: "assistant" | "user";
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_META = {
  listing: { icon: ShoppingBag, label: "Listing",  desc: "Etsy · TikTok Shop · Storefront copy" },
  social:  { icon: Share2,      label: "Social",   desc: "Captions + hashtags per channel" },
  mockup:  { icon: ImageIcon,   label: "Mockups",  desc: "AI-described scene frames (simulated)" },
} as const;

const CHANNEL_LABELS: Record<Channel, string> = {
  etsy:       "Etsy",
  tiktok:     "TikTok Shop",
  storefront: "Daybook Storefront",
};

const SOCIAL_CHANNEL_LABELS: Record<SocialChannel, string> = {
  instagram: "Instagram",
  pinterest: "Pinterest",
  tiktok:    "TikTok",
};

const VOICE_PRESETS: { value: string; label: string; override: Partial<StoreProfileVoice> }[] = [
  { value: "profile",      label: "Use profile default", override: {} },
  { value: "professional", label: "Professional",        override: { formalityLevel: "formal",   emojiLevel: "none"  } },
  { value: "playful",      label: "Playful",             override: { formalityLevel: "playful",  emojiLevel: "light" } },
  { value: "casual",       label: "Casual",              override: { formalityLevel: "casual",   emojiLevel: "light" } },
];

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  storeId: string;
  role: string;
  aiEnabled: boolean;
}

export default function MarketingStudio({ storeId, role, aiEnabled }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = role === "store_owner" || role === "super_admin";

  if (!aiEnabled) return role === "super_admin" ? <SuperAdminAiBanner /> : <AiDisabledState />;

  // ── Global state ────────────────────────────────────────────────────────────
  const [activeTool,    setActiveTool]    = useState<Tool>("listing");
  const [product,       setProduct]       = useState<SelectedProduct | null>(null);
  const [brief,         setBrief]         = useState("");
  const [voicePreset,   setVoicePreset]   = useState("profile");

  // Listing state
  const [listingChannel, setListingChannel] = useState<Channel>("etsy");
  const [listing, setListing] = useState<MarketingListingResult | null>(null);
  const [listingTitle, setListingTitle] = useState("");
  const [listingDesc,  setListingDesc]  = useState("");
  const [listingTags,  setListingTags]  = useState<string[]>([]);

  // Social state
  const [socialChannels, setSocialChannels] = useState<SocialChannel[]>(["instagram"]);
  const [socialPosts, setSocialPosts] = useState<MarketingSocialPost[]>([]);

  // Mockup state
  const [mockupFrames, setMockupFrames] = useState<MarketingMockupFrame[]>([]);
  const [mockupScene,  setMockupScene]  = useState("");

  // Copilot
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([
    { role: "assistant", content: "Hi! I'm your marketing copilot. Pick a product on the left and I'll help you write everything — or click **Guide me** and I'll walk you through it step by step." },
  ]);
  const [copilotInput, setCopilotInput] = useState("");
  const [isGuiding, setIsGuiding] = useState(false);
  const copilotEndRef = useRef<HTMLDivElement>(null);

  // Fetches
  const { data: ownedList } = useQuery({
    queryKey: ["owned-list", storeId],
    queryFn: () => storeStudiosApi.list(storeId),
  });
  const { data: profile } = useQuery({
    queryKey: ["store-profile", storeId],
    queryFn: () => storeProfileApi.get(storeId),
  });

  const hasProfile = !!(profile?.facts?.pitch || profile?.facts?.whatTheySell);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const voiceOverride = useCallback((): Partial<StoreProfileVoice> => {
    return VOICE_PRESETS.find(p => p.value === voicePreset)?.override ?? {};
  }, [voicePreset]);

  const scrollCopilot = useCallback(() => {
    setTimeout(() => copilotEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const addCopilotMessage = useCallback((msg: CopilotMessage) => {
    setCopilotMessages(prev => [...prev, msg]);
    scrollCopilot();
  }, [scrollCopilot]);

  // ── Generation mutations ─────────────────────────────────────────────────────

  const generateListing = useMutation({
    mutationFn: () =>
      marketingApi.generateListing(storeId, {
        editionId: product?.type === "edition" ? product.id : undefined,
        packId:    product?.type === "pack"    ? product.id : undefined,
        brief:     brief || undefined,
        channel:   listingChannel,
        voiceOverride: voicePreset !== "profile" ? voiceOverride() : undefined,
      }),
    onSuccess: (data) => {
      setListing(data);
      setListingTitle(data.title);
      setListingDesc(data.description);
      setListingTags(data.tags ?? []);
      addCopilotMessage({ role: "assistant", content: `✓ Listing drafted for **${CHANNEL_LABELS[listingChannel]}** — ${data.title.length} char title, ${data.tags?.length ?? 0} tags. Edit the fields or save below.` });
    },
    onError: (err: Error) => {
      toast({ title: "Listing generation failed", description: err.message, variant: "destructive" });
    },
  });

  const generateSocial = useMutation({
    mutationFn: () =>
      marketingApi.generateSocial(storeId, {
        editionId: product?.type === "edition" ? product.id : undefined,
        packId:    product?.type === "pack"    ? product.id : undefined,
        brief:     brief || undefined,
        channels:  socialChannels,
        voiceOverride: voicePreset !== "profile" ? voiceOverride() : undefined,
      }),
    onSuccess: (data) => {
      setSocialPosts(data.posts ?? []);
      addCopilotMessage({ role: "assistant", content: `✓ Social posts drafted for ${socialChannels.join(", ")}. Edit captions or hashtags, then save.` });
    },
    onError: (err: Error) => {
      toast({ title: "Social generation failed", description: err.message, variant: "destructive" });
    },
  });

  const generateMockup = useMutation({
    mutationFn: () =>
      marketingApi.generateMockup(storeId, {
        editionId:       product?.type === "edition" ? product.id : undefined,
        packId:          product?.type === "pack"    ? product.id : undefined,
        brief:           brief || undefined,
        sceneDescription: mockupScene || undefined,
      }),
    onSuccess: (data) => {
      setMockupFrames(data.frames ?? []);
      addCopilotMessage({ role: "assistant", content: `✓ ${data.frames.length} scene frames generated (simulated placeholders). ${data.notice}` });
    },
    onError: (err: Error) => {
      toast({ title: "Mockup generation failed", description: err.message, variant: "destructive" });
    },
  });

  // "Draft it all" — runs listing + social + mockup sequentially
  const draftAll = useMutation({
    mutationFn: async () => {
      addCopilotMessage({ role: "assistant", content: "Drafting everything — listing → social posts → mockup frames…" });
      const [l, s, m] = await Promise.all([
        marketingApi.generateListing(storeId, {
          editionId: product?.type === "edition" ? product.id : undefined,
          packId:    product?.type === "pack"    ? product.id : undefined,
          brief:     brief || undefined,
          channel:   listingChannel,
          voiceOverride: voicePreset !== "profile" ? voiceOverride() : undefined,
        }),
        marketingApi.generateSocial(storeId, {
          editionId: product?.type === "edition" ? product.id : undefined,
          packId:    product?.type === "pack"    ? product.id : undefined,
          brief:     brief || undefined,
          channels:  socialChannels,
          voiceOverride: voicePreset !== "profile" ? voiceOverride() : undefined,
        }),
        marketingApi.generateMockup(storeId, {
          editionId: product?.type === "edition" ? product.id : undefined,
          packId:    product?.type === "pack"    ? product.id : undefined,
          brief:     brief || undefined,
        }),
      ]);
      return { l, s, m };
    },
    onSuccess: ({ l, s, m }) => {
      setListing(l); setListingTitle(l.title); setListingDesc(l.description); setListingTags(l.tags ?? []);
      setSocialPosts(s.posts ?? []);
      setMockupFrames(m.frames ?? []);
      addCopilotMessage({ role: "assistant", content: `✅ All done! Listing, ${s.posts.length} social posts, and ${m.frames.length} mockup frames are ready. Review and edit each tab, then save what you want to keep.` });
    },
    onError: (err: Error) => {
      toast({ title: "Draft failed", description: err.message, variant: "destructive" });
    },
  });

  // Save asset
  const saveAsset = useMutation({
    mutationFn: (payload: Parameters<typeof marketingApi.saveAsset>[1]) =>
      marketingApi.saveAsset(storeId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-assets", storeId] });
      toast({ title: "Asset saved", description: "Saved to your marketing assets." });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // Copilot send — grounded real Claude
  const copilotMutation = useMutation({
    mutationFn: (userMsg: string) =>
      copilotApi.send(storeId, {
        messages: [...copilotMessages, { role: "user", content: userMsg }],
        context: { activeTool, selectedProduct: product },
      }),
    onSuccess: (res) => {
      addCopilotMessage({ role: "assistant", content: res.message });
      if (res.action?.type === "draft_all") {
        draftAll.mutate();
      } else if (res.action?.type === "generate_listing") {
        setActiveTool("listing");
        generateListing.mutate();
      } else if (res.action?.type === "generate_social") {
        setActiveTool("social");
        generateSocial.mutate();
      } else if (res.action?.type === "generate_mockup") {
        setActiveTool("mockup");
        generateMockup.mutate();
      }
    },
    onError: (err: Error) => {
      addCopilotMessage({ role: "assistant", content: `Sorry, I hit an error: ${err.message}` });
    },
  });

  const sendCopilot = useCallback(() => {
    if (!copilotInput.trim()) return;
    const userMsg = copilotInput.trim();
    setCopilotInput("");
    addCopilotMessage({ role: "user", content: userMsg });
    copilotMutation.mutate(userMsg);
  }, [copilotInput, addCopilotMessage, copilotMutation]);

  const guideMe = () => {
    setIsGuiding(true);
    const productHint = product ? `I see you've selected **${product.name}** — perfect.` : "First, pick a product on the left (or enter a brief).";
    const profileHint = hasProfile ? "Your store profile is set up, so I'll write in your brand voice." : "⚠️ Your store profile isn't set up yet — I'll do my best without it, but [setting it up](/store/" + storeId + "/settings/profile) first gives much better results.";
    addCopilotMessage({
      role: "assistant",
      content: `Let's build your marketing assets step by step!\n\n${productHint}\n\n${profileHint}\n\nWhen you're ready, type **draft all** and I'll write your Etsy listing, social posts, and mockup scenes at once — or tell me which one to start with.`,
    });
  };

  const isGenerating = generateListing.isPending || generateSocial.isPending || generateMockup.isPending || draftAll.isPending || copilotMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 -mx-8 -mt-4 overflow-hidden rounded-lg border border-border bg-background">

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-border overflow-y-auto">

        {/* Tool tabs */}
        <div className="p-4 border-b border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Tool</p>
          <div className="space-y-1">
            {(["listing", "social", "mockup"] as Tool[]).map(t => {
              const { icon: Icon, label, desc } = TOOL_META[t];
              const active = activeTool === t;
              return (
                <button
                  key={t}
                  onClick={() => setActiveTool(t)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={active
                    ? { background: "hsl(12 49% 58% / 0.12)", color: "hsl(12 60% 40%)" }
                    : { color: "hsl(var(--foreground))" }
                  }
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium leading-none">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{desc}</p>
                  </div>
                  {active && <ChevronRight className="w-3.5 h-3.5 ml-auto mt-0.5 shrink-0 opacity-60" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Product picker */}
        <div className="p-4 border-b border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Product</p>

          {product && (
            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded bg-muted/60">
              {product.type === "edition" ? <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <span className="text-xs flex-1 truncate font-medium">{product.name}</span>
              <button onClick={() => setProduct(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {!product && (
            <p className="text-xs text-muted-foreground mb-2">Select an edition or pack, or write a brief below.</p>
          )}

          {/* Editions */}
          {(ownedList?.editions?.length ?? 0) > 0 && (
            <div className="mb-2">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Editions</p>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {ownedList!.editions.filter(e => e.status !== "deleted").map(ed => (
                  <button
                    key={ed.id}
                    onClick={() => setProduct({ type: "edition", id: ed.id, name: ed.name })}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors truncate ${product?.id === ed.id ? "bg-[#C87560]/10 text-[#C87560]" : "hover:bg-muted"}`}
                  >
                    <BookOpen className="w-3 h-3 inline mr-1.5 opacity-60" />
                    {ed.name}
                    {ed.status === "draft" && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">draft</Badge>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Packs */}
          {(ownedList?.packs?.length ?? 0) > 0 && (
            <div className="mb-2">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Sticker packs</p>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {ownedList!.packs.filter(p => p.status !== "deleted").map(pk => (
                  <button
                    key={pk.id}
                    onClick={() => setProduct({ type: "pack", id: pk.id, name: pk.name })}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors truncate ${product?.id === pk.id ? "bg-[#C87560]/10 text-[#C87560]" : "hover:bg-muted"}`}
                  >
                    <Package className="w-3 h-3 inline mr-1.5 opacity-60" />
                    {pk.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Brief */}
        <div className="p-4 flex-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">
            Brief (optional)
          </Label>
          <Textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder="Any extra context for Claude — season, promotion, specific angle…"
            rows={4}
            className="text-xs resize-none"
          />
        </div>

        {/* Voice override */}
        <div className="p-4 border-t border-border">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-2">
            Voice / tone override
          </Label>
          <Select value={voicePreset} onValueChange={setVoicePreset}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VOICE_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasProfile && (
            <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <Link href={`/store/${storeId}/settings/profile`} className="underline">Set up profile</Link> for on-voice output.
            </p>
          )}
        </div>
      </aside>

      {/* ── Center workbench ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Tool header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            {(() => { const { icon: Icon, label } = TOOL_META[activeTool]; return <><Icon className="w-4 h-4 text-[#C87560]" /><span className="font-medium text-sm">{label}</span></>; })()}
            {product && (
              <Badge variant="secondary" className="text-xs ml-1">{product.name}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-7"
              disabled={isGenerating}
              onClick={() => draftAll.mutate()}
            >
              {draftAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Draft it all
            </Button>
          </div>
        </div>

        {/* Tool content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── Listing tool ─────────────────────────────────────────────────── */}
          {activeTool === "listing" && (
            <ListingPanel
              storeId={storeId}
              isOwner={isOwner}
              channel={listingChannel}
              setChannel={setListingChannel}
              title={listingTitle}
              setTitle={setListingTitle}
              desc={listingDesc}
              setDesc={setListingDesc}
              tags={listingTags}
              setTags={setListingTags}
              listing={listing}
              isGenerating={generateListing.isPending}
              onGenerate={() => generateListing.mutate()}
              onSave={() => saveAsset.mutate({
                assetType: "listing",
                title: listingTitle || "Untitled listing",
                data: { title: listingTitle, description: listingDesc, tags: listingTags, channel: listingChannel },
                sourceEditionId: product?.type === "edition" ? product.id : undefined,
                sourcePackId:    product?.type === "pack"    ? product.id : undefined,
                channelTarget: listingChannel,
              })}
              isSaving={saveAsset.isPending}
            />
          )}

          {/* ── Social tool ──────────────────────────────────────────────────── */}
          {activeTool === "social" && (
            <SocialPanel
              storeId={storeId}
              isOwner={isOwner}
              channels={socialChannels}
              setChannels={setSocialChannels}
              posts={socialPosts}
              setPosts={setSocialPosts}
              isGenerating={generateSocial.isPending}
              onGenerate={() => generateSocial.mutate()}
              onSave={() => saveAsset.mutate({
                assetType: "social",
                title: `Social posts — ${socialChannels.join(", ")}`,
                data: { posts: socialPosts, channels: socialChannels },
                sourceEditionId: product?.type === "edition" ? product.id : undefined,
                sourcePackId:    product?.type === "pack"    ? product.id : undefined,
              })}
              isSaving={saveAsset.isPending}
            />
          )}

          {/* ── Mockup tool ──────────────────────────────────────────────────── */}
          {activeTool === "mockup" && (
            <MockupPanel
              isOwner={isOwner}
              frames={mockupFrames}
              sceneDescription={mockupScene}
              setSceneDescription={setMockupScene}
              isGenerating={generateMockup.isPending}
              onGenerate={() => generateMockup.mutate()}
              onSave={() => saveAsset.mutate({
                assetType: "mockup",
                title: "Mockup frames",
                data: { frames: mockupFrames.map(f => ({ label: f.label, description: f.description, simulated: f.simulated })) },
                sourceEditionId: product?.type === "edition" ? product.id : undefined,
                sourcePackId:    product?.type === "pack"    ? product.id : undefined,
              })}
              isSaving={saveAsset.isPending}
            />
          )}
        </div>
      </main>

    </div>
  );
}

// ─── Sub-panels ───────────────────────────────────────────────────────────────

function ListingPanel({
  channel, setChannel, title, setTitle, desc, setDesc, tags, setTags,
  listing, isGenerating, onGenerate, onSave, isSaving, isOwner,
}: {
  channel: Channel; setChannel: (c: Channel) => void;
  title: string; setTitle: (s: string) => void;
  desc: string;  setDesc:  (s: string) => void;
  tags: string[]; setTags: (t: string[]) => void;
  listing: MarketingListingResult | null;
  isGenerating: boolean; onGenerate: () => void;
  onSave: () => void; isSaving: boolean; isOwner: boolean;
  storeId: string;
}) {
  const etsy_title_limit = 140;
  const etsy_tag_limit   = 13;

  return (
    <div className="space-y-5">
      {/* Channel + Generate */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label className="text-xs mb-1 block">Target channel</Label>
          <Select value={channel} onValueChange={v => setChannel(v as Channel)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["etsy", "tiktok", "storefront"] as Channel[]).map(c => (
                <SelectItem key={c} value={c} className="text-xs">{CHANNEL_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="bg-[#C87560] hover:bg-[#A85E4E] text-white gap-1.5 h-8"
          disabled={isGenerating}
          onClick={onGenerate}
        >
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Ask Claude
        </Button>
      </div>

      {/* Title */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs">Title</Label>
          <span className={`text-[10px] ${title.length > etsy_title_limit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {title.length}/{etsy_title_limit}
          </span>
        </div>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Product title will appear here after generation…"
          className="text-sm"
        />
        {title.length > etsy_title_limit && (
          <p className="text-xs text-destructive mt-1">Title exceeds {etsy_title_limit} character limit for {CHANNEL_LABELS[channel]}.</p>
        )}
      </div>

      {/* Description */}
      <div>
        <Label className="text-xs mb-1.5 block">Description</Label>
        <Textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Description will appear here after generation…"
          rows={8}
          className="text-sm resize-none"
        />
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs">Tags / SEO</Label>
          {channel === "etsy" && (
            <span className={`text-[10px] ${tags.length > etsy_tag_limit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {tags.length}/{etsy_tag_limit} Etsy limit
            </span>
          )}
        </div>
        <Input
          value={tags.join(", ")}
          onChange={e => setTags(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
          placeholder="Tags will appear here as comma-separated keywords…"
          className="text-sm"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      {listing && isOwner && (
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onSave}
            disabled={isSaving || !title}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save listing asset
          </Button>
        </div>
      )}
    </div>
  );
}

function SocialPanel({
  channels, setChannels, posts, setPosts,
  isGenerating, onGenerate, onSave, isSaving, isOwner,
}: {
  channels: SocialChannel[]; setChannels: (c: SocialChannel[]) => void;
  posts: MarketingSocialPost[]; setPosts: (p: MarketingSocialPost[]) => void;
  isGenerating: boolean; onGenerate: () => void;
  onSave: () => void; isSaving: boolean; isOwner: boolean;
  storeId: string;
}) {
  const toggleChannel = (c: SocialChannel) => {
    setChannels(channels.includes(c) ? channels.filter(x => x !== c) : [...channels, c]);
  };

  return (
    <div className="space-y-5">
      {/* Channel selector + Generate */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label className="text-xs mb-2 block">Channels</Label>
          <div className="flex gap-2">
            {(["instagram", "pinterest", "tiktok"] as SocialChannel[]).map(c => (
              <button
                key={c}
                onClick={() => toggleChannel(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  channels.includes(c)
                    ? "bg-[#C87560] border-[#C87560] text-white"
                    : "border-border text-muted-foreground hover:border-[#C87560]/50"
                }`}
              >
                {SOCIAL_CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          className="bg-[#C87560] hover:bg-[#A85E4E] text-white gap-1.5 h-8"
          disabled={isGenerating || channels.length === 0}
          onClick={onGenerate}
        >
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Ask Claude
        </Button>
      </div>

      {posts.length === 0 && !isGenerating && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Select channels and click "Ask Claude" to generate on-brand captions.
        </div>
      )}

      {/* Posts */}
      {posts.map((post, i) => (
        <SocialPostCard
          key={i}
          post={post}
          onUpdate={updated => setPosts(posts.map((p, j) => j === i ? updated : p))}
        />
      ))}

      {/* Save */}
      {posts.length > 0 && isOwner && (
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save social assets
          </Button>
        </div>
      )}
    </div>
  );
}

function SocialPostCard({
  post, onUpdate,
}: {
  post: MarketingSocialPost;
  onUpdate: (p: MarketingSocialPost) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(`${post.caption}\n\n${post.hashtags.join(" ")}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs capitalize">{post.channel}</Badge>
          <button onClick={copy} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <Textarea
          value={post.caption}
          onChange={e => onUpdate({ ...post, caption: e.target.value })}
          rows={4}
          className="text-sm resize-none"
        />
        <Input
          value={post.hashtags.join(" ")}
          onChange={e => onUpdate({ ...post, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
          className="text-xs font-mono"
          placeholder="#hashtag1 #hashtag2"
        />
      </CardContent>
    </Card>
  );
}

function MockupPanel({
  frames, sceneDescription, setSceneDescription,
  isGenerating, onGenerate, onSave, isSaving, isOwner,
}: {
  frames: MarketingMockupFrame[];
  sceneDescription: string; setSceneDescription: (s: string) => void;
  isGenerating: boolean; onGenerate: () => void;
  onSave: () => void; isSaving: boolean; isOwner: boolean;
}) {
  return (
    <div className="space-y-5">

      {/* Simulated notice */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          <strong>Simulated mockups.</strong> Claude generates scene descriptions and placeholder frames.
          A real image-generation model can drop in later via the stubbed interface — no code changes needed beyond the backend stub.
        </p>
      </div>

      {/* Scene direction + Generate */}
      <div className="space-y-2">
        <Label className="text-xs">Scene direction (optional)</Label>
        <div className="flex gap-2">
          <Input
            value={sceneDescription}
            onChange={e => setSceneDescription(e.target.value)}
            placeholder="e.g. Cozy autumn desk, warm tones, iPad Pro with Apple Pencil"
            className="text-sm flex-1"
          />
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white gap-1.5 shrink-0"
            disabled={isGenerating}
            onClick={onGenerate}
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Generate scenes
          </Button>
        </div>
      </div>

      {frames.length === 0 && !isGenerating && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Click "Generate scenes" to produce AI-described mockup frames.
        </div>
      )}

      {/* Frames */}
      <div className="grid grid-cols-1 gap-4">
        {frames.map(frame => (
          <Card key={frame.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <img
                  src={frame.imageSrc}
                  alt={frame.label}
                  className="w-24 h-18 object-cover rounded border border-border shrink-0"
                  style={{ height: "72px" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm font-medium">{frame.label}</span>
                    {frame.simulated && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">
                        SIMULATED
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{frame.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save */}
      {frames.length > 0 && isOwner && (
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save scene descriptions
          </Button>
        </div>
      )}
    </div>
  );
}

// Renders copilot message content with basic **bold** and link support
function CopilotText({ content, storeId }: { content: string; storeId: string }) {
  return (
    <span>
      {content.split(/\*\*(.*?)\*\*/g).map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      )}
    </span>
  );
}
