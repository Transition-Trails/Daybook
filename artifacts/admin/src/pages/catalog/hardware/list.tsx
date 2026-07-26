/**
 * Platform Hardware list — binding hardware for Theme Studio.
 *
 * API: GET /hardware, POST /hardware, PATCH /hardware/:id, DELETE /hardware/:id
 *      All mutations require super_admin.
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

interface HardwareItem {
  id: string; name: string;
  kind: string;   // coil | twin-loop | discs | 3-ring
  finish: string | null;
  status: "draft" | "live";
  origin: string;
  authoredByStoreId: string | null;
  createdAt: string; updatedAt: string;
}

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

// ── Finish swatch ─────────────────────────────────────────────────────────────

const FINISH_COLORS: Record<string, string> = {
  brass: "#C9A84C",
  silver: "#A8A9AD",
  black: "#2C2C2C",
  "rose-gold": "#E8A6A1",
  white: "#F2F2F2",
  gunmetal: "#4A4E54",
  gold: "#C9A84C",
};

function FinishSwatch({ finish }: { finish: string | null }) {
  if (!finish) return null;
  const bg = FINISH_COLORS[finish] ?? "#D0C8BC";
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border border-border shrink-0"
      style={{ background: bg }}
      title={finish}
    />
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

function HardwareForm({
  initial, onSave, onCancel,
}: {
  initial?: Partial<HardwareItem>;
  onSave: (data: Partial<HardwareItem>) => void;
  onCancel: () => void;
}) {
  const [name,   setName]   = useState(initial?.name   ?? "");
  const [kind,   setKind]   = useState(initial?.kind   ?? "coil");
  const [finish, setFinish] = useState(initial?.finish ?? "");
  const [status, setStatus] = useState<"draft" | "live">(initial?.status ?? "draft");
  const [origin, setOrigin] = useState(initial?.origin ?? "starter");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Brass Coil" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Kind</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="coil">Coil</SelectItem>
              <SelectItem value="twin-loop">Twin-loop</SelectItem>
              <SelectItem value="discs">Discs</SelectItem>
              <SelectItem value="3-ring">3-ring</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Finish</Label>
          <Select value={finish || "none"} onValueChange={v => setFinish(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Select finish" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— none —</SelectItem>
              <SelectItem value="brass">Brass</SelectItem>
              <SelectItem value="silver">Silver</SelectItem>
              <SelectItem value="black">Black</SelectItem>
              <SelectItem value="rose-gold">Rose gold</SelectItem>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="gunmetal">Gunmetal</SelectItem>
            </SelectContent>
          </Select>
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
        <Button onClick={() => onSave({ name, kind, finish: finish || null, status, origin })} disabled={!name.trim()}>
          Save hardware
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function HardwareCard({ item, onEdit, onDelete }: {
  item: HardwareItem; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">
      {/* Preview strip */}
      <div className="h-14 border-b border-border flex items-center justify-center gap-3"
        style={{ background: "#F7F4F0" }}>
        <FinishSwatch finish={item.finish} />
        <span className="text-[12px] font-medium text-muted-foreground capitalize">{item.kind}</span>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="min-w-0">
          <p className="font-semibold text-[13.5px] text-foreground truncate">{item.name}</p>
          {item.finish && (
            <p className="text-[11px] text-muted-foreground capitalize mt-0.5">Finish: {item.finish}</p>
          )}
        </div>

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

export default function HardwareList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: items = [], isLoading, error } = useQuery<HardwareItem[]>({
    queryKey: ["platform-hardware"],
    queryFn: () => apiFetch<HardwareItem[]>("/hardware"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<HardwareItem>) => {
      const id = `hw-${String(data.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}-${Date.now().toString(36)}`;
      return apiFetch<HardwareItem>("/hardware", { method: "POST", body: JSON.stringify({ ...data, id }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-hardware"] }); toast({ title: "Hardware created" }); setCreateOpen(false); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HardwareItem> }) =>
      apiFetch<HardwareItem>(`/hardware/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-hardware"] }); toast({ title: "Hardware updated" }); setEditingId(null); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/hardware/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-hardware"] }); toast({ title: "Hardware deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading hardware…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load hardware.</div>;

  const filtered = items.filter(it =>
    (kindFilter === "all" || it.kind === kindFilter) &&
    (statusFilter === "all" || it.status === statusFilter)
  );
  const editing = items.find(it => it.id === editingId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Hardware"
        subtitle="Binding hardware — coils, twin-loop, discs and rings — available as Theme Studio bundle parts."
        primaryCta={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />New hardware</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Create hardware</DialogTitle></DialogHeader>
              <HardwareForm onSave={data => createMutation.mutate(data)} onCancel={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
        filters={[
          {
            value: kindFilter,
            options: [
              { value: "all",       label: "All kinds"  },
              { value: "coil",      label: "Coil"       },
              { value: "twin-loop", label: "Twin-loop"  },
              { value: "discs",     label: "Discs"      },
              { value: "3-ring",    label: "3-ring"     },
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
            <DialogHeader><DialogTitle>Edit hardware</DialogTitle></DialogHeader>
            <HardwareForm
              initial={editing}
              onSave={data => patchMutation.mutate({ id: editingId, data })}
              onCancel={() => setEditingId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-[14px] p-14 text-center text-muted-foreground">
          {kindFilter !== "all" ? `No ${kindFilter} hardware.` : "No hardware yet — create one or run the starter seed."}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {filtered.map(it => (
            <HardwareCard
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
