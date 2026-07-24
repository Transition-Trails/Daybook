/**
 * Store Profile & Voice — onboarding / settings page.
 *
 * Set up once, editable later. The profile is injected as grounding into
 * every AI studio (Theme, Pack, Edition, Trend, Marketing) so Claude writes
 * in the brand voice and only states facts from the profile.
 *
 * FACTS  — what the store sells, who it's for, differentiators, links.
 * VOICE  — tone tags, words to use / avoid, formality, emoji level, style sample.
 */
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, CheckCircle2, Circle, Sparkles, BookUser, Mic2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  storeProfileApi,
  type StoreProfileFacts,
  type StoreProfileVoice,
} from "@/lib/api";
import { Link } from "wouter";

interface Props {
  storeId: string;
  role: string;
}

const FORMALITY_OPTIONS = [
  { value: "formal",   label: "Formal — polished, professional" },
  { value: "balanced", label: "Balanced — friendly but credible" },
  { value: "casual",   label: "Casual — warm, conversational" },
  { value: "playful",  label: "Playful — fun, expressive" },
];

const EMOJI_OPTIONS = [
  { value: "none",  label: "None — text only" },
  { value: "light", label: "Light — occasional accents" },
  { value: "heavy", label: "Heavy — emoji-rich" },
];

function completionScore(facts: StoreProfileFacts, voice: StoreProfileVoice): number {
  const factFields = [facts.pitch, facts.whatTheySell, facts.whoItsFor, facts.differentiators?.length, facts.storeName];
  const voiceFields = [voice.toneTags?.length, voice.formalityLevel, voice.emojiLevel];
  const all = [...factFields, ...voiceFields];
  const filled = all.filter(Boolean).length;
  return Math.round((filled / all.length) * 100);
}

export default function StoreProfile({ storeId, role }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = role === "store_owner" || role === "super_admin";

  const { data: profile, isLoading } = useQuery({
    queryKey: ["store-profile", storeId],
    queryFn: () => storeProfileApi.get(storeId),
  });

  // ── Facts state ─────────────────────────────────────────────────────────────
  const [storeName,       setStoreName]       = useState("");
  const [pitch,           setPitch]           = useState("");
  const [whatTheySell,    setWhatTheySell]    = useState("");
  const [whoItsFor,       setWhoItsFor]       = useState("");
  const [differentiators, setDifferentiators] = useState(""); // newline-separated
  const [links,           setLinks]           = useState("");  // newline-separated

  // ── Voice state ─────────────────────────────────────────────────────────────
  const [toneTags,       setToneTags]       = useState(""); // comma-separated
  const [wordsWeLove,    setWordsWeLove]    = useState(""); // comma-separated
  const [wordsToAvoid,   setWordsToAvoid]   = useState(""); // comma-separated
  const [formalityLevel, setFormalityLevel] = useState<StoreProfileVoice["formalityLevel"]>("balanced");
  const [emojiLevel,     setEmojiLevel]     = useState<StoreProfileVoice["emojiLevel"]>("light");
  const [styleSample,    setStyleSample]    = useState("");

  // Prefill from fetched profile
  useEffect(() => {
    if (!profile) return;
    const f = profile.facts ?? {};
    const v = profile.voice ?? {};
    setStoreName(f.storeName ?? "");
    setPitch(f.pitch ?? "");
    setWhatTheySell(f.whatTheySell ?? "");
    setWhoItsFor(f.whoItsFor ?? "");
    setDifferentiators((f.differentiators ?? []).join("\n"));
    setLinks((f.links ?? []).join("\n"));
    setToneTags((v.toneTags ?? []).join(", "));
    setWordsWeLove((v.wordsWeLove ?? []).join(", "));
    setWordsToAvoid((v.wordsToAvoid ?? []).join(", "));
    setFormalityLevel(v.formalityLevel ?? "balanced");
    setEmojiLevel(v.emojiLevel ?? "light");
    setStyleSample(v.styleSample ?? "");
  }, [profile]);

  const buildPayload = () => ({
    facts: {
      storeName:        storeName.trim() || undefined,
      pitch:            pitch.trim() || undefined,
      whatTheySell:     whatTheySell.trim() || undefined,
      whoItsFor:        whoItsFor.trim() || undefined,
      differentiators:  differentiators.split("\n").map(s => s.trim()).filter(Boolean),
      links:            links.split("\n").map(s => s.trim()).filter(Boolean),
    } as StoreProfileFacts,
    voice: {
      toneTags:      toneTags.split(",").map(s => s.trim()).filter(Boolean),
      wordsWeLove:   wordsWeLove.split(",").map(s => s.trim()).filter(Boolean),
      wordsToAvoid:  wordsToAvoid.split(",").map(s => s.trim()).filter(Boolean),
      formalityLevel,
      emojiLevel,
      styleSample:   styleSample.trim() || undefined,
    } as StoreProfileVoice,
  });

  const save = useMutation({
    mutationFn: () => storeProfileApi.save(storeId, buildPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-profile", storeId] });
      toast({ title: "Profile saved", description: "All AI studios will use this profile for grounding." });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const score = completionScore(buildPayload().facts, buildPayload().voice);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#C87560]" />
            <h1 className="text-xl font-semibold">Store Profile & Voice</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Filled in once, used by every AI studio. Claude states your facts as fact and writes in your voice.
          </p>
        </div>

        {/* Completion meter */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">Profile completion</span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${score}%`, background: score < 50 ? "#e9a87c" : "#C87560" }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{score}%</span>
          </div>
        </div>
      </div>

      {!isOwner && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You can view this profile but only the store owner can edit it.
        </div>
      )}

      {/* ── FACTS ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookUser className="w-4 h-4 text-[#C87560]" />
            Store Facts
          </CardTitle>
          <CardDescription>
            Ground truths Claude states as fact — no inventing prices, claims, or features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FieldRow
            label="Store name"
            hint="As it appears in listings and social posts."
            check={!!storeName}
          >
            <Input
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              placeholder="e.g. Petals & Pages"
              disabled={!isOwner}
            />
          </FieldRow>

          <FieldRow
            label="One-line pitch"
            hint="The single sentence that describes what makes you special."
            check={!!pitch}
          >
            <Input
              value={pitch}
              onChange={e => setPitch(e.target.value)}
              placeholder="e.g. Illustrated digital planners for the creative mind."
              disabled={!isOwner}
            />
          </FieldRow>

          <FieldRow
            label="What they sell"
            hint="Products you actually offer. Claude will only reference these."
            check={!!whatTheySell}
          >
            <Textarea
              value={whatTheySell}
              onChange={e => setWhatTheySell(e.target.value)}
              placeholder="e.g. GoodNotes-compatible daily planners, botanical sticker packs, habit tracker inserts."
              rows={3}
              disabled={!isOwner}
            />
          </FieldRow>

          <FieldRow
            label="Who it's for"
            hint="Describe your customer in a sentence."
            check={!!whoItsFor}
          >
            <Input
              value={whoItsFor}
              onChange={e => setWhoItsFor(e.target.value)}
              placeholder="e.g. Busy professionals who want a beautiful, functional digital planner."
              disabled={!isOwner}
            />
          </FieldRow>

          <FieldRow
            label="Differentiators"
            hint="One per line — what makes you different or better."
            check={differentiators.trim().length > 0}
          >
            <Textarea
              value={differentiators}
              onChange={e => setDifferentiators(e.target.value)}
              placeholder={"Hand-illustrated artwork\nNew edition every season\nGoodNotes & Notability compatible\nFull refund guarantee"}
              rows={4}
              disabled={!isOwner}
            />
          </FieldRow>

          <FieldRow
            label="Links / references"
            hint="Etsy shop URL, storefront, Instagram handle — one per line."
            check={links.trim().length > 0}
          >
            <Textarea
              value={links}
              onChange={e => setLinks(e.target.value)}
              placeholder={"https://etsy.com/shop/petalsandpages\nhttps://instagram.com/petalsandpages"}
              rows={2}
              disabled={!isOwner}
            />
          </FieldRow>
        </CardContent>
      </Card>

      {/* ── VOICE ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mic2 className="w-4 h-4 text-[#C87560]" />
            Brand Voice
          </CardTitle>
          <CardDescription>
            Claude will write every word in this voice — captions, listings, descriptions, all of it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FieldRow
            label="Tone tags"
            hint="Comma-separated adjectives that capture how you sound."
            check={toneTags.trim().length > 0}
          >
            <Input
              value={toneTags}
              onChange={e => setToneTags(e.target.value)}
              placeholder="e.g. warm, whimsical, encouraging, detail-obsessed"
              disabled={!isOwner}
            />
            {toneTags && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {toneTags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
          </FieldRow>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Words we love" hint="Comma-separated." check={wordsWeLove.trim().length > 0}>
              <Input
                value={wordsWeLove}
                onChange={e => setWordsWeLove(e.target.value)}
                placeholder="cozy, intentional, joyful"
                disabled={!isOwner}
              />
            </FieldRow>
            <FieldRow label="Words to avoid" hint="Comma-separated." check={wordsToAvoid.trim().length > 0}>
              <Input
                value={wordsToAvoid}
                onChange={e => setWordsToAvoid(e.target.value)}
                placeholder="just, simply, utilize"
                disabled={!isOwner}
              />
            </FieldRow>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Formality level" hint="" check={!!formalityLevel}>
              <Select value={formalityLevel} onValueChange={v => setFormalityLevel(v as StoreProfileVoice["formalityLevel"])} disabled={!isOwner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMALITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Emoji use" hint="" check={!!emojiLevel}>
              <Select value={emojiLevel} onValueChange={v => setEmojiLevel(v as StoreProfileVoice["emojiLevel"])} disabled={!isOwner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMOJI_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>

          <FieldRow
            label="Style sample"
            hint="Paste a caption or listing excerpt you love. Claude will match this voice exactly."
            check={styleSample.trim().length > 0}
          >
            <Textarea
              value={styleSample}
              onChange={e => setStyleSample(e.target.value)}
              placeholder="Paste a real caption, email, or listing description that sounds like you at your best."
              rows={4}
              disabled={!isOwner}
            />
          </FieldRow>
        </CardContent>
      </Card>

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      {isOwner && (
        <div className="flex items-center justify-between pt-2">
          <Link href={`/store/${storeId}/studios/marketing`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Open Marketing Studio
            </Button>
          </Link>
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white gap-1.5"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Small helper ─────────────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  check,
  children,
}: {
  label: string;
  hint: string;
  check: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {check
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          : <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
        <Label className="text-sm font-medium">{label}</Label>
      </div>
      {hint && <p className="text-xs text-muted-foreground pl-5">{hint}</p>}
      <div className="pl-5">{children}</div>
    </div>
  );
}
