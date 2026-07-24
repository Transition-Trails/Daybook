/**
 * Theme Studio — describe a mood/season/brand feel → AI generates a 6-color palette.
 * Save as draft or publish directly to the themes catalog.
 */
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Globe, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState } from "@/components/shared";
import { aiApi, extractJson, isValidHex, PALETTE_LABELS } from "@/lib/ai";

interface ThemeAiResult {
  name: string;
  description: string;
  colors: string[]; // 6 hex: accent, accent-dark, secondary, tertiary, ink, paper
}

const SYSTEM_PROMPT = `You are a professional color palette designer for a digital planner brand called Daybook. 
When given a mood, season, or brand feel, respond ONLY with valid JSON — no markdown, no explanation.
The JSON must match exactly:
{
  "name": "short evocative theme name (2-4 words)",
  "description": "one sentence that captures the mood and use case",
  "colors": ["#hex1","#hex2","#hex3","#hex4","#hex5","#hex6"]
}
The 6 colors in order: accent (primary brand color), accent-dark (deepened accent for hover/text), secondary (complementary mid-tone), tertiary (soft supporting tone), ink (dark text color), paper (lightest background).
Choose colors that feel cohesive, on-brand for a premium planner, and work well on screen.`;

async function createTheme(data: {
  name: string;
  description: string;
  colors: string[];
  status: "draft" | "live";
}) {
  const res = await fetch("/api/themes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      colors: data.colors,
      status: data.status,
      globalAvailable: false,
    }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function updateTheme(id: string, data: {
  name: string;
  description: string;
  colors: string[];
  status: "draft" | "live";
}) {
  const res = await fetch(`/api/themes/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: data.name, description: data.description, colors: data.colors, status: data.status }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function ThemeStudio() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [prompt, setPrompt] = useState(() => {
    const idea = sessionStorage.getItem("studioIdea") ?? "";
    if (idea) sessionStorage.removeItem("studioIdea");
    return idea;
  });
  const [aiMeta, setAiMeta] = useState<{ model: string; provider: string } | null>(null);
  const [result, setResult] = useState<ThemeAiResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Editable fields derived from AI result
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
        setParseError(
          `Claude responded but the JSON couldn't be parsed. ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    onError: (err: Error) => {
      setParseError(err.message);
    },
  });

  const save = useMutation({
    mutationFn: (status: "draft" | "live") =>
      savedId
        ? updateTheme(savedId, { name, description, colors, status })
        : createTheme({ name, description, colors, status }),
    onSuccess: (data, status) => {
      if (!savedId) setSavedId((data as { id: string }).id);
      qc.invalidateQueries({ queryKey: ["themes"] });
      toast({
        title: status === "live" ? "Theme published!" : savedId ? "Draft updated" : "Saved as draft",
        description: `"${name}" has been added to the catalog.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const canSave = !!name && colors.length === 6 && colors.every(isValidHex);

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      <ClaudeHeader
        title="Theme Studio"
        description="Describe a mood, season, or brand feel — Claude generates a cohesive 6-color palette you can publish straight to the catalog."
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      {/* Prompt */}
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme-prompt">Describe the mood / season / brand feel</Label>
            <Textarea
              id="theme-prompt"
              rows={3}
              placeholder={'e.g. \u201cA cosy autumn forest, warm ambers and deep mossy greens, perfect for a gratitude journal\u201d'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="resize-none font-sans"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate();
              }}
            />
            <p className="text-xs text-muted-foreground">⌘ + Enter to generate</p>
          </div>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !prompt.trim()}
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
          >
            {generate.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Claude is thinking…
              </>
            ) : (
              <>
                <Palette className="w-4 h-4 mr-2" />
                Generate palette
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {parseError && !generate.isPending && (
        <div className="mb-6">
          <ErrorState
            message={parseError}
            onRetry={() => generate.mutate()}
          />
        </div>
      )}

      {/* Result */}
      {result && !generate.isPending && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-6">
            {/* Palette swatches */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Generated palette
              </p>
              <div className="grid grid-cols-6 gap-2">
                {colors.map((hex, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-full aspect-square rounded-lg border border-border shadow-sm"
                      style={{ backgroundColor: isValidHex(hex) ? hex : "#ccc" }}
                    />
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">
                      {PALETTE_LABELS[i]}
                    </span>
                    <Input
                      value={hex}
                      onChange={(e) => {
                        const next = [...colors];
                        next[i] = e.target.value;
                        setColors(next);
                      }}
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
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                Regenerate
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => save.mutate("draft")}
                disabled={!canSave || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-2" />
                )}
                Save as draft
              </Button>
              <Button
                size="sm"
                className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
                onClick={() => save.mutate("live")}
                disabled={!canSave || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5 mr-2" />
                )}
                Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
