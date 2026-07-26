/**
 * Platform Palette list — responsive card grid (was full-width rows).
 * 3-4 columns at 1440px via auto-fill minmax(260px, 1fr).
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
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";

interface PlatformPalette {
  id: string; name: string; desc: string | null; colors: string[];
  price: number; status: "draft" | "live"; origin: string;
  authoredByStoreId: string | null; createdAt: string; updatedAt: string;
}

const DEFAULT_COLORS = ["#C87560", "#7A8FA6", "#F3EDE1", "#2D3E50", "#A9957E", "#F7F0E6"];
const COLOR_LABELS = ["Accent", "Accent dark", "Secondary", "Tertiary", "Ink", "Paper"];

// ── Badge primitives ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const live = status === "live";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={live ? { background: "#ecfdf5", color: "#047857" } : { background: "#fffbeb", color: "#b45309" }}
    >
      {live ? "Live" : "Draft"}
    </span>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    starter:  { bg: "#ecfdf5", text: "#047857" },
    licensed: { bg: "#faf5ff", text: "#7e22ce" },
    owned:    { bg: "#eff6ff", text: "#1d4ed8" },
  };
  const s = map[origin] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={{ background: s.bg, color: s.text }}
    >
      {origin}
    </span>
  );
}

// ── Palette form ──────────────────────────────────────────────────────────────

function PaletteForm({
  initial, onSave, onCancel,
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
    const next = [...colors]; next[i] = val; setColors(next);
  };

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
              <input type="color" value={c} onChange={e => updateColor(i, e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-input" />
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted-foreground">{COLOR_LABELS[i]}</span>
                <Input value={c} onChange={e => updateColor(i, e.target.value)} className="h-6 text-xs font-mono" />
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
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="licensed">Licensed</SelectItem>
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

// ── Palette card ──────────────────────────────────────────────────────────────

function PaletteCard({
  palette, onEdit, onDelete,
}: {
  palette: PlatformPalette;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">
      {/* Colour swatch strip */}
      <div className="flex h-10 overflow-hidden shrink-0">
        {(palette.colors ?? []).map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} title={`${COLOR_LABELS[i]}: ${c}`} />
        ))}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="min-w-0">
          <p className="font-semibold text-[13.5px] text-foreground truncate">{palette.name}</p>
          {palette.desc && (
            <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">{palette.desc}</p>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={palette.status} />
          <OriginBadge origin={palette.origin} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-auto pt-1">
          <button
            type="button"
            onClick={onEdit}
            style={{ cursor: "pointer" }}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{ cursor: "pointer" }}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-transparent text-destructive hover:border-destructive/20 hover:bg-destructive/5 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PalettesList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: palettes = [], isLoading, error } = useQuery<PlatformPalette[]>({
    queryKey: ["platform-palettes"],
    queryFn: () => apiFetch<PlatformPalette[]>("/palettes"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PlatformPalette>) =>
      apiFetch<PlatformPalette>("/palettes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-palettes"] }); toast({ title: "Palette created" }); setCreateOpen(false); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PlatformPalette> }) =>
      apiFetch<PlatformPalette>(`/palettes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-palettes"] }); toast({ title: "Palette updated" }); setEditingId(null); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/palettes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-palettes"] }); toast({ title: "Palette deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading palettes…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load palettes.</div>;

  const filtered = statusFilter === "all" ? palettes : palettes.filter(p => p.status === statusFilter);
  const editing = palettes.find(p => p.id === editingId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Palettes"
        subtitle="Colour palettes are the building blocks inside themes. Each palette defines 6 colour slots (accent · accent-dark · secondary · tertiary · ink · paper) and can be shared across multiple themes."
        primaryCta={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />New palette</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create palette</DialogTitle></DialogHeader>
              <PaletteForm onSave={data => createMutation.mutate(data)} onCancel={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
        filters={[
          {
            value: statusFilter,
            options: [
              { value: "all", label: "All" },
              { value: "live", label: "Live" },
              { value: "draft", label: "Draft" },
            ],
            onChange: setStatusFilter,
          },
        ]}
        filterMeta={`${filtered.length} palette${filtered.length !== 1 ? "s" : ""}`}
      />

      {/* Edit dialog */}
      {editingId && editing && (
        <Dialog open onOpenChange={(o) => !o && setEditingId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit palette</DialogTitle></DialogHeader>
            <PaletteForm
              initial={editing}
              onSave={data => patchMutation.mutate({ id: editingId, data })}
              onCancel={() => setEditingId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-[14px] p-14 text-center text-muted-foreground">
          {statusFilter !== "all" ? `No ${statusFilter} palettes.` : "No palettes yet — create one to start building your colour system."}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {filtered.map(palette => (
            <PaletteCard
              key={palette.id}
              palette={palette}
              onEdit={() => setEditingId(palette.id)}
              onDelete={() => { if (confirm(`Delete "${palette.name}"?`)) deleteMutation.mutate(palette.id); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
