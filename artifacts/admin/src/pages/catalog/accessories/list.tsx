/**
 * Platform Accessories list — ribbon bookmarks, clips, tabs, page markers, elastic bands.
 *
 * API: GET /accessories, POST /accessories, PATCH /accessories/:id, DELETE /accessories/:id
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
import { Plus, Loader2 } from "lucide-react";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";

interface Accessory {
  id: string; name: string;
  kind: string;  // clip | tab | bookmark | page-marker | elastic
  status: "draft" | "live";
  origin: string;
  authoredByStoreId: string | null;
  createdAt: string; updatedAt: string;
}

// ── Kind icon map ─────────────────────────────────────────────────────────────

const KIND_EMOJI: Record<string, string> = {
  clip:         "📎",
  tab:          "🗂",
  bookmark:     "🎀",
  "page-marker": "🏷",
  elastic:      "⭕",
};

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const live = status === "live";
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={live ? { background: "#ecfdf5", color: "#047857" } : { background: "#fffbeb", color: "#b45309" }}>
      {live ? "Live" : "Draft"}
    </span>
  );
}

function KindBadge({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium border border-border text-muted-foreground bg-background capitalize">
      {kind}
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
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={{ background: s.bg, color: s.text }}>
      {origin}
    </span>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

function AccessoryForm({
  initial, onSave, onCancel,
}: {
  initial?: Partial<Accessory>;
  onSave: (data: Partial<Accessory>) => void;
  onCancel: () => void;
}) {
  const [name,   setName]   = useState(initial?.name   ?? "");
  const [kind,   setKind]   = useState(initial?.kind   ?? "bookmark");
  const [status, setStatus] = useState<"draft" | "live">(initial?.status ?? "draft");
  const [origin, setOrigin] = useState(initial?.origin ?? "starter");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ribbon Bookmark" />
      </div>
      <div className="space-y-1">
        <Label>Kind</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="clip">Clip</SelectItem>
            <SelectItem value="tab">Tab</SelectItem>
            <SelectItem value="bookmark">Bookmark</SelectItem>
            <SelectItem value="page-marker">Page marker</SelectItem>
            <SelectItem value="elastic">Elastic band</SelectItem>
          </SelectContent>
        </Select>
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
        <Button onClick={() => onSave({ name, kind, status, origin })} disabled={!name.trim()}>
          Save accessory
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function AccessoryCard({ item, onEdit, onDelete }: {
  item: Accessory; onEdit: () => void; onDelete: () => void;
}) {
  const emoji = KIND_EMOJI[item.kind] ?? "📦";
  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">
      <div className="h-14 border-b border-border flex items-center justify-center"
        style={{ background: "#F7F4F0", fontSize: 26 }}>
        {emoji}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <p className="font-semibold text-[13.5px] text-foreground truncate">{item.name}</p>

        <div className="flex items-center gap-1.5 flex-wrap">
          <KindBadge kind={item.kind} />
          <StatusBadge status={item.status} />
          <OriginBadge origin={item.origin} />
        </div>

        <div className="flex items-center gap-1.5 mt-auto pt-1">
          <button type="button" onClick={onEdit}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background transition-colors">
            Edit
          </button>
          <button type="button" onClick={onDelete}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-transparent text-destructive hover:border-destructive/20 hover:bg-destructive/5 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccessoriesList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: items = [], isLoading, error } = useQuery<Accessory[]>({
    queryKey: ["platform-accessories"],
    queryFn: () => apiFetch<Accessory[]>("/accessories"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Accessory>) =>
      apiFetch<Accessory>("/accessories", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-accessories"] }); toast({ title: "Accessory created" }); setCreateOpen(false); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Accessory> }) =>
      apiFetch<Accessory>(`/accessories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-accessories"] }); toast({ title: "Accessory updated" }); setEditingId(null); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/accessories/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-accessories"] }); toast({ title: "Accessory deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading accessories…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load accessories.</div>;

  const filtered = items.filter(it =>
    (kindFilter === "all" || it.kind === kindFilter) &&
    (statusFilter === "all" || it.status === statusFilter)
  );
  const editing = items.find(it => it.id === editingId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Accessories"
        subtitle="Planner accessories — bookmarks, clips, tabs, page markers and elastic bands — available as Theme Studio bundle parts."
        primaryCta={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />New accessory</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Create accessory</DialogTitle></DialogHeader>
              <AccessoryForm onSave={data => createMutation.mutate(data)} onCancel={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
        filters={[
          {
            value: kindFilter,
            options: [
              { value: "all",          label: "All kinds"    },
              { value: "bookmark",     label: "Bookmark"     },
              { value: "clip",         label: "Clip"         },
              { value: "tab",          label: "Tab"          },
              { value: "page-marker",  label: "Page marker"  },
              { value: "elastic",      label: "Elastic band" },
            ],
            onChange: setKindFilter,
          },
          {
            value: statusFilter,
            options: [
              { value: "all",   label: "All statuses" },
              { value: "live",  label: "Live"         },
              { value: "draft", label: "Draft"        },
            ],
            onChange: setStatusFilter,
          },
        ]}
        filterMeta={`${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
      />

      {editingId && editing && (
        <Dialog open onOpenChange={(o) => !o && setEditingId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit accessory</DialogTitle></DialogHeader>
            <AccessoryForm
              initial={editing}
              onSave={data => patchMutation.mutate({ id: editingId, data })}
              onCancel={() => setEditingId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-[14px] p-14 text-center text-muted-foreground">
          {kindFilter !== "all" ? `No ${kindFilter} accessories.` : "No accessories yet — create one or run the starter seed."}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {filtered.map(it => (
            <AccessoryCard
              key={it.id} item={it}
              onEdit={() => setEditingId(it.id)}
              onDelete={() => { if (confirm(`Delete "${it.name}"?`)) deleteMutation.mutate(it.id); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
