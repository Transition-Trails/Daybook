/**
 * Store-Scoped Pack Studio
 * Generates sticker pack name, tags, and ideas from a concept prompt.
 * Staff can draft; only store_owner can publish.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Globe, Sticker, X, Upload, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState } from "@/components/shared";
import { storeStudiosApi, studioGenerateApi } from "@/lib/api";
import { AiDisabledState } from "./AiDisabledState";
import { canPublish } from "@/lib/permissions";

interface PackAiResult {
  name: string;
  tags: string[];
  ideas: string[];
}

interface Props {
  storeId: string;
  role: string;
  aiEnabled: boolean;
}

export function parsePackPrice(price: string): number | undefined {
  const value = price.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const numericPrice = Number(value);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return undefined;
  return numericPrice;
}

export function getPackPriceError(price: string): string | null {
  if (!price.trim()) return "Enter a price to publish.";
  if (!/^\d+(?:\.\d{1,2})?$/.test(price.trim())) {
    return "Price must be in whole cents (for example, 4.99).";
  }
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return "Price must be greater than $0.00.";
  return null;
}

export default function StorePackStudio({ storeId, role, aiEnabled }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = canPublish(role);

  const [prompt, setPrompt] = useState(() => {
    const idea = sessionStorage.getItem(`studioIdea:${storeId}`) ?? "";
    if (idea) sessionStorage.removeItem(`studioIdea:${storeId}`);
    return idea;
  });
  const [aiMeta, setAiMeta] = useState<{ model: string; provider: string } | null>(null);
  const [result, setResult] = useState<PackAiResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [price, setPrice] = useState<string>("4.99");
  // Track the id of the draft saved in this session so repeated saves update
  // rather than insert. Cleared on unmount (navigate away) automatically.
  const [savedId, setSavedId] = useState<string | null>(null);
  const priceError = getPackPriceError(price);
  const parsedPrice = parsePackPrice(price);

  const generate = useMutation({
    mutationFn: () => studioGenerateApi.generatePack(storeId, { prompt: prompt.trim() }),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      setResult({ name: res.name, tags: res.tags, ideas: res.ideas });
      setName(res.name ?? "");
      setTags(Array.isArray(res.tags) ? res.tags.slice(0, 4) : []);
      setIdeas(Array.isArray(res.ideas) ? res.ideas.slice(0, 4) : []);
    },
    onError: (err: Error) => setParseError(err.message),
  });

  const save = useMutation({
    mutationFn: (status: "draft" | "live") =>
      savedId
        ? storeStudiosApi.packs.update(storeId, savedId, { name, tags, price: parsedPrice, status })
        : storeStudiosApi.packs.create(storeId, { name, tags, price: parsedPrice, status }),
    onSuccess: (data, status) => {
      // Capture the id from the first save (or a server-upserted row) so future
      // saves in this session call PATCH instead of POST.
      if (!savedId) setSavedId((data as { id: string }).id);
      qc.invalidateQueries({ queryKey: ["store-catalog", storeId] });
      toast({
        title: status === "live" ? "Pack published!" : savedId ? "Draft updated" : "Saved as draft",
        description: `"${name}" is now part of your store's catalog.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const canSave = !!name && !priceError;
  // Pack Studio creates the pack spec; cover and member sticker assets are
  // attached through the existing asset workflows.
  const packAssetsConfigured = false;

  // All hooks declared above — safe to return early now.
  if (!aiEnabled) return <AiDisabledState />;

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      <ClaudeHeader
        title="Pack Studio"
        description="Describe a sticker pack concept — Claude names it, suggests tags, and brainstorms four sticker ideas ready to hand to an illustrator."
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      {/* Owned-content badge */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        Packs created here belong exclusively to your store (origin: Yours).
      </div>

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
            {generate.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claude is thinking…</>
            ) : (
              <><Sticker className="w-4 h-4 mr-2" />Generate pack spec</>
            )}
          </Button>
        </CardContent>
      </Card>

      {parseError && !generate.isPending && (
        <div className="mb-6">
          <ErrorState message={parseError} onRetry={() => generate.mutate()} />
        </div>
      )}

      {result && !generate.isPending && (
        <div className="space-y-4 mb-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label>Pack name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="px-3 py-1 gap-1.5 cursor-pointer hover:bg-destructive/10"
                      onClick={() => setTags(tags.filter((_, j) => j !== i))}
                    >
                      {tag}<X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Sticker ideas */}
              <div className="space-y-2">
                <Label>Sticker ideas</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ideas.map((idea, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground/80 leading-relaxed"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground mr-2">#{i + 1}</span>
                      {idea}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cover placeholder */}
              <div className="space-y-2">
                <Label>Cover image</Label>
                <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground gap-2 text-sm cursor-not-allowed bg-muted/20">
                  <Upload className="w-4 h-4" />
                  Drop cover image (coming soon)
                </div>
              </div>

              {/* Price */}
              <div className="space-y-2 max-w-[160px]">
                <Label>Price (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number" min="0.01" step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className={`pl-6 ${priceError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    aria-invalid={!!priceError}
                    aria-describedby={priceError ? "pack-price-error" : undefined}
                  />
                </div>
                {priceError && <p id="pack-price-error" className="text-xs text-destructive">{priceError}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" />Regenerate
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline" size="sm"
              onClick={() => save.mutate("draft")}
              disabled={!canSave || save.isPending}
              title={priceError ?? (!name ? "Add a pack name before saving." : undefined)}
            >
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              {savedId ? "Update draft" : "Save as draft"}
            </Button>
            {isOwner ? (
              <>
                <Button
                  size="sm"
                  className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
                  onClick={() => save.mutate("live")}
                  disabled={!canSave || !!priceError || save.isPending || !packAssetsConfigured}
                  title="Publishing requires a cover asset and at least one sticker asset. Attach them through the existing asset workflow first."
                >
                  {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Globe className="w-3.5 h-3.5 mr-2" />}
                  Publish
                </Button>
                <p className="text-xs text-muted-foreground">
                  Publish is available after you attach a cover asset and at least one sticker through the existing asset workflow. Live packs also need a positive whole-cent price.
                </p>
              </>
            ) : (
              <Button size="sm" disabled className="opacity-50" title="Publishing requires store owner role">
                <Lock className="w-3.5 h-3.5 mr-2" />Publish (owner only)
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
