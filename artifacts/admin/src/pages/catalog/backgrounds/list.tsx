/**
 * Platform Background list — responsive card grid (was full-width rows).
 * 3-4 columns at 1440px via auto-fill minmax(260px, 1fr).
 *
 * API: GET /backgrounds, POST /backgrounds, PATCH /backgrounds/:id,
 *      DELETE /backgrounds/:id  —  all require super_admin.
 */
import { useRef, useState } from "react";
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
import { Plus, Trash2, Image, Square, Layers, Loader2, Upload, X } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";

interface PlatformBackground {
  id: string; name: string;
  type: string;               // "color" | "texture" | "image"
  assetRef: string | null;    // hex / slug / URL
  status: "draft" | "live";
  origin: string;
  authoredByStoreId: string | null;
  createdAt: string; updatedAt: string;
}

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

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium border border-border text-muted-foreground bg-background capitalize">
      {type}
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

// ── Background preview thumbnail ──────────────────────────────────────────────

/** CSS background values for named texture slugs */
const TEXTURE_CSS: Record<string, string> = {
  linen: `
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(180,160,130,0.18) 3px,
      rgba(180,160,130,0.18) 4px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 3px,
      rgba(180,160,130,0.18) 3px,
      rgba(180,160,130,0.18) 4px
    ),
    #f5efe6
  `.trim(),
  kraft: `
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 5px,
      rgba(120,80,40,0.06) 5px,
      rgba(120,80,40,0.06) 6px
    ),
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 5px,
      rgba(120,80,40,0.06) 5px,
      rgba(120,80,40,0.06) 6px
    ),
    #c8935a
  `.trim(),
  marble: `
    repeating-linear-gradient(
      118deg,
      transparent 0px,
      transparent 18px,
      rgba(180,180,200,0.30) 18px,
      rgba(180,180,200,0.30) 20px,
      transparent 20px,
      transparent 38px,
      rgba(160,160,185,0.18) 38px,
      rgba(160,160,185,0.18) 40px
    ),
    #e8e6e2
  `.trim(),
  canvas: `
    repeating-linear-gradient(
      90deg,
      rgba(140,120,90,0.12) 0px,
      rgba(140,120,90,0.12) 1px,
      transparent 1px,
      transparent 6px
    ),
    repeating-linear-gradient(
      0deg,
      rgba(140,120,90,0.12) 0px,
      rgba(140,120,90,0.12) 1px,
      transparent 1px,
      transparent 6px
    ),
    #f0ebe0
  `.trim(),
  grid: `
    repeating-linear-gradient(
      90deg,
      rgba(100,100,200,0.15) 0px,
      rgba(100,100,200,0.15) 1px,
      transparent 1px,
      transparent 20px
    ),
    repeating-linear-gradient(
      0deg,
      rgba(100,100,200,0.15) 0px,
      rgba(100,100,200,0.15) 1px,
      transparent 1px,
      transparent 20px
    ),
    #f8f9ff
  `.trim(),
  dot: `
    radial-gradient(circle, rgba(80,80,120,0.25) 1.5px, transparent 1.5px),
    #f8f9ff
  `.trim(),
};

/** Generic hatch fallback for unknown texture slugs */
const TEXTURE_FALLBACK = `
  repeating-linear-gradient(
    45deg,
    rgba(120,100,80,0.10) 0px,
    rgba(120,100,80,0.10) 1px,
    transparent 1px,
    transparent 8px
  ),
  #f0ede8
`.trim();

function BgPreview({ bg }: { bg: PlatformBackground }) {
  // Solid colour
  if (bg.type === "color" && bg.assetRef) {
    return (
      <div
        className="h-16 w-full shrink-0 border-b border-border"
        style={{ background: bg.assetRef }}
        title={bg.assetRef}
      />
    );
  }

  // Image — HTTP URL, data-URI, or internal storage path
  if (
    bg.type === "image" &&
    bg.assetRef &&
    (bg.assetRef.startsWith("http") || bg.assetRef.startsWith("data:image/") || bg.assetRef.startsWith("/api/storage/"))
  ) {
    return (
      <div className="h-16 w-full shrink-0 border-b border-border overflow-hidden bg-muted/20">
        <img src={bg.assetRef} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  // Texture — CSS tile from slug map or generic hatch
  if (bg.type === "texture") {
    const slug = (bg.assetRef ?? "").toLowerCase().trim();
    const css = TEXTURE_CSS[slug] ?? TEXTURE_FALLBACK;
    return (
      <div
        className="h-16 w-full shrink-0 border-b border-border"
        style={{ background: css, backgroundSize: slug === "dot" ? "10px 10px" : undefined }}
        title={bg.assetRef ?? undefined}
      />
    );
  }

  // Fallback icon
  const Icon = bg.type === "image" ? Image : Square;
  return (
    <div className="h-16 w-full shrink-0 border-b border-border bg-muted/30 flex items-center justify-center">
      <Icon className="w-5 h-5 text-muted-foreground/50" />
    </div>
  );
}

// ── Background form ───────────────────────────────────────────────────────────

function BackgroundForm({
  initial, onSave, onCancel,
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
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const { uploadFile, isUploading } = useUpload({
    basePath: "/api/storage",
    onSuccess: (response) => {
      // Store the serving URL so it can be displayed as an image
      const servingUrl = `/api/storage${response.objectPath}`;
      setAssetRef(servingUrl);
    },
    onError: (err) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    await uploadFile(file);
    // reset input so same file can be re-selected after an error
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearUpload = () => {
    setUploadedFileName(null);
    setAssetRef("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Warm Cream" />
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => { setType(v); setAssetRef(v === "color" ? "#F7F0E6" : ""); setUploadedFileName(null); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="color">Solid color</SelectItem>
            <SelectItem value="texture">Named texture</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Image type: file upload + URL fallback ───────────────────────── */}
      {type === "image" ? (
        <div className="space-y-3">
          {/* File picker */}
          <div className="space-y-1">
            <Label>Upload image file</Label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="shrink-0"
              >
                {isUploading ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</>
                ) : (
                  <><Upload className="w-3.5 h-3.5 mr-1.5" />Choose file</>
                )}
              </Button>
              {uploadedFileName && (
                <div className="flex items-center gap-1 text-[12px] text-muted-foreground min-w-0">
                  <span className="truncate">{uploadedFileName}</span>
                  <button type="button" onClick={clearUpload} className="shrink-0 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            {/* Preview once uploaded */}
            {assetRef && assetRef.startsWith("/api/storage/") && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border h-20 bg-muted/20">
                <img src={assetRef} alt="preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* URL fallback */}
          <div className="space-y-1">
            <Label className="text-muted-foreground text-[11.5px]">Or paste an image URL</Label>
            <Input
              value={assetRef.startsWith("/api/storage/") ? "" : assetRef}
              onChange={e => { setAssetRef(e.target.value); setUploadedFileName(null); }}
              placeholder="https://…"
            />
          </div>
        </div>
      ) : type === "color" ? (
        <div className="space-y-1">
          <Label>Hex color (e.g. #F7F0E6)</Label>
          <div className="flex gap-2 items-center">
            <input type="color" value={assetRef} onChange={e => setAssetRef(e.target.value)}
              className="w-9 h-9 rounded border border-input cursor-pointer" />
            <Input value={assetRef} onChange={e => setAssetRef(e.target.value)} placeholder="#F7F0E6" className="font-mono" />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label>Texture slug (e.g. linen, kraft, marble)</Label>
          <Input value={assetRef} onChange={e => setAssetRef(e.target.value)} placeholder="linen" />
        </div>
      )}

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
          onClick={() => onSave({ name, type, assetRef, status, origin })}
          disabled={!name.trim() || isUploading}
        >
          Save background
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Background card ───────────────────────────────────────────────────────────

function BackgroundCard({
  bg, onEdit, onDelete,
}: {
  bg: PlatformBackground;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">
      <BgPreview bg={bg} />

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="min-w-0">
          <p className="font-semibold text-[13.5px] text-foreground truncate">{bg.name}</p>
          {bg.assetRef && bg.type !== "color" && (
            <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{bg.assetRef}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <TypeBadge type={bg.type} />
          <StatusBadge status={bg.status} />
          <OriginBadge origin={bg.origin} />
        </div>

        <div className="flex items-center gap-1.5 mt-auto pt-1">
          <button type="button" onClick={onEdit} style={{ cursor: "pointer" }}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background transition-colors">
            Edit
          </button>
          <button type="button" onClick={onDelete} style={{ cursor: "pointer" }}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-transparent text-destructive hover:border-destructive/20 hover:bg-destructive/5 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BackgroundsList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: backgrounds = [], isLoading, error } = useQuery<PlatformBackground[]>({
    queryKey: ["platform-backgrounds"],
    queryFn: () => apiFetch<PlatformBackground[]>("/backgrounds"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<PlatformBackground>) =>
      apiFetch<PlatformBackground>("/backgrounds", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-backgrounds"] }); toast({ title: "Background created" }); setCreateOpen(false); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PlatformBackground> }) =>
      apiFetch<PlatformBackground>(`/backgrounds/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-backgrounds"] }); toast({ title: "Background updated" }); setEditingId(null); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/backgrounds/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-backgrounds"] }); toast({ title: "Background deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading backgrounds…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load backgrounds.</div>;

  const filtered = backgrounds.filter(b =>
    (typeFilter === "all" || b.type === typeFilter) &&
    (statusFilter === "all" || b.status === statusFilter)
  );
  const editing = backgrounds.find(b => b.id === editingId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Backgrounds"
        subtitle="Platform page-fill backgrounds — solid colours, named textures, and images that themes can use in generated planners."
        primaryCta={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />New background</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create background</DialogTitle></DialogHeader>
              <BackgroundForm onSave={data => createMutation.mutate(data)} onCancel={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
        filters={[
          {
            value: typeFilter,
            options: [
              { value: "all", label: "All types" },
              { value: "color", label: "Colour" },
              { value: "texture", label: "Texture" },
              { value: "image", label: "Image" },
            ],
            onChange: setTypeFilter,
          },
          {
            value: statusFilter,
            options: [
              { value: "all", label: "All statuses" },
              { value: "live", label: "Live" },
              { value: "draft", label: "Draft" },
            ],
            onChange: setStatusFilter,
          },
        ]}
        filterMeta={`${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
      />

      {/* Edit dialog */}
      {editingId && editing && (
        <Dialog open onOpenChange={(o) => !o && setEditingId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit background</DialogTitle></DialogHeader>
            <BackgroundForm
              initial={editing}
              onSave={data => patchMutation.mutate({ id: editingId, data })}
              onCancel={() => setEditingId(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {filtered.length === 0 ? (
        <div className="border border-dashed rounded-[14px] p-14 text-center text-muted-foreground">
          {typeFilter !== "all" ? `No ${typeFilter} backgrounds.` : "No backgrounds yet — create one or run the starter seed."}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {filtered.map(bg => (
            <BackgroundCard
              key={bg.id}
              bg={bg}
              onEdit={() => setEditingId(bg.id)}
              onDelete={() => { if (confirm(`Delete "${bg.name}"?`)) deleteMutation.mutate(bg.id); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
