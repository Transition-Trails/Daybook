/**
 * Edition Studio — describe a planner edition → AI generates the full spec.
 * Attach existing catalog items, set price range, save as draft edition.
 * Also supports "Revise existing edition" mode to iterate for next year.
 */
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, Save, BookOpen, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState, SkeletonRows } from "@/components/shared";
import { catalogApi } from "@/lib/api";
import { aiApi, extractJson, isValidHex, PALETTE_LABELS } from "@/lib/ai";

interface EditionAiResult {
  name: string;
  description: string;
  sections: string[];
  palette: string[];
  priceLow: number;
  priceHigh: number;
}

const SYSTEM_PROMPT = `You are a product designer for Daybook, a premium digital planner brand.
When given a planner edition concept, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "edition name (3-6 words, e.g. 'The Christmas 2026 Planner')",
  "description": "2-sentence pitch that captures who it's for and what makes it special",
  "sections": ["Section A","Section B","Section C","Section D","Section E"],
  "palette": ["#hex1","#hex2","#hex3","#hex4","#hex5","#hex6"],
  "priceLow": 12,
  "priceHigh": 18
}
sections: 5–7 planner section names that make sense for this theme (e.g. "December Daily Log", "Gift Tracker", "Holiday Menu Planner").
palette 6 colors in order: accent, accent-dark, secondary, tertiary, ink, paper — cohesive and on-theme.
priceLow/priceHigh: suggested USD retail price range (integers).`;

async function createEdition(data: {
  name: string;
  description: string;
  sections: string[];
  priceLow: number;
  priceHigh: number;
  themeIds: string[];
  packIds: string[];
  insertIds: string[];
  productIds: string[];
  status: "draft";
}) {
  const res = await fetch("/api/editions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, globalAvailable: false }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function updateEdition(id: string, data: {
  name: string;
  description: string;
  sections: string[];
  priceLow: number;
  priceHigh: number;
}) {
  const res = await fetch(`/api/editions/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      sections: data.sections,
      priceLow: data.priceLow,
      priceHigh: data.priceHigh,
    }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function createTheme(data: {
  name: string;
  colors: string[];
  status: "draft";
}) {
  const res = await fetch("/api/themes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, globalAvailable: false, description: `Auto-generated palette for ${data.name}` }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function MultiChips({
  items,
  selected,
  onToggle,
}: {
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
      {items.map((item) => (
        <Badge
          key={item.id}
          variant={selected.includes(item.id) ? "default" : "outline"}
          className={
            selected.includes(item.id)
              ? "cursor-pointer bg-[#1B2A4A] text-white border-[#1B2A4A]"
              : "cursor-pointer hover:border-[#C87560]"
          }
          onClick={() => onToggle(item.id)}
        >
          {item.name}
        </Badge>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing in catalog yet</p>
      )}
    </div>
  );
}

export default function EditionStudio() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [prompt, setPrompt] = useState(() => {
    const idea = sessionStorage.getItem("studioIdea") ?? "";
    if (idea) sessionStorage.removeItem("studioIdea");
    return idea;
  });
  const [reviseFromId, setReviseFromId] = useState<string>("");
  const [showRevise, setShowRevise] = useState(false);
  const [aiMeta, setAiMeta] = useState<{ model: string; provider: string } | null>(null);
  const [result, setResult] = useState<EditionAiResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Editable state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<string[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [priceLow, setPriceLow] = useState("12");
  const [priceHigh, setPriceHigh] = useState("18");

  // Catalog attachment state
  const [selThemes, setSelThemes] = useState<string[]>([]);
  const [selPacks, setSelPacks] = useState<string[]>([]);
  const [selInserts, setSelInserts] = useState<string[]>([]);
  const [selProducts, setSelProducts] = useState<string[]>([]);
  // Track the id of the draft saved in this session so repeated saves update
  // rather than insert. Cleared on unmount (navigate away) automatically.
  const [savedId, setSavedId] = useState<string | null>(null);

  const existingEditions = useQuery({ queryKey: ["editions"], queryFn: catalogApi.editions });
  const themes = useQuery({ queryKey: ["themes"], queryFn: catalogApi.themes });
  const packs = useQuery({ queryKey: ["packs"], queryFn: catalogApi.packs });
  const inserts = useQuery({ queryKey: ["inserts"], queryFn: catalogApi.inserts });
  const products = useQuery({ queryKey: ["products"], queryFn: catalogApi.products });

  const handleReviseSelect = (id: string) => {
    setReviseFromId(id);
    const ed = existingEditions.data?.find((e) => e.id === id);
    if (ed) {
      setPrompt(
        `Revise "${ed.name}" for next year. Keep the core identity but refresh the seasonal references, section names, and palette.`,
      );
    }
  };

  const generate = useMutation({
    mutationFn: () => aiApi.complete(SYSTEM_PROMPT, prompt.trim()),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      try {
        const parsed = extractJson<EditionAiResult>(res.text);
        setResult(parsed);
        setName(parsed.name ?? "");
        setDescription(parsed.description ?? "");
        setSections(Array.isArray(parsed.sections) ? parsed.sections : []);
        setPalette(Array.isArray(parsed.palette) ? parsed.palette.slice(0, 6) : []);
        setPriceLow(String(parsed.priceLow ?? 12));
        setPriceHigh(String(parsed.priceHigh ?? 18));
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
    mutationFn: async () => {
      // If a draft was already saved this session, update it instead of inserting.
      if (savedId) {
        return updateEdition(savedId, {
          name,
          description,
          sections,
          priceLow: parseFloat(priceLow) || 0,
          priceHigh: parseFloat(priceHigh) || 0,
        });
      }

      // 1. Create a matching draft theme from the palette (first save only)
      let autoThemeId: string | undefined;
      if (palette.length === 6 && palette.every(isValidHex)) {
        try {
          const t = await createTheme({ name: `${name} — Auto palette`, colors: palette, status: "draft" });
          autoThemeId = t.id;
        } catch {
          // non-fatal — edition saves without it
        }
      }

      // 2. Create the edition
      return createEdition({
        name,
        description,
        sections,
        priceLow: parseFloat(priceLow) || 0,
        priceHigh: parseFloat(priceHigh) || 0,
        themeIds: autoThemeId ? [...selThemes, autoThemeId] : selThemes,
        packIds: selPacks,
        insertIds: selInserts,
        productIds: selProducts,
        status: "draft",
      });
    },
    onSuccess: (data) => {
      if (!savedId) setSavedId((data as { id: string }).id);
      qc.invalidateQueries({ queryKey: ["editions"] });
      qc.invalidateQueries({ queryKey: ["themes"] });
      toast({
        title: savedId ? "Draft updated" : "Edition saved as draft",
        description: savedId
          ? `"${name}" has been saved.`
          : `"${name}" and its auto-palette theme are ready to review.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canSave = !!name;

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      <ClaudeHeader
        title="Edition Studio"
        description="Describe a planner edition — Claude designs the full product spec: sections, palette, and price. Attach catalog items and save as a draft edition."
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      {/* Prompt + Revise */}
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          {/* Revise existing */}
          <div>
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowRevise(!showRevise)}
            >
              {showRevise ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Revise an existing edition
            </button>
            {showRevise && (
              <div className="mt-2">
                {existingEditions.isLoading ? (
                  <SkeletonRows rows={1} cols={1} />
                ) : (
                  <Select value={reviseFromId} onValueChange={handleReviseSelect}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick an edition to iterate on…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(existingEditions.data ?? []).map((ed) => (
                        <SelectItem key={ed.id} value={ed.id}>
                          {ed.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edition-prompt">Describe the edition</Label>
            <Textarea
              id="edition-prompt"
              rows={3}
              placeholder={'e.g. \u201cA Christmas planner for 2026 \u2014 cosy December daily logs, gift tracker, holiday recipe pages, warm cranberry and gold palette\u201d'}
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
                <BookOpen className="w-4 h-4 mr-2" />
                Generate edition spec
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {parseError && !generate.isPending && (
        <div className="mb-6">
          <ErrorState message={parseError} onRetry={() => generate.mutate()} />
        </div>
      )}

      {/* Result */}
      {result && !generate.isPending && (
        <div className="space-y-4 mb-6">
          {/* Spec card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edition spec</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Palette */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Palette
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {palette.map((hex, i) => (
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
                          const next = [...palette];
                          next[i] = e.target.value;
                          setPalette(next);
                        }}
                        className="h-6 text-[10px] text-center px-1 font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Sections
                </p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((s, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="px-3 py-1 bg-[#F7F0E6] text-[#1B2A4A] border-[#E7DCCB]"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Name + Description */}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Edition name</Label>
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

              {/* Price range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price low (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      value={priceLow}
                      onChange={(e) => setPriceLow(e.target.value)}
                      className="pl-6"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Price high (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      value={priceHigh}
                      onChange={(e) => setPriceHigh(e.target.value)}
                      className="pl-6"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Catalog attachment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attach catalog items</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose which themes, packs, inserts, and related products belong to this edition. The auto-generated palette will also be saved as a draft theme.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Themes
                </Label>
                {themes.isLoading ? (
                  <SkeletonRows rows={2} cols={1} />
                ) : (
                  <MultiChips
                    items={(themes.data ?? []) as { id: string; name: string }[]}
                    selected={selThemes}
                    onToggle={toggle(setSelThemes)}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Sticker packs
                </Label>
                {packs.isLoading ? (
                  <SkeletonRows rows={2} cols={1} />
                ) : (
                  <MultiChips
                    items={(packs.data ?? []) as { id: string; name: string }[]}
                    selected={selPacks}
                    onToggle={toggle(setSelPacks)}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Inserts
                </Label>
                {inserts.isLoading ? (
                  <SkeletonRows rows={2} cols={1} />
                ) : (
                  <MultiChips
                    items={(inserts.data ?? []) as { id: string; name: string }[]}
                    selected={selInserts}
                    onToggle={toggle(setSelInserts)}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Related products
                </Label>
                {products.isLoading ? (
                  <SkeletonRows rows={2} cols={1} />
                ) : (
                  <MultiChips
                    items={(products.data ?? []) as { id: string; name: string }[]}
                    selected={selProducts}
                    onToggle={toggle(setSelProducts)}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
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
              size="sm"
              className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
              onClick={() => save.mutate()}
              disabled={!canSave || save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-2" />
              )}
              Save as draft edition
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
