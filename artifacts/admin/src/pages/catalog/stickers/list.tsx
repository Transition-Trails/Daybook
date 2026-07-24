/**
 * Platform Sticker Library — /catalog/stickers
 *
 * Full authoring page for super_admin.
 * • Create new platform stickers (origin='starter')
 * • Edit any sticker (per-row, super_admin support access)
 * • Duplicate, publish/unpublish, delete with pack-orphan guard
 * • Bulk: set function type, add to platform pack, publish/unpublish, delete
 * • Store-owned rows are visible but per-row actions still work (super_admin support)
 */
import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Info,
  Search,
  SlidersHorizontal,
  Plus,
  ImageOff,
  Package,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  platformApi,
  platformStickersApi,
  STICKER_FUNCTION_TYPES,
  type LibrarySticker,
  type StickerFunctionType,
  type StickerUsage,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const FUNCTION_TYPE_LABELS: Record<string, string> = {
  checkbox:     "Checkbox",
  flag:         "Flag",
  habit:        "Habit",
  "time-block": "Time Block",
  tab:          "Tab",
  date:         "Date",
  banner:       "Banner",
  decorative:   "Decorative",
};

const ORIGIN_LABELS: Record<string, string> = {
  owned:    "Store-owned",
  licensed: "Licensed",
  starter:  "Starter",
};

const ORIGIN_COLORS: Record<string, string> = {
  owned:    "bg-blue-50 text-blue-700 border-blue-200",
  licensed: "bg-purple-50 text-purple-700 border-purple-200",
  starter:  "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ── Small reusable sub-components ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "live") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] px-1.5 py-0 font-medium">
        Live
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] px-1.5 py-0 font-medium">
      Draft
    </Badge>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${ORIGIN_COLORS[origin] ?? ""}`}>
      {ORIGIN_LABELS[origin] ?? origin}
    </Badge>
  );
}

function FunctionTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground border-border">
      {FUNCTION_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

function StickerThumb({ src }: { src?: string | null }) {
  if (!src) {
    return (
      <div className="w-10 h-10 rounded border border-dashed border-border flex items-center justify-center bg-muted/30 shrink-0">
        <ImageOff className="w-3.5 h-3.5 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-10 h-10 rounded border border-border object-contain bg-muted/20 shrink-0"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ── Image file input → base64 ─────────────────────────────────────────────────

function ImageUpload({
  value,
  onChange,
  label = "Image",
}: {
  value?: string | null;
  onChange: (base64: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) onChange(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value && (
          <img
            src={value}
            alt="preview"
            className="w-16 h-16 rounded border border-border object-contain bg-muted/20"
          />
        )}
        <div className="flex-1">
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
            {value ? "Replace image" : "Choose image"}
          </Button>
          {!value && (
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPEG, or WebP. Background will be removed automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sticker form ──────────────────────────────────────────────────────────────

interface StickerFormValues {
  name: string;
  tags: string;
  functionType: StickerFunctionType;
  imageBase64: string;
  borderStyle: string;
  borderWidth: string;
  borderColor: string;
  sizeInMm: string;
  exportGoodnotes: boolean;
  exportInk: boolean;
  exportCricut: boolean;
}

function defaultForm(sticker?: LibrarySticker | null): StickerFormValues {
  return {
    name: sticker?.name ?? "",
    tags: sticker?.tags?.join(", ") ?? "",
    functionType: (sticker?.functionType as StickerFunctionType) ?? "decorative",
    imageBase64: sticker?.processedImageData ?? "",
    borderStyle: sticker?.borderStyle ?? "none",
    borderWidth: String(sticker?.borderWidth ?? 2),
    borderColor: sticker?.borderColor ?? "#000000",
    sizeInMm: String(sticker?.sizeInMm ?? ""),
    exportGoodnotes: sticker?.exportTargets?.goodnotes ?? true,
    exportInk: sticker?.exportTargets?.ink ?? true,
    exportCricut: sticker?.exportTargets?.cricut ?? false,
  };
}

function StickerFormFields({
  form,
  setForm,
  requireImage,
}: {
  form: StickerFormValues;
  setForm: React.Dispatch<React.SetStateAction<StickerFormValues>>;
  requireImage: boolean;
}) {
  return (
    <div className="space-y-4 py-1">
      <div className="space-y-1.5">
        <Label>Name <span className="text-destructive">*</span></Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Pink checkbox"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Function type <span className="text-destructive">*</span></Label>
        <Select
          value={form.functionType}
          onValueChange={(v) => setForm((f) => ({ ...f, functionType: v as StickerFunctionType }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STICKER_FUNCTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{FUNCTION_TYPE_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Tags</Label>
        <Input
          value={form.tags}
          onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          placeholder="holiday, festive, pastel (comma-separated)"
        />
      </div>

      <ImageUpload
        value={form.imageBase64 || null}
        onChange={(b64) => setForm((f) => ({ ...f, imageBase64: b64 }))}
        label={requireImage ? "Image *" : "Replace image"}
      />

      <div className="border rounded-lg p-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Processing options
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Border style</Label>
            <Select
              value={form.borderStyle}
              onValueChange={(v) => setForm((f) => ({ ...f, borderStyle: v }))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="thin">Thin</SelectItem>
                <SelectItem value="white">White matte</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.borderStyle !== "none" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Border width (px)</Label>
                <Input
                  type="number" min="1" max="20" className="h-8 text-xs"
                  value={form.borderWidth}
                  onChange={(e) => setForm((f) => ({ ...f, borderWidth: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Border colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color" value={form.borderColor}
                    onChange={(e) => setForm((f) => ({ ...f, borderColor: e.target.value }))}
                    className="h-8 w-8 rounded border border-border cursor-pointer"
                  />
                  <Input
                    className="h-8 text-xs font-mono" value={form.borderColor}
                    onChange={(e) => setForm((f) => ({ ...f, borderColor: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Target size (mm)</Label>
            <Input
              type="number" min="1" className="h-8 text-xs"
              value={form.sizeInMm}
              onChange={(e) => setForm((f) => ({ ...f, sizeInMm: e.target.value }))}
              placeholder="Leave blank = original"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Export targets</Label>
          <div className="flex items-center gap-4">
            {[
              { key: "exportGoodnotes" as const, label: "GoodNotes" },
              { key: "exportInk" as const,       label: "Ink" },
              { key: "exportCricut" as const,    label: "Cricut / Silhouette" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={form[key]}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, [key]: Boolean(c) }))}
                />
                <span className="text-xs">{label}</span>
              </label>
            ))}
          </div>
          {form.exportCricut && (
            <p className="text-xs text-muted-foreground mt-1">
              A Cricut-compatible SVG cut path will be generated from the cutout's contour.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<StickerFormValues>(defaultForm());
  const [publishNow, setPublishNow] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      platformStickersApi.create({
        name: form.name,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        functionType: form.functionType,
        imageBase64: form.imageBase64,
        borderStyle: form.borderStyle,
        borderWidth: form.borderWidth ? parseFloat(form.borderWidth) : undefined,
        borderColor: form.borderColor || undefined,
        sizeInMm: form.sizeInMm ? parseFloat(form.sizeInMm) : undefined,
        exportTargets: {
          goodnotes: form.exportGoodnotes,
          ink: form.exportInk,
          cricut: form.exportCricut,
        },
        status: publishNow ? "live" : "draft",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      toast({ title: "Sticker created", description: "Background removal complete." });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const valid = form.name && form.functionType && form.imageBase64;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New platform sticker</DialogTitle>
          <DialogDescription>
            Upload an image — background will be removed automatically. Saved as <code className="text-xs">origin=starter</code>.
          </DialogDescription>
        </DialogHeader>

        <StickerFormFields form={form} setForm={setForm} requireImage={true} />

        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={publishNow} onCheckedChange={(c) => setPublishNow(Boolean(c))} />
          <span className="text-sm">Publish immediately</span>
        </label>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            disabled={!valid || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            {create.isPending ? "Processing…" : "Create sticker"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditModal({
  sticker,
  onClose,
}: {
  sticker: LibrarySticker;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<StickerFormValues>(defaultForm(sticker));

  const save = useMutation({
    mutationFn: (extra?: { status?: "draft" | "live" }) =>
      platformStickersApi.update(sticker.id, {
        name: form.name,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        functionType: form.functionType,
        ...(form.imageBase64 !== sticker.processedImageData
          ? { imageBase64: form.imageBase64 }
          : {}),
        borderStyle: form.borderStyle,
        borderWidth: form.borderWidth ? parseFloat(form.borderWidth) : null,
        borderColor: form.borderColor || null,
        sizeInMm: form.sizeInMm ? parseFloat(form.sizeInMm) : null,
        exportTargets: {
          goodnotes: form.exportGoodnotes,
          ink: form.exportInk,
          cricut: form.exportCricut,
        },
        ...extra,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      toast({ title: "Sticker updated" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit sticker</DialogTitle>
          {sticker.origin !== "starter" && (
            <DialogDescription className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              This is a store-owned sticker. Editing it here is a super_admin support action.
            </DialogDescription>
          )}
        </DialogHeader>

        <StickerFormFields form={form} setForm={setForm} requireImage={false} />

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {sticker.status === "draft" && (
            <Button
              variant="outline" size="sm"
              disabled={!form.name || save.isPending}
              onClick={() => save.mutate({ status: "live" })}
            >
              Save & Publish
            </Button>
          )}
          <Button
            size="sm"
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            disabled={!form.name || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Usage modal ───────────────────────────────────────────────────────────────

function UsageModal({
  sticker,
  onClose,
}: {
  sticker: LibrarySticker;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<StickerUsage>({
    queryKey: ["platform-sticker-usage", sticker.id],
    queryFn: () => platformStickersApi.usage(sticker.id),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Usage — {sticker.name}</DialogTitle>
          <DialogDescription>Packs and editions that contain this sticker.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && <p className="text-sm text-destructive">Failed to load usage.</p>}
          {data && (
            <>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Packs ({data.packs.length})
                </p>
                {data.packs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not in any pack.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.packs.map((p) => (
                      <li key={p.packId} className="flex items-center gap-2 text-sm">
                        <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{p.packName ?? p.packId}</span>
                        <StatusBadge status={p.packStatus ?? "draft"} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {data.editions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Referenced by editions ({data.editions.length})
                  </p>
                  <ul className="space-y-1">
                    {data.editions.map((e, i) => (
                      <li key={i} className="text-sm text-muted-foreground truncate">
                        {e.editionName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add-to-pack modal ─────────────────────────────────────────────────────────

function AddToPackModal({
  selectedIds,
  onClose,
}: {
  selectedIds: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [packId, setPackId] = useState("");

  const { data: packs = [] } = useQuery({
    queryKey: ["platform-sticker-packs"],
    queryFn: () => platformStickersApi.listPacks(),
  });

  const add = useMutation({
    mutationFn: () => platformStickersApi.bulkAddToPack(selectedIds, packId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      toast({ title: `Added ${res.added} sticker(s) to pack` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to platform pack</DialogTitle>
          <DialogDescription>
            {selectedIds.length} sticker{selectedIds.length !== 1 ? "s" : ""} selected.
            Only platform stickers (origin=starter) will be added.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Select platform pack</Label>
            <Select value={packId} onValueChange={setPackId}>
              <SelectTrigger><SelectValue placeholder="Choose a pack…" /></SelectTrigger>
              <SelectContent>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    <span className="ml-1 text-muted-foreground text-xs">({p.origin})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={!packId || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Add to pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete target type ────────────────────────────────────────────────────────

interface DeleteTarget {
  sticker: LibrarySticker;
  affectedPacks?: { id: string; name: string | null }[];
}

// ── Sticker row ───────────────────────────────────────────────────────────────

interface PlatformSticker extends LibrarySticker {
  authoredByStoreId: string | null;
}

function StickerRow({
  sticker,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
  onUsage,
  togglePending,
  dupPending,
  deletePending,
}: {
  sticker: PlatformSticker;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onUsage: () => void;
  togglePending: boolean;
  dupPending: boolean;
  deletePending: boolean;
}) {
  const isLive = sticker.status === "live";

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        selected ? "bg-primary/5 border-primary/30" : "bg-card border-border hover:bg-muted/30"
      }`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(c) => onSelect(sticker.id, Boolean(c))}
        className="shrink-0"
      />

      <StickerThumb src={sticker.processedImageData} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{sticker.name}</span>
          <FunctionTypeBadge type={sticker.functionType} />
          <StatusBadge status={sticker.status} />
          <OriginBadge origin={sticker.origin} />
          {sticker.authoredByStoreId && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {sticker.authoredByStoreId}
            </span>
          )}
        </div>
        {sticker.tags && sticker.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {(sticker.tags as string[]).slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1 py-0.5">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Edit */}
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>

        {/* Duplicate */}
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onDuplicate}
          disabled={dupPending}
          title="Duplicate as platform draft"
        >
          {dupPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>

        {/* Usage */}
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onUsage}
          title="Show usage"
        >
          <Info className="w-3.5 h-3.5" />
        </Button>

        {/* Publish toggle */}
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          disabled={togglePending}
          title={isLive ? "Unpublish" : "Publish"}
        >
          {togglePending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : isLive
              ? <EyeOff className="w-3.5 h-3.5" />
              : <Eye className="w-3.5 h-3.5" />}
        </Button>

        {/* Delete */}
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
          onClick={onDelete}
          disabled={deletePending}
          title="Delete"
        >
          {deletePending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Trash2 className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlatformStickersList() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Filters
  const [search, setSearch]           = useState("");
  const [filterOrigin, setFilterOrigin] = useState("all");
  const [filterType, setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const queryParams = {
    q: search || undefined,
    origin: filterOrigin !== "all" ? filterOrigin : undefined,
    functionType: filterType !== "all" ? filterType : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
  };

  const { data: stickers, isLoading, error } = useQuery<PlatformSticker[]>({
    queryKey: ["platform-stickers", queryParams],
    queryFn: () => platformApi.stickers(queryParams) as Promise<PlatformSticker[]>,
    staleTime: 30_000,
  });

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = () => {
    if (!stickers) return;
    if (selected.size === stickers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(stickers.map((s) => s.id)));
    }
  };

  // Modals
  const [showCreate, setShowCreate]       = useState(false);
  const [editTarget, setEditTarget]       = useState<LibrarySticker | null>(null);
  const [usageTarget, setUsageTarget]     = useState<LibrarySticker | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<DeleteTarget | null>(null);
  const [showAddToPack, setShowAddToPack] = useState(false);
  const [showBulkType, setShowBulkType]   = useState(false);
  const [bulkFnType, setBulkFnType]       = useState<StickerFunctionType>("decorative");

  // Per-row pending states
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [pendingDups, setPendingDups]       = useState<Set<string>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // ── Toggle publish ────────────────────────────────────────────────────

  function toggle(sticker: PlatformSticker) {
    const newStatus = sticker.status === "live" ? "draft" : "live";
    setPendingToggles((s) => new Set(s).add(sticker.id));
    platformStickersApi
      .update(sticker.id, { status: newStatus })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["platform-stickers"] });
        toast({ title: newStatus === "live" ? "Published" : "Unpublished" });
      })
      .catch((err: Error) =>
        toast({ title: "Failed", description: err.message, variant: "destructive" }),
      )
      .finally(() =>
        setPendingToggles((s) => { const n = new Set(s); n.delete(sticker.id); return n; }),
      );
  }

  // ── Duplicate ─────────────────────────────────────────────────────────

  function duplicate(sticker: PlatformSticker) {
    setPendingDups((s) => new Set(s).add(sticker.id));
    platformStickersApi
      .duplicate(sticker.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["platform-stickers"] });
        toast({ title: "Duplicated as platform draft" });
      })
      .catch((err: Error) =>
        toast({ title: "Duplicate failed", description: err.message, variant: "destructive" }),
      )
      .finally(() =>
        setPendingDups((s) => { const n = new Set(s); n.delete(sticker.id); return n; }),
      );
  }

  // ── Delete ────────────────────────────────────────────────────────────

  function initiateDelete(sticker: PlatformSticker) {
    setDeleteTarget({ sticker });
  }

  function confirmDelete(force: boolean) {
    if (!deleteTarget) return;
    const { sticker } = deleteTarget;
    setPendingDeletes((s) => new Set(s).add(sticker.id));
    setDeleteTarget(null);

    platformStickersApi
      .deleteRaw(sticker.id, force)
      .then(async (r) => {
        if (r.status === 409) {
          const body = await r.json().catch(() => ({}));
          setDeleteTarget({ sticker, affectedPacks: body.affectedPacks ?? [] });
          return;
        }
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          toast({ title: "Delete failed", description: body.error ?? `HTTP ${r.status}`, variant: "destructive" });
          return;
        }
        qc.invalidateQueries({ queryKey: ["platform-stickers"] });
        setSelected((s) => { const n = new Set(s); n.delete(sticker.id); return n; });
        toast({ title: "Sticker deleted" });
      })
      .catch((err: Error) =>
        toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
      )
      .finally(() =>
        setPendingDeletes((s) => { const n = new Set(s); n.delete(sticker.id); return n; }),
      );
  }

  // ── Bulk publish ──────────────────────────────────────────────────────

  const bulkPublish = useMutation({
    mutationFn: (publish: boolean) =>
      platformStickersApi.bulkPublish([...selected], publish),
    onSuccess: (res, publish) => {
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      setSelected(new Set());
      toast({ title: `${publish ? "Published" : "Unpublished"} ${res.updated} sticker(s)` });
    },
    onError: (err: Error) =>
      toast({ title: "Bulk action failed", description: err.message, variant: "destructive" }),
  });

  // ── Bulk set function type ────────────────────────────────────────────

  const bulkSetType = useMutation({
    mutationFn: () => platformStickersApi.bulkSetFunctionType([...selected], bulkFnType),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      setSelected(new Set());
      setShowBulkType(false);
      toast({ title: `Updated ${res.updated} sticker(s)` });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // ── Bulk delete ───────────────────────────────────────────────────────

  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const bulkDelete = useMutation({
    mutationFn: () => platformStickersApi.bulkDelete([...selected]),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      setSelected(new Set());
      setShowBulkDelete(false);
      toast({ title: `Deleted ${res.deleted} sticker(s)` });
    },
    onError: (err: Error) =>
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" }),
  });

  // ── Derived ───────────────────────────────────────────────────────────

  const selArray = [...selected];
  const hasSelection = selArray.length > 0;
  const total = stickers?.length ?? 0;
  const byCounts = (stickers ?? []).reduce<Record<string, number>>((acc, s) => {
    acc[s.origin] = (acc[s.origin] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Sticker Library</h1>
          <p className="text-muted-foreground mt-1">
            All stickers across every store. Create and manage platform starters here.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-[#C87560] hover:bg-[#A85E4E] text-white shrink-0"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New sticker
        </Button>
      </div>

      {/* Summary chips */}
      {!isLoading && stickers && stickers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">{total} sticker{total !== 1 ? "s" : ""}</span>
          {Object.entries(byCounts).map(([origin, n]) => (
            <button
              key={origin}
              onClick={() => setFilterOrigin(filterOrigin === origin ? "all" : origin)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                filterOrigin === origin
                  ? (ORIGIN_COLORS[origin] ?? "") + " ring-1 ring-offset-1 ring-current"
                  : ORIGIN_COLORS[origin] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {ORIGIN_LABELS[origin] ?? origin}: {n}
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search name or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={filterOrigin} onValueChange={setFilterOrigin}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All origins</SelectItem>
            <SelectItem value="owned">Store-owned</SelectItem>
            <SelectItem value="licensed">Licensed</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {STICKER_FUNCTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{FUNCTION_TYPE_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk toolbar */}
      {hasSelection && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-medium text-primary">
            {selArray.length} selected
          </span>
          <div className="flex-1" />

          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setShowBulkType(true)}
          >
            Set type
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setShowAddToPack(true)}
          >
            Add to pack
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            disabled={bulkPublish.isPending}
            onClick={() => bulkPublish.mutate(true)}
          >
            {bulkPublish.isPending && bulkPublish.variables === true
              ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Publish
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            disabled={bulkPublish.isPending}
            onClick={() => bulkPublish.mutate(false)}
          >
            {bulkPublish.isPending && bulkPublish.variables === false
              ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Unpublish
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setShowBulkDelete(true)}
          >
            Delete
          </Button>
          <Button
            size="sm" variant="ghost" className="h-7 text-xs"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-destructive border border-dashed rounded-lg gap-2">
          <p className="text-sm font-medium">Failed to load stickers</p>
          <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
        </div>
      )}
      {!isLoading && !error && stickers && stickers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg gap-1">
          <ImageOff className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm font-medium text-foreground/70">No stickers match this filter</p>
          <p className="text-xs">Try clearing the search or changing the origin filter.</p>
        </div>
      )}

      {/* Sticker list */}
      {!isLoading && !error && stickers && stickers.length > 0 && (
        <div className="space-y-2">
          {/* Select all row */}
          <div className="flex items-center gap-2 px-3 py-1">
            <Checkbox
              checked={selected.size === stickers.length && stickers.length > 0}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-muted-foreground">Select all</span>
          </div>

          {stickers.map((s) => (
            <StickerRow
              key={s.id}
              sticker={s}
              selected={selected.has(s.id)}
              onSelect={toggleSelect}
              onEdit={() => setEditTarget(s)}
              onDuplicate={() => duplicate(s)}
              onToggle={() => toggle(s)}
              onDelete={() => initiateDelete(s)}
              onUsage={() => setUsageTarget(s)}
              togglePending={pendingToggles.has(s.id)}
              dupPending={pendingDups.has(s.id)}
              deletePending={pendingDeletes.has(s.id)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}

      {editTarget && (
        <EditModal sticker={editTarget} onClose={() => setEditTarget(null)} />
      )}

      {usageTarget && (
        <UsageModal sticker={usageTarget} onClose={() => setUsageTarget(null)} />
      )}

      {showAddToPack && (
        <AddToPackModal
          selectedIds={selArray}
          onClose={() => setShowAddToPack(false)}
        />
      )}

      {/* Delete confirm (initial) */}
      {deleteTarget && !deleteTarget.affectedPacks && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTarget.sticker.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will soft-delete the sticker. Planners already generated for customers are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => confirmDelete(false)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete confirm (pack orphan 409) */}
      {deleteTarget && deleteTarget.affectedPacks && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                Sticker is in {deleteTarget.affectedPacks.length} pack(s)
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>Deleting will remove this sticker from the following packs:</p>
                  <ul className="text-sm space-y-0.5 text-foreground">
                    {deleteTarget.affectedPacks.map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                        {p.name ?? p.id}
                      </li>
                    ))}
                  </ul>
                  <p>Planners already generated are not affected. Continue?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => confirmDelete(true)}
              >
                Force delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Bulk set type dialog */}
      <Dialog open={showBulkType} onOpenChange={(o) => !o && setShowBulkType(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Set function type</DialogTitle>
            <DialogDescription>
              Applies to {selArray.length} selected sticker(s). Only platform stickers (origin=starter) will be updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label>Function type</Label>
            <Select value={bulkFnType} onValueChange={(v) => setBulkFnType(v as StickerFunctionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STICKER_FUNCTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{FUNCTION_TYPE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowBulkType(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={bulkSetType.isPending}
              onClick={() => bulkSetType.mutate()}
            >
              {bulkSetType.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={showBulkDelete} onOpenChange={(o) => !o && setShowBulkDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selArray.length} sticker(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Only platform stickers (origin=starter) will be deleted. Store-owned stickers in the selection will be skipped.
              Planners already generated are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={bulkDelete.isPending}
              onClick={() => bulkDelete.mutate()}
            >
              {bulkDelete.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
