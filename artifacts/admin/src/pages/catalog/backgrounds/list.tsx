/**
 * Platform Background list — manage starter and licensed backgrounds
 * (solid colors, named textures, or image references) that themes can use.
 *
 * API: GET /backgrounds, POST /backgrounds, PATCH /backgrounds/:id,
 *      DELETE /backgrounds/:id  —  all require super_admin.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Image, Square, Layers } from "lucide-react";

interface PlatformBackground {
  id: string;
  name: string;
  /** color | texture | image */
  type: string;
  /** Hex color string for 'color', texture slug for 'texture', asset path/URL for 'image' */
  assetRef: string | null;
  status: "draft" | "live";
  origin: string;
  authoredByStoreId: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  color: Square,
  texture: Layers,
  image: Image,
};

function BackgroundPreview({ bg }: { bg: PlatformBackground }) {
  if (bg.type === "color" && bg.assetRef) {
    return (
      <div
        className="w-10 h-10 rounded border border-black/10 shrink-0"
        style={{ background: bg.assetRef }}
        title={bg.assetRef}
      />
    );
  }
  const Icon = TYPE_ICONS[bg.type] ?? Image;
  return (
    <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}

function BackgroundForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<PlatformBackground>;
  onSave: (data: Partial<PlatformBackground>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<string>(initial?.type ?? "color");
  const [assetRef, setAssetRef] = useState(initial?.assetRef ?? "#F7F0E6");
  const [status, setStatus] = useState<"draft" | "live">(initial?.status ?? "draft");
  const [origin, setOrigin] = useState(initial?.origin ?? "licensed");

  const assetLabel =
    type === "color" ? "Hex color (e.g. #F7F0E6)" :
    type === "texture" ? "Texture slug (e.g. linen, kraft, marble)" :
    "Image URL or asset path";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Warm Cream" />
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="color">Solid color</SelectItem>
            <SelectItem value="texture">Named texture</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>{assetLabel}</Label>
        {type === "color" ? (
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={assetRef}
              onChange={e => setAssetRef(e.target.value)}
              className="w-9 h-9 rounded border border-input cursor-pointer"
            />
            <Input
              value={assetRef}
              onChange={e => setAssetRef(e.target.value)}
              placeholder="#F7F0E6"
              className="font-mono"
            />
          </div>
        ) : (
          <Input
            value={assetRef}
            onChange={e => setAssetRef(e.target.value)}
            placeholder={type === "texture" ? "linen" : "https://…"}
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v: "draft" | "live") => setStatus(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Origin</Label>
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="licensed">Licensed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ name, type, assetRef, status, origin })} disabled={!name.trim()}>
          Save background
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function BackgroundsList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: backgrounds = [], isLoading, error } = useQuery<PlatformBackground[]>({
    queryKey: ["platform-backgrounds"],
    queryFn: () => apiFetch<PlatformBackground[]>("/backgrounds"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PlatformBackground>) =>
      apiFetch<PlatformBackground>("/backgrounds", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-backgrounds"] });
      toast({ title: "Background created" });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PlatformBackground> }) =>
      apiFetch<PlatformBackground>(`/backgrounds/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-backgrounds"] });
      toast({ title: "Background updated" });
      setEditingId(null);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/backgrounds/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-backgrounds"] });
      toast({ title: "Background deleted" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading backgrounds…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load backgrounds.</div>;

  const filtered = typeFilter === "all" ? backgrounds : backgrounds.filter(b => b.type === typeFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Backgrounds</h1>
          <p className="text-muted-foreground mt-1">
            Platform backgrounds — solid colors, named textures, and images that themes can use
            as page fills in generated planners.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New background</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create background</DialogTitle></DialogHeader>
            <BackgroundForm
              onSave={data => createMutation.mutate(data)}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Type filter */}
      <div className="flex gap-2">
        {["all", "color", "texture", "image"].map(t => (
          <Button
            key={t}
            size="sm"
            variant={typeFilter === t ? "default" : "outline"}
            onClick={() => setTypeFilter(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
        <span className="text-sm text-muted-foreground self-center ml-2">{filtered.length} items</span>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          {typeFilter !== "all" ? `No ${typeFilter} backgrounds.` : "No backgrounds yet. Create one to start."}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(bg => (
            <div key={bg.id}>
              {editingId === bg.id ? (
                <div className="border rounded-lg p-4">
                  <BackgroundForm
                    initial={bg}
                    onSave={data => patchMutation.mutate({ id: bg.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="border rounded-lg px-4 py-3 flex items-center gap-4">
                  <BackgroundPreview bg={bg} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{bg.name}</p>
                    {bg.assetRef && (
                      <p className="text-xs text-muted-foreground font-mono truncate">{bg.assetRef}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">{bg.type}</Badge>
                    <Badge variant={bg.status === "live" ? "default" : "secondary"}>{bg.status}</Badge>
                    <Badge variant="outline">{bg.origin}</Badge>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(bg.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete "${bg.name}"?`)) deleteMutation.mutate(bg.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
