/**
 * Platform Palette list — manage starter and licensed color palettes
 * that can be linked to themes in the platform catalog.
 *
 * API: GET /palettes (list), POST /palettes (create), PATCH /palettes/:id,
 *      DELETE /palettes/:id  —  all require super_admin.
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
import { Plus, Trash2, Pencil } from "lucide-react";

interface PlatformPalette {
  id: string;
  name: string;
  desc: string | null;
  colors: string[];
  price: number;
  status: "draft" | "live";
  origin: string;
  authoredByStoreId: string | null;
  createdAt: string;
  updatedAt: string;
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <div
      className="w-5 h-5 rounded-full border border-black/10 shrink-0"
      style={{ background: color }}
      title={color}
    />
  );
}

const DEFAULT_COLORS = ["#C87560", "#7A8FA6", "#F3EDE1", "#2D3E50", "#A9957E", "#F7F0E6"];

function PaletteForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<PlatformPalette>;
  onSave: (data: { name: string; desc: string; colors: string[]; status: "draft" | "live"; origin: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.desc ?? "");
  const [colors, setColors] = useState<string[]>(initial?.colors ?? [...DEFAULT_COLORS]);
  const [status, setStatus] = useState<"draft" | "live">(initial?.status ?? "draft");
  const [origin, setOrigin] = useState(initial?.origin ?? "licensed");

  const updateColor = (i: number, val: string) => {
    const next = [...colors];
    next[i] = val;
    setColors(next);
  };

  const COLOR_LABELS = ["Accent", "Accent dark", "Secondary", "Tertiary", "Ink", "Paper"];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Autumn Harvest" />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Brief description" />
      </div>
      <div className="space-y-2">
        <Label>Colors (6 — accent · accent-dark · secondary · tertiary · ink · paper)</Label>
        <div className="grid grid-cols-3 gap-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={c}
                onChange={e => updateColor(i, e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-input"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted-foreground">{COLOR_LABELS[i]}</span>
                <Input
                  value={c}
                  onChange={e => updateColor(i, e.target.value)}
                  className="h-6 text-xs font-mono"
                />
              </div>
            </div>
          ))}
        </div>
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
              <SelectItem value="starter">Starter (always available)</SelectItem>
              <SelectItem value="licensed">Licensed (subscription)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ name, desc, colors, status, origin })} disabled={!name.trim()}>
          Save palette
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function PalettesList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: palettes = [], isLoading, error } = useQuery<PlatformPalette[]>({
    queryKey: ["platform-palettes"],
    queryFn: () => apiFetch<PlatformPalette[]>("/palettes"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PlatformPalette>) =>
      apiFetch<PlatformPalette>("/palettes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-palettes"] });
      toast({ title: "Palette created" });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PlatformPalette> }) =>
      apiFetch<PlatformPalette>(`/palettes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-palettes"] });
      toast({ title: "Palette updated" });
      setEditingId(null);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/palettes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-palettes"] });
      toast({ title: "Palette deleted" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading palettes…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load palettes.</div>;

  const editing = palettes.find(p => p.id === editingId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Palettes</h1>
          <p className="text-muted-foreground mt-1">
            Platform color palettes — link to themes to give sellers styling choices.
            Each palette defines 6 slots: accent · accent-dark · secondary · tertiary · ink · paper.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New palette</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create palette</DialogTitle></DialogHeader>
            <PaletteForm
              onSave={data => createMutation.mutate(data)}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {palettes.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          No palettes yet. Create one to start building your color system.
        </div>
      ) : (
        <div className="grid gap-3">
          {palettes.map(palette => (
            <div key={palette.id}>
              {editingId === palette.id ? (
                <div className="border rounded-lg p-4">
                  <PaletteForm
                    initial={palette}
                    onSave={data => patchMutation.mutate({ id: palette.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="border rounded-lg px-4 py-3 flex items-center gap-4">
                  {/* Color swatches */}
                  <div className="flex gap-1 shrink-0">
                    {(palette.colors ?? []).map((c, i) => (
                      <ColorSwatch key={i} color={c} />
                    ))}
                  </div>
                  {/* Name + desc */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{palette.name}</p>
                    {palette.desc && <p className="text-xs text-muted-foreground truncate">{palette.desc}</p>}
                  </div>
                  {/* Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={palette.status === "live" ? "default" : "secondary"}>
                      {palette.status}
                    </Badge>
                    <Badge variant="outline">{palette.origin}</Badge>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(palette.id)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete "${palette.name}"?`)) deleteMutation.mutate(palette.id); }}
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
