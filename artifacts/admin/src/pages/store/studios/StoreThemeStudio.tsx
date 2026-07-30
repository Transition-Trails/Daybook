/**
 * Store-Scoped Theme Studio
 * Generates a 6-color palette from a mood prompt, saves as owned theme.
 * Staff can draft; only store_owner can publish.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Globe, Palette, Lock, Sparkles, Image, CheckCircle2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState } from "@/components/shared";
import { isValidHex, PALETTE_LABELS } from "@/lib/ai";
import { storeStudiosApi, studioGenerateApi } from "@/lib/api";
import { AiDisabledState, SuperAdminAiBanner } from "./AiDisabledState";

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

  // Background generator state
  const [bgBrief, setBgBrief] = useState("");
  const [bgName, setBgName] = useState("");
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgSavedId, setBgSavedId] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);

  // Theme-link state (post-save)
  const [bgLinkThemeId, setBgLinkThemeId] = useState<string>("");
  const [bgLinkedThemeIds, setBgLinkedThemeIds] = useState<Set<string>>(new Set());

  const generate = useMutation({
    mutationFn: () => studioGenerateApi.generateTheme(storeId, { prompt: prompt.trim() }),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      setResult({ name: res.name, description: res.description, colors: res.colors });
      setName(res.name ?? "");
      setDescription(res.description ?? "");
      setColors(Array.isArray(res.colors) ? res.colors.slice(0, 6) : []);
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

  // Owned themes list — for the theme-link picker
  const ownedThemes = useQuery({
    queryKey: ["store-owned", storeId, "themes"],
    queryFn: () => storeStudiosApi.list(storeId),
    select: (data) => data.themes ?? [],
    staleTime: 60_000,
  });

  const linkBgToTheme = useMutation({
    mutationFn: async (themeId: string) => {
      // Fetch existing backgrounds for the theme so we do an additive link
      const current = await storeStudiosApi.backgrounds.getForTheme(storeId, themeId);
      const existingIds = current.map((b) => b.id);
      const merged = existingIds.includes(bgSavedId!)
        ? existingIds
        : [...existingIds, bgSavedId!];
      return storeStudiosApi.backgrounds.setForTheme(storeId, themeId, merged);
    },
    onSuccess: (_data, themeId) => {
      setBgLinkedThemeIds((prev) => new Set([...prev, themeId]));
      qc.invalidateQueries({ queryKey: ["store-catalog", storeId] });
      const themeName = ownedThemes.data?.find((t) => t.id === themeId)?.name ?? "theme";
      toast({ title: "Background linked!", description: `"${bgName}" is now attached to "${themeName}".` });
    },
    onError: (err: Error) => {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    },
  });

  const generateBg = useMutation({
    mutationFn: (saveToStore: boolean) =>
      storeStudiosApi.backgrounds.generate(storeId, {
        brief: bgBrief.trim(),
        name: bgName.trim() || "Untitled background",
        backgroundType: "texture",
        saveToStore,
      }),
    onSuccess: (data, saveToStore) => {
      setBgError(null);
      setBgPreview(data.assetRef);
      if (saveToStore && data.savedId) {
        setBgSavedId(data.savedId);
        qc.invalidateQueries({ queryKey: ["store-catalog", storeId] });
        toast({ title: "Background saved!", description: `"${bgName}" added to your backgrounds as a draft.` });
      }
    },
    onError: (err: Error) => setBgError(err.message),
  });

  const canSave = !!name && colors.length === 6 && colors.every(isValidHex);

  // All hooks declared above — safe to return early now.
  if (!aiEnabled) return role === "super_admin" ? <SuperAdminAiBanner /> : <AiDisabledState />;

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

      {/* ── Background Generator ──────────────────────────────────────────── */}
      <div className="border-t border-border pt-8 mt-8">
        <h3 className="text-sm font-semibold mb-1">Generate a Background</h3>
        <p className="text-xs text-muted-foreground mb-6">
          Describe a texture or paper style — Claude expands the brief, DALL·E 3 generates the art.
        </p>

        <Card className="mb-4">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bg-brief">Background brief</Label>
              <Textarea
                id="bg-brief"
                rows={2}
                placeholder={"e.g. \"Aged cream linen with subtle grain and soft floral watercolour edges\""}
                value={bgBrief}
                onChange={(e) => setBgBrief(e.target.value)}
                className="resize-none font-sans"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bg-name">Background name</Label>
              <Input
                id="bg-name"
                placeholder="e.g. Aged Linen"
                value={bgName}
                onChange={(e) => { setBgName(e.target.value); setBgSavedId(null); }}
              />
            </div>
            <Button
              onClick={() => generateBg.mutate(false)}
              disabled={generateBg.isPending || !bgBrief.trim() || !bgName.trim()}
              variant="outline"
            >
              {generateBg.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating… (up to 30 s)</>
                : <><Image className="w-4 h-4 mr-2" />Preview background</>}
            </Button>
          </CardContent>
        </Card>

        {bgError && !generateBg.isPending && (
          <div className="mb-4">
            <ErrorState message={bgError} onRetry={() => generateBg.mutate(false)} />
          </div>
        )}

        {bgPreview && !generateBg.isPending && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Preview</p>
                <div className="rounded-lg overflow-hidden border border-border aspect-video">
                  <img src={bgPreview} alt="Generated background" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => generateBg.mutate(false)} disabled={generateBg.isPending}>
                  <RefreshCw className="w-3.5 h-3.5 mr-2" />Regenerate
                </Button>
                <div className="flex-1" />
                {bgSavedId ? (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />Saved to your backgrounds
                  </span>
                ) : isOwner ? (
                  <Button
                    size="sm"
                    className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
                    onClick={() => generateBg.mutate(true)}
                    disabled={generateBg.isPending}
                  >
                    {generateBg.isPending
                      ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Saving…</>
                      : <><Save className="w-3.5 h-3.5 mr-2" />Save to my backgrounds</>}
                  </Button>
                ) : (
                  <Button size="sm" disabled className="opacity-50 cursor-not-allowed">
                    <Lock className="w-3.5 h-3.5 mr-2" />Save (owner only)
                  </Button>
                )}
              </div>

              {/* ── Theme-link panel (appears after background is saved) ── */}
              {bgSavedId && (
                <div className="pt-4 border-t border-border space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />Add to a theme
                  </p>
                  {ownedThemes.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />Loading your themes…
                    </div>
                  ) : (ownedThemes.data?.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No owned themes yet — save a theme above first.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={bgLinkThemeId} onValueChange={setBgLinkThemeId}>
                        <SelectTrigger className="h-8 text-xs w-52">
                          <SelectValue placeholder="Pick a theme…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ownedThemes.data!.map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs">
                              <span className="flex items-center gap-1.5">
                                {bgLinkedThemeIds.has(t.id) && (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                )}
                                {t.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!bgLinkThemeId || linkBgToTheme.isPending || bgLinkedThemeIds.has(bgLinkThemeId)}
                        onClick={() => linkBgToTheme.mutate(bgLinkThemeId)}
                      >
                        {linkBgToTheme.isPending ? (
                          <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Linking…</>
                        ) : bgLinkThemeId && bgLinkedThemeIds.has(bgLinkThemeId) ? (
                          <><CheckCircle2 className="w-3 h-3 mr-1.5 text-emerald-500" />Linked</>
                        ) : (
                          <>Add to {bgLinkThemeId ? `"${ownedThemes.data!.find((t) => t.id === bgLinkThemeId)?.name ?? "theme"}"` : "theme"}</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
