/**
 * Platform Fonts catalog — Google Font families with curated pairing metadata.
 *
 * API: GET /fonts, POST /fonts, PATCH /fonts/:id, DELETE /fonts/:id
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
import { Plus, Loader2, ExternalLink } from "lucide-react";
import { useFontLoader } from "@/components/FontSpecimenCard";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";

interface FontVariant  { weight: string; style?: "normal" | "italic" }
interface CuratedPairing { role: "heading" | "body" | "accent"; family: string; weight?: string }

interface FontItem {
  id: string;
  familyName: string;
  variants: FontVariant[];
  sampleUrl: string | null;
  curatedPairings: CuratedPairing[];
  status: "draft" | "live";
  origin: string;
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

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    heading: { bg: "#eff6ff", text: "#1d4ed8" },
    body:    { bg: "#f0fdf4", text: "#166534" },
    accent:  { bg: "#fef3c7", text: "#92400e" },
  };
  const s = map[role] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={{ background: s.bg, color: s.text }}>
      {role}
    </span>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    starter:  { bg: "#ecfdf5", text: "#047857" },
    licensed: { bg: "#faf5ff", text: "#7e22ce" },
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

function FontForm({
  initial, onSave, onCancel,
}: {
  initial?: Partial<FontItem>;
  onSave: (data: Partial<FontItem>) => void;
  onCancel: () => void;
}) {
  const [familyName, setFamilyName] = useState(initial?.familyName ?? "");
  const [sampleUrl,  setSampleUrl]  = useState(initial?.sampleUrl  ?? "");
  const [roles, setRoles] = useState<string[]>(
    (initial?.curatedPairings ?? []).map(p => p.role)
  );
  const [status, setStatus] = useState<"draft" | "live">(initial?.status ?? "draft");
  const [origin, setOrigin] = useState(initial?.origin ?? "starter");

  function toggleRole(r: string) {
    setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  function buildPairings(): CuratedPairing[] {
    return roles.map(r => ({ role: r as CuratedPairing["role"], family: familyName }));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Family name</Label>
        <Input value={familyName} onChange={e => setFamilyName(e.target.value)} placeholder="e.g. Playfair Display" />
        <p className="text-[11px] text-muted-foreground">Must match the Google Fonts family name exactly.</p>
      </div>
      <div className="space-y-1">
        <Label>Google Fonts URL (optional)</Label>
        <Input value={sampleUrl} onChange={e => setSampleUrl(e.target.value)} placeholder="https://fonts.google.com/specimen/…" />
      </div>
      <div className="space-y-2">
        <Label>Curated roles</Label>
        <div className="flex gap-2">
          {["heading", "body", "accent"].map(r => (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors capitalize"
              style={roles.includes(r)
                ? { background: "#1B2A4A", color: "#fff", borderColor: "#1B2A4A" }
                : { background: "transparent", borderColor: "#E7DCCB" }}
            >
              {r}
            </button>
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
        <Button
          onClick={() => onSave({ familyName, sampleUrl: sampleUrl || null, curatedPairings: buildPairings(), status, origin })}
          disabled={!familyName.trim()}
        >
          Save font
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function FontCard({ item, onEdit, onDelete }: {
  item: FontItem; onEdit: () => void; onDelete: () => void;
}) {
  // Load the font so the specimen tile and name label actually render in the
  // correct typeface instead of falling back to the UI font.
  const loaded = useFontLoader([item.familyName]);

  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">
      {/* Specimen tile — "Aa" in the actual typeface, fades in once loaded */}
      <div
        className="h-16 border-b border-border flex items-center justify-center px-4"
        style={{
          background: "#F7F4F0",
          fontFamily: `"${item.familyName}", Georgia, serif`,
          fontSize:   22,
          fontWeight: 600,
          color:      "#1B2A4A",
          opacity:    loaded ? 1 : 0.35,
          transition: "opacity 200ms",
        }}
      >
        Aa
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="min-w-0 flex items-start justify-between gap-2">
          {/* Family name label in its own typeface */}
          <p
            className="truncate"
            style={{
              fontFamily: `"${item.familyName}", Georgia, serif`,
              fontSize:   13.5,
              fontWeight: 600,
              color:      "#1B2A4A",
            }}
          >
            {item.familyName}
          </p>
          {item.sampleUrl && (
            <a href={item.sampleUrl} target="_blank" rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground shrink-0">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Curated role badges */}
        {item.curatedPairings.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.curatedPairings.map((p, i) => (
              <RoleBadge key={i} role={p.role} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
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

export default function FontsList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen]   = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [roleFilter, setRoleFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: items = [], isLoading, error } = useQuery<FontItem[]>({
    queryKey: ["platform-fonts"],
    queryFn: () => apiFetch<FontItem[]>("/fonts"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<FontItem>) => {
      const id = `font-${String(data.familyName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}-${Date.now().toString(36)}`;
      // buildCatalogRoutes requires `name`; fontsTable stores `familyName`.
      // Sending both satisfies the API guard; drizzle maps familyName → family_name and ignores the extra name key.
      return apiFetch<FontItem>("/fonts", { method: "POST", body: JSON.stringify({ ...data, id, name: data.familyName }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-fonts"] }); toast({ title: "Font created" }); setCreateOpen(false); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FontItem> }) =>
      apiFetch<FontItem>(`/fonts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-fonts"] }); toast({ title: "Font updated" }); setEditingId(null); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/fonts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-fonts"] }); toast({ title: "Font deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading fonts…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load fonts.</div>;

  const filtered = items.filter(it =>
    (roleFilter === "all" || it.curatedPairings.some(p => p.role === roleFilter)) &&
    (statusFilter === "all" || it.status === statusFilter)
  );
  const editing = items.find(it => it.id === editingId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Fonts"
        subtitle="Curated Google Font families with heading / body / accent roles — available as Theme Studio bundle parts."
        primaryCta={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />New font</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add font family</DialogTitle></DialogHeader>
              <FontForm onSave={data => createMutation.mutate(data)} onCancel={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
        filters={[
          {
            value: roleFilter,
            options: [
              { value: "all",     label: "All roles" },
              { value: "heading", label: "Heading"   },
              { value: "body",    label: "Body"       },
              { value: "accent",  label: "Accent"     },
            ],
            onChange: setRoleFilter,
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
            <DialogHeader><DialogTitle>Edit font</DialogTitle></DialogHeader>
            <FontForm
              initial={editing}
              onSave={data => patchMutation.mutate({ id: editingId, data })}
              onCancel={() => setEditingId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-[14px] p-14 text-center text-muted-foreground">
          {roleFilter !== "all" ? `No ${roleFilter} fonts.` : "No fonts yet — create one or run the starter seed."}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {filtered.map(it => (
            <FontCard
              key={it.id} item={it}
              onEdit={() => setEditingId(it.id)}
              onDelete={() => { if (confirm(`Delete "${it.familyName}"?`)) deleteMutation.mutate(it.id); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
