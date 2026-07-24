/**
 * Store-Scoped Edition Studio
 * Generates a full planner edition spec from a concept prompt.
 * Attach picker uses the store's owned + entitled items (not global catalog).
 * Creates owned edition + auto-palette draft theme. Always saves as draft.
 * Supports "Revise existing edition" pre-fill.
 * Supports EDIT mode via ?edit=<id> URL param — pre-fills and saves via PATCH.
 */
import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, Save, BookOpen, ChevronDown, ChevronUp, Sparkles, ArrowLeft,
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
import { isValidHex, PALETTE_LABELS } from "@/lib/ai";
import { storeStudiosApi, studioGenerateApi, type CatalogItem, type OwnedList } from "@/lib/api";
import { AiDisabledState } from "./AiDisabledState";

interface EditionAiResult {
  name: string;
  description: string;
  sections: string[];
  palette: string[];
  priceLow: number;
  priceHigh: number;
}

interface AttachableItems {
  themes: CatalogItem[];
  packs: CatalogItem[];
  inserts: CatalogItem[];
  products: CatalogItem[];
  editions: CatalogItem[];
}

interface Props {
  storeId: string;
  role: string;
  aiEnabled: boolean;
}

function MultiChips({
  items,
  selected,
  onToggle,
  originBadge,
}: {
  items: CatalogItem[];
  selected: string[];
  onToggle: (id: string) => void;
  originBadge?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
      {items.map((item) => {
        const isOwned = item.origin === "owned";
        return (
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
            {originBadge && isOwned && (
              <span className="ml-1 text-[9px] font-semibold opacity-70">★</span>
            )}
          </Badge>
        );
      })}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing available yet</p>
      )}
    </div>
  );
}

export default function StoreEditionStudio({ storeId, role: _role, aiEnabled }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const search = useSearch();
  const [, setLocation] = useLocation();

  // Edit mode: ?edit=<editionId> pre-fills the form and switches save to PATCH
  const editId = new URLSearchParams(search).get("edit") ?? undefined;
  // Track the id of the draft created in this session (create path only) so
  // repeated saves update rather than insert. Cleared on unmount automatically.
  const [savedId, setSavedId] = useState<string | null>(null);

  const [prompt, setPrompt] = useState(() => {
    const idea = sessionStorage.getItem(`studioIdea:${storeId}`) ?? "";
    if (idea) sessionStorage.removeItem(`studioIdea:${storeId}`);
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

  // Attachable items from store-scoped endpoint (owned + entitled)
  const attachable = useQuery<AttachableItems>({
    queryKey: ["store-attachable", storeId],
    queryFn: () => storeStudiosApi.attachable(storeId),
  });

  // Edit mode: fetch the existing owned list to pre-fill
  const { data: ownedList } = useQuery<OwnedList>({
    queryKey: ["store-owned-list", storeId],
    queryFn: () => storeStudiosApi.list(storeId),
    enabled: !!editId,
  });
  const existingEdition = editId
    ? ownedList?.editions.find((e) => e.id === editId)
    : undefined;
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!existingEdition || prefilled) return;
    setName(existingEdition.name);
    setSections((existingEdition.sections as string[]) ?? []);
    setPriceLow(String(existingEdition.priceLow ?? 12));
    setPriceHigh(String(existingEdition.priceHigh ?? 18));
    setSelThemes((existingEdition.themes as string[]) ?? []);
    setSelPacks((existingEdition.packs as string[]) ?? []);
    setSelInserts((existingEdition.inserts as string[]) ?? []);
    setSelProducts((existingEdition.products as string[]) ?? []);
    // Seed result so the form section appears immediately without requiring AI generation
    setResult({
      name: existingEdition.name,
      description: "",
      sections: (existingEdition.sections as string[]) ?? [],
      palette: [],
      priceLow: (existingEdition.priceLow as number) ?? 12,
      priceHigh: (existingEdition.priceHigh as number) ?? 18,
    });
    setPrefilled(true);
  }, [existingEdition, prefilled]);

  // Existing owned editions for the revise picker
  const ownedEditions = (attachable.data?.editions ?? []).filter(
    (e) => e.origin === "owned" && e.authoredByStoreId === storeId,
  );

  const handleReviseSelect = (id: string) => {
    setReviseFromId(id);
    const ed = ownedEditions.find((e) => e.id === id);
    if (ed) {
      setPrompt(
        `Revise "${ed.name}" for next year. Keep the core identity but refresh the seasonal references, section names, and palette.`,
      );
    }
  };

  const generate = useMutation({
    mutationFn: () => studioGenerateApi.generateEdition(storeId, { prompt: prompt.trim() }),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      setResult({ name: res.name, description: res.description, sections: res.sections, palette: res.palette, priceLow: res.priceLow, priceHigh: res.priceHigh });
      setName(res.name ?? "");
      setDescription(res.description ?? "");
      setSections(Array.isArray(res.sections) ? res.sections : []);
      setPalette(Array.isArray(res.palette) ? res.palette.slice(0, 6) : []);
      setPriceLow(String(res.priceLow ?? 12));
      setPriceHigh(String(res.priceHigh ?? 18));
    },
    onError: (err: Error) => setParseError(err.message),
  });

  // Resolved id for PATCH: URL edit param takes precedence, then session savedId.
  const activeId = editId ?? savedId ?? null;

  const save = useMutation({
    mutationFn: () =>
      activeId
        ? storeStudiosApi.editions.update(storeId, activeId, {
            name,
            sections,
            priceLow: parseFloat(priceLow) || 0,
            priceHigh: parseFloat(priceHigh) || 0,
            themeIds: selThemes,
            packIds: selPacks,
            insertIds: selInserts,
            productIds: selProducts,
          })
        : storeStudiosApi.editions.create(storeId, {
            name,
            description,
            sections,
            priceLow: parseFloat(priceLow) || 0,
            priceHigh: parseFloat(priceHigh) || 0,
            themeIds: selThemes,
            packIds: selPacks,
            insertIds: selInserts,
            productIds: selProducts,
            palette: palette.length === 6 && palette.every(isValidHex) ? palette : undefined,
          }),
    onSuccess: (data) => {
      // Capture id from first create so subsequent saves in this session PATCH.
      if (!editId && !savedId) setSavedId((data as { id: string }).id);
      qc.invalidateQueries({ queryKey: ["store-catalog", storeId] });
      qc.invalidateQueries({ queryKey: ["store-attachable", storeId] });
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      if (editId) {
        toast({ title: "Edition updated", description: `"${name}" has been saved.` });
      } else if (savedId) {
        toast({ title: "Draft updated", description: `"${name}" has been saved.` });
      } else {
        const themeNote = (data as any).autoThemeId
          ? " A matching draft theme was also created."
          : "";
        toast({
          title: "Edition saved as draft",
          description: `"${name}" is ready to review.${themeNote}`,
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canSave = !!name;

  // All hooks declared above — safe to return early now.
  if (!aiEnabled) return <AiDisabledState />;

  // Loading state for edit mode pre-fill
  if (editId && !prefilled && !ownedList) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <SkeletonRows rows={4} cols={1} />
      </div>
    );
  }

  if (editId && !existingEdition && ownedList) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <ErrorState message="Edition not found or no longer available." />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      {/* Edit mode banner */}
      {editId && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-lg bg-[#1B2A4A]/10 border border-[#1B2A4A]/20">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setLocation(`/store/${storeId}/my-content`)}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            My content
          </button>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-sm font-medium text-[#1B2A4A]">
            Editing: {existingEdition?.name ?? "edition"}
          </span>
        </div>
      )}

      <ClaudeHeader
        title={editId ? "Edit edition" : "Edition Studio"}
        description={
          editId
            ? "Update the edition spec below. You can optionally regenerate fields with Claude, or edit directly and save."
            : "Describe a planner edition — Claude designs the full product spec. Attach your store's own items and entitled catalog content, then save as a draft edition."
        }
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      {/* Owned-content badge */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        Editions created here belong exclusively to your store (origin: Yours). Items marked ★ are yours.
      </div>

      {/* Prompt + Revise */}
      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          {/* Revise existing (hidden in edit mode to keep it focused) */}
          {!editId && (
            <div>
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowRevise(!showRevise)}
              >
                {showRevise ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Revise one of your existing editions
              </button>
              {showRevise && (
                <div className="mt-2">
                  {ownedEditions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No owned editions yet — create one first.</p>
                  ) : (
                    <Select value={reviseFromId} onValueChange={handleReviseSelect}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick an edition to iterate on…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ownedEditions.map((ed) => (
                          <SelectItem key={ed.id} value={ed.id}>{ed.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edition-prompt">
              {editId ? "Regenerate with Claude (optional)" : "Describe the edition"}
            </Label>
            <Textarea
              id="edition-prompt"
              rows={3}
              placeholder={"e.g. \"A Christmas planner for 2026 — cosy December daily logs, gift tracker, holiday recipe pages, warm cranberry and gold palette\""}
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
              <><BookOpen className="w-4 h-4 mr-2" />{editId ? "Regenerate spec" : "Generate edition spec"}</>
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
          {/* Spec card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edition spec</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Palette (only shown when there is a palette) */}
              {palette.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Palette</p>
                  <div className="grid grid-cols-6 gap-2">
                    {palette.map((hex, i) => (
                      <div key={i} className="flex flex-col items-center gap-1.5">
                        <div
                          className="w-full aspect-square rounded-lg border border-border shadow-sm"
                          style={{ backgroundColor: isValidHex(hex) ? hex : "#ccc" }}
                        />
                        <span className="text-[10px] text-muted-foreground text-center leading-tight">{PALETTE_LABELS[i]}</span>
                        <Input
                          value={hex}
                          onChange={(e) => { const next = [...palette]; next[i] = e.target.value; setPalette(next); }}
                          className="h-6 text-[10px] text-center px-1 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sections */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sections</p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((s, i) => (
                    <Badge key={i} variant="secondary" className="px-3 py-1 bg-[#F7F0E6] text-[#1B2A4A] border-[#E7DCCB]">
                      {s}
                    </Badge>
                  ))}
                  {sections.length === 0 && (
                    <p className="text-xs text-muted-foreground">No sections yet — generate or add manually</p>
                  )}
                </div>
              </div>

              {/* Name + Description */}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Edition name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                {!editId && (
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="resize-none" />
                  </div>
                )}
              </div>

              {/* Price range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price low (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input type="number" min="0" value={priceLow} onChange={(e) => setPriceLow(e.target.value)} className="pl-6" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Price high (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input type="number" min="0" value={priceHigh} onChange={(e) => setPriceHigh(e.target.value)} className="pl-6" />
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
                Choose from your store's owned items (★) and any entitled catalog content.
                {!editId && " The auto-palette will also be saved as a draft theme."}
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {attachable.isLoading ? (
                <div className="col-span-2"><SkeletonRows rows={3} cols={1} /></div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Themes</Label>
                    <MultiChips items={attachable.data?.themes ?? []} selected={selThemes} onToggle={toggle(setSelThemes)} originBadge />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sticker packs</Label>
                    <MultiChips items={attachable.data?.packs ?? []} selected={selPacks} onToggle={toggle(setSelPacks)} originBadge />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Inserts</Label>
                    <MultiChips items={attachable.data?.inserts ?? []} selected={selInserts} onToggle={toggle(setSelInserts)} originBadge />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Related products</Label>
                    <MultiChips items={attachable.data?.products ?? []} selected={selProducts} onToggle={toggle(setSelProducts)} originBadge />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending || !prompt.trim()}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" />Regenerate
            </Button>
            <div className="flex-1" />
            {editId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation(`/store/${storeId}/my-content`)}
              >
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
              onClick={() => save.mutate()}
              disabled={!canSave || save.isPending}
            >
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              {editId ? "Save changes" : "Save as draft edition"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
