/**
 * Stickers — Sticker Library management for store-owned stickers.
 *
 * Features:
 *   • List + search/filter (by name/tag, functionType, scope)
 *   • Checkbox multi-select with bulk operations toolbar
 *   • Create sticker modal (image upload → pipeline)
 *   • Edit sticker modal (re-runs pipeline on change)
 *   • Usage lookup dialog (which packs / editions reference this sticker)
 *   • Delete with pack-orphan guard (409 → confirm with force)
 *   • Duplicate (clone as draft)
 */
import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
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
  AlertTriangle,
  Package,
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
import { ErrorState, SkeletonRows } from "@/components/shared";
import { stickersApi, storesApi, type LibrarySticker, type StickerFunctionType, STICKER_FUNCTION_TYPES } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const FUNCTION_TYPE_LABELS: Record<StickerFunctionType, string> = {
  checkbox:    "Checkbox",
  flag:        "Flag",
  habit:       "Habit",
  "time-block": "Time Block",
  tab:         "Tab",
  date:        "Date",
  banner:      "Banner",
  decorative:  "Decorative",
};

// ── Small reusable sub-components ────────────────────────────────────────────

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

function FunctionTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal border-border text-muted-foreground">
      {FUNCTION_TYPE_LABELS[type as StickerFunctionType] ?? type}
    </Badge>
  );
}

function StickerThumb({ src }: { src?: string | null }) {
  if (!src) {
    return (
      <div className="w-12 h-12 rounded border border-dashed border-border flex items-center justify-center bg-muted/30 shrink-0">
        <ImageOff className="w-4 h-4 text-muted-foreground/50" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-12 h-12 rounded border border-border object-contain bg-muted/20 shrink-0"
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
          <input
            ref={ref}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => ref.current?.click()}
          >
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

// ── Sticker form (shared between Create and Edit) ─────────────────────────────

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
      {/* Name */}
      <div className="space-y-1.5">
        <Label>Name <span className="text-destructive">*</span></Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Pink checkbox"
        />
      </div>

      {/* Function type */}
      <div className="space-y-1.5">
        <Label>Function type <span className="text-destructive">*</span></Label>
        <Select
          value={form.functionType}
          onValueChange={(v) => setForm((f) => ({ ...f, functionType: v as StickerFunctionType }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STICKER_FUNCTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {FUNCTION_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <Label>Tags</Label>
        <Input
          value={form.tags}
          onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          placeholder="holiday, festive, pastel (comma-separated)"
        />
      </div>

      {/* Image */}
      <ImageUpload
        value={form.imageBase64 || null}
        onChange={(b64) => setForm((f) => ({ ...f, imageBase64: b64 }))}
        label={requireImage ? "Image *" : "Replace image"}
      />

      {/* Pipeline */}
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
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
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
                  type="number"
                  min="1"
                  max="20"
                  className="h-8 text-xs"
                  value={form.borderWidth}
                  onChange={(e) => setForm((f) => ({ ...f, borderWidth: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Border colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.borderColor}
                    onChange={(e) => setForm((f) => ({ ...f, borderColor: e.target.value }))}
                    className="h-8 w-8 rounded border border-border cursor-pointer"
                  />
                  <Input
                    className="h-8 text-xs font-mono"
                    value={form.borderColor}
                    onChange={(e) => setForm((f) => ({ ...f, borderColor: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Target size (mm)</Label>
            <Input
              type="number"
              min="1"
              className="h-8 text-xs"
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

// ── Create modal ───────────────────────────────────────────────────────────────

function CreateModal({
  storeId,
  isOwner,
  onClose,
}: {
  storeId: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<StickerFormValues>(defaultForm());
  const [publishNow, setPublishNow] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      stickersApi.create(storeId, {
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
        status: isOwner && publishNow ? "live" : "draft",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
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
          <DialogTitle>New sticker</DialogTitle>
          <DialogDescription>
            Upload an image — background will be removed automatically.
          </DialogDescription>
        </DialogHeader>

        <StickerFormFields form={form} setForm={setForm} requireImage={true} />

        {isOwner && (
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={publishNow}
              onCheckedChange={(c) => setPublishNow(Boolean(c))}
            />
            <span className="text-sm">Publish immediately</span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
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

// ── Edit modal ─────────────────────────────────────────────────────────────────

function EditModal({
  storeId,
  sticker,
  isOwner,
  onClose,
}: {
  storeId: string;
  sticker: LibrarySticker;
  isOwner: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<StickerFormValues>(defaultForm(sticker));

  const save = useMutation({
    mutationFn: (extra?: { status?: "draft" | "live" }) =>
      stickersApi.update(storeId, sticker.id, {
        name: form.name,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        functionType: form.functionType,
        // Only resend imageBase64 if the user actually changed it
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
      qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
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
        </DialogHeader>

        <StickerFormFields form={form} setForm={setForm} requireImage={false} />

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {isOwner && sticker.status === "draft" && (
            <Button
              variant="outline"
              size="sm"
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
            onClick={() => save.mutate(undefined as any)}
          >
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Usage modal ────────────────────────────────────────────────────────────────

function UsageModal({
  storeId,
  sticker,
  onClose,
}: {
  storeId: string;
  sticker: LibrarySticker;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sticker-usage", storeId, sticker.id],
    queryFn: () => stickersApi.usage(storeId, sticker.id),
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

// ── Bulk-add-to-pack modal ─────────────────────────────────────────────────────

function AddToPackModal({
  storeId,
  selectedIds,
  onClose,
}: {
  storeId: string;
  selectedIds: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [packId, setPackId] = useState("");

  // Fetch owned packs for this store
  const { data: ownedList } = useQuery({
    queryKey: ["store-owned-list", storeId],
    queryFn: () =>
      fetch(`/api/stores/${storeId}/owned`, {
        credentials: "include",
        headers: { "x-store-id": storeId },
      }).then((r) => r.json()),
  });

  const packs: { id: string; name: string }[] = ownedList?.packs ?? [];

  const add = useMutation({
    mutationFn: () => stickersApi.bulkAddToPack(storeId, selectedIds, packId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
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
          <DialogTitle>Add to pack</DialogTitle>
          <DialogDescription>
            {selectedIds.length} sticker{selectedIds.length !== 1 ? "s" : ""} selected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Select pack</Label>
            <Select value={packId} onValueChange={setPackId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a pack…" />
              </SelectTrigger>
              <SelectContent>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
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

// ── Delete guard dialog ────────────────────────────────────────────────────────

interface DeleteTarget {
  sticker: LibrarySticker;
  affectedPacks?: { id: string; name: string | null }[];
}

// ── Sticker row ────────────────────────────────────────────────────────────────

interface StickerRowProps {
  sticker: LibrarySticker;
  isOwner: boolean;
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
}

function StickerRow({
  sticker,
  isOwner,
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
}: StickerRowProps) {
  const isDraft = sticker.status === "draft";
  const isLive  = sticker.status === "live";

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
          {(sticker.packCount ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {sticker.packCount} pack{sticker.packCount !== 1 ? "s" : ""}
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
          disabled={!isOwner && !isDraft}
          title={!isOwner && !isDraft ? "Staff can only edit drafts" : "Edit"}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>

        {/* Duplicate */}
        <Button
          size="sm" variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onDuplicate}
          disabled={dupPending}
          title="Duplicate as draft"
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

        {/* Publish toggle — owner only */}
        {isOwner && (
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
        )}

        {/* Delete — owner only */}
        {isOwner && (
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
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
  storeId: string;
  role: string;
}

export default function Stickers({ storeId, role }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const isOwner = role === "store_owner" || role === "super_admin";

  const { data: flags } = useQuery({
    queryKey: ["store-flags", storeId],
    queryFn: () => storesApi.flags.get(storeId),
    staleTime: 60_000,
  });
  const aiEnabled = flags?.aiEnabled ?? false;

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");

  // Active query params
  const queryParams = {
    q: search || undefined,
    functionType: filterType !== "all" ? filterType : undefined,
    scope: filterScope !== "all" ? filterScope : undefined,
  };

  const {
    data: stickers,
    isLoading,
    error,
  } = useQuery<LibrarySticker[]>({
    queryKey: ["store-stickers", storeId, queryParams],
    queryFn: () => stickersApi.list(storeId, queryParams),
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

  // ── Toggle publish ─────────────────────────────────────────────────────

  function toggle(sticker: LibrarySticker) {
    const newStatus = sticker.status === "live" ? "draft" : "live";
    setPendingToggles((s) => new Set(s).add(sticker.id));
    stickersApi
      .update(storeId, sticker.id, { status: newStatus })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
        toast({ title: newStatus === "live" ? "Published" : "Unpublished" });
      })
      .catch((err: Error) =>
        toast({ title: "Failed", description: err.message, variant: "destructive" }),
      )
      .finally(() =>
        setPendingToggles((s) => { const n = new Set(s); n.delete(sticker.id); return n; }),
      );
  }

  // ── Duplicate ──────────────────────────────────────────────────────────

  function duplicate(sticker: LibrarySticker) {
    setPendingDups((s) => new Set(s).add(sticker.id));
    stickersApi
      .duplicate(storeId, sticker.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
        toast({ title: "Duplicated as draft" });
      })
      .catch((err: Error) =>
        toast({ title: "Duplicate failed", description: err.message, variant: "destructive" }),
      )
      .finally(() =>
        setPendingDups((s) => { const n = new Set(s); n.delete(sticker.id); return n; }),
      );
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  function initiateDelete(sticker: LibrarySticker) {
    setDeleteTarget({ sticker });
  }

  function confirmDelete(force: boolean) {
    if (!deleteTarget) return;
    const { sticker } = deleteTarget;
    setPendingDeletes((s) => new Set(s).add(sticker.id));
    setDeleteTarget(null);

    fetch(`/api/stores/${storeId}/stickers/${sticker.id}${force ? "?force=true" : ""}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "x-store-id": storeId },
    })
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
        qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
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

  // ── Bulk publish ───────────────────────────────────────────────────────

  const bulkPublish = useMutation({
    mutationFn: (publish: boolean) =>
      stickersApi.bulkPublish(storeId, [...selected], publish),
    onSuccess: (res, publish) => {
      qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
      setSelected(new Set());
      toast({ title: `${publish ? "Published" : "Unpublished"} ${res.updated} sticker(s)` });
    },
    onError: (err: Error) =>
      toast({ title: "Bulk action failed", description: err.message, variant: "destructive" }),
  });

  // ── Bulk set function type ─────────────────────────────────────────────

  const bulkSetType = useMutation({
    mutationFn: () => stickersApi.bulkSetFunctionType(storeId, [...selected], bulkFnType),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
      setSelected(new Set());
      setShowBulkType(false);
      toast({ title: `Updated ${res.updated} sticker(s)` });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  // ── Bulk delete ────────────────────────────────────────────────────────

  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const bulkDelete = useMutation({
    mutationFn: () => stickersApi.bulkDelete(storeId, [...selected]),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
      setSelected(new Set());
      setShowBulkDelete(false);
      toast({ title: `Deleted ${res.deleted} sticker(s)` });
    },
    onError: (err: Error) =>
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" }),
  });

  // ── Render ─────────────────────────────────────────────────────────────

  const selArray = [...selected];
  const hasSelection = selArray.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Sticker Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your store's sticker assets. Editing or deleting a sticker never alters planners already generated for customers.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOwner && aiEnabled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLocation(`/store/${storeId}/studios/pack`)}
            >
              Pack Studio →
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New sticker
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search name or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {STICKER_FUNCTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{FUNCTION_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stickers</SelectItem>
            <SelectItem value="in-pack">In a pack</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk toolbar */}
      {hasSelection && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-medium text-primary">
            {selArray.length} selected
          </span>
          <div className="flex items-center gap-1.5 ml-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowBulkType(true)}>
              Set type
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddToPack(true)}>
              Add to pack
            </Button>
            {isOwner && (
              <>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  disabled={bulkPublish.isPending}
                  onClick={() => bulkPublish.mutate(true)}
                >
                  Publish all
                </Button>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  disabled={bulkPublish.isPending}
                  onClick={() => bulkPublish.mutate(false)}
                >
                  Unpublish all
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:bg-destructive/5"
                  onClick={() => setShowBulkDelete(true)}
                >
                  Delete
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading && <SkeletonRows rows={5} />}
      {error && (
        <ErrorState
          message={(error as Error).message}
        />
      )}
      {!isLoading && !error && stickers && stickers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg gap-1">
          <ImageOff className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm font-medium text-foreground/70">
            You haven't created any stickers yet
          </p>
          {isOwner ? (
            <>
              <p className="text-xs text-muted-foreground">
                Upload an image — background removal and export files are generated automatically.
              </p>
              <Button
                size="sm" variant="link" className="mt-1 text-[#C87560]"
                onClick={() => setShowCreate(true)}
              >
                Create your first sticker
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Ask your store owner to create stickers.
            </p>
          )}
        </div>
      )}
      {!isLoading && !error && stickers && stickers.length > 0 && (
        <div className="space-y-1.5">
          {/* Select all row */}
          <div className="flex items-center gap-2 px-3 py-1">
            <Checkbox
              checked={selected.size === stickers.length && stickers.length > 0}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-muted-foreground">
              {selected.size === stickers.length && stickers.length > 0 ? "Deselect all" : "Select all"}
            </span>
          </div>
          {stickers.map((sticker) => (
            <StickerRow
              key={sticker.id}
              sticker={sticker}
              isOwner={isOwner}
              selected={selected.has(sticker.id)}
              onSelect={toggleSelect}
              onEdit={() => setEditTarget(sticker)}
              onDuplicate={() => duplicate(sticker)}
              onToggle={() => toggle(sticker)}
              onDelete={() => initiateDelete(sticker)}
              onUsage={() => setUsageTarget(sticker)}
              togglePending={pendingToggles.has(sticker.id)}
              dupPending={pendingDups.has(sticker.id)}
              deletePending={pendingDeletes.has(sticker.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal storeId={storeId} isOwner={isOwner} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <EditModal storeId={storeId} sticker={editTarget} isOwner={isOwner} onClose={() => setEditTarget(null)} />
      )}
      {usageTarget && (
        <UsageModal storeId={storeId} sticker={usageTarget} onClose={() => setUsageTarget(null)} />
      )}
      {showAddToPack && (
        <AddToPackModal storeId={storeId} selectedIds={selArray} onClose={() => setShowAddToPack(false)} />
      )}

      {/* Bulk set function type dialog */}
      <AlertDialog open={showBulkType} onOpenChange={setShowBulkType}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set function type</AlertDialogTitle>
            <AlertDialogDescription>
              Set the function type for {selArray.length} sticker(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={bulkFnType} onValueChange={(v) => setBulkFnType(v as StickerFunctionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STICKER_FUNCTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{FUNCTION_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkSetType.isPending}
              onClick={(e) => { e.preventDefault(); bulkSetType.mutate(); }}
            >
              {bulkSetType.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selArray.length} sticker(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Stickers will be detached from all packs and soft-deleted. Planners already generated are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDelete.isPending}
              onClick={(e) => { e.preventDefault(); bulkDelete.mutate(); }}
            >
              {bulkDelete.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete guard (single) */}
      {deleteTarget && (
        deleteTarget.affectedPacks !== undefined ? (
          /* 409 orphan guard — packs are referenced */
          <AlertDialog open onOpenChange={() => setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Sticker is in use
                </AlertDialogTitle>
                <AlertDialogDescription>
                  "{deleteTarget.sticker.name}" is in {deleteTarget.affectedPacks.length} pack(s):
                  {deleteTarget.affectedPacks.map((p) => (
                    <span key={p.id} className="block font-medium mt-0.5">• {p.name ?? p.id}</span>
                  ))}
                  <br />
                  Deleting it will detach it from those packs. Planners already generated are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep sticker</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => { e.preventDefault(); confirmDelete(true); }}
                >
                  Detach & delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          /* First-pass confirm */
          <AlertDialog open onOpenChange={() => setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{deleteTarget.sticker.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This sticker will be soft-deleted. Planners already generated are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => { e.preventDefault(); confirmDelete(false); }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )
      )}
    </div>
  );
}
