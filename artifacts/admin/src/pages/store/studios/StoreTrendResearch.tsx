/**
 * Store-Scoped Trend Research Studio
 * Focus prompt → 5 trend cards with → Theme and → Pack jump-into-studio actions.
 * Jump buttons pre-fill the store-scoped studios via sessionStorage.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, TrendingUp, Lightbulb, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState } from "@/components/shared";
import { aiApi, extractJson } from "@/lib/ai";
import { AiDisabledState } from "./AiDisabledState";

interface TrendCard {
  trend: string;
  insight: string;
  idea: string;
}

interface Props {
  storeId: string;
  aiEnabled: boolean;
}

const SYSTEM_PROMPT = `You are a trend analyst for a premium digital planner brand.
When given a research focus, respond ONLY with a valid JSON array — no markdown, no explanation.
[
  { "trend": "short trend name", "insight": "1-2 sentences on why this is relevant now", "idea": "specific planner product idea that capitalises on this trend" },
  ...
]
Return exactly 5 objects. Be specific and actionable — the "idea" should be a concrete product concept a designer can work from immediately.`;

export default function StoreTrendResearch({ storeId, aiEnabled }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState("");
  const [aiMeta, setAiMeta] = useState<{ model: string; provider: string } | null>(null);
  const [trends, setTrends] = useState<TrendCard[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () => aiApi.complete(SYSTEM_PROMPT, prompt.trim()),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      try {
        const parsed = extractJson<TrendCard[]>(res.text);
        if (!Array.isArray(parsed)) throw new Error("Expected an array");
        setTrends(parsed.slice(0, 5));
      } catch (e) {
        setTrends([]);
        setParseError(`Claude responded but the JSON couldn't be parsed. ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    onError: (err: Error) => {
      setParseError(err.message);
      toast({ title: "Research failed", description: err.message, variant: "destructive" });
    },
  });

  // All hooks declared above — safe to return early now.
  if (!aiEnabled) return <AiDisabledState />;

  // Write idea to store-scoped sessionStorage key, then navigate to the studio
  const goToTheme = (idea: string) => {
    sessionStorage.setItem(`studioIdea:${storeId}`, idea);
    navigate(`/store/${storeId}/studios/theme`);
  };

  const goToPack = (idea: string) => {
    sessionStorage.setItem(`studioIdea:${storeId}`, idea);
    navigate(`/store/${storeId}/studios/pack`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      <ClaudeHeader
        title="Trend Research"
        description="Describe your research focus — Claude surfaces five trends, what they mean for planners, and a concrete product idea for each."
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      {/* Model knowledge notice */}
      <div className="flex items-start gap-2.5 rounded-lg border border-[#E7DCCB] bg-[#FFFDF9] px-4 py-3 mb-6 text-sm text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#C87560]" />
        <p>
          This draws on Claude's training knowledge, not a live web feed. Use it for creative
          inspiration and early-stage direction — verify market specifics before committing to a
          product line.
        </p>
      </div>

      {/* Prompt */}
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trend-prompt">Research focus</Label>
            <Textarea
              id="trend-prompt"
              rows={3}
              placeholder={"e.g. \"Productivity planners for remote workers in 2026\" or \"Self-care journals for new moms\""}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="resize-none font-sans"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate(); }}
            />
            <p className="text-xs text-muted-foreground">⌘ + Enter to research</p>
          </div>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !prompt.trim()}
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
          >
            {generate.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claude is thinking…</>
            ) : (
              <><TrendingUp className="w-4 h-4 mr-2" />Research trends</>
            )}
          </Button>
        </CardContent>
      </Card>

      {parseError && !generate.isPending && (
        <div className="mb-6">
          <ErrorState message={parseError} onRetry={() => generate.mutate()} />
        </div>
      )}

      {/* Trend cards */}
      {trends.length > 0 && !generate.isPending && (
        <div className="space-y-3">
          {trends.map((card, i) => (
            <Card key={i} className="group transition-shadow hover:shadow-md border-[#E7DCCB]">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-4">
                  {/* Number badge */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-display font-semibold text-sm mt-0.5"
                    style={{ background: "linear-gradient(135deg, #C87560, #A85E4E)", color: "#fff" }}
                  >
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#C87560] shrink-0" />
                      <h3 className="font-display font-semibold text-foreground text-sm">{card.trend}</h3>
                    </div>

                    <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{card.insight}</p>

                    {/* Product idea */}
                    <div className="flex items-start gap-2 rounded-lg border border-[#E7DCCB] bg-[#F7F0E6] px-3 py-2.5 mb-3">
                      <Lightbulb className="w-3.5 h-3.5 text-[#C87560] shrink-0 mt-0.5" />
                      <p className="text-sm text-[#1B2A4A] leading-relaxed">{card.idea}</p>
                    </div>

                    {/* Jump actions — go to this store's studios */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs border-[#E7DCCB] hover:border-[#C87560] hover:text-[#C87560]"
                        onClick={() => goToTheme(card.idea)}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" />→ Theme Studio
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs border-[#E7DCCB] hover:border-[#C87560] hover:text-[#C87560]"
                        onClick={() => goToPack(card.idea)}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" />→ Pack Studio
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
