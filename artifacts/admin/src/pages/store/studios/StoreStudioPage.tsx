/**
 * Sticker Studio — Store-scoped two-mode shell (replaces Store Pack Studio).
 *
 * Mode A — Create Stickers:  batch upload + three AI generation sub-routes
 *   • Upload & Process (batch pipeline with shadow/feather controls)
 *   • Functional SVG   (Claude draws a clean vector sticker)
 *   • Text Set         (renders date / weekday / month label sets)
 *   • Illustrative Art (Claude writes an image-gen prompt)
 *
 * Mode B — Assemble a Pack: pack name/tag/price editor + attestation + publish
 *
 * Mode is kept in the URL query string (?mode=create | ?mode=assemble) so the
 * browser back button returns you to the correct mode.
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Upload, Wand2, Type, Image, Package, Sticker,
  RefreshCw, Save, Globe, Lock, Sparkles, X, ChevronRight,
  CheckCircle2, AlertCircle, Lightbulb, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState } from "@/components/shared";
import {
  storeStudiosApi,
  studioGenerateApi,
  apiFetch,
  STICKER_FUNCTION_TYPES,
  type StickerFunctionType,
} from "@/lib/api";
import { getPackPriceError, parsePackPrice } from "@/lib/studio/packPricing";
import { AiDisabledState, SuperAdminAiBanner } from "./AiDisabledState";

// ── Types ─────────────────────────────────────────────────────────────────────

import { canPublish as mayPublish, isSuperAdminRole } from "@/lib/permissions";

interface Props {
  storeId: string;
  role: string;
  aiEnabled: boolean;
}

type Mode = "create" | "assemble";
type CreateTab = "upload" | "functional" | "textset" | "prompt";

interface BatchItem {
  id: string;
  name: string;
  file: File;
  preview: string;
  status: "pending" | "processing" | "ok" | "failed";
  stickerId?: string;
  reason?: string;
}

interface GeneratedSticker {
  id: string;
  name: string;
  processedImageData?: string;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useQueryParam(key: string, fallback: string): [string, (v: string) => void] {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const value = params.get(key) ?? fallback;
  const set = (v: string) => {
    const base = location.split("?")[0];
    const next = new URLSearchParams(params);
    next.set(key, v);
    setLocation(`${base}?${next.toString()}`);
  };
  return [value, set];
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ── Mode selector ─────────────────────────────────────────────────────────────

function ModeBar({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex gap-2 mb-6 p-1 bg-muted rounded-lg w-fit">
      {([
        { id: "create", label: "Create Stickers", icon: Sticker },
        { id: "assemble", label: "Assemble a Pack", icon: Package },
      ] as const).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          className={[
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            mode === id
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          <Icon className="w-4 h-4" />{label}
        </button>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MODE A — CREATE STICKERS
// ═════════════════════════════════════════════════════════════════════════════

// ── Upload & Process tab ──────────────────────────────────────────────────────

function UploadTab({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Shadow / feather shared settings (applied to all items in batch)
  const [shadowStyle, setShadowStyle] = useState("none");
  const [shadowLiftPx, setShadowLiftPx] = useState(4);
  const [edgeFeatherPx, setEdgeFeatherPx] = useState(0);
  const [sizeInMm, setSizeInMm] = useState(25);
  const [borderStyle, setBorderStyle] = useState("none");

  const addFiles = async (files: FileList) => {
    const newItems: BatchItem[] = [];
    for (const file of Array.from(files).slice(0, 50 - items.length)) {
      if (!file.type.startsWith("image/")) continue;
      const preview = await fileToDataUrl(file);
      newItems.push({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        file,
        preview,
        status: "pending",
      });
    }
    setItems((prev) => [...prev, ...newItems]);
  };

  const updateName = (id: string, name: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const runBatch = async () => {
    const pending = items.filter((i) => i.status === "pending");
    if (!pending.length) return;
    setProcessing(true);

    for (const item of pending) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "processing" } : i)));
      try {
        const imageBase64 = await fileToDataUrl(item.file);
        const result = await apiFetch<{ results: Array<{ id?: string; status: string; reason?: string }> }>(
          `/stores/${storeId}/stickers/batch`,
          {
            method: "POST",
            body: JSON.stringify({
              items: [{
                name: item.name,
                imageBase64,
                functionType: "decorative",
                borderStyle,
                sizeInMm,
                shadowStyle: shadowStyle === "none" ? undefined : shadowStyle,
                shadowLiftPx: shadowStyle !== "none" ? shadowLiftPx : undefined,
                edgeFeatherPx: edgeFeatherPx > 0 ? edgeFeatherPx : undefined,
                exportTargets: { goodnotes: true, ink: true, cricut: false },
                sourceType: "photo",
              }],
            }),
          },
        );
        const r = result.results[0];
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: r.status as "ok" | "failed", stickerId: r.id, reason: r.reason }
              : i
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "failed", reason: String(err) } : i))
        );
      }
    }
    setProcessing(false);
    toast({ title: "Batch complete" });
  };

  const succeeded = items.filter((i) => i.status === "ok").length;
  const failed = items.filter((i) => i.status === "failed").length;

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className="flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed border-border bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors gap-2 text-muted-foreground text-sm"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <Upload className="w-6 h-6" />
        <span>Drop images here or <span className="text-primary font-medium underline">browse</span></span>
        <span className="text-xs">PNG, JPEG, WebP — max 5 MB each, up to 50 per batch</span>
        <input ref={fileRef} type="file" multiple accept="image/*" className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {/* Pipeline controls */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Pipeline settings (applied to all)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Size (mm)</Label>
              <Input type="number" min={8} max={200} value={sizeInMm}
                onChange={(e) => setSizeInMm(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Border</Label>
              <Select value={borderStyle} onValueChange={setBorderStyle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="thin">Thin</SelectItem>
                  <SelectItem value="white">White</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shadow</Label>
              <Select value={shadowStyle} onValueChange={setShadowStyle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="flat">Flat</SelectItem>
                  <SelectItem value="soft">Soft</SelectItem>
                  <SelectItem value="lifted">Lifted</SelectItem>
                  <SelectItem value="cut-paper">Cut-paper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Edge feather (px)</Label>
              <Input type="number" min={0} max={20} value={edgeFeatherPx}
                onChange={(e) => setEdgeFeatherPx(Number(e.target.value))} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Item grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.id} className="relative rounded-lg border border-border bg-card p-3 space-y-2">
              <img src={item.preview} alt={item.name}
                className="w-full h-24 object-contain rounded bg-muted/30" />
              <Input
                value={item.name}
                onChange={(e) => updateName(item.id, e.target.value)}
                className="h-7 text-xs"
                disabled={item.status !== "pending"}
              />
              <div className="flex items-center gap-1.5 text-xs">
                {item.status === "pending" && <span className="text-muted-foreground">Ready</span>}
                {item.status === "processing" && <><Loader2 className="w-3 h-3 animate-spin" /><span>Processing…</span></>}
                {item.status === "ok" && <><CheckCircle2 className="w-3 h-3 text-green-600" /><span className="text-green-600">Done</span></>}
                {item.status === "failed" && (
                  <span className="text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{item.reason ?? "Failed"}
                  </span>
                )}
              </div>
              {item.status === "pending" && (
                <button onClick={() => removeItem(item.id)}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Batch summary + run */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          {(succeeded > 0 || failed > 0) && (
            <span className="text-xs text-muted-foreground">
              {succeeded} succeeded · {failed} failed
            </span>
          )}
          <div className="flex-1" />
          <Button
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
            onClick={runBatch}
            disabled={processing || items.every((i) => i.status !== "pending")}
          >
            {processing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
              : <><Sticker className="w-4 h-4 mr-2" />Process {items.filter((i) => i.status === "pending").length} sticker{items.filter((i) => i.status === "pending").length !== 1 ? "s" : ""}</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Functional SVG tab ────────────────────────────────────────────────────────

function FunctionalTab({ storeId, aiEnabled, isSuperAdmin }: { storeId: string; aiEnabled: boolean; isSuperAdmin?: boolean }) {
  const { toast } = useToast();
  const [functionType, setFunctionType] = useState<StickerFunctionType>("tab");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#2D3748");
  const [sizeInMm, setSizeInMm] = useState(20);
  const [result, setResult] = useState<GeneratedSticker | null>(null);

  if (!aiEnabled) return isSuperAdmin ? <SuperAdminAiBanner /> : <AiDisabledState />;

  const generate = useMutation({
    mutationFn: () =>
      apiFetch<GeneratedSticker & { model: string }>(`/stores/${storeId}/stickers/generate/functional`, {
        method: "POST",
        body: JSON.stringify({ functionType, label: label.trim() || undefined, paletteColors: [color], sizeInMm }),
      }),
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "SVG sticker generated and saved as draft" });
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-lg">
      <p className="text-sm text-muted-foreground">
        Claude draws a clean vector SVG sticker. Ideal for tabs, banners, date circles, and functional shapes.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Function type</Label>
          <Select value={functionType} onValueChange={(value) => setFunctionType(value as StickerFunctionType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STICKER_FUNCTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Label (optional)</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Monday" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Primary colour</Label>
          <div className="flex gap-2 items-center">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 rounded border border-border cursor-pointer" />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Size (mm)</Label>
          <Input type="number" min={8} max={200} value={sizeInMm}
            onChange={(e) => setSizeInMm(Number(e.target.value))} />
        </div>
      </div>
      <Button
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
        className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
      >
        {generate.isPending
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claude is drawing…</>
          : <><Wand2 className="w-4 h-4 mr-2" />Generate SVG sticker</>}
      </Button>

      {result && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Saved as draft: <strong>{result.name}</strong></span>
          <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
        </div>
      )}
    </div>
  );
}

// ── Text Set tab ──────────────────────────────────────────────────────────────

const SET_TYPES = [
  { value: "dates-1-31", label: "Dates 1–31" },
  { value: "dates-padded", label: "Dates 01–31 (padded)" },
  { value: "dates-ordinal", label: "Dates 1st–31st" },
  { value: "weekdays-long", label: "Weekdays (Monday…)" },
  { value: "weekdays-short", label: "Weekdays (Mon…)" },
  { value: "weekdays-initial", label: "Weekdays (M T W…)" },
  { value: "months-long", label: "Months (January…)" },
  { value: "months-short", label: "Months (Jan…)" },
  { value: "months-numeric", label: "Months (01–12)" },
];

function TextSetTab({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [setType, setSetType] = useState("dates-1-31");
  const [fontKey, setFontKey] = useState("sans-bold");
  const [color, setColor] = useState("#1A202C");
  const [sizeInMm, setSizeInMm] = useState(12);
  const [result, setResult] = useState<{ created: number; setType: string } | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      apiFetch<{ created: number; ids: string[]; setType: string }>(
        `/stores/${storeId}/stickers/generate/text-set`,
        {
          method: "POST",
          body: JSON.stringify({ setType, fontKey, color, sizeInMm, exportTargets: { goodnotes: true, ink: true, cricut: false } }),
        },
      ),
    onSuccess: (data) => {
      setResult({ created: data.created, setType: data.setType });
      toast({ title: `${data.created} stickers created`, description: "All saved as drafts in your library." });
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-lg">
      <p className="text-sm text-muted-foreground">
        Renders a full set of text labels (dates, weekdays, or months) as individual draft stickers using SVG text rendering.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Set type</Label>
          <Select value={setType} onValueChange={setSetType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SET_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Font</Label>
          <Select value={fontKey} onValueChange={setFontKey}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sans">Instrument Sans — regular</SelectItem>
              <SelectItem value="sans-bold">Instrument Sans — bold</SelectItem>
              <SelectItem value="serif">Spectral — regular</SelectItem>
              <SelectItem value="serif-bold">Spectral — bold</SelectItem>
              <SelectItem value="mono">Space Mono — regular</SelectItem>
              <SelectItem value="mono-bold">Space Mono — bold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Text colour</Label>
          <div className="flex gap-2 items-center">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 rounded border border-border cursor-pointer" />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Size (mm)</Label>
          <Input type="number" min={6} max={100} value={sizeInMm}
            onChange={(e) => setSizeInMm(Number(e.target.value))} />
        </div>
      </div>
      <Button onClick={() => generate.mutate()} disabled={generate.isPending}
        className="bg-[#C87560] hover:bg-[#A85E4E] text-white">
        {generate.isPending
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rendering…</>
          : <><Type className="w-4 h-4 mr-2" />Generate set</>}
      </Button>
      {result && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span><strong>{result.created}</strong> drafts created for <em>{result.setType}</em></span>
        </div>
      )}
    </div>
  );
}

// ── Illustrative Art Prompt tab ───────────────────────────────────────────────

function IllustrativeTab({ storeId, aiEnabled, isSuperAdmin }: { storeId: string; aiEnabled: boolean; isSuperAdmin?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [brief, setBrief] = useState("");
  const [refImage, setRefImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ prompt: string; reasoning: string; qaChecklist?: string[] | null } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [stickerName, setStickerName] = useState("");

  // All hooks must come before conditional returns
  const generate = useMutation({
    mutationFn: () =>
      apiFetch<typeof result>(`/stores/${storeId}/stickers/generate/illustrative-prompt`, {
        method: "POST",
        body: JSON.stringify({ brief: brief.trim(), referenceImageBase64: refImage ?? undefined }),
      }),
    onSuccess: (data) => { setResult(data); setPreviewImage(null); setStickerName(""); },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const generateImage = useMutation({
    mutationFn: (prompt: string) =>
      apiFetch<{ processedImageData: string; cutlineSvg: string | null; prompt: string }>(
        `/stores/${storeId}/stickers/generate/illustrative-image`,
        { method: "POST", body: JSON.stringify({ prompt }) },
      ),
    onSuccess: (data) => setPreviewImage(data.processedImageData),
    onError: (err: Error) => toast({ title: "Image generation failed", description: err.message, variant: "destructive" }),
  });

  const saveSticker = useMutation({
    mutationFn: () => {
      if (!previewImage || !stickerName.trim()) throw new Error("Name and image required");
      return apiFetch<{ id: string }>(
        `/stores/${storeId}/stickers`,
        {
          method: "POST",
          body: JSON.stringify({
            imageBase64: previewImage,
            name: stickerName.trim(),
            borderStyle: "none",
            shadowStyle: "none",
          }),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-stickers", storeId] });
      toast({ title: "Sticker saved!", description: `"${stickerName}" added to your library as a draft.` });
      setPreviewImage(null);
      setStickerName("");
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // All hooks declared above — safe to return early now
  if (!aiEnabled) return isSuperAdmin ? <SuperAdminAiBanner /> : <AiDisabledState />;

  const loadRef = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setRefImage(dataUrl);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Describe a sticker concept — Claude writes a detailed prompt, then DALL·E 3 generates and processes the art.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Concept brief</Label>
        <Textarea rows={3} placeholder="e.g. A cosy autumn reading nook — warm lighting, pile of books, steaming mug, falling leaves outside the window"
          value={brief} onChange={(e) => setBrief(e.target.value)} className="resize-none" />
      </div>

      {/* Optional reference image */}
      <div className="space-y-2">
        <Label className="text-xs">Reference image (optional — enables vision comparison)</Label>
        {refImage ? (
          <div className="relative w-32">
            <img src={refImage} alt="reference" className="w-32 h-32 object-cover rounded border border-border" />
            <button onClick={() => setRefImage(null)}
              className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5 hover:bg-destructive hover:border-destructive hover:text-white transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-border cursor-pointer hover:bg-muted/30 gap-2 text-muted-foreground text-sm"
            onClick={() => fileRef.current?.click()}>
            <Image className="w-4 h-4" />Upload reference
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && loadRef(e.target.files[0])} />
          </div>
        )}
      </div>

      <Button onClick={() => generate.mutate()} disabled={generate.isPending || !brief.trim()}
        className="bg-[#C87560] hover:bg-[#A85E4E] text-white">
        {generate.isPending
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claude is writing…</>
          : <><Lightbulb className="w-4 h-4 mr-2" />Write prompt</>}
      </Button>

      {result && !generate.isPending && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Generated prompt</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 font-mono text-xs select-all">{result.prompt}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" className="text-xs"
                  onClick={() => navigator.clipboard.writeText(result!.prompt)}>
                  Copy to clipboard
                </Button>
                <Button
                  size="sm"
                  className="bg-[#C87560] hover:bg-[#A85E4E] text-white text-xs"
                  onClick={() => generateImage.mutate(result!.prompt)}
                  disabled={generateImage.isPending}
                >
                  {generateImage.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Generating image (up to 30s)…</>
                    : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Generate image</>}
                </Button>
              </div>
            </CardContent>
          </Card>
          {result.reasoning && (
            <p className="text-xs text-muted-foreground italic">{result.reasoning}</p>
          )}
          {result.qaChecklist && result.qaChecklist.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">QA checklist (vs. reference)</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {result.qaChecklist.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Generated image preview + save ──────────────────────────────────── */}
      {previewImage && !generateImage.isPending && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Image className="w-4 h-4" />Generated sticker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="bg-muted/40 rounded-lg border border-border p-4 shrink-0">
                <img src={previewImage} alt="Generated sticker" className="w-32 h-32 object-contain drop-shadow-md" />
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <p className="text-xs text-muted-foreground">Background removed. Give it a name to save as a draft sticker.</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sticker name</Label>
                  <Input
                    placeholder="e.g. Autumn reading nook"
                    value={stickerName}
                    onChange={(e) => setStickerName(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <Button variant="outline" size="sm"
                onClick={() => result && generateImage.mutate(result.prompt)}
                disabled={generateImage.isPending || !result}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Regenerate
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
                onClick={() => saveSticker.mutate()}
                disabled={!stickerName.trim() || saveSticker.isPending}
              >
                {saveSticker.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                  : <><Save className="w-3.5 h-3.5 mr-1.5" />Save as draft</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MODE B — ASSEMBLE A PACK
// ═════════════════════════════════════════════════════════════════════════════

function AssembleMode({ storeId, role, aiEnabled }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = mayPublish(role);

  const [prompt, setPrompt] = useState(() => {
    const idea = sessionStorage.getItem(`studioIdea:${storeId}`) ?? "";
    if (idea) sessionStorage.removeItem(`studioIdea:${storeId}`);
    return idea;
  });
  const [aiMeta, setAiMeta] = useState<{ model: string; provider: string } | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [price, setPrice] = useState("4.99");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Attestation
  const [attestation, setAttestation] = useState<"own-or-licensed" | "ai-generated" | "">("");
  const [attestingTool, setAttestingTool] = useState("");
  const priceError = getPackPriceError(price);
  const parsedPrice = parsePackPrice(price);

  const generate = useMutation({
    mutationFn: () => studioGenerateApi.generatePack(storeId, { prompt: prompt.trim() }),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      setName(res.name ?? "");
      setTags(Array.isArray(res.tags) ? res.tags.slice(0, 4) : []);
      setIdeas(Array.isArray(res.ideas) ? res.ideas.slice(0, 4) : []);
    },
    onError: (err: Error) => setParseError(err.message),
  });

  const save = useMutation({
    mutationFn: (status: "draft" | "live") => {
      const body: Record<string, unknown> = { name, tags, price: parsedPrice, status };
      if (attestation) { body.attestation = attestation; if (attestingTool) body.attestingTool = attestingTool; }
      return savedId
        ? apiFetch(`/stores/${storeId}/owned/sticker-packs/${savedId}`, { method: "PATCH", body: JSON.stringify(body) })
        : apiFetch(`/stores/${storeId}/owned/sticker-packs`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (data: { id: string }, status) => {
      if (!savedId) setSavedId(data.id);
      qc.invalidateQueries({ queryKey: ["store-catalog", storeId] });
      toast({
        title: status === "live" ? "Pack published!" : savedId ? "Draft updated" : "Saved as draft",
        description: `"${name}" is now part of your store's catalog.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const canSave = !!name && !priceError;
  const canPublish = isOwner && !!attestation && !priceError;

  return (
    <div className="space-y-0 max-w-3xl mx-auto">
      <ClaudeHeader
        title="Assemble a Pack"
        description="Describe a sticker pack concept — Claude names it, suggests tags, and brainstorms sticker ideas. Attest IP rights before publishing."
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        Packs created here belong exclusively to your store.
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pack-prompt">Describe the sticker pack concept</Label>
            <Textarea
              id="pack-prompt" rows={3}
              placeholder={"e.g. \"A self-care pack for college students — cosy vibes, affirmations, study motivation\""}
              value={prompt} onChange={(e) => setPrompt(e.target.value)} className="resize-none font-sans"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate(); }}
            />
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending || !prompt.trim()}
            className="bg-[#C87560] hover:bg-[#A85E4E] text-white">
            {generate.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claude is thinking…</>
              : <><Sticker className="w-4 h-4 mr-2" />Generate pack spec</>}
          </Button>
        </CardContent>
      </Card>

      {parseError && !generate.isPending && (
        <div className="mb-6"><ErrorState message={parseError} onRetry={() => generate.mutate()} /></div>
      )}

      {(name || tags.length > 0) && !generate.isPending && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2"><Label>Pack name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="px-3 py-1 gap-1.5 cursor-pointer"
                      onClick={() => setTags(tags.filter((_, j) => j !== i))}>
                      {tag}<X className="w-3 h-3" />
                    </Badge>
                  ))}
                </div>
              </div>
              {ideas.length > 0 && (
                <div className="space-y-2">
                  <Label>Sticker ideas</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ideas.map((idea, i) => (
                      <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed">
                        <span className="font-mono text-[10px] text-muted-foreground mr-2">#{i + 1}</span>{idea}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2 max-w-[160px]">
                <Label>Price (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input type="number" min="0.01" step="0.01" value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className={`pl-6 ${priceError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    aria-invalid={!!priceError}
                    aria-describedby={priceError ? "store-pack-price-error" : undefined} />
                </div>
                {priceError && <p id="store-pack-price-error" className="text-xs text-destructive">{priceError}</p>}
              </div>
            </CardContent>
          </Card>

          {/* ── Attestation ────────────────────────────────────────────── */}
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                Intellectual Property Attestation
              </CardTitle>
              <p className="text-xs text-muted-foreground">Required before publishing. Confirms the sticker art meets Daybook's IP policy.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {[
                  { value: "own-or-licensed", label: "I own or hold a commercial licence for all artwork in this pack" },
                  { value: "ai-generated", label: "This pack contains AI-generated artwork" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={attestation === opt.value}
                      onCheckedChange={() => setAttestation(attestation === opt.value ? "" : opt.value as typeof attestation)}
                      className="mt-0.5"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              {attestation === "ai-generated" && (
                <div className="space-y-1.5 pl-6">
                  <Label className="text-xs">AI tool used</Label>
                  <Input placeholder="e.g. Midjourney v6, DALL·E 3, Firefly…" value={attestingTool}
                    onChange={(e) => setAttestingTool(e.target.value)} className="h-8 text-sm" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" />Regenerate
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => save.mutate("draft")}
              disabled={!canSave || save.isPending}
              title={priceError ?? (!name ? "Add a pack name before saving." : undefined)}>
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              {savedId ? "Update draft" : "Save as draft"}
            </Button>
            {isOwner ? (
              <Button size="sm" className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
                onClick={() => save.mutate("live")}
                disabled={!canSave || !canPublish || save.isPending}
                title={priceError ?? (!attestation ? "Select an attestation to publish" : undefined)}>
                {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Globe className="w-3.5 h-3.5 mr-2" />}
                Publish
              </Button>
            ) : (
              <Button size="sm" disabled className="opacity-50">
                <Lock className="w-3.5 h-3.5 mr-2" />Publish (owner only)
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT — StoreStudioPage
// ═════════════════════════════════════════════════════════════════════════════

export default function StoreStudioPage({ storeId, role, aiEnabled }: Props) {
  const [mode, setMode] = useQueryParam("mode", "create") as [Mode, (m: Mode) => void];
  const [createTab, setCreateTab] = useState<CreateTab>("upload");

  return (
    <div className="animate-in fade-in duration-300">
      <ModeBar mode={mode} setMode={(m) => setMode(m)} />

      {mode === "create" ? (
        <div className="max-w-3xl">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">Create Stickers</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload photos to process through the pipeline, generate clean SVG shapes with Claude, render text label sets, or write image-generation prompts.
            </p>
          </div>

          <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as CreateTab)}>
            <div className="overflow-x-auto mb-6" style={{ scrollbarWidth: "none" }}>
            <TabsList>
              <TabsTrigger value="upload" className="gap-1.5"><Upload className="w-3.5 h-3.5" />Upload</TabsTrigger>
              <TabsTrigger value="functional" className="gap-1.5"><Wand2 className="w-3.5 h-3.5" />Functional SVG</TabsTrigger>
              <TabsTrigger value="textset" className="gap-1.5"><Type className="w-3.5 h-3.5" />Text Set</TabsTrigger>
              <TabsTrigger value="prompt" className="gap-1.5"><Lightbulb className="w-3.5 h-3.5" />Illustrative Art</TabsTrigger>
            </TabsList>
            </div>

            <TabsContent value="upload">
              <UploadTab storeId={storeId} />
            </TabsContent>
            <TabsContent value="functional">
              <FunctionalTab storeId={storeId} aiEnabled={aiEnabled} isSuperAdmin={isSuperAdminRole(role)} />
            </TabsContent>
            <TabsContent value="textset">
              <TextSetTab storeId={storeId} />
            </TabsContent>
            <TabsContent value="prompt">
              <IllustrativeTab storeId={storeId} aiEnabled={aiEnabled} isSuperAdmin={isSuperAdminRole(role)} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <AssembleMode storeId={storeId} role={role} aiEnabled={aiEnabled} />
      )}
    </div>
  );
}
