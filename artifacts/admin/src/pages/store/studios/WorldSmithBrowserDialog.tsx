import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, Image as ImageIcon, ChevronRight, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { storePlannersApi, type WorldsmithSourceAsset } from "@/lib/api";

const CATEGORIES = ["All", "Papers", "Journal Cards", "Ephemera", "Washi", "Covers", "Dividers", "Other"] as const;
type Category = typeof CATEGORIES[number];

const USAGE_KINDS = [
  { value: "background", label: "Background" },
  { value: "artwork", label: "Artwork" },
  { value: "decorative", label: "Decorative" },
  { value: "journal-card", label: "Journal Card" },
  { value: "ephemera", label: "Ephemera" },
  { value: "strip", label: "Strip" },
  { value: "divider", label: "Divider" },
  { value: "cover", label: "Cover" },
  { value: "end-paper", label: "End Paper" },
  { value: "library", label: "Library" },
];

function classifyComponentType(type: string): Category {
  const t = type.toLowerCase();
  if (t === "paper") return "Papers";
  if (t === "journal-card") return "Journal Cards";
  if (t === "ephemera") return "Ephemera";
  if (t === "washi") return "Washi";
  if (t === "cover" || t === "end-paper") return "Covers";
  if (t === "divider") return "Dividers";
  return "Other";
}

export function WorldSmithBrowserDialog({
  storeId,
  plannerId,
  open,
  onOpenChange,
  onImportComplete,
}: {
  storeId: string;
  plannerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("All");
  
  const [selectedWorld, setSelectedWorld] = useState<string>("All");
  const [selectedCollection, setSelectedCollection] = useState<string>("All");
  const [selectedVolume, setSelectedVolume] = useState<string>("All");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [usageKind, setUsageKind] = useState<string>("background");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["worldsmith-assets", storeId, plannerId, { search }],
    queryFn: () => storePlannersApi.worldsmithAssets.listSource(storeId, plannerId, { search }),
    enabled: open,
  });

  const allAssets = data?.assets || [];

  const worlds = useMemo(() => {
    const map = new Map<string, string>();
    allAssets.forEach(a => map.set(a.world.id, a.world.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allAssets]);

  const collections = useMemo(() => {
    if (selectedWorld === "All") return [];
    const set = new Set<string>();
    allAssets.forEach(a => {
      if (a.world.id === selectedWorld && a.collectionId) {
        set.add(a.collectionId);
      }
    });
    return Array.from(set);
  }, [allAssets, selectedWorld]);

  const volumes = useMemo(() => {
    if (selectedCollection === "All") return [];
    const set = new Set<string>();
    allAssets.forEach(a => {
      if (a.collectionId === selectedCollection && a.volumeId) {
        set.add(a.volumeId);
      }
    });
    return Array.from(set);
  }, [allAssets, selectedCollection]);

  const handleWorldChange = (w: string) => {
    setSelectedWorld(w);
    setSelectedCollection("All");
    setSelectedVolume("All");
  };

  const handleCollectionChange = (c: string) => {
    setSelectedCollection(c);
    setSelectedVolume("All");
  };

  const displayAssets = useMemo(() => {
    return allAssets.filter(a => {
      if (selectedWorld !== "All" && a.world.id !== selectedWorld) return false;
      if (selectedCollection !== "All" && a.collectionId !== selectedCollection) return false;
      if (selectedVolume !== "All" && a.volumeId !== selectedVolume) return false;
      
      if (category !== "All") {
        if (classifyComponentType(a.componentType) !== category) return false;
      }
      return true;
    });
  }, [allAssets, selectedWorld, selectedCollection, selectedVolume, category]);


  const importMutation = useMutation({
    mutationFn: () =>
      storePlannersApi.worldsmithAssets.import(storeId, plannerId, {
        assetIds: Array.from(selectedIds),
        usageKind,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-project-assets", storeId, plannerId] });
      setSelectedIds(new Set());
      onImportComplete?.();
      onOpenChange(false);
    },
  });

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const importError = importMutation.error instanceof Error ? importMutation.error.message : "Failed to import assets.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden bg-card">
        <DialogHeader className="p-5 pb-4 border-b border-border bg-background">
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            Add Assets <ChevronRight className="w-5 h-5 text-muted-foreground" /> WorldSmith
          </DialogTitle>
          <DialogDescription>
            Browse approved final artwork to import into your planner workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          <div className="w-60 border-r border-border bg-muted/40 p-4 flex flex-col gap-5 overflow-y-auto">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Search</p>
              <Input
                data-testid="input-worldsmith-search"
                placeholder="Search name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>

            {worlds.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">World</p>
                  <select data-testid="select-filter-world" value={selectedWorld} onChange={e => handleWorldChange(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                    <option value="All">All Worlds</option>
                    {worlds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                {selectedWorld !== "All" && collections.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">Collection</p>
                    <select data-testid="select-filter-collection" value={selectedCollection} onChange={e => handleCollectionChange(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                      <option value="All">All Collections</option>
                      {collections.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {selectedCollection !== "All" && volumes.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">Volume</p>
                    <select data-testid="select-filter-volume" value={selectedVolume} onChange={e => setSelectedVolume(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                      <option value="All">All Volumes</option>
                      {volumes.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Category</p>
              <div className="flex flex-col gap-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    data-testid={`filter-category-${c.toLowerCase().replace(' ', '-')}`}
                    onClick={() => setCategory(c)}
                    className={`text-left text-xs px-3 py-2 rounded-md transition-colors ${
                      category === c ? "bg-foreground text-background font-medium" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 p-5 overflow-y-auto flex flex-col bg-card relative">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : isError ? (
              <div className="flex-1 flex items-center justify-center text-destructive text-sm">
                Failed to load assets.
              </div>
            ) : displayAssets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
                <ImageIcon className="w-10 h-10 opacity-20" />
                <p>No final artwork found for these filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-max pb-4">
                {displayAssets.map((asset) => (
                  <div
                    key={asset.id}
                    data-testid={`worldsmith-asset-${asset.id}`}
                    onClick={() => toggleSelection(asset.id)}
                    className={`relative group cursor-pointer rounded-lg border-2 overflow-hidden transition-all ${
                      selectedIds.has(asset.id)
                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border-border hover:border-primary/50 bg-background"
                    }`}
                  >
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      <img
                        src={asset.sourceRenderUrl}
                        alt={asset.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      {selectedIds.has(asset.id) && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-1">
                      <p className="text-xs font-medium truncate" title={asset.name}>{asset.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{asset.world.name}</p>
                      
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">{asset.componentType}</Badge>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal bg-muted">v{asset.version}</Badge>
                      </div>
                      
                      <div className="flex flex-col gap-0.5 mt-1">
                        {asset.productionSpecId && (
                          <span className="text-[9px] text-muted-foreground truncate" title={asset.productionSpecId}>Spec: {asset.productionSpecId}</span>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground capitalize">{asset.status}</span>
                          {asset.productionMetadata?.orientation && (
                            <span className="text-[9px] text-muted-foreground capitalize">{asset.productionMetadata.orientation}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-background sm:justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {selectedIds.size} asset{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            {selectedIds.size > 0 && (
              <select
                data-testid="select-usage-kind"
                value={usageKind}
                onChange={(e) => setUsageKind(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                {USAGE_KINDS.map(k => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            )}
            {importMutation.isError && (
              <div className="flex items-center gap-1 text-destructive text-xs bg-destructive/10 px-2 py-1 rounded">
                <AlertTriangle className="w-3 h-3" /> {importError}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button data-testid="button-cancel-import" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              data-testid="button-import-assets"
              onClick={() => importMutation.mutate()}
              disabled={selectedIds.size === 0 || importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Import Selected
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
