/**
 * Marketing Studio — compose-pattern workspace for listing copy, social
 * content, mockups, trend research, and listing images.
 *
 * ALL tabs follow the compose pattern (heading → decision card → library row → build panel).
 * No data tables. No ComingSoon stubs.
 *
 * LEFT RAIL  — mode context (market focus, period, platform, channel)
 * CENTER     — compose surface per mode
 * RIGHT DOCK — AI assistant
 */
import { useState, useRef, useEffect } from "react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import { useLocation, useSearch } from "wouter";
import {
  Megaphone, Sparkles, TrendingUp, FileText, Image, Share2, Layers,
  Upload, RefreshCw, Globe, Copy, ChevronRight,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  SectionLabel, ChipRow, SegmentedControl, EmptyState, RailCard, DockAiAssistant, ActionChip,
} from "@/components/studio/primitives";
import { aiApi, extractJson } from "@/lib/ai";
import { catalogApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ── Design tokens (mirrored from Planner Studio) ──────────────────────────────
const CLAY       = "#C87560";
const PAPER_TINT = "#FFFDF9";
const NAVY       = "#1B2A4A";

// ── Modes ─────────────────────────────────────────────────────────────────────

const MODES = [
  { id: "trends",  label: "Trends" },
  { id: "listing", label: "Listing generator" },
  { id: "social",  label: "Social posts" },
  { id: "mockups", label: "Promo mockups" },
  { id: "images",  label: "Listing images" },
] as const;

type ModeId = typeof MODES[number]["id"];

// ── Shared compose primitives ─────────────────────────────────────────────────

function ComposeHeader({
  title, subtitle, aiLabel, onAi,
}: { title: string; subtitle: string; aiLabel?: string; onAi?: () => void }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1.5">
        <h1 className="font-display font-semibold text-[22px] text-foreground">{title}</h1>
        {onAi && (
          <button
            onClick={onAi}
            style={{ cursor: "pointer", background: CLAY }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3 h-3" />
            {aiLabel ?? "✦ Ask Claude"}
          </button>
        )}
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed">{subtitle}</p>
    </div>
  );
}

function ComposeCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border p-5 mb-6 space-y-4" style={{ background: PAPER_TINT, borderColor: "#E7DCCB" }}>
      {children}
    </div>
  );
}

function ComposeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ cursor: "pointer", background: active ? CLAY : "transparent", color: active ? "#fff" : "inherit", borderColor: active ? CLAY : "#E7DCCB" }}
      className="px-3.5 py-1.5 rounded-full border text-[12.5px] font-medium transition-colors hover:border-foreground/20"
    >
      {label}
    </button>
  );
}

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{children}</p>
  );
}

// ── TRENDS tab ────────────────────────────────────────────────────────────────

interface TrendCard { trend: string; insight: string; idea: string }

const TREND_SYSTEM = `You are a trend analyst for a premium digital planner brand called Daybook.
When given a research focus, respond ONLY with a valid JSON array — no markdown, no explanation.
[{ "trend": "short trend name", "insight": "1-2 sentences on why this is relevant now", "idea": "specific planner product idea that capitalises on this trend" }, ...]
Return exactly 5 objects. Be specific — the "idea" must be a concrete product concept a designer can work from immediately.`;

function TrendsCenter() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [focus, setFocus] = useState("seasonal");
  const [prompt, setPrompt] = useState("");
  const [trends, setTrends] = useState<TrendCard[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () => aiApi.complete(TREND_SYSTEM, prompt.trim() || `${focus} planner trends for 2026`),
    onSuccess: (res) => {
      setParseError(null);
      try {
        const parsed = extractJson<TrendCard[]>(res.text);
        if (!Array.isArray(parsed)) throw new Error("Expected an array");
        setTrends(parsed.slice(0, 5));
      } catch (e) {
        setParseError(`Claude responded but the result couldn't be parsed. ${e instanceof Error ? e.message : ""}`);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Research failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div style={{ minWidth: 0 }}>
      {/* No aiLabel/onAi here — the inline "Research trends" button inside the card
          is the single action trigger. The global ✦ AI pill in the shell top-bar
          is the one generic assistant entry point. */}
      <ComposeHeader
        title="Market trends"
        subtitle="Claude surfaces trends, what they mean for planners, and a concrete product idea for each. Based on training knowledge — validate specifics before committing to a product line."
      />

      {/* Decision card — market focus */}
      <ComposeCard>
        <EyebrowLabel>What kind of trends?</EyebrowLabel>
        {/* Horizontally scrollable pill row — never clips at 834 px or 640 px */}
        <div className="relative">
          <div
            className="flex gap-2 overflow-x-auto"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            {[
              { value: "seasonal",   label: "Seasonal" },
              { value: "evergreen",  label: "Evergreen" },
              { value: "lifestyle",  label: "Lifestyle" },
              { value: "workspace",  label: "Workspace" },
              { value: "self-care",  label: "Self-care" },
              { value: "academic",   label: "Academic" },
            ].map(o => (
              <ComposeChip key={o.value} label={o.label} active={focus === o.value} onClick={() => setFocus(o.value)} />
            ))}
            {/* Trailing spacer so the last pill doesn't hide under the fade */}
            <span className="w-6 shrink-0" aria-hidden="true" />
          </div>
          {/* Right-edge scroll cue — visible only when pills overflow */}
          <div
            className="absolute right-0 inset-y-0 w-8 pointer-events-none"
            style={{ background: "linear-gradient(to left, #FFFDF9, transparent)" }}
          />
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {focus === "seasonal"  ? "Trends tied to seasons, holidays, and annual rhythms — spring, back-to-school, gifting season." :
           focus === "evergreen" ? "Durable demand not tied to a season — productivity, journalling, habit tracking." :
           focus === "lifestyle" ? "Aesthetic movements and cultural identity — cosy minimalism, cottagecore, dark academia." :
           focus === "workspace" ? "How people organise their work life — remote, studio, desk setup, time-blocking." :
           focus === "self-care" ? "Wellness, mental health, and intentional living — mindfulness, gratitude, rest." :
                                  "Student life — study plans, exam prep, campus routines, graduation gifts."}
        </p>
      </ComposeCard>

      {/* Research prompt */}
      <ComposeCard>
        <EyebrowLabel>Research focus</EyebrowLabel>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={3}
          placeholder={`e.g. "Productivity planners for remote workers in 2026" or leave blank for ${focus} trends`}
          className="w-full rounded-[12px] border bg-background px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors resize-none"
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate(); }}
        />
        <p className="text-[11px] text-muted-foreground">⌘ + Enter to research · Claude draws on training knowledge, not a live web feed.</p>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          style={{ cursor: generate.isPending ? "not-allowed" : "pointer", background: CLAY }}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {generate.isPending
            ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Researching…</>
            : <><TrendingUp className="w-3.5 h-3.5" />Research trends</>
          }
        </button>
      </ComposeCard>

      {/* Error */}
      {parseError && !generate.isPending && (
        <div className="mb-6 rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[12.5px] text-destructive">
          {parseError}
          <button onClick={() => generate.mutate()} className="ml-3 underline">Retry</button>
        </div>
      )}

      {/* Trend results — visual cards */}
      {trends.length > 0 && !generate.isPending && (
        <div className="space-y-3">
          {trends.map((card, i) => (
            <div
              key={i}
              className="rounded-[16px] border p-5 space-y-3 hover:shadow-sm transition-shadow"
              style={{ background: PAPER_TINT, borderColor: "#E7DCCB" }}
            >
              <div className="flex items-start gap-4">
                {/* Number badge */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-display font-semibold text-[13px]"
                  style={{ background: `linear-gradient(135deg, ${CLAY}, #A85E4E)`, color: "#fff" }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: CLAY }} />
                    <h3 className="font-display font-semibold text-[14px] text-foreground">{card.trend}</h3>
                  </div>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed">{card.insight}</p>
                  <div className="flex items-start gap-2 rounded-[12px] border px-3 py-2.5" style={{ background: "#F7F0E6", borderColor: "#E7DCCB" }}>
                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: CLAY }} />
                    <p className="text-[12.5px] leading-relaxed" style={{ color: NAVY }}>{card.idea}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { sessionStorage.setItem("studioIdea", card.idea); navigate("/studios/theme-builder"); }}
                      style={{ cursor: "pointer", borderColor: "#E7DCCB" }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                    >
                      <ChevronRight className="w-3 h-3" />→ Theme Studio
                    </button>
                    <button
                      onClick={() => { sessionStorage.setItem("studioIdea", card.idea); navigate("/studios/stickers?mode=create"); }}
                      style={{ cursor: "pointer", borderColor: "#E7DCCB" }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                    >
                      <ChevronRight className="w-3 h-3" />→ Sticker Studio
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LISTING GENERATOR tab ─────────────────────────────────────────────────────

const LISTING_SYSTEM = `You are an Etsy/Shopify listing copywriter for a premium digital planner brand called Daybook.
Given an edition name and tier, respond ONLY with valid JSON:
{
  "title": "SEO-optimised listing title under 140 chars",
  "description": "3-paragraph listing description with features, use cases, and brand voice",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13"]
}`;

function ListingCenter() {
  const { toast } = useToast();
  const [platform, setPlatform] = useState("etsy");
  const [selectedEditionId, setSelectedEditionId] = useState("");
  const [result, setResult] = useState<{ title: string; description: string; tags: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: rawEditions = [] } = useQuery({
    queryKey: ["editions"],
    queryFn: () => catalogApi.editions(),
    // staleTime: 0 — compose picker; deleted editions must not remain selectable
    // in the listing-generator after a platform admin removes them elsewhere.
    staleTime: 0,
  });
  const editions = (rawEditions as any[]).filter((e: any) => e.status !== "deleted");
  const selected = editions.find((e: any) => e.id === selectedEditionId);

  const generate = useMutation({
    mutationFn: () => aiApi.complete(
      LISTING_SYSTEM,
      `Edition: "${selected?.name ?? ""}". Tier: ${selected?.tier ?? "basic"}. Platform: ${platform}.`,
    ),
    onSuccess: (res) => {
      setError(null);
      try {
        const parsed = extractJson<{ title: string; description: string; tags: string[] }>(res.text);
        setResult(parsed);
      } catch { setError("Claude returned an unexpected format — try again."); }
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div style={{ minWidth: 0 }}>
      <ComposeHeader
        title="Listing generator"
        subtitle="SEO-optimised Etsy or Shopify listing titles, descriptions, and tag stacks generated from your edition spec."
        aiLabel="✦ Generate listing"
        onAi={() => selectedEditionId ? generate.mutate() : undefined}
      />

      {/* Platform decision */}
      <ComposeCard>
        <EyebrowLabel>Which platform?</EyebrowLabel>
        <div className="flex gap-2">
          {[
            { value: "etsy",     label: "Etsy" },
            { value: "shopify",  label: "Shopify" },
            { value: "gumroad",  label: "Gumroad" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={platform === o.value} onClick={() => setPlatform(o.value)} />
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {platform === "etsy"    ? "Title ≤ 140 chars, keyword-rich. 13 tags. Description follows Etsy's proven hook → features → CTA structure." :
           platform === "shopify" ? "Title ≤ 70 chars for SEO. Rich description with HTML formatting compatible with Shopify themes." :
                                   "Concise title and benefit-focused description. Tags optimised for Gumroad search."}
        </p>
      </ComposeCard>

      {/* Edition picker — visual card row */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <EyebrowLabel>Pick an edition</EyebrowLabel>
          <span className="text-[11.5px] text-muted-foreground">Click one to select</span>
        </div>
        {editions.length === 0 ? (
          <div className="rounded-[14px] border-2 border-dashed border-border p-8 text-center">
            <p className="text-[12.5px] text-muted-foreground">No editions yet — create one in Planner Studio → Editions.</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
            {editions.slice(0, 8).map((e: any) => {
              const isSelected = selectedEditionId === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedEditionId(isSelected ? "" : e.id)}
                  style={{
                    cursor: "pointer", flexShrink: 0, width: 130,
                    background: isSelected ? "#FEF0ED" : PAPER_TINT,
                    borderColor: isSelected ? CLAY : "#E7DCCB",
                  }}
                  className="rounded-[14px] border flex flex-col overflow-hidden transition-colors text-left"
                >
                  <div className="w-full h-16 flex items-center justify-center border-b" style={{ background: isSelected ? "#F9D8D0" : "#EEE8E0", borderColor: "#E7DCCB" }}>
                    <FileText className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <div className="p-2.5 space-y-1">
                    <p className="text-[11.5px] font-semibold text-foreground leading-tight truncate">{e.name}</p>
                    <p className="text-[10.5px] text-muted-foreground">{e.tier === "basic" ? "PDF-only" : "Live"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="mb-6">
        <button
          onClick={() => generate.mutate()}
          disabled={!selectedEditionId || generate.isPending}
          style={{ cursor: !selectedEditionId || generate.isPending ? "not-allowed" : "pointer", background: CLAY }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {generate.isPending
            ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Generating…</>
            : <><Sparkles className="w-3.5 h-3.5" />✦ Generate listing copy</>
          }
        </button>
        {!selectedEditionId && <p className="text-[11.5px] text-muted-foreground mt-2">Select an edition above first</p>}
      </div>

      {/* Error */}
      {error && <div className="mb-6 rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[12.5px] text-destructive">{error}</div>}

      {/* Result */}
      {result && !generate.isPending && (
        <div className="rounded-[16px] border p-5 space-y-5" style={{ background: PAPER_TINT, borderColor: "#E7DCCB" }}>
          <EyebrowLabel>Generated listing — {selected?.name}</EyebrowLabel>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Title</p>
            <p className="text-[13.5px] font-semibold text-foreground leading-snug">{result.title}</p>
            <p className="text-[10.5px] text-muted-foreground">{result.title.length} / {platform === "etsy" ? "140" : "70"} chars</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</p>
            <p className="text-[12.5px] text-foreground/80 leading-relaxed whitespace-pre-line">{result.description}</p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tags ({result.tags.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {result.tags.map((tag, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full border text-[11.5px] text-foreground/70" style={{ borderColor: "#E7DCCB", background: "#fff" }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => generate.mutate()}
              style={{ cursor: "pointer", borderColor: "#E7DCCB" }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3 h-3" />Regenerate
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(`${result.title}\n\n${result.description}\n\nTags: ${result.tags.join(", ")}`)}
              style={{ cursor: "pointer", borderColor: "#E7DCCB" }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3 h-3" />Copy all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SOCIAL POSTS tab ──────────────────────────────────────────────────────────

const SOCIAL_SYSTEM = `You are a social media copywriter for a premium digital planner brand called Daybook.
Given a product and platform, respond ONLY with valid JSON:
{
  "caption": "ready-to-post caption with line breaks",
  "hashtags": ["hashtag1","hashtag2","hashtag3","hashtag4","hashtag5","hashtag6","hashtag7","hashtag8"],
  "hook": "first line hook variant 2",
  "cta": "call to action line"
}`;

function SocialCenter() {
  const { toast } = useToast();
  const [platform, setPlatform] = useState("instagram");
  const [tone, setTone] = useState("warm");
  const [concept, setConcept] = useState("");
  const [result, setResult] = useState<{ caption: string; hashtags: string[]; hook: string; cta: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () => aiApi.complete(
      SOCIAL_SYSTEM,
      `Platform: ${platform}. Tone: ${tone}. Product concept: "${concept.trim() || "a beautifully designed digital planner"}".`,
    ),
    onSuccess: (res) => {
      setError(null);
      try { setResult(extractJson<typeof result>(res.text) as typeof result); }
      catch { setError("Claude returned an unexpected format — try again."); }
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div style={{ minWidth: 0 }}>
      <ComposeHeader
        title="Social posts"
        subtitle="Platform-native captions, hashtag stacks, and hooks for Instagram, Pinterest, and TikTok."
        aiLabel="✦ Write posts"
        onAi={() => generate.mutate()}
      />

      {/* Platform decision card */}
      <ComposeCard>
        <EyebrowLabel>Which platform?</EyebrowLabel>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "instagram", label: "Instagram" },
            { value: "pinterest", label: "Pinterest" },
            { value: "tiktok",    label: "TikTok" },
            { value: "facebook",  label: "Facebook" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={platform === o.value} onClick={() => setPlatform(o.value)} />
          ))}
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {platform === "instagram" ? "Caption up to 2200 chars with emoji. Hook in first line. 8 hashtags in first comment." :
           platform === "pinterest" ? "Pin description under 500 chars. Keyword-led, no hashtags. Link CTA." :
           platform === "tiktok"    ? "Short punchy caption ≤ 150 chars. Trending hashtags. Hook drives view time." :
                                     "Friendly, conversational. Longer paragraphs OK. CTA to link."}
        </p>
      </ComposeCard>

      {/* Tone */}
      <ComposeCard>
        <EyebrowLabel>Tone</EyebrowLabel>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "warm",         label: "Warm & personal" },
            { value: "aspirational", label: "Aspirational" },
            { value: "playful",      label: "Playful" },
            { value: "educational",  label: "Educational" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={tone === o.value} onClick={() => setTone(o.value)} />
          ))}
        </div>
      </ComposeCard>

      {/* Build panel */}
      <ComposeCard>
        <EyebrowLabel>What you're promoting</EyebrowLabel>
        <textarea
          value={concept}
          onChange={e => setConcept(e.target.value)}
          rows={3}
          placeholder="e.g. New autumn planner launch — cosy earthy palette, habit tracker inserts, 12-month dated"
          className="w-full rounded-[12px] border bg-background px-4 py-3 text-[13px] placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors resize-none"
        />
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          style={{ cursor: generate.isPending ? "not-allowed" : "pointer", background: CLAY }}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-semibold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {generate.isPending
            ? <><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Writing…</>
            : <><Share2 className="w-3.5 h-3.5" />✦ Write post</>
          }
        </button>
      </ComposeCard>

      {error && <div className="mb-6 rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[12.5px] text-destructive">{error}</div>}

      {/* Result */}
      {result && !generate.isPending && (
        <div className="rounded-[16px] border p-5 space-y-5" style={{ background: PAPER_TINT, borderColor: "#E7DCCB" }}>
          <EyebrowLabel>Generated post — {platform}</EyebrowLabel>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Hook variant</p>
            <p className="text-[13px] font-semibold text-foreground leading-snug">{result.hook}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Caption</p>
            <p className="text-[12.5px] text-foreground/80 leading-relaxed whitespace-pre-line">{result.caption}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CTA</p>
            <p className="text-[12.5px] font-medium text-foreground">{result.cta}</p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Hashtags</p>
            <div className="flex flex-wrap gap-1.5">
              {result.hashtags.map((h, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full border text-[11.5px]" style={{ borderColor: "#E7DCCB", background: "#fff" }}>
                  #{h.replace(/^#/, "")}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => generate.mutate()} style={{ cursor: "pointer", borderColor: "#E7DCCB" }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-3 h-3" />Regenerate
            </button>
            <button onClick={() => navigator.clipboard.writeText(`${result.caption}\n\n${result.hashtags.map(h => `#${h.replace(/^#/, "")}`).join(" ")}`)}
              style={{ cursor: "pointer", borderColor: "#E7DCCB" }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Copy className="w-3 h-3" />Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PROMO MOCKUPS tab ─────────────────────────────────────────────────────────

const MOCKUP_SCENES = [
  { id: "desk",     label: "Desk",       desc: "Flat lay on a styled desk with accessories",   hex: "#8C9C8A" },
  { id: "hand",     label: "Hand-held",  desc: "Lifestyle shot — planner held open to spread", hex: "#C4A882" },
  { id: "flat-lay", label: "Flat lay",   desc: "Top-down minimalist white background",         hex: "#C4C4C4" },
  { id: "cosy",     label: "Cosy",       desc: "Warm light, coffee cup, seasonal accessories", hex: "#C87560" },
  { id: "digital",  label: "On screen",  desc: "Mockup on iPad or tablet screen",              hex: "#4A5568" },
];

function MockupsCenter() {
  const [scene, setScene] = useState("desk");

  return (
    <div style={{ minWidth: 0 }}>
      <ComposeHeader
        title="Promo mockups"
        subtitle="Composite your edition covers into lifestyle scene templates. Generated images are sized for listing thumbnails and social posts."
        aiLabel="✦ Generate mockup"
        onAi={() => {}}
      />

      {/* Scene template library row */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <EyebrowLabel>Scene template</EyebrowLabel>
          <span className="text-[11.5px] text-muted-foreground">Click one to select</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {MOCKUP_SCENES.map(s => {
            const isSelected = scene === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScene(s.id)}
                style={{
                  cursor: "pointer", flexShrink: 0, width: 130,
                  background: isSelected ? "#FEF0ED" : PAPER_TINT,
                  borderColor: isSelected ? CLAY : "#E7DCCB",
                }}
                className="rounded-[14px] border flex flex-col overflow-hidden transition-colors text-left"
              >
                <div className="w-full h-16 flex items-center justify-center border-b" style={{ background: s.hex + "33", borderColor: "#E7DCCB" }}>
                  <Image className="w-5 h-5" style={{ color: s.hex }} />
                </div>
                <div className="p-2.5 space-y-0.5">
                  <p className="text-[11.5px] font-semibold text-foreground leading-tight">{s.label}</p>
                  <p className="text-[10.5px] text-muted-foreground leading-snug">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Build panel */}
      <ComposeCard>
        <EyebrowLabel>Build — {MOCKUP_SCENES.find(s => s.id === scene)?.label} mockup</EyebrowLabel>
        {/* Cover upload drop zone */}
        <div
          className="rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 py-8 hover:border-foreground/20 hover:bg-muted/10 transition-colors"
          style={{ cursor: "pointer" }}
        >
          <Upload className="w-5 h-5 text-muted-foreground/60" />
          <div className="space-y-0.5 text-center">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Drop your cover image</p>
            <p className="text-[12px] text-muted-foreground">PNG or JPEG — the cover will be composited into the scene</p>
          </div>
        </div>
        {/* Preview placeholder */}
        <div className="rounded-[12px] border bg-muted/20 flex items-center justify-center py-12" style={{ borderColor: "#E7DCCB" }}>
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-[12px] mx-auto flex items-center justify-center" style={{ background: MOCKUP_SCENES.find(s => s.id === scene)?.hex + "33" }}>
              <Image className="w-7 h-7" style={{ color: MOCKUP_SCENES.find(s => s.id === scene)?.hex }} />
            </div>
            <p className="text-[12.5px] text-muted-foreground">{MOCKUP_SCENES.find(s => s.id === scene)?.label} scene</p>
            <p className="text-[11px] text-muted-foreground/60">Upload a cover to generate the composite</p>
          </div>
        </div>
        <p className="text-[11.5px] text-muted-foreground">Mockup generation via AI image compositing — coming in the next studio release.</p>
      </ComposeCard>
    </div>
  );
}

// ── LISTING IMAGES tab ────────────────────────────────────────────────────────

function ImagesCenter() {
  const [style, setStyle] = useState("on-white");
  const [size, setSize] = useState("2000");

  return (
    <div style={{ minWidth: 0 }}>
      <ComposeHeader
        title="Listing images"
        subtitle="On-white and lifestyle product images at listing size — compliant with Etsy and Shopify image requirements."
        aiLabel="✦ Generate images"
        onAi={() => {}}
      />

      {/* Image style decision */}
      <ComposeCard>
        <EyebrowLabel>Image style</EyebrowLabel>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "on-white",   label: "On-white",   desc: "Clean product shot — required as first image on Etsy" },
            { value: "lifestyle",  label: "Lifestyle",   desc: "Styled scene with props — drives emotional connection" },
            { value: "spread",     label: "Open spread", desc: "Two-page spread showing inside content" },
            { value: "mockup",     label: "Device",      desc: "iPad or desktop screen mockup for digital products" },
          ].map(o => (
            <button
              key={o.value}
              onClick={() => setStyle(o.value)}
              style={{
                cursor: "pointer",
                background: style === o.value ? "#FEF0ED" : PAPER_TINT,
                borderColor: style === o.value ? CLAY : "#E7DCCB",
                flex: "1 1 160px",
              }}
              className="rounded-[14px] border p-3.5 text-left transition-colors"
            >
              <p className="text-[13px] font-semibold text-foreground mb-0.5">{o.label}</p>
              <p className="text-[11.5px] text-muted-foreground leading-snug">{o.desc}</p>
            </button>
          ))}
        </div>
      </ComposeCard>

      {/* Output size */}
      <ComposeCard>
        <EyebrowLabel>Output size</EyebrowLabel>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "2000", label: "2000 × 2000 — Square (Etsy standard)" },
            { value: "1500", label: "1500 × 2000 — Portrait (Pinterest)" },
            { value: "1920", label: "1920 × 1080 — Landscape (Facebook banner)" },
          ].map(o => (
            <ComposeChip key={o.value} label={o.label} active={size === o.value} onClick={() => setSize(o.value)} />
          ))}
        </div>
      </ComposeCard>

      {/* Build panel */}
      <ComposeCard>
        <EyebrowLabel>Build — {style.replace("-", " ")} image</EyebrowLabel>
        <div
          className="rounded-[12px] border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 py-8 hover:border-foreground/20 transition-colors"
          style={{ cursor: "pointer" }}
        >
          <Upload className="w-5 h-5 text-muted-foreground/60" />
          <div className="space-y-0.5 text-center">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Drop your cover or spread</p>
            <p className="text-[12px] text-muted-foreground">PNG, JPEG, or PDF page</p>
          </div>
        </div>
        <div className="rounded-[12px] border bg-muted/20 flex items-center justify-center py-12" style={{ borderColor: "#E7DCCB" }}>
          <div className="text-center space-y-1">
            <Layers className="w-7 h-7 mx-auto text-muted-foreground/40" />
            <p className="text-[12.5px] text-muted-foreground">Upload source to generate listing image</p>
            <p className="text-[11px] text-muted-foreground/60">Output at {size}px — ready for direct upload</p>
          </div>
        </div>
        <p className="text-[11.5px] text-muted-foreground">Image generation via AI compositing — coming in the next studio release.</p>
      </ComposeCard>
    </div>
  );
}

// ── LEFT RAILS ────────────────────────────────────────────────────────────────

function MarketingRail({ mode, market, setMarket, period, setPeriod, platform, setPlatform }: {
  mode: ModeId;
  market: string; setMarket: (v: string) => void;
  period: string; setPeriod: (v: string) => void;
  platform: string; setPlatform: (v: string) => void;
}) {
  const railDescriptions: Partial<Record<ModeId, string>> = {
    trends:  "Research seasonal and evergreen trends to plan your next product launches.",
    listing: "Pick an edition and platform to generate a complete listing in seconds.",
    social:  "Draft ready-to-post captions across Instagram, Pinterest, and TikTok.",
    mockups: "Composite your cover into professional lifestyle scene templates.",
    images:  "Generate on-white and lifestyle images at listing-ready sizes.",
  };
  return (
    <div className="p-4 space-y-5">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Marketing Studio</p>
          <p className="text-[11px] text-muted-foreground">{railDescriptions[mode]}</p>
        </div>
      </RailCard>
      <div className="space-y-2">
        <SectionLabel>Market focus</SectionLabel>
        <ChipRow
          options={[{value:"all",label:"All"},{value:"seasonal",label:"Seasonal"},{value:"evergreen",label:"Evergreen"},{value:"niche",label:"Niche"}]}
          value={market} onChange={setMarket}
        />
      </div>
      <div className="space-y-2">
        <SectionLabel>Period</SectionLabel>
        <ChipRow
          options={[{value:"q1",label:"Q1"},{value:"q2",label:"Q2"},{value:"q3",label:"Q3"},{value:"q4",label:"Q4"},{value:"evergreen",label:"Always"}]}
          value={period} onChange={setPeriod}
        />
      </div>
      {(mode === "listing" || mode === "social") && (
        <div className="space-y-2">
          <SectionLabel>Channel</SectionLabel>
          <ChipRow
            options={[{value:"all",label:"All"},{value:"etsy",label:"Etsy"},{value:"shopify",label:"Shopify"},{value:"instagram",label:"Instagram"},{value:"pinterest",label:"Pinterest"}]}
            value={platform} onChange={setPlatform}
          />
        </div>
      )}
    </div>
  );
}

// ── MAIN HUB ──────────────────────────────────────────────────────────────────

export default function MarketingStudioHub() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode = (params.get("mode") ?? "trends") as ModeId;
  const validMode: ModeId = MODES.some(m => m.id === mode) ? mode : "trends";
  const setMode = (id: string) => navigate(`/studios/marketing?mode=${id}`);

  const [market,   setMarket]   = useState("all");
  const [period,   setPeriod]   = useState("evergreen");
  const [platform, setPlatform] = useState("all");

  const leftRail = (
    <MarketingRail
      mode={validMode}
      market={market} setMarket={setMarket}
      period={period} setPeriod={setPeriod}
      platform={platform} setPlatform={setPlatform}
    />
  );

  // ── AI drawer context ────────────────────────────────────────────────────────
  const { setAiContext, clearAiContext } = useAiDrawer();
  const _clearRef = useRef(clearAiContext);
  _clearRef.current = clearAiContext;
  useEffect(() => () => _clearRef.current(), []);
  useEffect(() => {
    const systemPrompt =
      validMode === "trends"  ? "You are a market trend analyst for a premium digital planner brand. Help with market research, product positioning, and identifying seasonal opportunities." :
      validMode === "listing" ? "You are an Etsy/Shopify listing copywriter. Help with titles, descriptions, tags, and SEO strategy for digital planner products." :
      validMode === "social"  ? "You are a social media strategist for a premium planner brand. Help with content strategy, caption writing, hashtag research, and platform-specific best practices." :
                               "You are a visual marketing expert for digital products. Help with mockup styling, image composition, and product photography strategy.";
    const examplePrompts =
      validMode === "trends"
        ? ["What planner trends are emerging for 2027?", "Which niche audiences are underserved?", "Seasonal launch windows for a self-care journal"]
        : validMode === "listing"
        ? ["Best tags for a productivity planner on Etsy", "How to write a listing for a digital product", "Title ideas for an undated planner"]
        : validMode === "social"
        ? ["Instagram caption ideas for planner launch", "Best hashtags for planner niche", "Content plan for new product announcement"]
        : ["Best mockup scenes for digital planners", "Colour palette for autumn listing images", "How to show digital products on Pinterest"];
    setAiContext({
      systemPrompt,
      examplePrompts,
      contextLabel: `Marketing Studio · ${validMode}`,
      previewContent: null,
    });
  }, [validMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const center = (() => {
    if (validMode === "trends")  return <TrendsCenter />;
    if (validMode === "listing") return <ListingCenter />;
    if (validMode === "social")  return <SocialCenter />;
    if (validMode === "mockups") return <MockupsCenter />;
    return <ImagesCenter />;
  })();

  return (
    <StudioLayout
      scope="Marketing Studio"
      modes={MODES}
      activeMode={validMode}
      onModeChange={setMode}
      status={{ label: "Platform", ok: true }}
      primaryAction={{
        label: validMode === "trends" ? "Research" : "Generate",
        icon: <Sparkles className="w-3.5 h-3.5" />,
        onClick: () => {},
      }}
      leftRail={leftRail}
      hasAssistant
    >
      {center}
    </StudioLayout>
  );
}
