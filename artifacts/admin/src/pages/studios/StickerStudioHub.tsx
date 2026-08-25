/**
 * Sticker Studio — unified workspace applying the ONE STUDIO SHELL rule.
 *
 * Three modes (top-bar pill switcher):
 *   Library · Create a sticker · Assemble a pack
 *
 * Per the UX spec:
 *  - LEFT RAIL: filters (Library), in-progress batch (Create), pack context (Packs)
 *  - CENTER: work surface
 *  - RIGHT DOCK: AI Assistant + TRUE SCALE PREVIEW (sticker on A5 planner page,
 *    so sizeInMm is visually meaningful, not just a number field)
 *
 * Cut-click changes:
 *  - Three Select dropdowns → inline ChipRow in left rail (one click, no open-then-pick)
 *  - Five icon-only row actions → "Edit" ActionChip + overflow for destructive/rare ones
 *  - Packs TABLE → list rows (swatch → stacked text → action chip)
 *  - Create mode shows BOTH paths immediately (Upload / AI generate) — AI is one option,
 *    not a gate that must fire before anything appears
 *  - Bulk set-type Select → ChipRow inline in the bulk toolbar
 *
 * Contrast audit (all pass WCAG AA 4.5:1):
 *  - bg-blue-50 (#eff6ff) / text-blue-700 (#1d4ed8)     = 7.5:1 ✓
 *  - bg-purple-50 (#faf5ff) / text-purple-700 (#7e22ce) = 6.5:1 ✓
 *  - bg-emerald-50 (#ecfdf5) / text-emerald-700 (#047857)= 5.5:1 ✓
 *  - bg-amber-50 (#fffbeb) / text-amber-700 (#b45309)   = 4.6:1 ✓
 *  - Active chip: bg-primary (navy) / text-primary-foreground (white) ≈ 11:1 ✓
 *  - Never accent text on accent-soft backgrounds
 *
 * Two-line text rule: every title+description block uses explicit flex-col + width:100%.
 *
 * No backend/auth/generation logic changed — this is purely UI composition.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAiDrawer } from "@/contexts/AiDrawerContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  Loader2, Pencil, Trash2, Info, Copy, Eye, EyeOff,
  Upload, ImageOff, Package, AlertTriangle, Globe, Sticker,
  Plus, MoreHorizontal, X, RefreshCw, Save, Sparkles, CheckSquare,
  ChevronDown, ChevronUp, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  platformApi, platformStickersApi, STICKER_FUNCTION_TYPES,
  type LibrarySticker, type StickerFunctionType, type StickerUsage, type PlatformStickerPack,
} from "@/lib/api";
// useListStickerPacks / useUpdateStickerPack removed — PacksCenter now uses platformStickersApi directly
import { aiApi, extractJson } from "@/lib/ai";
import { StudioLayout } from "@/components/studio/StudioLayout";
import {
  SectionLabel, ChipRow, MultiChipRow, SegmentedControl, EmptyState, ErrorState,
  SkeletonRows, RailCard, DockAiAssistant, ActionChip, StatusPill,
  CHIP_ACTIVE_BG,
} from "@/components/studio/primitives";
import { catalogApi } from "@/lib/api";

// ── Set-generator constants ────────────────────────────────────────────────────

const SET_TYPE_OPTIONS = [
  { value: "dates",    label: "Dates · 31" },
  { value: "weekdays", label: "Weekdays · 7" },
  { value: "months",   label: "Months · 12" },
];

const LABEL_STYLE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  dates:    [{ value: "bare", label: "1–31" }, { value: "padded", label: "01–31" }, { value: "ordinal", label: "1st–31st" }],
  weekdays: [{ value: "full", label: "Monday…" }, { value: "abbr", label: "Mon…" }, { value: "initial", label: "M–Su" }],
  months:   [{ value: "full", label: "January…" }, { value: "abbr", label: "Jan…" }],
};

const FONT_OPTIONS = [
  { value: "sans",       label: "Sans" },
  { value: "sans-bold",  label: "Bold" },
  { value: "serif",      label: "Serif" },
  { value: "serif-bold", label: "Serif Bd" },
  { value: "mono",       label: "Mono" },
];

const SHADOW_OPTIONS = [
  { value: "none",      label: "None" },
  { value: "flat",      label: "Flat" },
  { value: "soft",      label: "Soft" },
  { value: "lifted",    label: "Lifted" },
  { value: "cut-paper", label: "Cut paper" },
];

// ── Mode definitions ──────────────────────────────────────────────────────────

const MODES = [
  { id: "library", label: "Library" },
  { id: "create",  label: "Create a sticker" },
  { id: "packs",   label: "Assemble a pack" },
] as const;

type ModeId = typeof MODES[number]["id"];

// ── Constants ─────────────────────────────────────────────────────────────────

const FUNCTION_TYPE_LABELS: Record<string, string> = {
  checkbox: "Checkbox", flag: "Flag", habit: "Habit",
  "time-block": "Time Block", tab: "Tab", date: "Date",
  banner: "Banner", decorative: "Decorative",
};

const ORIGIN_LABELS: Record<string, string> = {
  owned: "Store-owned", licensed: "Licensed", starter: "Starter",
};

// Contrast-audited: all pass 4.5:1
const ORIGIN_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  owned:    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" }, // blue-50/700 = 7.5:1 ✓
  licensed: { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" }, // purple-50/700 = 6.5:1 ✓
  starter:  { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" }, // emerald-50/700 = 5.5:1 ✓
};

// ── Set-grouping helpers ──────────────────────────────────────────────────────
// Groups stickers whose names share a common prefix before " — " into logical
// sets (e.g. "dates-1-31 — 1" … "dates-1-31 — 31" → one set card).
// This is a display-layer heuristic; the permanent solution is a setId DB field
// stamped at generation time (no endpoint changed here).

interface StickerGroup {
  type:        "set";
  setKey:      string;               // e.g. "dates-1-31"
  displayName: string;               // e.g. "Dates 1–31"
  stickers:    PlatformStickerExt[];
}

function deriveSetName(key: string): string {
  return key
    .replace(/-(\d+)-(\d+)$/, " $1–$2")   // trailing numeric range: -1-31 → " 1–31"
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupStickers(stickers: PlatformStickerExt[]): {
  sets:    StickerGroup[];
  singles: PlatformStickerExt[];
} {
  const setMap = new Map<string, PlatformStickerExt[]>();
  const singles: PlatformStickerExt[] = [];

  for (const s of stickers) {
    // Prefer the stable DB setId; fall back to name-prefix heuristic for
    // pre-migration rows where setId was not yet stamped.
    const key = s.setId ?? (s.name.indexOf(" — ") > 0
      ? s.name.slice(0, s.name.indexOf(" — ")).trim()
      : null);
    if (key) {
      const arr = setMap.get(key) ?? [];
      arr.push(s);
      setMap.set(key, arr);
    } else {
      singles.push(s);
    }
  }

  const sets: StickerGroup[] = [];
  for (const [key, members] of setMap) {
    if (members.length > 1) {
      sets.push({ type: "set", setKey: key, displayName: deriveSetName(key), stickers: members });
    } else {
      // Single-member "sets" are just regular cards
      singles.push(...members);
    }
  }

  return { sets, singles };
}

// ── Small shared display components ──────────────────────────────────────────

function StickerThumb({ src, size = 40 }: { src?: string | null; size?: number }) {
  if (!src) {
    return (
      <div
        className="rounded border border-dashed border-border flex items-center justify-center bg-muted/30 shrink-0"
        style={{ width: size, height: size, minWidth: size }}
      >
        <ImageOff className="w-3.5 h-3.5 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img
      src={src} alt=""
      className="rounded border border-border object-contain bg-muted/20 shrink-0"
      style={{ width: size, height: size, minWidth: size, imageRendering: "pixelated" }}
    />
  );
}

function OriginBadge({ origin }: { origin: string }) {
  const c = ORIGIN_BADGE[origin];
  if (!c) return null;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em] border"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {ORIGIN_LABELS[origin] ?? origin}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  return status === "live" ? (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={{ background: "#ecfdf5", color: "#047857" }}>Live</span>
  ) : (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={{ background: "#fffbeb", color: "#b45309" }}>Draft</span>
  );
}

// ── Image file input → base64 ─────────────────────────────────────────────────

function ImageUpload({ value, onChange, label = "Image" }: {
  value?: string | null; onChange: (b64: string) => void; label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const r = ev.target?.result as string; if (r) onChange(r); };
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-[12.5px]">{label}</Label>
      <div className="flex items-center gap-3">
        {value && <img src={value} alt="preview" className="w-14 h-14 rounded border border-border object-contain bg-muted/20 shrink-0" />}
        <div>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
          <button
            type="button"
            onClick={() => ref.current?.click()}
            style={{ cursor: "pointer" }}
            className="px-3 py-1.5 rounded-lg border text-[12.5px] font-medium hover:bg-muted transition-colors"
          >
            {value ? "Replace image" : "Choose image"}
          </button>
          {!value && (
            <p className="text-[11px] text-muted-foreground mt-1">
              PNG, JPEG, or WebP. Background removed automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sticker form ──────────────────────────────────────────────────────────────

interface StickerFormValues {
  name: string; tags: string; functionType: StickerFunctionType;
  imageBase64: string; borderStyle: string; borderWidth: string;
  borderColor: string; sizeInMm: string;
  exportGoodnotes: boolean; exportInk: boolean; exportCricut: boolean;
}

function defaultForm(s?: LibrarySticker | null): StickerFormValues {
  return {
    name: s?.name ?? "",
    tags: s?.tags?.join(", ") ?? "",
    functionType: (s?.functionType as StickerFunctionType) ?? "decorative",
    imageBase64: s?.processedImageData ?? "",
    borderStyle: s?.borderStyle ?? "none",
    borderWidth: String(s?.borderWidthMm ?? ((s?.borderWidth ?? 2) * 25.4) / 96),
    borderColor: s?.borderColor ?? "#000000",
    sizeInMm: String(s?.sizeInMm ?? ""),
    exportGoodnotes: s?.exportTargets?.goodnotes ?? true,
    exportInk: s?.exportTargets?.ink ?? true,
    exportCricut: s?.exportTargets?.cricut ?? false,
  };
}

function StickerFormFields({
  form, setForm, requireImage,
}: { form: StickerFormValues; setForm: React.Dispatch<React.SetStateAction<StickerFormValues>>; requireImage: boolean }) {
  const set = (k: keyof StickerFormValues, v: StickerFormValues[keyof StickerFormValues]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 py-1">
      <div className="space-y-1.5">
        <Label className="text-[12.5px]">Name *</Label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Pink checkbox" />
      </div>

      {/* Function type: ChipRow replaces Select */}
      <div className="space-y-1.5">
        <Label className="text-[12.5px]">Function type *</Label>
        <div className="flex gap-1 flex-wrap">
          {STICKER_FUNCTION_TYPES.map((t) => (
            <button key={t} onClick={() => set("functionType", t)} type="button"
              style={{ cursor: "pointer", ...(form.functionType === t ? { background: CHIP_ACTIVE_BG, color: "#fff", borderColor: CHIP_ACTIVE_BG } : {}) }}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                form.functionType === t
                  ? ""
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {FUNCTION_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[12.5px]">Tags</Label>
        <Input value={form.tags} onChange={(e) => set("tags", e.target.value)}
          placeholder="holiday, festive, pastel (comma-separated)" />
      </div>

      <ImageUpload value={form.imageBase64 || null} onChange={(b) => set("imageBase64", b)}
        label={requireImage ? "Image *" : "Replace image"} />

      <div className="rounded-[14px] border p-4 space-y-3">
        <SectionLabel>Processing options</SectionLabel>

        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Border style</Label>
          <SegmentedControl
            options={[{value:"none",label:"None"},{value:"thin",label:"Thin"},{value:"white",label:"White matte"}]}
            value={form.borderStyle} onChange={(v) => set("borderStyle", v)}
          />
        </div>

        {form.borderStyle !== "none" && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="space-y-1.5">
              <Label className="text-[11.5px]">Border width (mm)</Label>
              <Input type="number" min="0.1" max="10" step="0.1" className="h-8 text-xs"
                value={form.borderWidth} onChange={(e) => set("borderWidth", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11.5px]">Border colour</Label>
              <div className="flex items-center gap-1.5">
                <input type="color" value={form.borderColor}
                  onChange={(e) => set("borderColor", e.target.value)}
                  className="h-8 w-8 rounded border border-border cursor-pointer shrink-0" />
                <Input className="h-8 text-xs font-mono" value={form.borderColor}
                  onChange={(e) => set("borderColor", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Target size (mm)</Label>
          <Input type="number" min="1" className="h-8 text-xs" value={form.sizeInMm}
            onChange={(e) => set("sizeInMm", e.target.value)} placeholder="Leave blank = original" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Export targets</Label>
          <div className="flex items-center gap-4">
            {([
              { key: "exportGoodnotes" as const, label: "GoodNotes" },
              { key: "exportInk" as const,       label: "Ink" },
              { key: "exportCricut" as const,    label: "Cricut" },
            ]).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
                <Checkbox checked={form[key]}
                  onCheckedChange={(c) => set(key, Boolean(c))} />
                <span className="text-[12px]">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create / Edit modals (same logic, different title) ────────────────────────

function StickerFormModal({
  mode, sticker, onClose,
}: { mode: "create" | "edit"; sticker?: LibrarySticker | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<StickerFormValues>(defaultForm(sticker));
  const [publishNow, setPublishNow] = useState(false);

  const createMut = useMutation({
    mutationFn: () => platformStickersApi.create({
      name: form.name,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      functionType: form.functionType,
      imageBase64: form.imageBase64,
      borderStyle: form.borderStyle,
      borderWidthMm: form.borderWidth ? parseFloat(form.borderWidth) : undefined,
      borderColor: form.borderColor || undefined,
      sizeInMm: form.sizeInMm ? parseFloat(form.sizeInMm) : undefined,
      exportTargets: { goodnotes: form.exportGoodnotes, ink: form.exportInk, cricut: form.exportCricut },
      status: publishNow ? "live" : "draft",
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-stickers"] }); toast({ title: "Sticker created" }); onClose(); },
    onError: (err: Error) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: (extra?: { status?: "draft" | "live" }) =>
      platformStickersApi.update(sticker!.id, {
        name: form.name,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        functionType: form.functionType,
        ...(form.imageBase64 !== sticker?.processedImageData ? { imageBase64: form.imageBase64 } : {}),
        borderStyle: form.borderStyle,
        borderWidthMm: form.borderWidth ? parseFloat(form.borderWidth) : null,
        borderColor: form.borderColor || null,
        sizeInMm: form.sizeInMm ? parseFloat(form.sizeInMm) : null,
        exportTargets: { goodnotes: form.exportGoodnotes, ink: form.exportInk, cricut: form.exportCricut },
        ...extra,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-stickers"] }); toast({ title: "Sticker updated" }); onClose(); },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const pending = createMut.isPending || editMut.isPending;
  const valid = !!form.name && !!form.functionType && (mode === "edit" || !!form.imageBase64);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New platform sticker" : "Edit sticker"}</DialogTitle>
          {mode === "create" && (
            <DialogDescription>Saved as <code className="text-xs">origin=starter</code>. Background removed automatically.</DialogDescription>
          )}
          {mode === "edit" && sticker?.origin !== "starter" && (
            <DialogDescription className="flex items-center gap-1.5" style={{ color: "#b45309" }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Store-owned sticker — super_admin support action.
            </DialogDescription>
          )}
        </DialogHeader>

        <StickerFormFields form={form} setForm={setForm} requireImage={mode === "create"} />

        {mode === "create" && (
          <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
            <Checkbox checked={publishNow} onCheckedChange={(c) => setPublishNow(Boolean(c))} />
            <span className="text-[13px]">Publish immediately</span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {mode === "edit" && sticker?.status === "draft" && (
            <Button variant="outline" size="sm" disabled={!form.name || pending}
              onClick={() => editMut.mutate({ status: "live" })}>
              Save & Publish
            </Button>
          )}
          <Button size="sm" className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            disabled={!valid || pending}
            onClick={() => mode === "create" ? createMut.mutate() : editMut.mutate(undefined)}>
            {pending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            {mode === "create" ? "Create sticker" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Usage modal ───────────────────────────────────────────────────────────────

function UsageModal({ sticker, onClose }: { sticker: LibrarySticker; onClose: () => void }) {
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
        <div className="space-y-3 py-1 min-h-[60px]">
          {isLoading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {error && <p className="text-sm" style={{ color: "#b23b3b" }}>Failed to load usage.</p>}
          {data && (
            <>
              <div>
                <SectionLabel className="mb-1.5">Packs ({data.packs.length})</SectionLabel>
                {data.packs.length === 0
                  ? <p className="text-[12.5px] text-muted-foreground">Not in any pack.</p>
                  : <ul className="space-y-1">
                    {data.packs.map((p) => (
                      <li key={p.packId} className="flex items-center gap-2 text-[12.5px]">
                        <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{p.packName ?? p.packId}</span>
                        <StatusChip status={p.packStatus ?? "draft"} />
                      </li>
                    ))}
                  </ul>
                }
              </div>
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

// ── Delete confirm ────────────────────────────────────────────────────────────

interface DeleteTarget { sticker: LibrarySticker; affectedPacks?: { id: string; name: string | null }[] }

function DeleteConfirm({ target, onConfirm, onCancel }: {
  target: DeleteTarget; onConfirm: (force: boolean) => void; onCancel: () => void;
}) {
  const hasPacks = !!target.affectedPacks;
  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={hasPacks ? "flex items-center gap-2" : ""}>
            {hasPacks && <AlertTriangle className="w-4 h-4" style={{ color: "#b23b3b" }} />}
            {hasPacks
              ? `Sticker is in ${target.affectedPacks!.length} pack(s)`
              : `Delete "${target.sticker.name}"?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              {hasPacks
                ? <><p>Deleting will remove it from:</p>
                  <ul className="text-sm space-y-0.5 text-foreground mt-1">
                    {target.affectedPacks!.map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-muted-foreground shrink-0" />{p.name ?? p.id}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">Already-generated planners are not affected.</p></>
                : <p>Already-generated planners are not affected.</p>
              }
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
            onClick={() => onConfirm(hasPacks)}>
            {hasPacks ? "Force delete" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Add-to-pack modal ─────────────────────────────────────────────────────────

function AddToPackModal({ selectedIds, onClose }: { selectedIds: string[]; onClose: () => void }) {
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
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to platform pack</DialogTitle>
          <DialogDescription>{selectedIds.length} sticker(s) selected. Only starter-origin stickers will be added.</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <SectionLabel>Select pack</SectionLabel>
          <div className="space-y-1">
            {(packs as any[]).map((p) => (
              <button key={p.id} onClick={() => setPackId(p.id)} style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-[12.5px] transition-colors ${
                  packId === p.id ? "bg-primary/10 border-primary/30 font-semibold" : "border-border hover:bg-muted"
                }`}
              >
                <Package className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{p.name}</span>
                <StatusChip status={p.status ?? "draft"} />
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!packId || add.isPending} onClick={() => add.mutate()}>
            {add.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Add to pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CREATE PACK MODAL ─────────────────────────────────────────────────────────
// Gap 3: in-studio pack creation without leaving the sticker studio.
// Fetches live platform stickers to use as a picker, then calls
// platformStickersApi.createPack() to create the pack via the new backend route.

function CreatePackModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name,      setName]      = useState("");
  const [price,     setPrice]     = useState("4.99");
  const [tagsStr,   setTagsStr]   = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search,    setSearch]    = useState("");

  const { data: stickers = [], isLoading } = useQuery<LibrarySticker[]>({
    queryKey: ["platform-stickers-for-pack-picker"],
    queryFn:  () => platformApi.stickers({ status: "live" }) as Promise<LibrarySticker[]>,
    // staleTime: 0 — pack-composer picker; deleted stickers must not remain
    // selectable after an admin removes them in the Stickers tab.
    staleTime: 0,
  });

  const filtered = stickers.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const create = useMutation({
    mutationFn: (status: "draft" | "live") =>
      platformStickersApi.createPack({
        name,
        price:      parseFloat(price) || null,
        tags:       tagsStr.split(",").map((t) => t.trim()).filter(Boolean),
        stickerIds: [...selectedIds],
        status,
      }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["platform-sticker-packs"] });
      toast({ title: status === "live" ? "Pack published!" : "Pack saved as draft" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>New platform pack</DialogTitle>
          <DialogDescription>Name the pack and pick stickers from the library.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Fields */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Pack name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Core Date Set" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Price (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[12.5px]">$</span>
                <Input type="number" min="0" step="0.01" value={price}
                  onChange={(e) => setPrice(e.target.value)} className="pl-6" />
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[12.5px]">Tags (comma-separated)</Label>
              <Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)}
                placeholder="dates, coverups, minimal" />
            </div>
          </div>

          {/* Sticker picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel>{selectedIds.size} sticker{selectedIds.size !== 1 ? "s" : ""} selected</SectionLabel>
              <div className="relative w-44">
                <Input className="pl-7 h-7 text-[12px]" placeholder="Search…"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
                <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                </svg>
              </div>
            </div>

            {isLoading && <SkeletonRows count={3} />}

            {!isLoading && filtered.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground text-center py-6">
                {search ? "No stickers match the search." : "No live stickers in the library yet."}
              </p>
            )}

            {!isLoading && filtered.length > 0 && (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))" }}>
                {filtered.map((s) => {
                  const sel = selectedIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedIds((prev) => {
                        const n = new Set(prev);
                        sel ? n.delete(s.id) : n.add(s.id);
                        return n;
                      })}
                      style={{
                        cursor: "pointer",
                        outline: sel ? `2px solid ${CHIP_ACTIVE_BG}` : "none",
                        outlineOffset: 2, borderRadius: 10,
                      }}
                      className="flex flex-col items-center gap-1 p-2 rounded-[10px] border border-border hover:bg-muted/40 transition-colors"
                    >
                      <StickerThumb src={s.processedImageData} size={52} />
                      <span className="text-[9.5px] text-muted-foreground leading-tight text-center break-words w-full line-clamp-2">
                        {s.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-4 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="outline" size="sm" disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate("draft")}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Save as draft
          </Button>
          <Button size="sm" style={{ background: CHIP_ACTIVE_BG, color: "#fff" }}
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate("live")}>
            {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            <Globe className="w-3.5 h-3.5 mr-1.5" />Publish pack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── TRUE SCALE PREVIEW ────────────────────────────────────────────────────────
// Shows the sticker at its real physical size on an A5 planner page.
// A5 = 148mm × 210mm. Preview container = 268px wide → scale = 268/148 = 1.81px/mm.
// This makes sizeInMm immediately meaningful: a 15mm sticker looks like a 27px square.

function StickerScalePreview({ sticker, onOpenEdit }: { sticker?: LibrarySticker | null; onOpenEdit?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(268);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(entry?.contentRect.width ?? el.clientWidth);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const A5_W_MM = 148;
  const A5_H_MM = 210;

  // True physical scale: 96 CSS px = 1 inch = 25.4 mm  →  1 mm ≈ 3.779 CSS px.
  // We compute how wide the A5 page would be at 100% physical scale, then ask
  // whether the available container is wide enough to show it at that size.
  // If not, we scale down and show an explicit "shown at N%" label so the user
  // is never misled about actual sticker size.
  const CSS_PX_PER_MM  = 96 / 25.4;                          // ≈ 3.779
  const available      = Math.max(120, containerW - 32);
  const trueA5W        = A5_W_MM * CSS_PX_PER_MM;            // ≈ 559 px at 100%
  const scaleFactor    = Math.min(1, available / trueA5W);   // 1.0 when container ≥ 559px
  const scalePercent   = Math.round(scaleFactor * 100);
  const isAtTrueScale  = scalePercent >= 99;

  const PREVIEW_W  = Math.round(A5_W_MM * CSS_PX_PER_MM * scaleFactor);
  const PREVIEW_H  = Math.round(A5_H_MM * CSS_PX_PER_MM * scaleFactor);
  const PX_PER_MM  = CSS_PX_PER_MM * scaleFactor;            // effective px/mm in this render

  const sizeMm = sticker?.sizeInMm ?? null;
  const sizePx = sizeMm ? Math.round(sizeMm * PX_PER_MM) : Math.round(30 * PX_PER_MM);

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3 p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] self-start flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground">True scale · A5</span>
        {!isAtTrueScale && (
          <span style={{
            color: "#92400e", background: "#fef3c7", borderRadius: 4,
            padding: "1px 6px", fontSize: 9, fontWeight: 700,
          }}>
            shown at {scalePercent}% · container too narrow for 1:1
          </span>
        )}
      </div>

      {/* A5 page */}
      <div
        style={{
          width: PREVIEW_W, height: PREVIEW_H, position: "relative",
          background: "#FAF7F4", border: "1px solid #E7DCCB", borderRadius: 3,
          overflow: "hidden", flexShrink: 0,
        }}
      >
        {/* Planner page lines (faint) */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", left: 12, right: 12,
            top: 40 + i * 28, height: 1, background: "#E7DCCB", opacity: 0.6,
          }} />
        ))}
        {/* Date header stub */}
        <div style={{
          position: "absolute", left: 12, top: 14, width: 80, height: 14,
          background: "#E7DCCB", borderRadius: 2, opacity: 0.5,
        }} />

        {/* Sticker at scale */}
        {sticker?.processedImageData ? (
          <div style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: sizePx, height: sizePx,
          }}>
            <img src={sticker.processedImageData} alt={sticker.name}
              style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: sizePx, height: sizePx,
            border: "2px dashed #C8C0B8", borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ImageOff style={{ width: 16, height: 16, color: "#B0A898" }} />
          </div>
        )}

        {/* Scale legend */}
        <div style={{
          position: "absolute", bottom: 6, left: 12, right: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 9, color: "#7A8FA6" }}>148mm A5</span>
          <span style={{
            fontSize: 9,
            color:      isAtTrueScale ? "#3f6b4c" : "#92400e",
            fontWeight: isAtTrueScale ? 700 : 400,
          }}>
            {isAtTrueScale ? "1:1 true scale" : `${scalePercent}%`}
          </span>
        </div>
      </div>

      {/* Size info — two-line text block: explicit flex-col + width:100% */}
      <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 2 }}>
        {sticker ? (
          <>
            <p className="text-[12.5px] font-semibold text-foreground truncate">{sticker.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {sizeMm ? `${sizeMm}mm × ${sizeMm}mm physical size` : "No size set — add sizeInMm to preview at true scale"}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground text-center">Select a sticker to preview at true scale</p>
        )}
      </div>

      {sticker && !sticker.sizeInMm && onOpenEdit && (
        <button
          onClick={onOpenEdit}
          style={{ cursor: "pointer", width: "100%" }}
          className="px-3 py-2 rounded-full border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          Set size → opens Edit
        </button>
      )}
    </div>
  );
}

// ── LIBRARY MODE ──────────────────────────────────────────────────────────────

interface PlatformStickerExt extends LibrarySticker { authoredByStoreId: string | null }

function LibraryRow({
  sticker, selected, onSelect, onEdit, onDuplicate, onToggle, onDelete, onUsage,
  togglePending, dupPending, deletePending, onSelectForPreview, isPreviewTarget,
}: {
  sticker: PlatformStickerExt;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: () => void; onDuplicate: () => void; onToggle: () => void;
  onDelete: () => void; onUsage: () => void;
  togglePending: boolean; dupPending: boolean; deletePending: boolean;
  onSelectForPreview: () => void; isPreviewTarget: boolean;
}) {
  const isLive = sticker.status === "live";

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-[14px] border transition-colors ${
        isPreviewTarget ? "bg-primary/5 border-primary/40" :
        selected ? "bg-primary/5 border-primary/20" : "bg-card border-border hover:bg-muted/30"
      }`}
    >
      <Checkbox checked={selected} onCheckedChange={(c) => onSelect(sticker.id, Boolean(c))} className="shrink-0" />

      {/* Thumbnail — click to preview at scale */}
      <button onClick={onSelectForPreview} title="Preview at scale" style={{ cursor: "pointer" }} className="shrink-0">
        <StickerThumb src={sticker.processedImageData} />
      </button>

      {/* Text column — explicit flex-col + width:100% */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, width: "100%", gap: 3 }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-[13px] truncate">{sticker.name}</span>
          <StatusChip status={sticker.status} />
          <OriginBadge origin={sticker.origin} />
          <span className="text-[10.5px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
            {FUNCTION_TYPE_LABELS[sticker.functionType] ?? sticker.functionType}
          </span>
        </div>
        {sticker.tags && (sticker.tags as string[]).length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {(sticker.tags as string[]).slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">{t}</span>
            ))}
            {sticker.sizeInMm && (
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 rounded px-1.5 py-0.5">{sticker.sizeInMm}mm</span>
            )}
          </div>
        )}
      </div>

      {/* Actions: visible "Edit" chip + overflow for rare/destructive */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ActionChip label="Edit" onClick={onEdit} variant="secondary"
          icon={<Pencil className="w-3 h-3" />} />

        <ActionChip
          label={isLive ? "Unpublish" : "Publish"}
          onClick={onToggle}
          disabled={togglePending}
          variant={isLive ? "secondary" : "primary"}
        />

        {/* Overflow: duplicate, usage, delete */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              style={{ cursor: "pointer" }}
              className="p-1.5 rounded-lg border border-transparent hover:border-border hover:bg-muted transition-colors text-muted-foreground"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onDuplicate} disabled={dupPending}>
              <Copy className="w-3.5 h-3.5 mr-2" />Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onUsage}>
              <Info className="w-3.5 h-3.5 mr-2" />Show usage
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete}
              className="text-destructive focus:text-destructive" disabled={deletePending}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── STICKER CARD (compact vertical, used in library grid) ─────────────────────
// Target: 6-8 cards per row at 1440px (grid uses minmax(160px, 1fr)).
// Card height: fixed 80px thumbnail + ~60px meta + ~36px actions ≈ 180px total.
// One meta line combines function-type + status + origin — no stacked badge rows.

function StickerCard({
  sticker, selected, onSelect, onEdit, onDuplicate, onToggle, onDelete, onUsage,
  togglePending, dupPending, deletePending, onSelectForPreview, isPreviewTarget,
}: {
  sticker: PlatformStickerExt; selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: () => void; onDuplicate: () => void; onToggle: () => void;
  onDelete: () => void; onUsage: () => void;
  togglePending: boolean; dupPending: boolean; deletePending: boolean;
  onSelectForPreview: () => void; isPreviewTarget: boolean;
}) {
  const isLive = sticker.status === "live";
  return (
    <div className={`rounded-[14px] border flex flex-col overflow-hidden transition-colors ${
      isPreviewTarget ? "border-[#C87560] bg-[#FEF0ED]/40" : "bg-card border-border"
    }`}>
      {/* Thumbnail — fixed 80px height (replaces aspect-square to cut card height) */}
      <div
        role="button" tabIndex={0} onClick={onSelectForPreview}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelectForPreview(); }}
        style={{ cursor: "pointer", display: "block" }}
        className="relative w-full h-20 bg-[#FFFDF9] flex items-center justify-center hover:bg-muted/30 transition-colors overflow-hidden border-b border-border/50 shrink-0"
      >
        <StickerThumb src={sticker.processedImageData} size={56} />
        <div className="absolute top-1.5 left-1.5">
          <Checkbox checked={selected} onCheckedChange={(c) => onSelect(sticker.id, Boolean(c))}
            onClick={e => e.stopPropagation()} />
        </div>
        {isPreviewTarget && (
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#C87560]" />
        )}
      </div>

      {/* Name + ONE inline meta line */}
      <div className="px-2.5 pt-2 pb-1 flex flex-col gap-1 flex-1">
        <p className="text-[12px] font-semibold text-foreground truncate">{sticker.name}</p>
        {/* Single combined meta row: function-type · status · origin */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9.5px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 shrink-0">
            {FUNCTION_TYPE_LABELS[sticker.functionType] ?? sticker.functionType}
          </span>
          <StatusChip status={sticker.status} />
          <OriginBadge origin={sticker.origin} />
        </div>
      </div>

      {/* Compact action row */}
      <div className="px-2.5 pb-2.5 flex items-center gap-1 flex-wrap">
        <ActionChip label="Edit" onClick={onEdit} variant="secondary" icon={<Pencil className="w-3 h-3" />} />
        <ActionChip
          label={isLive ? "Unpublish" : "Publish"}
          onClick={onToggle} disabled={togglePending}
          variant={isLive ? "secondary" : "primary"}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button style={{ cursor: "pointer" }}
              className="p-1 rounded-lg border border-transparent hover:border-border hover:bg-muted transition-colors text-muted-foreground">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onDuplicate} disabled={dupPending}>
              <Copy className="w-3.5 h-3.5 mr-2" />Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onUsage}>
              <Info className="w-3.5 h-3.5 mr-2" />Show usage
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive" disabled={deletePending}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── SET CARD ──────────────────────────────────────────────────────────────────
// Represents a batch of stickers that share a common name prefix (e.g. a
// date-label set). Shows a rotated thumbnail cluster, count badge, set name,
// and shared status/origin. Clicking expands a full-width member panel below
// the sets grid.

function SetCard({
  group, expanded, onExpand,
}: {
  group: StickerGroup;
  expanded: boolean;
  onExpand: () => void;
}) {
  const { stickers } = group;
  const allLive  = stickers.every((s) => s.status === "live");
  const allDraft = stickers.every((s) => s.status === "draft");
  const sharedOrigin = stickers[0]?.origin ?? "";
  const sameOrigin   = stickers.every((s) => s.origin === sharedOrigin);

  return (
    <div
      className="rounded-[14px] border flex flex-col overflow-hidden transition-colors"
      style={expanded
        ? { borderColor: "#C87560", background: "rgba(200,117,96,0.04)" }
        : { background: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* Thumbnail cluster — up to 3 stickers fanned out */}
      <button
        onClick={onExpand}
        className="relative w-full h-20 bg-[#FFFDF9] flex items-center justify-center hover:bg-muted/30 transition-colors border-b border-border/50 shrink-0"
        style={{ cursor: "pointer" }}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${group.displayName}`}
      >
        <div className="relative" style={{ width: 72, height: 48 }}>
          {stickers.slice(0, 3).map((s, i) => (
            <div
              key={s.id}
              style={{
                position:  "absolute",
                left:      i * 14,
                top:       i === 1 ? -4 : 2,
                zIndex:    3 - i,
                transform: i === 0 ? "rotate(-8deg)" : i === 2 ? "rotate(8deg)" : "none",
              }}
            >
              <StickerThumb src={s.processedImageData} size={38} />
            </div>
          ))}
        </div>

        {/* Count badge */}
        <span
          className="absolute top-1.5 right-1.5 text-[9.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
          style={{ background: "#1B2A4A", color: "#fff" }}
        >
          {stickers.length}
        </span>

        {/* Expand chevron */}
        <span
          className="absolute bottom-1.5 right-1.5 text-muted-foreground"
          aria-hidden
        >
          {expanded
            ? <ChevronUp  className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>

      {/* Name + one meta line */}
      <div className="px-2.5 pt-2 pb-1 flex flex-col gap-1 flex-1">
        <p className="text-[12px] font-semibold text-foreground truncate">{group.displayName}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9.5px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 shrink-0 flex items-center gap-0.5">
            <Layers className="w-2.5 h-2.5" />
            {stickers.length}
          </span>
          {allLive  ? <StatusChip status="live" />  :
           allDraft ? <StatusChip status="draft" /> :
           <span className="text-[9.5px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">Mixed</span>}
          {sameOrigin && <OriginBadge origin={sharedOrigin} />}
        </div>
      </div>

      {/* View / Collapse button */}
      <div className="px-2.5 pb-2.5">
        <button
          onClick={onExpand}
          className="w-full text-[11px] font-semibold py-1 rounded-full border transition-colors"
          style={{
            cursor:      "pointer",
            borderColor: expanded ? "#C87560" : "#E4DDD5",
            color:       expanded ? "#C87560" : "#6B7280",
          }}
        >
          {expanded ? "Collapse ▲" : "View set ▼"}
        </button>
      </div>
    </div>
  );
}

// ── PACK CARD (vertical, used in packs grid) ──────────────────────────────────

function PackCard({ pack, coverImage, onToggle, togglePending }: {
  pack: PlatformStickerPack; coverImage?: string | null; onToggle: () => void; togglePending: boolean;
}) {
  const isLive = pack.status === "live";
  const tags   = (pack.tags as string[] | undefined) ?? [];
  const shown  = tags.slice(0, 2);
  const extra  = tags.length - shown.length;

  // Use memberImages if available (up to 3 for fan), otherwise fall back to coverImage
  const memberImages = pack.memberImages ?? (coverImage ? [coverImage] : []);
  const [errSet, setErrSet] = useState<Set<number>>(new Set());
  const validImgs = memberImages.filter((_, i) => !errSet.has(i));
  const hasImages = validImgs.length > 0;

  // Fan positioning for up to 3 images
  const FAN_OFFSETS: Array<{ rotate: string; top: number; left: number; zIndex: number }> = [
    { rotate: "rotate(9deg)",  top: 4,  left: 12, zIndex: 1 },
    { rotate: "rotate(-5deg)", top: 2,  left: 4,  zIndex: 2 },
    { rotate: "rotate(0deg)",  top: 6,  left: 8,  zIndex: 3 },
  ];
  // Reverse so front card = first image (most prominent)
  const fanImgs = validImgs.slice(0, 3).reverse();

  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden hover:shadow-sm transition-shadow">
      {/* ── Thumbnail — fixed 96px tall ── */}
      <div
        className="w-full border-b border-border flex items-center justify-center overflow-hidden"
        style={{ height: 96, background: "#FFFDF9" }}
      >
        {hasImages ? (
          /* Real sticker images fanned */
          <div className="relative" style={{ width: 52, height: 52 }}>
            {fanImgs.map((src, i) => {
              const offset = FAN_OFFSETS[fanImgs.length - 1 - i] ?? FAN_OFFSETS[0];
              const origIdx = memberImages.indexOf(src);
              return (
                <div
                  key={i}
                  className="absolute rounded-[8px] border border-border bg-white overflow-hidden"
                  style={{
                    width: 36, height: 36,
                    top: offset.top, left: offset.left,
                    transform: offset.rotate,
                    zIndex: offset.zIndex,
                  }}
                >
                  <img
                    src={src} alt=""
                    onError={() => setErrSet((s) => new Set(s).add(origIdx))}
                    style={{ width: 36, height: 36, objectFit: "contain" }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          /* Stylised placeholder — stacked card fan + label */
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative" style={{ width: 40, height: 40 }}>
              <div className="absolute rounded-[6px] border border-border bg-muted/60"
                style={{ width: 32, height: 32, top: 6, left: 10, transform: "rotate(10deg)" }} />
              <div className="absolute rounded-[6px] border border-border bg-muted/40"
                style={{ width: 32, height: 32, top: 4, left: 4, transform: "rotate(-6deg)" }} />
              <div className="absolute rounded-[6px] border border-border bg-card flex items-center justify-center"
                style={{ width: 32, height: 32, top: 4, left: 4 }}>
                <Package className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
            </div>
            <span className="text-[9.5px] text-muted-foreground/60 leading-none">No stickers yet</span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{pack.name}</p>

        {/* One meta line: status · price */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusChip status={pack.status} />
          <span className="text-[10.5px] font-mono text-muted-foreground">
            {pack.price ? `$${Number(pack.price).toFixed(2)}` : "Free"}
          </span>
        </div>

        {/* Tags — max 2 shown, "+N" overflow pill */}
        {shown.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {shown.map((t) => (
              <span key={t} className="text-[9.5px] text-muted-foreground bg-muted/60 rounded-full px-1.5 py-0.5 leading-none">{t}</span>
            ))}
            {extra > 0 && (
              <span className="text-[9.5px] text-muted-foreground/60 rounded-full px-1.5 py-0.5 leading-none">+{extra}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="px-3 pb-3 flex items-center gap-1.5">
        <ActionChip
          label={isLive ? "Unpublish" : "Publish"}
          onClick={onToggle} disabled={togglePending}
          variant={isLive ? "secondary" : "primary"}
        />
        <a
          href={`/daybook/catalog/packs/${pack.id}`}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-border text-[12px] font-semibold text-foreground hover:bg-muted transition-colors"
        >
          Edit
        </a>
      </div>
    </div>
  );
}

function LibraryCenter({
  filterOrigin, filterType, filterStatus, search, setSearch,
  selectedPreview, onSelectPreview, triggerCreate,
}: {
  filterOrigin: string; filterType: string; filterStatus: string;
  search: string; setSearch: (v: string) => void;
  selectedPreview: LibrarySticker | null;
  onSelectPreview: (s: LibrarySticker | null) => void;
  /** Increment this counter to programmatically open the "New sticker" modal */
  triggerCreate?: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = {
    q: search || undefined,
    origin: filterOrigin !== "all" ? filterOrigin : undefined,
    functionType: filterType !== "all" ? filterType : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
  };

  const { data: stickers, isLoading, error, refetch } = useQuery<PlatformStickerExt[]>({
    queryKey: ["platform-stickers", params],
    queryFn: () => platformApi.stickers(params) as Promise<PlatformStickerExt[]>,
    // staleTime: 30_000 — management list view with explicit refetch button;
    // short cache acceptable, mutations also invalidate this key.
    staleTime: 30_000,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate]     = useState(false);
  const [editTarget, setEditTarget]     = useState<LibrarySticker | null>(null);

  // Gap 2: open create dialog when hub's top-bar "New sticker" button fires
  useEffect(() => { if (triggerCreate) setShowCreate(true); }, [triggerCreate]);
  const [usageTarget, setUsageTarget]   = useState<LibrarySticker | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [showAddToPack, setShowAddToPack] = useState(false);
  const [bulkTypeOpen, setBulkTypeOpen]   = useState(false);
  const [bulkFnType, setBulkFnType]       = useState<StickerFunctionType>("decorative");
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  // Grouping mode: "grouped" collapses same-prefix sets into set cards
  const [grouping,       setGrouping]       = useState<"grouped" | "flat">("grouped");
  const [expandedSetKey, setExpandedSetKey] = useState<string | null>(null);
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [pendingDups, setPendingDups]       = useState<Set<string>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n; });
  }, []);

  function toggle(s: PlatformStickerExt) {
    const next = s.status === "live" ? "draft" : "live";
    setPendingToggles((p) => new Set(p).add(s.id));
    platformStickersApi.update(s.id, { status: next })
      .then(() => { qc.invalidateQueries({ queryKey: ["platform-stickers"] }); toast({ title: next === "live" ? "Published" : "Unpublished" }); })
      .catch((err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }))
      .finally(() => setPendingToggles((p) => { const n = new Set(p); n.delete(s.id); return n; }));
  }

  function duplicate(s: PlatformStickerExt) {
    setPendingDups((p) => new Set(p).add(s.id));
    platformStickersApi.duplicate(s.id)
      .then(() => { qc.invalidateQueries({ queryKey: ["platform-stickers"] }); toast({ title: "Duplicated as draft" }); })
      .catch((err: Error) => toast({ title: "Duplicate failed", description: err.message, variant: "destructive" }))
      .finally(() => setPendingDups((p) => { const n = new Set(p); n.delete(s.id); return n; }));
  }

  function initiateDelete(s: PlatformStickerExt) { setDeleteTarget({ sticker: s }); }

  function confirmDelete(force: boolean) {
    if (!deleteTarget) return;
    const { sticker: s } = deleteTarget;
    setPendingDeletes((p) => new Set(p).add(s.id));
    setDeleteTarget(null);
    platformStickersApi.deleteRaw(s.id, force)
      .then(async (r) => {
        if (r.status === 409) {
          const body = await r.json().catch(() => ({}));
          setDeleteTarget({ sticker: s, affectedPacks: body.affectedPacks ?? [] });
          return;
        }
        if (!r.ok) { const body = await r.json().catch(() => ({})); toast({ title: "Delete failed", description: body.error ?? `HTTP ${r.status}`, variant: "destructive" }); return; }
        qc.invalidateQueries({ queryKey: ["platform-stickers"] });
        setSelected((p) => { const n = new Set(p); n.delete(s.id); return n; });
        if (selectedPreview?.id === s.id) onSelectPreview(null);
        toast({ title: "Sticker deleted" });
      })
      .catch((err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }))
      .finally(() => setPendingDeletes((p) => { const n = new Set(p); n.delete(s.id); return n; }));
  }

  const bulkPublish = useMutation({
    mutationFn: (publish: boolean) => platformStickersApi.bulkPublish([...selected], publish),
    onSuccess: (res, publish) => { qc.invalidateQueries({ queryKey: ["platform-stickers"] }); setSelected(new Set()); toast({ title: `${publish ? "Published" : "Unpublished"} ${res.updated} sticker(s)` }); },
    onError: (err: Error) => toast({ title: "Bulk action failed", description: err.message, variant: "destructive" }),
  });
  const bulkSetType = useMutation({
    mutationFn: () => platformStickersApi.bulkSetFunctionType([...selected], bulkFnType),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["platform-stickers"] }); setSelected(new Set()); setBulkTypeOpen(false); toast({ title: `Updated ${res.updated} sticker(s)` }); },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });
  const bulkDelete = useMutation({
    mutationFn: () => platformStickersApi.bulkDelete([...selected]),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["platform-stickers"] }); setSelected(new Set()); setShowBulkDelete(false); toast({ title: `Deleted ${res.deleted} sticker(s)` }); },
    onError: (err: Error) => toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" }),
  });

  // Compute grouped view whenever stickers data or grouping mode changes
  const { gridSets, gridSingles } = useMemo(() => {
    if (grouping === "flat" || !stickers) return { gridSets: [] as StickerGroup[], gridSingles: stickers ?? [] };
    const { sets, singles } = groupStickers(stickers);
    return { gridSets: sets, gridSingles: singles };
  }, [stickers, grouping]);

  const selArray     = [...selected];
  const hasSelection = selArray.length > 0;
  const total        = stickers?.length ?? 0;
  // Items visible in current view: set-cards + singles (or flat total)
  const itemCount    = grouping === "grouped"
    ? gridSets.length + gridSingles.length
    : total;

  // Reusable card renderer — captures all action callbacks from this closure
  const renderCard = (s: PlatformStickerExt) => (
    <StickerCard
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
      onSelectForPreview={() => onSelectPreview(selectedPreview?.id === s.id ? null : s)}
      isPreviewTarget={selectedPreview?.id === s.id}
    />
  );

  return (
    <div className="space-y-4" style={{ minWidth: 0 }}>
      {/* Heading — no in-page action button; the top-bar primary action is the one true CTA */}
      <div className="mb-2">
        <h1 className="font-display font-semibold text-[22px] text-foreground mb-1">Your sticker library</h1>
        <p className="text-[13px] text-muted-foreground">All platform stickers — starter, licensed, and store-owned. Click a thumbnail to preview at true scale.</p>
      </div>

      {/* Search + grouping toggle (no duplicate New sticker button here) */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-0" style={{ minWidth: 160 }}>
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
          <Input className="pl-8 h-8 text-[12.5px]" placeholder="Search name or tag…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* Grouped / All items toggle */}
        <div className="flex items-center rounded-full border border-border overflow-hidden shrink-0 h-8 text-[11.5px] font-semibold">
          {(["grouped", "flat"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setGrouping(v); setExpandedSetKey(null); }}
              className="px-3 h-full transition-colors"
              style={{
                cursor:     "pointer",
                background: grouping === v ? "#1B2A4A" : "transparent",
                color:      grouping === v ? "#fff"    : "hsl(var(--muted-foreground))",
              }}
            >
              {v === "grouped" ? "Grouped" : "All items"}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk toolbar */}
      {hasSelection && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-[14px] border flex-wrap"
          style={{ background: "hsl(var(--primary) / 0.05)", borderColor: "hsl(var(--primary) / 0.2)" }}>
          <span className="text-[12.5px] font-semibold text-primary">{selArray.length} selected</span>
          <div className="flex-1" />
          {/* Bulk type: ChipRow inline — no open-then-pick */}
          {bulkTypeOpen ? (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-muted-foreground">Set type:</span>
              {STICKER_FUNCTION_TYPES.map((t) => (
                <button key={t} onClick={() => { setBulkFnType(t); bulkSetType.mutate(); }}
                  style={{ cursor: "pointer" }}
                  className="px-2 py-0.5 rounded-full text-[11px] border border-border hover:bg-muted transition-colors">
                  {FUNCTION_TYPE_LABELS[t]}
                </button>
              ))}
              <button onClick={() => setBulkTypeOpen(false)} style={{ cursor: "pointer" }} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <ActionChip label="Set type" onClick={() => setBulkTypeOpen(true)} />
          )}
          <ActionChip label="Add to pack" onClick={() => setShowAddToPack(true)} />
          <ActionChip label="Publish" onClick={() => bulkPublish.mutate(true)} disabled={bulkPublish.isPending} />
          <ActionChip label="Unpublish" onClick={() => bulkPublish.mutate(false)} disabled={bulkPublish.isPending} />
          <ActionChip label="Delete" onClick={() => setShowBulkDelete(true)} variant="danger" />
          <ActionChip label="Clear" onClick={() => setSelected(new Set())} />
        </div>
      )}

      {/* Count — reflects active filters AND current grouping mode */}
      {!isLoading && !error && stickers && stickers.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          {grouping === "grouped" && itemCount !== total
            ? <>{itemCount} item{itemCount !== 1 ? "s" : ""} · {total} sticker{total !== 1 ? "s" : ""}</>
            : <>{total} sticker{total !== 1 ? "s" : ""}</>
          }
        </p>
      )}

      {/* States */}
      {isLoading && <SkeletonRows count={6} />}
      {error && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}
      {!isLoading && !error && stickers?.length === 0 && (
        <EmptyState
          icon={<ImageOff className="w-5 h-5 text-muted-foreground" />}
          title="No stickers match this filter"
          description="Try clearing the search or changing the filters."
          action={{ label: "Clear filters", onClick: () => setSearch("") }}
        />
      )}

      {/* Card grid — grouped (set cards + singles) or flat */}
      {!isLoading && !error && stickers && stickers.length > 0 && (
        <>
          {/* ── Set cards (grouped mode) ── */}
          {grouping === "grouped" && gridSets.length > 0 && (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                {gridSets.map((group) => (
                  <SetCard
                    key={group.setKey}
                    group={group}
                    expanded={expandedSetKey === group.setKey}
                    onExpand={() => setExpandedSetKey((k) => k === group.setKey ? null : group.setKey)}
                  />
                ))}
              </div>

              {/* Expanded set member panel — full width, below the sets grid */}
              {expandedSetKey && (() => {
                const activeGroup = gridSets.find((g) => g.setKey === expandedSetKey);
                if (!activeGroup) return null;
                return (
                  <div
                    className="rounded-[14px] border p-4 space-y-3"
                    style={{ borderColor: "rgba(200,117,96,0.4)", background: "rgba(200,117,96,0.04)" }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-foreground">{activeGroup.displayName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{activeGroup.stickers.length} stickers</span>
                        <button
                          onClick={() => setExpandedSetKey(null)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          style={{ cursor: "pointer" }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                      {activeGroup.stickers.map(renderCard)}
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* ── Individual sticker cards (singles + flat mode) ── */}
          {(grouping === "flat" ? stickers : gridSingles).length > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {(grouping === "flat" ? stickers : gridSingles).map(renderCard)}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && <StickerFormModal mode="create" onClose={() => setShowCreate(false)} />}
      {editTarget && <StickerFormModal mode="edit" sticker={editTarget} onClose={() => setEditTarget(null)} />}
      {usageTarget && <UsageModal sticker={usageTarget} onClose={() => setUsageTarget(null)} />}
      {showAddToPack && <AddToPackModal selectedIds={selArray} onClose={() => setShowAddToPack(false)} />}
      {deleteTarget && <DeleteConfirm target={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}
      <AlertDialog open={showBulkDelete} onOpenChange={(o) => !o && setShowBulkDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selArray.length} sticker(s)?</AlertDialogTitle>
            <AlertDialogDescription>Only starter-origin stickers will be deleted. Already-generated planners are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={bulkDelete.isPending} onClick={() => bulkDelete.mutate()}>
              {bulkDelete.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── CREATE MODE ───────────────────────────────────────────────────────────────
// One decision card selects a path; only that path's controls render.
// CreatePath type is declared alongside CreateRail above.

interface InProgressItem { id: string; name: string; src?: string; status: "uploading" | "processing" | "done" | "error" }

interface PackAiResult { name: string; tags: string[]; ideas: string[] }
const PACK_SYSTEM_PROMPT = `You are a creative director for a digital planner brand called Daybook.
When given a sticker pack concept, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "punchy pack name (2-5 words)",
  "tags": ["tag1","tag2","tag3","tag4"],
  "ideas": [
    "brief sticker idea (e.g. 'a coffee cup with Monday energy text')",
    "...", "...", "..."
  ]
}`;

const PATH_CHIPS: Array<{ id: CreatePath; label: string }> = [
  { id: "upload",       label: "Upload artwork" },
  { id: "brainstorm",   label: "✦ Brainstorm with Claude" },
  { id: "labelled-set", label: "Generate a labelled set" },
];

const PATH_DESCRIPTIONS: Record<CreatePath, string> = {
  upload:        "Drag in a PNG, JPEG, or WebP file. Background is removed automatically, and a Cricut-compatible SVG cut path is generated if you enable it.",
  brainstorm:    "Describe a pack concept — Claude names it, suggests 4 tags, and brainstorms 4 specific illustration briefs ready to hand to an artist or image model.",
  "labelled-set": "Renders real transparent PNGs server-side — 31 date cover-ups, 7 weekdays, or 12 months — in your chosen font, colour, and size. Review and deselect before saving.",
};

function CreateCenter({
  batchItems, setBatchItems, aiResult, setAiResult, uploadTrigger,
  createPath, setCreatePath, onStickerCreated,
}: {
  batchItems: InProgressItem[]; setBatchItems: React.Dispatch<React.SetStateAction<InProgressItem[]>>;
  aiResult: PackAiResult | null; setAiResult: (r: PackAiResult | null) => void;
  /** Increment to programmatically trigger the file-upload dialog from the top bar */
  uploadTrigger?: number;
  createPath: CreatePath;
  setCreatePath: (p: CreatePath) => void;
  /** Called after a sticker is successfully created — updates the right-dock preview */
  onStickerCreated?: (sticker: LibrarySticker) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Fire file-picker (and switch to upload path) when hub top-bar button increments
  useEffect(() => {
    if (uploadTrigger) { setCreatePath("upload"); fileRef.current?.click(); }
  }, [uploadTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload path ─────────────────────────────────────────────────────────────
  const [uploadForm, setUploadForm] = useState<StickerFormValues>(defaultForm());
  const [showUploadForm, setShowUploadForm] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const id = crypto.randomUUID();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target?.result as string;
        setUploadForm((f) => ({ ...f, imageBase64: b64 }));
        setShowUploadForm(true);
      };
      reader.readAsDataURL(file);
      setBatchItems((prev) => [...prev, { id, name: file.name, status: "uploading" }]);
    });
  }

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  const createMut = useMutation({
    mutationFn: () => platformStickersApi.create({
      name: uploadForm.name,
      tags: uploadForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      functionType: uploadForm.functionType,
      imageBase64: uploadForm.imageBase64,
      borderStyle: uploadForm.borderStyle,
      borderWidthMm: uploadForm.borderWidth ? parseFloat(uploadForm.borderWidth) : undefined,
      borderColor: uploadForm.borderColor || undefined,
      sizeInMm: uploadForm.sizeInMm ? parseFloat(uploadForm.sizeInMm) : undefined,
      exportTargets: { goodnotes: uploadForm.exportGoodnotes, ink: uploadForm.exportInk, cricut: uploadForm.exportCricut },
      status: "draft",
    }),
    onSuccess: (sticker) => {
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      toast({ title: "Sticker created — background removed" });
      onStickerCreated?.(sticker);
      setUploadForm(defaultForm());
      setShowUploadForm(false);
    },
    onError: (err: Error) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  // ── Brainstorm path ──────────────────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiError,  setAiError]  = useState<string | null>(null);
  const [aiTags,   setAiTags]   = useState<string[]>([]);
  const [aiIdeas,  setAiIdeas]  = useState<string[]>([]);
  const [aiName,   setAiName]   = useState("");
  const [aiPrice,  setAiPrice]  = useState("4.99");

  const aiMut = useMutation({
    mutationFn: () => aiApi.complete(PACK_SYSTEM_PROMPT, aiPrompt.trim()),
    onSuccess: (res) => {
      setAiError(null);
      try {
        const parsed = extractJson<PackAiResult>(res.text);
        setAiResult(parsed);
        setAiName(parsed.name ?? "");
        setAiTags(Array.isArray(parsed.tags) ? parsed.tags.slice(0, 4) : []);
        setAiIdeas(Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, 4) : []);
      } catch { setAiError("Claude returned invalid JSON — try rephrasing."); }
    },
    onError: (err: Error) => setAiError(err.message),
  });

  const savePack = useMutation({
    mutationFn: (status: "draft" | "live") =>
      fetch("/api/sticker-packs", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: aiName, tags: aiTags, price: parseFloat(aiPrice) || 0, editionIds: [], status, globalAvailable: false }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: (_data, status) => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      toast({ title: status === "live" ? "Pack published!" : "Saved as draft" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // ── Labelled-set path (state previously in GenerateSetCard) ──────────────────
  const [setType,     setSetType]     = useState<string>("dates");
  const [labelStyle,  setLabelStyle]  = useState<string>("padded");
  const [fontKey,     setFontKey]     = useState<string>("sans-bold");
  const [color,       setColor]       = useState<string>("#1B2A4A");
  const [sizeInMm,    setSizeInMm]    = useState<string>("20");
  const [borderStyle, setBorderStyle] = useState<string>("none");
  const [borderWidth, setBorderWidth] = useState<string>("0.5");
  const [borderColor, setBorderColor] = useState<string>("#000000");
  const [shadowStyle, setShadowStyle] = useState<string>("none");
  const [genResult,   setGenResult]   = useState<Array<{ name: string; imageBase64: string; selected: boolean }>>([]);
  const [genPending,  setGenPending]  = useState(false);
  const [genError,    setGenError]    = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    const opts = LABEL_STYLE_OPTIONS[setType] ?? [];
    if (opts.length > 0) setLabelStyle(opts[0].value);
    setGenResult([]);
  }, [setType]);

  async function generate() {
    setGenPending(true);
    setGenError(null);
    try {
      const res = await platformStickersApi.generateSet({
        setType, labelStyle, fontKey, color,
        sizeInMm:    sizeInMm ? parseFloat(sizeInMm) : null,
        borderStyle,
        borderWidthMm: borderStyle !== "none" ? (parseFloat(borderWidth) || null) : null,
        borderColor: borderStyle !== "none" ? (borderColor || null) : null,
        shadowStyle,
      });
      setGenResult(res.items.map((item) => ({ ...item, selected: true })));
    } catch (err: unknown) {
      setGenError((err as Error).message);
    } finally {
      setGenPending(false);
    }
  }

  async function saveSelected() {
    const toSave = genResult.filter((i) => i.selected);
    if (!toSave.length) return;
    setSaving(true);
    // Stable identifier shared by all stickers in this batch — enables DB-level grouping
    const newSetId = crypto.randomUUID();
    try {
      const res = await platformStickersApi.batchCreate({
        items:        toSave.map((i) => ({ name: i.name, imageBase64: i.imageBase64 })),
        functionType: "date",
        sizeInMm:     sizeInMm ? parseFloat(sizeInMm) : null,
        status:       "draft",
        setId:        newSetId,
      });
      qc.invalidateQueries({ queryKey: ["platform-stickers"] });
      toast({ title: `${res.created} sticker${res.created !== 1 ? "s" : ""} saved as draft` });
      if (res.stickers.length > 0) onStickerCreated?.(res.stickers[0]);
      setGenResult([]);
    } catch (err: unknown) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const setCount      = setType === "dates" ? 31 : setType === "weekdays" ? 7 : 12;
  const selectedCount = genResult.filter((i) => i.selected).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" style={{ minWidth: 0 }}>
      {/* Page header */}
      <div className="mb-1">
        <h1 className="font-display font-semibold text-[22px] text-foreground mb-1.5">Create a sticker</h1>
        <p className="text-[13px] text-muted-foreground">
          Upload your own artwork, brainstorm with AI, or generate a full labelled set — all in one screen.
        </p>
      </div>

      {/* Decision card */}
      <div className="rounded-[14px] border bg-card shadow-sm p-5 space-y-3">
        <p style={{ letterSpacing: "0.16em" }} className="text-[10px] font-bold uppercase text-muted-foreground">
          HOW ARE YOU MAKING THIS?
        </p>
        <div className="flex flex-wrap gap-2">
          {PATH_CHIPS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCreatePath(id)}
              style={{
                cursor: "pointer",
                ...(createPath === id
                  ? { background: CHIP_ACTIVE_BG, color: "#fff", borderColor: CHIP_ACTIVE_BG }
                  : {}),
              }}
              className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
                createPath === id ? "" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground">{PATH_DESCRIPTIONS[createPath]}</p>
      </div>

      {/* ── Path A: Upload artwork ── */}
      {createPath === "upload" && (
        <div className="rounded-[14px] border bg-card shadow-sm p-5 space-y-4">
          {!showUploadForm ? (
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              style={{ cursor: "pointer" }}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors py-8"
            >
              <Upload className="w-7 h-7 text-muted-foreground" />
              <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "center", gap: 2 }}>
                <p className="font-medium text-[13px] text-foreground">Drop files here or click to browse</p>
                <p className="text-[11.5px] text-muted-foreground">PNG, JPEG, WebP · Multiple files OK</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-semibold text-foreground">Configure sticker</p>
                <button onClick={() => setShowUploadForm(false)} style={{ cursor: "pointer" }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <StickerFormFields form={uploadForm} setForm={setUploadForm} requireImage={false} />
              <div className="flex gap-2">
                <button
                  onClick={() => createMut.mutate()}
                  disabled={!uploadForm.name || !uploadForm.imageBase64 || createMut.isPending}
                  style={{ cursor: !uploadForm.name || !uploadForm.imageBase64 || createMut.isPending ? "not-allowed" : "pointer" }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-[12.5px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {createMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create sticker
                </button>
                <button onClick={() => setShowUploadForm(false)} style={{ cursor: "pointer" }}
                  className="px-4 py-2 rounded-full border text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Path B: Brainstorm with Claude ── */}
      {createPath === "brainstorm" && (
        <div className="rounded-[14px] border bg-card shadow-sm p-5 space-y-4">
          <div className="relative">
            <Textarea
              rows={4}
              placeholder="e.g. A self-care pack for college students — cosy vibes, affirmations, study motivation, coffee & books"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) aiMut.mutate(); }}
              className="resize-none text-[12.5px] pr-36"
            />
            {/* "✦ Ask Claude" chip pinned inside the bottom-right corner of the textarea */}
            <button
              onClick={() => aiMut.mutate()}
              disabled={!aiPrompt.trim() || aiMut.isPending}
              style={{
                cursor: !aiPrompt.trim() || aiMut.isPending ? "not-allowed" : "pointer",
                position: "absolute", bottom: 10, right: 10,
                background: CHIP_ACTIVE_BG, color: "#fff",
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {aiMut.isPending
                ? <><Loader2 className="w-3 h-3 animate-spin" />Thinking…</>
                : <><Sparkles className="w-3 h-3" />✦ Ask Claude</>
              }
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">⌘ + Enter to generate</p>

          {aiError && !aiMut.isPending && (
            <ErrorState message={aiError} onRetry={() => aiMut.mutate()} />
          )}

          {aiResult && !aiMut.isPending && (
            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">Pack name</Label>
                <Input value={aiName} onChange={(e) => setAiName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {aiTags.map((tag, i) => (
                    <button key={i} onClick={() => setAiTags(aiTags.filter((_, j) => j !== i))}
                      style={{ cursor: "pointer" }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] font-medium hover:bg-destructive/10 hover:border-destructive/30 transition-colors">
                      {tag}<X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">Illustration briefs</Label>
                <div className="space-y-2">
                  {aiIdeas.map((idea, i) => (
                    <div key={i} className="rounded-xl border bg-muted/30 p-3 text-[12.5px] text-foreground/80 leading-relaxed">
                      <span className="font-mono text-[10px] text-muted-foreground mr-2">#{i + 1}</span>{idea}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 max-w-[140px]">
                <Label className="text-[12.5px]">Price (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[12.5px]">$</span>
                  <Input type="number" min="0" step="0.01" value={aiPrice} onChange={(e) => setAiPrice(e.target.value)} className="pl-6" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => aiMut.mutate()} style={{ cursor: "pointer" }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />Regenerate
                </button>
                <div className="flex-1" />
                <button onClick={() => savePack.mutate("draft")} disabled={!aiName || savePack.isPending}
                  style={{ cursor: !aiName || savePack.isPending ? "not-allowed" : "pointer" }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[12px] font-medium disabled:opacity-40 hover:bg-muted transition-colors">
                  {savePack.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save as draft
                </button>
                <button onClick={() => savePack.mutate("live")} disabled={!aiName || savePack.isPending}
                  style={{ cursor: !aiName || savePack.isPending ? "not-allowed" : "pointer" }}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity">
                  {savePack.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  Publish pack
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Path C: Generate a labelled set ── */}
      {createPath === "labelled-set" && (
        <div className="rounded-[14px] border bg-card shadow-sm p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[12.5px]">Set type</Label>
            <ChipRow options={SET_TYPE_OPTIONS} value={setType} onChange={(v) => setSetType(v)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12.5px]">Label style</Label>
            <ChipRow options={LABEL_STYLE_OPTIONS[setType] ?? []} value={labelStyle} onChange={setLabelStyle} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12.5px]">Font</Label>
            <ChipRow options={FONT_OPTIONS} value={fontKey} onChange={setFontKey} />
          </div>

          {/* Two-column: Colour + Size */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Colour</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-8 rounded border border-border cursor-pointer shrink-0" />
                <Input className="h-8 text-xs font-mono" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Size (mm)</Label>
              <Input type="number" min="5" max="100" className="h-8 text-xs"
                value={sizeInMm} onChange={(e) => setSizeInMm(e.target.value)} placeholder="e.g. 20" />
            </div>
          </div>

          {/* Two-column: Shadow + Border */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Shadow</Label>
              <ChipRow options={SHADOW_OPTIONS} value={shadowStyle} onChange={setShadowStyle} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Border</Label>
              <SegmentedControl
                options={[{value:"none",label:"None"},{value:"thin",label:"Thin"},{value:"white",label:"White"}]}
                value={borderStyle} onChange={setBorderStyle}
              />
            </div>
          </div>

          {borderStyle !== "none" && (
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="space-y-1.5">
                <Label className="text-[11.5px]">Width (mm)</Label>
                <Input type="number" min="0.1" max="10" step="0.1" className="h-8 text-xs"
                  value={borderWidth} onChange={(e) => setBorderWidth(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11.5px]">Border colour</Label>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={borderColor} onChange={(e) => setBorderColor(e.target.value)}
                    className="h-8 w-8 rounded border border-border cursor-pointer shrink-0" />
                  <Input className="h-8 text-xs font-mono" value={borderColor} onChange={(e) => setBorderColor(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <button
            onClick={generate}
            disabled={genPending}
            style={{ cursor: genPending ? "not-allowed" : "pointer", background: CHIP_ACTIVE_BG, color: "#fff" }}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {genPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating {setCount} stickers…</>
              : <><CheckSquare className="w-3.5 h-3.5" />Generate {setCount} stickers</>
            }
          </button>

          {genError && !genPending && <ErrorState message={genError} onRetry={generate} />}

          {genResult.length > 0 && !genPending && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-semibold text-foreground">
                  {genResult.length} generated — click a sticker to deselect
                </p>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <button onClick={() => setGenResult((r) => r.map((i) => ({ ...i, selected: true })))}
                    style={{ cursor: "pointer" }} className="hover:text-foreground">All</button>
                  <span>·</span>
                  <button onClick={() => setGenResult((r) => r.map((i) => ({ ...i, selected: false })))}
                    style={{ cursor: "pointer" }} className="hover:text-foreground">None</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {genResult.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => setGenResult((r) => r.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                    style={{
                      cursor: "pointer",
                      opacity: item.selected ? 1 : 0.3,
                      outline: item.selected ? `2px solid ${CHIP_ACTIVE_BG}` : "2px solid transparent",
                      outlineOffset: 2, borderRadius: 8,
                    }}
                    className="flex flex-col items-center gap-1 p-1.5 rounded-[8px] border border-border transition-all"
                    title={item.name}
                  >
                    <StickerThumb src={item.imageBase64} size={44} />
                    <span className="text-[9px] text-muted-foreground leading-none">
                      {item.name.replace(/^(Date coverup |Weekday |Month )/, "")}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={saveSelected}
                disabled={selectedCount === 0 || saving}
                style={{
                  cursor: selectedCount === 0 || saving ? "not-allowed" : "pointer",
                  background: CHIP_ACTIVE_BG, color: "#fff",
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save {selectedCount} sticker{selectedCount !== 1 ? "s" : ""} as draft
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PACKS MODE ────────────────────────────────────────────────────────────────

function PackRow({ pack, coverImage, onToggle, togglePending }: {
  pack: PlatformStickerPack; coverImage?: string | null; onToggle: () => void; togglePending: boolean;
}) {
  const isLive = pack.status === "live";

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-[14px] border bg-card hover:bg-muted/30 transition-colors">
      {/* Swatch thumbnail — first sticker image or fallback icon */}
      <div
        className="rounded-xl border border-border flex items-center justify-center shrink-0 overflow-hidden"
        style={{ width: 48, height: 48, background: "hsl(var(--muted))", minWidth: 48 }}
      >
        {coverImage
          ? <img src={coverImage} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
          : <Sticker className="w-5 h-5 text-muted-foreground" />
        }
      </div>

      {/* Stacked text — explicit flex-col + width:100% */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, width: "100%", gap: 3 }}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px] text-foreground truncate">{pack.name}</span>
          <StatusChip status={pack.status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {((pack.tags as string[]) || []).slice(0, 3).map((t: string) => (
            <span key={t} className="text-[10.5px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">{t}</span>
          ))}
          <span className="text-[10.5px] font-mono text-muted-foreground">
            {pack.price ? `$${Number(pack.price).toFixed(2)}` : "Free"}
          </span>
        </div>
      </div>

      {/* Actions: visible primary chip + detail link */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ActionChip
          label={isLive ? "Unpublish" : "Publish"}
          onClick={onToggle}
          disabled={togglePending}
          variant={isLive ? "secondary" : "primary"}
        />
        <a href={`/daybook/catalog/packs/${pack.id}`}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-border text-[12px] font-semibold text-foreground hover:bg-muted transition-colors">
          Edit
        </a>
      </div>
    </div>
  );
}

function PacksCenter({
  packStatus, packOrigin, packPriceFilter, onNewPack,
}: {
  packStatus: string; packOrigin: string; packPriceFilter: "all" | "free" | "paid";
  onNewPack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rawPacks, isLoading, error, refetch } = useQuery<PlatformStickerPack[]>({
    queryKey: ["platform-sticker-packs"],
    queryFn:  () => platformStickersApi.listPacks(),
    // staleTime: 30_000 — management list view with explicit refetch button;
    // short cache acceptable, mutations also invalidate this key.
    staleTime: 30_000,
  });
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  const packs = rawPacks ?? [];
  const filtered = packs.filter((p) => {
    if (packStatus !== "all" && p.status !== packStatus) return false;
    if (packOrigin !== "all" && p.origin !== packOrigin) return false;
    if (packPriceFilter === "free" && p.price) return false;
    if (packPriceFilter === "paid" && !p.price) return false;
    return true;
  });

  function toggle(pack: PlatformStickerPack) {
    const next = pack.status === "live" ? "draft" : "live";
    setPendingToggles((p) => new Set(p).add(pack.id));
    fetch(`/api/platform/sticker-packs/${pack.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      toast({ title: next === "live" ? "Published" : "Unpublished" });
      qc.invalidateQueries({ queryKey: ["platform-sticker-packs"] });
    }).catch((err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }))
      .finally(() => setPendingToggles((p) => { const n = new Set(p); n.delete(pack.id); return n; }));
  }

  const liveCount  = packs.filter((p) => p.status === "live").length;
  const draftCount = packs.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-4" style={{ minWidth: 0 }}>
      {/* Heading — no inline "New pack" button; the top-bar primary action is the one CTA */}
      <div className="mb-2">
        <h1 className="font-display font-semibold text-[22px] text-foreground mb-1.5">Sticker packs</h1>
        <p className="text-[13px] text-muted-foreground">
          Sellable bundles — each pack groups stickers, sets the price, and controls which editions buyers can access it in.
        </p>
      </div>

      {/* Count summary */}
      {!isLoading && !error && packs.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          {filtered.length} pack{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== packs.length && ` of ${packs.length}`}
          {" "}· {liveCount} live · {draftCount} draft
        </p>
      )}

      {isLoading && <SkeletonRows count={4} />}
      {error && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={<Package className="w-5 h-5 text-muted-foreground" />}
          title={packs.length === 0 ? "No packs yet" : "No packs match these filters"}
          description={packs.length === 0 ? "Create your first sticker pack using the button above." : "Try clearing origin or price filters."}
          action={packs.length === 0 ? { label: "New pack", onClick: onNewPack } : undefined}
        />
      )}
      {!isLoading && !error && filtered.length > 0 && (
        /* minmax(168px) → 6 per row at 1440 with a 246px rail */
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))" }}>
          {filtered.map((pack) => (
            <PackCard key={pack.id} pack={pack} coverImage={pack.coverImage}
              onToggle={() => toggle(pack)}
              togglePending={pendingToggles.has(pack.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── LEFT RAILS per mode ───────────────────────────────────────────────────────

function LibraryRail({
  origin, setOrigin, status, setStatus, filterType, setFilterType,
}: {
  origin: string; setOrigin: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  filterType: string; setFilterType: (v: string) => void;
}) {
  return (
    <div className="p-4 space-y-5 flex-1 overflow-y-auto">
      <RailCard>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
          <p className="font-display font-semibold text-[13px] text-foreground">Sticker library</p>
          <p className="text-[11px] text-muted-foreground">All platform stickers. Click a thumbnail to preview at true scale in the right dock.</p>
        </div>
      </RailCard>
      <div className="space-y-2">
        <SectionLabel>Origin</SectionLabel>
        <ChipRow
          options={[{value:"all",label:"All"},{value:"starter",label:"Starter"},{value:"owned",label:"Store-owned"},{value:"licensed",label:"Licensed"}]}
          value={origin} onChange={setOrigin}
        />
      </div>
      <div className="space-y-2">
        <SectionLabel>Status</SectionLabel>
        <ChipRow
          options={[{value:"all",label:"All"},{value:"live",label:"Live"},{value:"draft",label:"Draft"}]}
          value={status} onChange={setStatus}
        />
      </div>
      <div className="space-y-2">
        <SectionLabel>Function type</SectionLabel>
        <ChipRow
          options={[{value:"all",label:"All"}, ...STICKER_FUNCTION_TYPES.map((t) => ({value:t, label: FUNCTION_TYPE_LABELS[t] ?? t}))]}
          value={filterType} onChange={setFilterType}
        />
      </div>
    </div>
  );
}

const CREATE_WORKFLOW_STEPS = [
  "Upload or generate",
  "Auto-cutout & bg remove",
  "Refine & size",
  "Publish",
];

type CreatePath = "upload" | "brainstorm" | "labelled-set";

function CreateRail({
  batchItems,
  createPath,
}: {
  batchItems: InProgressItem[];
  createPath: CreatePath;
}) {
  // Compute active workflow step from batch state
  const activeStep = batchItems.length === 0 ? 0
    : batchItems.some((i) => i.status === "uploading" || i.status === "processing") ? 1
    : batchItems.some((i) => i.status === "done") ? 2
    : 0;

  const pathDesc: Record<CreatePath, string> = {
    "upload":        "Drop a PNG, JPEG, or WebP file. Background is removed automatically.",
    "brainstorm":    "Describe a pack concept. Claude returns a name, 4 tags, and 4 illustration briefs.",
    "labelled-set":  "Generate 7–31 transparent PNGs server-side. Review and deselect before saving.",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Context card — updates with selected path */}
        <RailCard>
          <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
            <p className="font-display font-semibold text-[13px] text-foreground">
              {createPath === "upload" ? "Upload artwork"
                : createPath === "brainstorm" ? "Brainstorm with Claude"
                : "Generate a labelled set"}
            </p>
            <p className="text-[11px] text-muted-foreground">{pathDesc[createPath]}</p>
          </div>
        </RailCard>

        {/* Workflow — PROMOTED to main rail content with active step highlighted */}
        <div className="space-y-1">
          <SectionLabel className="mb-2">Workflow</SectionLabel>
          {CREATE_WORKFLOW_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2 py-1">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{
                  background: i === activeStep ? CHIP_ACTIVE_BG : "hsl(var(--muted))",
                  color:      i === activeStep ? "#fff"          : "hsl(var(--muted-foreground))",
                }}
              >
                {i + 1}
              </span>
              <span
                className={`text-[11.5px] ${i === activeStep ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {step}
              </span>
            </div>
          ))}
        </div>

        {/* In-progress items */}
        {batchItems.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>In progress</SectionLabel>
            {batchItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg border">
                <StickerThumb src={item.src} size={32} />
                <div style={{ display: "flex", flexDirection: "column", width: "100%", minWidth: 0, gap: 1 }}>
                  <p className="text-[11.5px] font-medium truncate">{item.name}</p>
                  <p className="text-[10.5px] text-muted-foreground capitalize">{item.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PacksRail({
  packStatus, setPackStatus,
  packOrigin, setPackOrigin,
  packPriceFilter, setPackPriceFilter,
}: {
  packStatus: string; setPackStatus: (v: string) => void;
  packOrigin: string; setPackOrigin: (v: string) => void;
  packPriceFilter: "all" | "free" | "paid"; setPackPriceFilter: (v: "all" | "free" | "paid") => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Context card */}
        <RailCard>
          <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 4 }}>
            <p className="font-display font-semibold text-[13px] text-foreground">Assemble a pack</p>
            <p className="text-[11px] text-muted-foreground">
              A pack is the sellable unit. Group stickers, set the price, and control which edition tiers get access.
            </p>
          </div>
        </RailCard>

        {/* Status filter */}
        <div className="space-y-2">
          <SectionLabel>Status</SectionLabel>
          <ChipRow
            options={[
              { value: "all",   label: "All" },
              { value: "live",  label: "Live" },
              { value: "draft", label: "Draft" },
            ]}
            value={packStatus} onChange={setPackStatus}
          />
        </div>

        {/* Origin filter */}
        <div className="space-y-2">
          <SectionLabel>Origin</SectionLabel>
          <ChipRow
            options={[
              { value: "all",      label: "All" },
              { value: "starter",  label: "Starter" },
              { value: "owned",    label: "Store" },
              { value: "licensed", label: "Licensed" },
            ]}
            value={packOrigin} onChange={setPackOrigin}
          />
        </div>

        {/* Price filter */}
        <div className="space-y-2">
          <SectionLabel>Price</SectionLabel>
          <ChipRow
            options={[
              { value: "all",  label: "All" },
              { value: "free", label: "Free" },
              { value: "paid", label: "Paid" },
            ]}
            value={packPriceFilter}
            onChange={(v) => setPackPriceFilter(v as "all" | "free" | "paid")}
          />
        </div>
      </div>

      {/* Pinned workflow guide */}
      <div className="border-t p-4 space-y-1 shrink-0">
        <SectionLabel className="mb-2">Pack workflow</SectionLabel>
        {[
          "Create pack & set price",
          "Add stickers from library",
          "Link to edition tiers",
          "Publish",
        ].map((step, i) => (
          <div key={step} className="flex items-center gap-2 py-1">
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
              style={{
                background: i === 0 ? CHIP_ACTIVE_BG : "hsl(var(--muted))",
                color:      i === 0 ? "#fff"         : "hsl(var(--muted-foreground))",
              }}
            >
              {i + 1}
            </span>
            <span className={`text-[11.5px] ${i === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN HUB ──────────────────────────────────────────────────────────────────

export default function StickerStudioHub() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode = (params.get("mode") ?? "library") as ModeId;
  const validMode: ModeId = MODES.some((m) => m.id === mode) ? mode : "library";
  const setMode = (id: string) => navigate(`/studios/stickers?mode=${id}`);

  // Library filter state (in left rail, shared with center)
  const [origin,     setOrigin]     = useState("all");
  const [libStatus,  setLibStatus]  = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [libSearch,  setLibSearch]  = useState("");

  // Scale preview state
  const [previewSticker, setPreviewSticker] = useState<LibrarySticker | null>(null);

  // Create mode state
  const [batchItems,   setBatchItems]   = useState<InProgressItem[]>([]);
  const [aiResult,     setAiResult]     = useState<PackAiResult | null>(null);
  const [createPath,   setCreatePath]   = useState<CreatePath>("upload");

  // Packs filter state
  const [packStatus,      setPackStatus]      = useState("all");
  const [packOrigin,      setPackOrigin]      = useState("all");
  const [packPriceFilter, setPackPriceFilter] = useState<"all" | "free" | "paid">("all");

  // Gap 2: counters that fire each child's primary action from the top-bar button
  const [libCreateTrigger, setLibCreateTrigger] = useState(0);
  const [uploadTrigger,    setUploadTrigger]    = useState(0);

  // Gap 3: in-studio pack composer
  const [showNewPack, setShowNewPack] = useState(false);

  // Gap 5: edit target opened from the scale-preview dock
  const [hubEditTarget, setHubEditTarget] = useState<LibrarySticker | null>(null);

  // ── Left rail ─────────────────────────────────────────────────────────────
  const leftRail = (() => {
    if (validMode === "library")
      return <LibraryRail origin={origin} setOrigin={setOrigin} status={libStatus} setStatus={setLibStatus} filterType={filterType} setFilterType={setFilterType} />;
    if (validMode === "create")
      return <CreateRail batchItems={batchItems} createPath={createPath} />;
    return <PacksRail
      packStatus={packStatus} setPackStatus={setPackStatus}
      packOrigin={packOrigin} setPackOrigin={setPackOrigin}
      packPriceFilter={packPriceFilter} setPackPriceFilter={setPackPriceFilter}
    />;
  })();

  // ── AI drawer context ────────────────────────────────────────────────────────
  const { setAiContext, clearAiContext } = useAiDrawer();
  const _clearRef = useRef(clearAiContext);
  _clearRef.current = clearAiContext;
  useEffect(() => () => _clearRef.current(), []);
  useEffect(() => {
    const systemPrompt =
      validMode === "library"
        ? "You are a sticker curation expert. Help the user audit their sticker library, spot gaps, and decide what to create or remove."
        : validMode === "create"
        ? "You are a sticker concept generator. Create specific, visual illustration briefs: subject, style, colour palette, expression, and any text overlay. Give 4 ideas per prompt."
        : "You are a product packaging expert for digital sticker packs. Help with naming, pricing strategy, tag selection, and edition targeting.";
    const examplePrompts =
      validMode === "library"
        ? ["What sticker types are missing from a productivity planner set?", "Which origin stickers get used least?", "Suggest 5 stickers to round out a minimal theme"]
        : validMode === "create"
        ? ["Generate 4 kawaii food sticker briefs for a meal-planning planner", "Describe 4 botanical stickers for a spring journalling theme", "What makes a good habit-tracker sticker?"]
        : ["Suggest a name for a cosy autumn sticker pack", "What's a good price for a 12-sticker premium pack?", "Which edition tiers should a starter pack target?"];
    setAiContext({
      systemPrompt,
      examplePrompts,
      contextLabel: `Sticker Studio · ${validMode}`,
      previewContent: null,
    });
  }, [validMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep preview in sync with the currently selected sticker card
  useEffect(() => {
    setAiContext({
      previewContent: <StickerScalePreview
        sticker={previewSticker}
        onOpenEdit={previewSticker ? () => setHubEditTarget(previewSticker) : undefined}
      />,
    });
  }, [previewSticker]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Center content ────────────────────────────────────────────────────────
  const center = (() => {
    if (validMode === "library")
      return <LibraryCenter
        filterOrigin={origin} filterType={filterType} filterStatus={libStatus}
        search={libSearch} setSearch={setLibSearch}
        selectedPreview={previewSticker} onSelectPreview={setPreviewSticker}
        triggerCreate={libCreateTrigger}
      />;
    if (validMode === "create")
      return <CreateCenter
        batchItems={batchItems} setBatchItems={setBatchItems}
        aiResult={aiResult} setAiResult={setAiResult}
        uploadTrigger={uploadTrigger}
        createPath={createPath} setCreatePath={setCreatePath}
        onStickerCreated={(s) => setPreviewSticker(s)}
      />;
    return <PacksCenter
      packStatus={packStatus} packOrigin={packOrigin} packPriceFilter={packPriceFilter}
      onNewPack={() => setShowNewPack(true)}
    />;
  })();

  // ── Primary action ────────────────────────────────────────────────────────
  const primaryAction = (() => {
    if (validMode === "library")
      return { label: "New sticker", icon: <Plus className="w-3.5 h-3.5" />, onClick: () => setLibCreateTrigger((c) => c + 1) };
    if (validMode === "create")
      return { label: "Upload artwork", icon: <Upload className="w-3.5 h-3.5" />, onClick: () => { setCreatePath("upload"); setUploadTrigger((c) => c + 1); } };
    return { label: "New pack", icon: <Plus className="w-3.5 h-3.5" />, onClick: () => setShowNewPack(true) };
  })();

  return (
    <StudioLayout
      scope="Sticker Studio"
      modes={MODES}
      activeMode={validMode}
      onModeChange={setMode}
      status={{ label: "Platform", ok: true }}
      primaryAction={primaryAction}
      leftRail={leftRail}
      hasAssistant
      hasPreview
    >
      {center}

      {/* Gap 3: in-studio pack composer */}
      {showNewPack && <CreatePackModal onClose={() => setShowNewPack(false)} />}

      {/* Gap 5: edit sticker opened from the scale-preview "Set size" button */}
      {hubEditTarget && (
        <StickerFormModal mode="edit" sticker={hubEditTarget} onClose={() => setHubEditTarget(null)} />
      )}
    </StudioLayout>
  );
}
