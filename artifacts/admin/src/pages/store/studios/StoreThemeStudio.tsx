/**
 * Store-Scoped Theme Studio
 * Generates a 6-color palette from a mood prompt, saves as owned theme.
 * Staff can draft; only store_owner can publish.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Globe, Palette, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState } from "@/components/shared";
import { aiApi, extractJson, isValidHex, PALETTE_LABELS } from "@/lib/ai";
import { storeStudiosApi } from "@/lib/api";
import { AiDisabledState } from "./AiDisabledState";

interface ThemeAiResult {
  name: string;
  description: string;
  colors: string[];
}

interface Props {
  storeId: string;
  role: string;
  aiEnabled: boolean;
}

const SYSTEM_PROMPT = `You are a professional color palette designer for a premium digital planner brand.
When given a mood, season, or brand feel, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "short evocative theme name (2-4 words)",
  "description": "one sentence that captures the mood and use case",
  "colors": ["#hex1","#hex2","#hex3","#hex4","#hex5","#hex6"]
}
The 6 colors in order: accent (primary brand color), accent-dark (deepened accent for hover/text), secondary (complementary mid-tone), tertiary (soft supporting tone), ink (dark text color), paper (lightest background).
Choose colors that feel cohesive, premium, and work well on screen.`;

export default function StoreThemeStudio({ storeId, role, aiEnabled }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = role === "store_owner" || role === "super_admin";

  const [prompt, setPrompt] = useState(() => {
    const idea = sessionStorage.getItem(`studioIdea:${storeId}`) ?? "";
    if (idea) sessionStorage.removeItem(`studioIdea:${storeId}`);
    return idea;
  });
  const [aiMeta, setAiMeta] = useState<{ model: string; provider: string } | null>(null);
  const [result, setResult] = useState<ThemeAiResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  // Track the id of the draft saved in this session so repeated saves update
  // rather than insert. Cleared on unmount (navigate away) automatically.
  const [savedId, setSavedId] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () => aiApi.complete(SYSTEM_PROMPT, prompt.trim()),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      try {
        const parsed = extractJson<ThemeAiResult>(res.text);
        setResult(parsed);
        setName(parsed.name ?? "");
        setDescription(parsed.description ?? "");
        setColors(Array.isArray(parsed.colors) ? parsed.colors.slice(0, 6) : []);
      } catch (e) {
        setResult(null);
        setParseError(`Claude responded but the JSON couldn't be parsed. ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    onError: (err: Error) => setParseError(err.message),
  });

  const save = useMutation({
    mutationFn: (status: "draft" | "live") =>
      savedId
        ? storeStudiosApi.themes.update(storeId, savedId, { name, description, colors, status })
        : storeStudiosApi.themes.create(storeId, { name, description, colors, status }),
    onSuccess: (data, status) => {
      if (!savedId) setSavedId((data as { id: string }).id);
      qc.invalidateQueries({ queryKey: ["store-catalog", storeId] });
      toast({
        title: status === "live" ? "Theme published!" : savedId ? "Draft updated" : "Saved as draft",
        description: `"${name}" is now part of your store's catalog.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const canSave = !!name && colors.length === 6 && colors.every(isValidHex);

  // All hooks declared above — safe to return early now.
  if (!aiEnabled) return <AiDisabledState />;

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      <ClaudeHeader
        title="Theme Studio"
        description="Describe a mood, season, or brand feel — Claude generates a cohesive 6-color palette you can publish as your store's own theme."
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      {/* Owned-content badge */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        Themes created here belong exclusively to your store (origin: Yours).
      </div>

      {/* Prompt */}
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-prompt">Describe the mood / season / brand feel</Label>
            <Textarea
              id="theme-prompt"
              rows={3}
              placeholder={"e.g. \"A cosy autumn forest, warm ambers and deep mossy greens, perfect for a gratitude journal\""}
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
              <><Palette className="w-4 h-4 mr-2" />Generate palette</>
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
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-6">
            {/* Palette swatches */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Generated palette</p>
              <div className="grid grid-cols-6 gap-2">
                {colors.map((hex, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-full aspect-square rounded-lg border border-border shadow-sm"
                      style={{ backgroundColor: isValidHex(hex) ? hex : "#ccc" }}
                    />
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{PALETTE_LABELS[i]}</span>
                    <Input
                      value={hex}
                      onChange={(e) => { const next = [...colors]; next[i] = e.target.value; setColors(next); }}
                      className="h-6 text-[10px] text-center px-1 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Editable fields */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Theme name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="resize-none" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
                <RefreshCw className="w-3.5 h-3.5 mr-2" />Regenerate
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => save.mutate("draft")}
                disabled={!canSave || save.isPending}
              >
                {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                {savedId ? "Update draft" : "Save as draft"}
              </Button>
              {isOwner ? (
                <Button
                  size="sm"
                  className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
                  onClick={() => save.mutate("live")}
                  disabled={!canSave || save.isPending}
                >
                  {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Globe className="w-3.5 h-3.5 mr-2" />}
                  Publish
                </Button>
              ) : (
                <Button size="sm" disabled className="opacity-50 cursor-not-allowed" title="Publishing requires store owner role">
                  <Lock className="w-3.5 h-3.5 mr-2" />Publish (owner only)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
