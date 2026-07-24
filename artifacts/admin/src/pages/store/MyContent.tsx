/**
 * MyContent — "My content" management surface for store-owned catalog items.
 *
 * Shows all owned Themes, Packs, Inserts, and Editions for this store.
 * Allows editing, publish/unpublish toggle (owner only), and soft-delete
 * (owner only, with orphan guard for items attached to editions).
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  FolderOpen,
  Palette,
  Sticker,
  FileText,
  BookOpen,
  AlertTriangle,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ErrorState, SkeletonRows } from "@/components/shared";
import {
  storeStudiosApi,
  type OwnedTheme,
  type OwnedPack,
  type OwnedEdition,
  type OwnedList,
  type OwnedPalette,
  type OwnedBackground,
} from "@/lib/api";

interface Props {
  storeId: string;
  role: string;
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "live") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">
        Live
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 font-medium">
      Draft
    </Badge>
  );
}

function YoursBadge() {
  return (
    <Badge
      className="text-[10px] px-1.5 py-0"
      style={{ background: "hsl(221 46% 17%)", color: "hsl(35 52% 88%)", border: "none" }}
    >
      Yours
    </Badge>
  );
}

// ── Item row ───────────────────────────────────────────────────────────────

interface ItemRowProps {
  name: string;
  status: string;
  isOwner: boolean;
  isLive: boolean;
  isDraft: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  togglePending?: boolean;
  deletePending?: boolean;
}

function ItemRow({
  name,
  status,
  isOwner,
  isLive,
  isDraft,
  onEdit,
  onToggle,
  onDelete,
  togglePending,
  deletePending,
}: ItemRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="font-medium text-sm truncate">{name}</span>
        <YoursBadge />
        <StatusBadge status={status} />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Edit — staff can edit drafts; owner can edit anything */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          disabled={!isOwner && !isDraft}
          title={!isOwner && !isDraft ? "Staff can only edit draft items" : "Edit"}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>

        {/* Publish / Unpublish — owner only */}
        {isOwner && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            disabled={togglePending}
            title={isLive ? "Unpublish" : "Publish"}
          >
            {togglePending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isLive ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </Button>
        )}

        {/* Delete — owner only */}
        {isOwner && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
            onClick={onDelete}
            disabled={deletePending}
            title="Delete"
          >
            {deletePending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  empty,
}: {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h2>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground px-4 py-3 border border-dashed rounded-lg">
          No {title.toLowerCase()} yet
        </p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}

// ── Edit palette modal ─────────────────────────────────────────────────────

function EditPaletteModal({
  storeId,
  palette,
  onClose,
}: {
  storeId: string;
  palette: OwnedPalette | null; // null = create mode
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(palette?.name ?? "");
  const [colors, setColors] = useState<string[]>(
    palette?.colors ?? ["#6366f1", "#4f46e5", "#a5b4fc", "#c7d2fe", "#1e1b4b", "#fafafa"],
  );

  const setColor = (i: number, val: string) => {
    const next = [...colors];
    next[i] = val;
    setColors(next);
  };

  const save = useMutation({
    mutationFn: () =>
      palette
        ? storeStudiosApi.palettes.update(storeId, palette.id, { name, colors: colors.filter(c => c.trim()) })
        : storeStudiosApi.palettes.create(storeId, { name, colors: colors.filter(c => c.trim()) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-palettes", storeId] });
      toast({ title: palette ? "Palette updated" : "Palette created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: palette ? "Update failed" : "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const colorLabels = ["Accent", "Accent-dark", "Secondary", "Tertiary", "Ink", "Paper"];

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{palette ? "Edit palette" : "New palette"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Warm Sunset" />
          </div>
          <div className="space-y-2">
            <Label>Colors ({colors.length} slots: accent → paper)</Label>
            <div className="grid grid-cols-3 gap-2">
              {colors.map((hex, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded shrink-0 border border-border" style={{ backgroundColor: hex }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground truncate">{colorLabels[i] ?? `#${i + 1}`}</p>
                    <Input
                      value={hex}
                      onChange={e => setColor(i, e.target.value)}
                      className="h-6 text-[10px] px-1 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            onClick={() => save.mutate()}
            disabled={!name || colors.every(c => !c.trim()) || save.isPending}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            {palette ? "Save changes" : "Create palette"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manage theme palettes modal ────────────────────────────────────────────

function ManageThemePalettesModal({
  storeId,
  theme,
  allPalettes,
  onClose,
}: {
  storeId: string;
  theme: OwnedTheme;
  allPalettes: OwnedPalette[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: linked, isLoading } = useQuery<OwnedPalette[]>({
    queryKey: ["theme-palettes", storeId, theme.id],
    queryFn: () => storeStudiosApi.palettes.getForTheme(storeId, theme.id),
  });

  const linkedIds = new Set((linked ?? []).map(p => p.id));

  const save = useMutation({
    mutationFn: (ids: string[]) => storeStudiosApi.palettes.setForTheme(storeId, theme.id, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["theme-palettes", storeId, theme.id] });
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      toast({ title: "Palette links updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  function toggle(paletteId: string) {
    const next = linkedIds.has(paletteId)
      ? [...linkedIds].filter(id => id !== paletteId)
      : [...linkedIds, paletteId];
    save.mutate(next);
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Palettes for "{theme.name}"</DialogTitle>
          <DialogDescription className="pt-1 text-sm text-muted-foreground">
            Select which palettes buyers can pick when using this theme. The first palette is the default.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : allPalettes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No palettes yet. Create palettes in the Palettes section below, then come back here to link them.
          </p>
        ) : (
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {allPalettes.map(p => {
              const isLinked = linkedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  disabled={save.isPending}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    isLinked
                      ? "border-[#C87560] bg-[#FFF6F3]"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div className="flex gap-1 shrink-0">
                    {p.colors.slice(0, 6).map((c, i) => (
                      <span key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.1)", display: "inline-block" }} />
                    ))}
                  </div>
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  {isLinked && (
                    <Badge className="bg-[#C87560] text-white border-none text-[10px] px-1.5 py-0">
                      Linked
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button size="sm" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit background modal ─────────────────────────────────────────────────

function EditBackgroundModal({
  storeId,
  background,
  onClose,
}: {
  storeId: string;
  background: OwnedBackground | null; // null = create mode
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(background?.name ?? "");
  const [type, setType] = useState<"color" | "texture" | "image">(
    (background?.type as "color" | "texture" | "image") ?? "color",
  );
  const [hex, setHex] = useState(
    background?.type === "color" ? (background.assetRef ?? "#C87560") : "#C87560",
  );
  const [assetDataUrl, setAssetDataUrl] = useState<string | null>(
    background && background.type !== "color" ? (background.assetRef ?? null) : null,
  );
  const [uploading, setUploading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => { setAssetDataUrl(ev.target?.result as string); setUploading(false); };
    reader.onerror = () => { toast({ title: "File read failed", variant: "destructive" }); setUploading(false); };
    reader.readAsDataURL(file);
  }

  const assetRef = type === "color" ? hex : (assetDataUrl ?? undefined);

  const save = useMutation({
    mutationFn: () =>
      background
        ? storeStudiosApi.backgrounds.update(storeId, background.id, { name, type, assetRef: assetRef ?? null })
        : storeStudiosApi.backgrounds.create(storeId, { name, type, assetRef }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-backgrounds", storeId] });
      toast({ title: background ? "Background updated" : "Background created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const isValid =
    name.trim() !== "" && (type === "color" ? hex.startsWith("#") && hex.length >= 4 : assetDataUrl !== null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{background ? "Edit background" : "New background"}</DialogTitle>
          <DialogDescription>
            Appears as the base layer of every page in the generated planner.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warm Linen" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as "color" | "texture" | "image");
                setAssetDataUrl(null); // clear image when switching types
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="color">Color — solid paper tint</option>
              <option value="texture">Texture — seamless pattern</option>
              <option value="image">Image — full-page graphic</option>
            </select>
          </div>

          {type === "color" ? (
            <div className="space-y-1.5">
              <Label>Hex color</Label>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded border border-border shrink-0"
                  style={{ background: hex.startsWith("#") ? hex : "#ccc" }}
                />
                <Input
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  placeholder="#C87560"
                  className="font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{type === "texture" ? "Texture image" : "Background image"}</Label>
              {assetDataUrl && (
                <div className="relative w-full h-28 rounded-lg border border-border overflow-hidden bg-muted mb-2">
                  <img src={assetDataUrl} className="w-full h-full object-cover" alt="preview" />
                  <button
                    className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black/70"
                    onClick={() => setAssetDataUrl(null)}
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button size="sm" variant="outline" className="pointer-events-none" asChild={false}>
                  {uploading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  {assetDataUrl ? "Replace image" : "Upload image"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  PNG, JPG or WebP · 1920 × 1080+ recommended
                </span>
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            onClick={() => save.mutate()}
            disabled={!isValid || save.isPending}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            {background ? "Save changes" : "Create background"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manage theme backgrounds modal ────────────────────────────────────────

function ManageThemeBackgroundsModal({
  storeId,
  theme,
  allBackgrounds,
  onClose,
}: {
  storeId: string;
  theme: OwnedTheme;
  allBackgrounds: OwnedBackground[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: linked, isLoading } = useQuery<OwnedBackground[]>({
    queryKey: ["theme-backgrounds", storeId, theme.id],
    queryFn: () => storeStudiosApi.backgrounds.getForTheme(storeId, theme.id),
  });

  const linkedIds = new Set((linked ?? []).map((b) => b.id));

  const save = useMutation({
    mutationFn: (ids: string[]) => storeStudiosApi.backgrounds.setForTheme(storeId, theme.id, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["theme-backgrounds", storeId, theme.id] });
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      toast({ title: "Background links updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  function toggle(bgId: string) {
    const next = linkedIds.has(bgId)
      ? [...linkedIds].filter((id) => id !== bgId)
      : [...linkedIds, bgId];
    save.mutate(next);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Backgrounds for "{theme.name}"</DialogTitle>
          <DialogDescription className="pt-1 text-sm text-muted-foreground">
            Linked backgrounds appear as page-background options in the builder. The first linked
            background is the default when a buyer picks this theme.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : allBackgrounds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No backgrounds yet. Create one in the Background library section below, then return here
            to link it.
          </p>
        ) : (
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {allBackgrounds.map((bg) => {
              const isLinked = linkedIds.has(bg.id);
              return (
                <button
                  key={bg.id}
                  onClick={() => toggle(bg.id)}
                  disabled={save.isPending}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    isLinked
                      ? "border-[#C87560] bg-[#FFF6F3]"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  {/* Swatch */}
                  <div className="w-8 h-8 rounded shrink-0 border border-border overflow-hidden">
                    {bg.type === "color" ? (
                      <div className="w-full h-full" style={{ background: bg.assetRef ?? "#ccc" }} />
                    ) : bg.assetRef?.startsWith("data:image/") ? (
                      <img src={bg.assetRef} className="w-full h-full object-cover" alt={bg.name} />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <ImageIcon className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="flex-1 text-sm font-medium">{bg.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize shrink-0">
                    {bg.type}
                  </Badge>
                  {isLinked && (
                    <Badge className="bg-[#C87560] text-white border-none text-[10px] px-1.5 py-0">
                      Linked
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button size="sm" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit theme modal ───────────────────────────────────────────────────────

function EditThemeModal({
  storeId,
  theme,
  onClose,
}: {
  storeId: string;
  theme: OwnedTheme;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(theme.name);
  const [desc, setDesc] = useState(theme.desc ?? "");
  const [colors, setColors] = useState<string[]>(
    Array.isArray(theme.colors) ? (theme.colors as string[]) : [],
  );

  const save = useMutation({
    mutationFn: () =>
      storeStudiosApi.themes.update(storeId, theme.id, {
        name,
        description: desc || undefined,
        colors: colors.filter((c) => c.trim()),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      qc.invalidateQueries({ queryKey: ["store-attachable", storeId] });
      toast({ title: "Theme updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const setColor = (i: number, val: string) => {
    const next = [...colors];
    next[i] = val;
    setColors(next);
  };

  const colorLabels = ["Accent", "Accent-dark", "Secondary", "Tertiary", "Ink", "Paper"];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit theme</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          {colors.length > 0 && (
            <div className="space-y-2">
              <Label>Palette ({colors.length} colors)</Label>
              <div className="grid grid-cols-3 gap-2">
                {colors.map((hex, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div
                      className="w-6 h-6 rounded shrink-0 border border-border"
                      style={{ backgroundColor: hex }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground truncate">{colorLabels[i] ?? `#${i + 1}`}</p>
                      <Input
                        value={hex}
                        onChange={(e) => setColor(i, e.target.value)}
                        className="h-6 text-[10px] px-1 font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            onClick={() => save.mutate()}
            disabled={!name || save.isPending}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit pack modal ────────────────────────────────────────────────────────

function EditPackModal({
  storeId,
  pack,
  onClose,
}: {
  storeId: string;
  pack: OwnedPack;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(pack.name);
  const [tagsStr, setTagsStr] = useState((pack.tags as string[]).join(", "));
  const [price, setPrice] = useState(String(pack.price ?? 0));

  const save = useMutation({
    mutationFn: () =>
      storeStudiosApi.packs.update(storeId, pack.id, {
        name,
        tags: tagsStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        price: parseFloat(price) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      qc.invalidateQueries({ queryKey: ["store-attachable", storeId] });
      toast({ title: "Pack updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit sticker pack</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma-separated)</Label>
            <Input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="holiday, festive, winter"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Price (USD)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="pl-6"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            onClick={() => save.mutate()}
            disabled={!name || save.isPending}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit insert modal ──────────────────────────────────────────────────────

function EditInsertModal({
  storeId,
  insert,
  onClose,
}: {
  storeId: string;
  insert: { id: string; name: string };
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(insert.name);

  const save = useMutation({
    mutationFn: () => storeStudiosApi.inserts.update(storeId, insert.id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      toast({ title: "Insert updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit insert</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            onClick={() => save.mutate()}
            disabled={!name || save.isPending}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirm + orphan guard dialog ───────────────────────────────────

interface DeleteState {
  type: "themes" | "packs" | "inserts" | "editions";
  id: string;
  name: string;
  orphanEditions?: { id: string; name: string }[];
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function MyContent({ storeId, role }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const isOwner = role === "store_owner" || role === "super_admin";

  // Modals
  const [editTheme, setEditTheme] = useState<OwnedTheme | null>(null);
  const [editPack, setEditPack] = useState<OwnedPack | null>(null);
  const [editInsert, setEditInsert] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteState | null>(null);
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // Palette management
  const [editPalette, setEditPalette] = useState<OwnedPalette | "new" | null>(null);
  const [managePaletteTheme, setManagePaletteTheme] = useState<OwnedTheme | null>(null);
  const [deletingPaletteId, setDeletingPaletteId] = useState<string | null>(null);

  // Background management
  const [editBackground, setEditBackground] = useState<OwnedBackground | "new" | null>(null);
  const [manageBackgroundTheme, setManageBackgroundTheme] = useState<OwnedTheme | null>(null);
  const [deletingBackgroundId, setDeletingBackgroundId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<OwnedList>({
    queryKey: ["store-owned-list", storeId],
    queryFn: () => storeStudiosApi.list(storeId),
  });

  const { data: palettes = [], refetch: refetchPalettes } = useQuery<OwnedPalette[]>({
    queryKey: ["store-palettes", storeId],
    queryFn: () => storeStudiosApi.palettes.list(storeId),
  });

  const { data: backgrounds = [], refetch: refetchBackgrounds } = useQuery<OwnedBackground[]>({
    queryKey: ["store-backgrounds", storeId],
    queryFn: () => storeStudiosApi.backgrounds.list(storeId),
  });

  function deletePalette(p: OwnedPalette) {
    setDeletingPaletteId(p.id);
    storeStudiosApi.palettes.delete(storeId, p.id)
      .then(() => { refetchPalettes(); toast({ title: `"${p.name}" deleted` }); })
      .catch((err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }))
      .finally(() => setDeletingPaletteId(null));
  }

  function deleteBackground(bg: OwnedBackground) {
    setDeletingBackgroundId(bg.id);
    storeStudiosApi.backgrounds.delete(storeId, bg.id)
      .then(() => { refetchBackgrounds(); toast({ title: `"${bg.name}" deleted` }); })
      .catch((err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }))
      .finally(() => setDeletingBackgroundId(null));
  }

  // ── Status toggle ──────────────────────────────────────────────────────

  function toggle(
    type: "themes" | "packs" | "inserts" | "editions",
    id: string,
    currentStatus: string,
  ) {
    const newStatus = currentStatus === "live" ? "draft" : "live";
    setPendingToggles((s) => new Set(s).add(id));

    const fn =
      type === "themes"
        ? () => storeStudiosApi.themes.update(storeId, id, { status: newStatus })
        : type === "packs"
          ? () => storeStudiosApi.packs.update(storeId, id, { status: newStatus })
          : type === "inserts"
            ? () => storeStudiosApi.inserts.update(storeId, id, { status: newStatus })
            : () => storeStudiosApi.editions.update(storeId, id, { status: newStatus });

    fn()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
        toast({
          title: newStatus === "live" ? "Published" : "Unpublished",
          description: `Item is now ${newStatus}.`,
        });
      })
      .catch((err: Error) => {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      })
      .finally(() => {
        setPendingToggles((s) => { const n = new Set(s); n.delete(id); return n; });
      });
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  function initiateDelete(
    type: "themes" | "packs" | "inserts" | "editions",
    id: string,
    name: string,
  ) {
    setDeleteTarget({ type, id, name });
  }

  function performDelete(force = false) {
    if (!deleteTarget) return;
    const { type, id, name } = deleteTarget;
    setPendingDeletes((s) => new Set(s).add(id));

    const fn =
      type === "themes"
        ? () => storeStudiosApi.themes.delete(storeId, id, force)
        : type === "packs"
          ? () => storeStudiosApi.packs.delete(storeId, id, force)
          : type === "inserts"
            ? () => storeStudiosApi.inserts.delete(storeId, id, force)
            : () => storeStudiosApi.editions.delete(storeId, id);

    fn()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
        qc.invalidateQueries({ queryKey: ["store-attachable", storeId] });
        toast({ title: `"${name}" deleted` });
        setDeleteTarget(null);
      })
      .catch((err: any) => {
        if (err.affectedEditions) {
          // Show orphan warning — user must confirm force-delete
          setDeleteTarget((prev) => prev ? { ...prev, orphanEditions: err.affectedEditions } : null);
        } else {
          toast({ title: "Delete failed", description: err.message, variant: "destructive" });
          setDeleteTarget(null);
        }
      })
      .finally(() => {
        setPendingDeletes((s) => { const n = new Set(s); n.delete(id); return n; });
      });
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-semibold">My content</h1>
        <SkeletonRows rows={4} cols={1} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-semibold">My content</h1>
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      </div>
    );
  }

  const themes = data?.themes ?? [];
  const packs = data?.packs ?? [];
  const inserts = data?.inserts ?? [];
  const editions = data?.editions ?? [];
  const totalItems = themes.length + packs.length + inserts.length + editions.length + palettes.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-semibold">My content</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catalog items your store created via AI studios.
        </p>
      </div>

      {totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed rounded-xl">
          <FolderOpen className="w-10 h-10 text-muted-foreground mb-4 opacity-50" />
          <p className="text-base font-medium text-muted-foreground">
            You haven't created any content yet
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Open a studio to design your first owned theme, pack, or edition.
          </p>
          <Button
            className="mt-5 bg-[#C87560] hover:bg-[#A85E4E] text-white"
            onClick={() => setLocation(`/store/${storeId}/studios/theme`)}
          >
            Open Theme Studio
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Themes */}
          <Section icon={Palette} title="Themes" empty={themes.length === 0}>
            {themes.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <ItemRow
                    name={t.name}
                    status={t.status}
                    isOwner={isOwner}
                    isLive={t.status === "live"}
                    isDraft={t.status === "draft"}
                    onEdit={() => setEditTheme(t)}
                    onToggle={() => toggle("themes", t.id, t.status)}
                    onDelete={() => initiateDelete("themes", t.id, t.name)}
                    togglePending={pendingToggles.has(t.id)}
                    deletePending={pendingDeletes.has(t.id)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 text-xs gap-1.5 text-muted-foreground"
                  title="Manage palettes for this theme"
                  onClick={() => setManagePaletteTheme(t)}
                >
                  <Palette className="w-3 h-3" />
                  Palettes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 text-xs gap-1.5 text-muted-foreground"
                  title="Manage backgrounds for this theme"
                  onClick={() => setManageBackgroundTheme(t)}
                >
                  <ImageIcon className="w-3 h-3" />
                  Backgrounds
                </Button>
              </div>
            ))}
          </Section>

          {/* Palettes */}
          <Section icon={Palette} title="Palette library" empty={palettes.length === 0}>
            {isOwner && (
              <div className="mb-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setEditPalette("new")}
                >
                  + New palette
                </Button>
              </div>
            )}
            {palettes.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="flex gap-1 shrink-0">
                  {p.colors.slice(0, 6).map((c, i) => (
                    <span
                      key={i}
                      style={{ width: 14, height: 14, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.1)", display: "inline-block" }}
                    />
                  ))}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{p.name}</span>
                  <YoursBadge />
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditPalette(p)}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {isOwner && (
                    <>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          const newStatus = p.status === "live" ? "draft" : "live";
                          storeStudiosApi.palettes.update(storeId, p.id, { status: newStatus })
                            .then(() => refetchPalettes())
                            .catch((err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }));
                        }}
                        title={p.status === "live" ? "Unpublish" : "Publish"}
                      >
                        {p.status === "live" ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deletePalette(p)}
                        disabled={deletingPaletteId === p.id}
                        title="Delete"
                      >
                        {deletingPaletteId === p.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Section>

          {/* Backgrounds */}
          <Section icon={ImageIcon} title="Background library" empty={backgrounds.length === 0}>
            {isOwner && (
              <div className="mb-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setEditBackground("new")}
                >
                  + New background
                </Button>
              </div>
            )}
            {backgrounds.map((bg) => (
              <div
                key={bg.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                {/* Swatch / thumbnail */}
                <div className="w-9 h-9 rounded shrink-0 border border-border overflow-hidden">
                  {bg.type === "color" ? (
                    <div className="w-full h-full" style={{ background: bg.assetRef ?? "#ccc" }} />
                  ) : bg.assetRef?.startsWith("data:image/") ? (
                    <img src={bg.assetRef} className="w-full h-full object-cover" alt={bg.name} />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{bg.name}</span>
                  <YoursBadge />
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{bg.type}</Badge>
                  <StatusBadge status={bg.status} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditBackground(bg)}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {isOwner && (
                    <>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          const newStatus = bg.status === "live" ? "draft" : "live";
                          storeStudiosApi.backgrounds.update(storeId, bg.id, { status: newStatus })
                            .then(() => refetchBackgrounds())
                            .catch((err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }));
                        }}
                        title={bg.status === "live" ? "Unpublish" : "Publish"}
                      >
                        {bg.status === "live" ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deleteBackground(bg)}
                        disabled={deletingBackgroundId === bg.id}
                        title="Delete"
                      >
                        {deletingBackgroundId === bg.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Section>

          {/* Packs */}
          <Section icon={Sticker} title="Sticker packs" empty={packs.length === 0}>
            {packs.map((p) => (
              <ItemRow
                key={p.id}
                name={p.name}
                status={p.status}
                isOwner={isOwner}
                isLive={p.status === "live"}
                isDraft={p.status === "draft"}
                onEdit={() => setEditPack(p)}
                onToggle={() => toggle("packs", p.id, p.status)}
                onDelete={() => initiateDelete("packs", p.id, p.name)}
                togglePending={pendingToggles.has(p.id)}
                deletePending={pendingDeletes.has(p.id)}
              />
            ))}
          </Section>

          {/* Inserts (only shown if store has any) */}
          {inserts.length > 0 && (
            <Section icon={FileText} title="Inserts" empty={false}>
              {inserts.map((ins) => (
                <ItemRow
                  key={ins.id}
                  name={ins.name}
                  status={ins.status}
                  isOwner={isOwner}
                  isLive={ins.status === "live"}
                  isDraft={ins.status === "draft"}
                  onEdit={() => setEditInsert({ id: ins.id, name: ins.name })}
                  onToggle={() => toggle("inserts", ins.id, ins.status)}
                  onDelete={() => initiateDelete("inserts", ins.id, ins.name)}
                  togglePending={pendingToggles.has(ins.id)}
                  deletePending={pendingDeletes.has(ins.id)}
                />
              ))}
            </Section>
          )}

          {/* Editions */}
          <Section icon={BookOpen} title="Editions" empty={editions.length === 0}>
            {editions.map((ed) => (
              <ItemRow
                key={ed.id}
                name={ed.name}
                status={ed.status}
                isOwner={isOwner}
                isLive={ed.status === "live"}
                isDraft={ed.status === "draft"}
                onEdit={() =>
                  setLocation(`/store/${storeId}/studios/edition?edit=${ed.id}`)
                }
                onToggle={() => toggle("editions", ed.id, ed.status)}
                onDelete={() => initiateDelete("editions", ed.id, ed.name)}
                togglePending={pendingToggles.has(ed.id)}
                deletePending={pendingDeletes.has(ed.id)}
              />
            ))}
          </Section>
        </div>
      )}

      {/* ── Palette modals ──────────────────────────────────────────────── */}
      {editPalette !== null && (
        <EditPaletteModal
          storeId={storeId}
          palette={editPalette === "new" ? null : editPalette}
          onClose={() => setEditPalette(null)}
        />
      )}
      {managePaletteTheme && (
        <ManageThemePalettesModal
          storeId={storeId}
          theme={managePaletteTheme}
          allPalettes={palettes}
          onClose={() => setManagePaletteTheme(null)}
        />
      )}

      {/* ── Background modals ───────────────────────────────────────────── */}
      {editBackground !== null && (
        <EditBackgroundModal
          storeId={storeId}
          background={editBackground === "new" ? null : editBackground}
          onClose={() => setEditBackground(null)}
        />
      )}
      {manageBackgroundTheme && (
        <ManageThemeBackgroundsModal
          storeId={storeId}
          theme={manageBackgroundTheme}
          allBackgrounds={backgrounds}
          onClose={() => setManageBackgroundTheme(null)}
        />
      )}

      {/* ── Edit modals ─────────────────────────────────────────────────── */}
      {editTheme && (
        <EditThemeModal
          storeId={storeId}
          theme={editTheme}
          onClose={() => setEditTheme(null)}
        />
      )}
      {editPack && (
        <EditPackModal
          storeId={storeId}
          pack={editPack}
          onClose={() => setEditPack(null)}
        />
      )}
      {editInsert && (
        <EditInsertModal
          storeId={storeId}
          insert={editInsert}
          onClose={() => setEditInsert(null)}
        />
      )}

      {/* ── Delete dialog (plain confirm or orphan guard) ────────────────── */}
      {deleteTarget && !deleteTarget.orphanEditions && (
        <AlertDialog open onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTarget.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will soft-delete the item. Planners already generated by customers
                will not be affected — this only removes the item from future storefronts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => performDelete(false)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Orphan guard — item is attached to editions */}
      {deleteTarget?.orphanEditions && (
        <Dialog open onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                Item is in use
              </DialogTitle>
              <DialogDescription className="pt-1">
                <strong>"{deleteTarget.name}"</strong> is attached to the following edition
                {deleteTarget.orphanEditions.length > 1 ? "s" : ""}:
              </DialogDescription>
            </DialogHeader>
            <ul className="text-sm space-y-1 ml-1 text-muted-foreground">
              {deleteTarget.orphanEditions.map((ed) => (
                <li key={ed.id} className="flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3 shrink-0" />
                  {ed.name}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground mt-1">
              Deleting will detach it from these editions. Customers who already generated
              planners will not be affected.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => performDelete(true)}
              >
                Detach and delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
