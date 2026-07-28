/**
 * Sticker Studio — platform-level (super_admin / Daybook Console).
 * Describe a sticker pack concept → AI generates name, tags, and sticker ideas.
 * Formerly named "Pack Studio".
 */
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Globe, Sticker, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState, SkeletonRows } from "@/components/shared";
import { catalogApi } from "@/lib/api";
import { aiApi, extractJson } from "@/lib/ai";

interface PackAiResult {
  name: string;
  tags: string[];
  ideas: string[];
}

const SYSTEM_PROMPT = `You are a creative director for a digital planner brand called Daybook.
When given a sticker pack concept, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "punchy pack name (2-5 words)",
  "tags": ["tag1","tag2","tag3","tag4"],
  "ideas": [
    "brief sticker idea (e.g. 'a coffee cup with 'Monday energy' text')",
    "...",
    "...",
    "..."
  ]
}
tags: 4 short keywords that describe the vibe/audience (e.g. "cosy", "productivity", "ADHD-friendly").
ideas: exactly 4 sticker concepts — be specific about the illustration and any text overlay.`;

async function createPack(data: {
  name: string;
  tags: string[];
  price: number;
  editionIds: string[];
  status: "draft" | "live";
}) {
  const res = await fetch("/api/packs", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      tags: data.tags,
      price: data.price,
      editionIds: data.editionIds,
      status: data.status,
      globalAvailable: false,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function StickerStudio() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<PackAiResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [price, setPrice] = useState<string>("4.99");
  const [selectedEditions, setSelectedEditions] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);

  const editions = useQuery({
    queryKey: ["editions"],
    queryFn: () => catalogApi.editions(),
    staleTime: 60_000,
  });

  const generate = useMutation({
    mutationFn: () =>
      aiApi.complete(SYSTEM_PROMPT, prompt.trim()),
    onSuccess: (res) => {
      setParseError(null);
      let parsed: PackAiResult | null = null;
      try { parsed = extractJson<PackAiResult>(res.text); } catch { /* fall through */ }
      if (!parsed) { setParseError("Claude returned invalid JSON — try rephrasing the concept."); return; }
      setResult(parsed);
      setName(parsed.name ?? "");
      setTags(Array.isArray(parsed.tags) ? parsed.tags.slice(0, 4) : []);
      setIdeas(Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, 4) : []);
    },
    onError: (err: Error) => setParseError(err.message),
  });

  const save = useMutation({
    mutationFn: (status: "draft" | "live") =>
      createPack({ name, tags, price: parseFloat(price) || 0, editionIds: selectedEditions, status }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      toast({ title: status === "live" ? "Pack published!" : "Saved as draft" });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const canSave = !!name;

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      <ClaudeHeader
        title="Sticker Studio"
        description="Describe a sticker pack concept — Claude names it, suggests tags, and brainstorms four sticker ideas ready to hand to an illustrator."
      />

      {/* Prompt */}
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pack-prompt">Describe the sticker pack concept</Label>
            <Textarea
              id="pack-prompt"
              rows={3}
              placeholder={"e.g. \"A self-care pack for college students — cosy vibes, affirmations, study motivation, coffee & books\""}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="resize-none font-sans"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate(); }}
            />
            <p className="text-xs text-muted-foreground">⌘ + Enter to generate</p>
          </div>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !prompt.trim()}
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
          >
            {generate.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claude is thinking…</>
              : <><Sticker className="w-4 h-4 mr-2" />Generate pack spec</>}
          </Button>
        </CardContent>
      </Card>

      {parseError && !generate.isPending && (
        <div className="mb-6"><ErrorState message={parseError} onRetry={() => generate.mutate()} /></div>
      )}

      {result && !generate.isPending && (
        <div className="space-y-4 mb-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>Pack name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="px-3 py-1 gap-1.5 cursor-pointer hover:bg-destructive/10"
                      onClick={() => setTags(tags.filter((_, j) => j !== i))}>
                      {tag}<X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Sticker ideas</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ideas.map((idea, i) => (
                    <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground/80 leading-relaxed">
                      <span className="font-mono text-[10px] text-muted-foreground mr-2">#{i + 1}</span>{idea}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cover image</Label>
                <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground gap-2 text-sm cursor-not-allowed bg-muted/20">
                  <Upload className="w-4 h-4" />Drop cover image (coming soon)
                </div>
              </div>
              <div className="space-y-2 max-w-[160px]">
                <Label>Price (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input type="number" min="0" step="0.01" value={price}
                    onChange={(e) => setPrice(e.target.value)} className="pl-6" />
                </div>
              </div>

              {/* Editions */}
              <div className="space-y-2">
                <Label>Available in editions</Label>
                {editions.isLoading ? <SkeletonRows rows={2} /> : (
                  <div className="flex flex-wrap gap-2">
                    {(editions.data ?? []).map((ed: { id: string; name: string }) => (
                      <Badge key={ed.id} variant={selectedEditions.includes(ed.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setSelectedEditions(prev =>
                          prev.includes(ed.id) ? prev.filter(x => x !== ed.id) : [...prev, ed.id]
                        )}>
                        {ed.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" />Regenerate
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => save.mutate("draft")} disabled={!canSave || save.isPending}>
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              Save as draft
            </Button>
            <Button size="sm" className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
              onClick={() => save.mutate("live")} disabled={!canSave || save.isPending}>
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Globe className="w-3.5 h-3.5 mr-2" />}
              Publish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
