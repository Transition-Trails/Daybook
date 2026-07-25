/**
 * Hotspot Editor — lets sellers define clickable hyperlink zones on planner
 * template pages (weekly, daily, month-calendar, etc.).
 *
 * Hotspots use stamp-once semantics: a map defined for "weekly" is applied to
 * every weekly spread in the exported PDF automatically.  Coordinates are
 * normalised 0-1 fractions of page width/height, so maps survive size changes.
 *
 * Flow:
 *  1. Select a template type.
 *  2. See / edit / draw hotspot rectangles on the scaled page canvas.
 *  3. Optionally upload a page-art image and click Auto-detect to let Claude
 *     Vision propose hotspots (requires server-side AI key).
 *  4. Review proposed hotspots, accept/reject, then Save.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  plannerHotspotsApi,
  type PlannerHotspot,
  type HotspotInput,
  type ProposedHotspot,
} from "@/lib/api";
import {
  Crosshair,
  Trash2,
  Wand2,
  Save,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const TEMPLATE_KEYS = [
  { key: "weekly",          label: "Weekly spread" },
  { key: "daily",           label: "Daily page" },
  { key: "month-calendar",  label: "Month calendar" },
  { key: "month-divider",   label: "Month divider" },
  { key: "cover",           label: "Cover" },
  { key: "home",            label: "Home / contents" },
  { key: "year",            label: "Year overview" },
  { key: "todo",            label: "To-do page" },
  { key: "notes",           label: "Notes" },
  { key: "section-divider", label: "Section divider" },
  { key: "note-paper",      label: "Note paper" },
];

const TARGET_TYPES = [
  { value: "home",           label: "Home / contents",   hasRef: false },
  { value: "cover",          label: "Cover",             hasRef: false },
  { value: "year",           label: "Year overview",     hasRef: false },
  { value: "todo",           label: "To-do",             hasRef: false },
  { value: "notes",          label: "Notes",             hasRef: false },
  { value: "next-day",       label: "Next daily →",      hasRef: false },
  { value: "prev-day",       label: "← Prev daily",     hasRef: false },
  { value: "next-week",      label: "Next weekly →",     hasRef: false },
  { value: "prev-week",      label: "← Prev weekly",    hasRef: false },
  { value: "next-month",     label: "Next month →",      hasRef: false },
  { value: "prev-month",     label: "← Prev month",     hasRef: false },
  { value: "month-for-day",  label: "Month (for this day)", hasRef: false },
  { value: "month-for-week", label: "Month (for this week)", hasRef: false },
  { value: "month-divider",  label: "Month divider (N)", hasRef: false },
  { value: "month-calendar", label: "Month calendar (N)", hasRef: false },
  { value: "section-n",      label: "Section N",         hasRef: true,  refLabel: "Section index (0-based)" },
  { value: "url",            label: "External URL",      hasRef: true,  refLabel: "https://…" },
];

// Page aspect ratio for the canvas preview (portrait A5 default)
const CANVAS_W = 280;
const CANVAS_H = 396;

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocalHotspot extends HotspotInput {
  localId: string;
  isProposed?: boolean;
  accepted?: boolean;
  confidence?: number;
}

function newLocal(partial: Partial<LocalHotspot> = {}): LocalHotspot {
  return {
    localId: Math.random().toString(36).slice(2),
    x: 0.1, y: 0.1, w: 0.2, h: 0.1,
    targetType: "home",
    targetRef: null,
    source: "manual",
    label: null,
    accepted: true,
    ...partial,
  };
}

function fromSaved(h: PlannerHotspot): LocalHotspot {
  return { localId: h.id, x: h.x, y: h.y, w: h.w, h: h.h, targetType: h.targetType, targetRef: h.targetRef, confidence: h.confidence ?? undefined, source: h.source, label: h.label, accepted: true };
}

function fromProposed(p: ProposedHotspot): LocalHotspot {
  return { ...p, localId: Math.random().toString(36).slice(2), isProposed: true, accepted: false };
}

// ── Colour for a hotspot based on state ───────────────────────────────────────

function hotspotColor(h: LocalHotspot, selected: boolean): string {
  if (!h.accepted && h.isProposed) return selected ? "rgba(234,179,8,0.85)" : "rgba(234,179,8,0.45)";
  return selected ? "rgba(59,130,246,0.85)" : "rgba(59,130,246,0.45)";
}

// ── Drawing state machine ──────────────────────────────────────────────────────

interface DrawState {
  active: boolean;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HotspotDetail({
  hotspot,
  onChange,
  onDelete,
}: {
  hotspot: LocalHotspot;
  onChange: (patch: Partial<LocalHotspot>) => void;
  onDelete: () => void;
}) {
  const meta = TARGET_TYPES.find((t) => t.value === hotspot.targetType);

  return (
    <div className="space-y-3 p-3 border rounded-md bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {hotspot.isProposed ? (
            <span className="text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Proposed
              {hotspot.confidence !== undefined && ` (${Math.round(hotspot.confidence * 100)}%)`}
            </span>
          ) : "Hotspot"}
        </span>
        <button onClick={onDelete} className="text-destructive hover:text-destructive/80">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Position / size (read-only summary) */}
      <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
        {(["x","y","w","h"] as const).map((f) => (
          <div key={f} className="bg-background border rounded px-1.5 py-0.5">
            <span className="font-mono">{f}={hotspot[f].toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Target type */}
      <div className="space-y-1">
        <Label className="text-xs">Navigate to</Label>
        <Select value={hotspot.targetType} onValueChange={(v) => onChange({ targetType: v, targetRef: null })}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ref field (only when needed) */}
      {meta?.hasRef && (
        <div className="space-y-1">
          <Label className="text-xs">{meta.refLabel ?? "Reference"}</Label>
          <Input
            className="h-7 text-xs"
            placeholder={meta.refLabel}
            value={hotspot.targetRef ?? ""}
            onChange={(e) => onChange({ targetRef: e.target.value || null })}
          />
        </div>
      )}

      {/* Label */}
      <div className="space-y-1">
        <Label className="text-xs">Label (optional tooltip)</Label>
        <Input
          className="h-7 text-xs"
          placeholder="e.g. Back to month"
          value={hotspot.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value || null })}
        />
      </div>

      {hotspot.isProposed && !hotspot.accepted && (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
          onClick={() => onChange({ accepted: true })}
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept this hotspot
        </Button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HotspotEditor({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [templateKey, setTemplateKey] = useState<string>("weekly");
  const [hotspots, setHotspots] = useState<LocalHotspot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draw, setDraw] = useState<DrawState>({ active: false, startX: 0, startY: 0, curX: 0, curY: 0 });
  const [drawMode, setDrawMode] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Remote state ──────────────────────────────────────────────────────────

  const { data: savedHotspots, isLoading } = useQuery({
    queryKey: ["hotspots", storeId, templateKey],
    queryFn: () => plannerHotspotsApi.get(storeId, templateKey),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (savedHotspots) {
      setHotspots(savedHotspots.map(fromSaved));
      setSelectedId(null);
      setDirty(false);
    }
  }, [savedHotspots]);

  const saveMutation = useMutation({
    mutationFn: (hs: HotspotInput[]) => plannerHotspotsApi.save(storeId, templateKey, hs),
    onSuccess: (data) => {
      toast({ title: `Saved ${data.count} hotspot${data.count !== 1 ? "s" : ""} for "${templateKey}"` });
      qc.invalidateQueries({ queryKey: ["hotspots", storeId] });
      setDirty(false);
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // ── Hotspot mutation helpers ───────────────────────────────────────────────

  const mutate = useCallback((fn: (prev: LocalHotspot[]) => LocalHotspot[]) => {
    setHotspots((p) => fn(p));
    setDirty(true);
  }, []);

  const updateOne = useCallback((localId: string, patch: Partial<LocalHotspot>) =>
    mutate((p) => p.map((h) => h.localId === localId ? { ...h, ...patch } : h)), [mutate]);

  const deleteOne = useCallback((localId: string) => {
    mutate((p) => p.filter((h) => h.localId !== localId));
    setSelectedId((id) => id === localId ? null : id);
  }, [mutate]);

  const addEmpty = () => {
    const h = newLocal();
    mutate((p) => [...p, h]);
    setSelectedId(h.localId);
  };

  // ── SVG canvas interaction ─────────────────────────────────────────────────

  const svgToNorm = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return [x, y];
  }, []);

  const onSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawMode) return;
    e.preventDefault();
    const [nx, ny] = svgToNorm(e.clientX, e.clientY);
    setDraw({ active: true, startX: nx, startY: ny, curX: nx, curY: ny });
  }, [drawMode, svgToNorm]);

  const onSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!draw.active) return;
    const [nx, ny] = svgToNorm(e.clientX, e.clientY);
    setDraw((d) => ({ ...d, curX: nx, curY: ny }));
  }, [draw.active, svgToNorm]);

  const onSvgMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!draw.active) return;
    const [nx, ny] = svgToNorm(e.clientX, e.clientY);
    const x = Math.min(draw.startX, nx);
    const y = Math.min(draw.startY, ny);
    const w = Math.abs(nx - draw.startX);
    const h = Math.abs(ny - draw.startY);
    setDraw({ active: false, startX: 0, startY: 0, curX: 0, curY: 0 });
    if (w < 0.01 || h < 0.01) return; // too small to be intentional
    const nh = newLocal({ x, y, w, h });
    mutate((p) => [...p, nh]);
    setSelectedId(nh.localId);
    setDrawMode(false);
  }, [draw, svgToNorm, mutate]);

  // ── Auto-detect ───────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setBgImage(dataUrl);
      const base64 = dataUrl.split(",")[1] ?? "";
      const mediaType = file.type || "image/png";
      setDetecting(true);
      try {
        const res = await plannerHotspotsApi.autoDetect(storeId, templateKey, base64, mediaType);
        const proposed = res.proposed.map(fromProposed);
        mutate((p) => [...p, ...proposed]);
        toast({ title: `Claude proposed ${proposed.length} hotspot${proposed.length !== 1 ? "s" : ""} — review and accept below` });
      } catch {
        toast({ title: "Auto-detect failed", description: "Check that your AI key is configured.", variant: "destructive" });
      } finally {
        setDetecting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const selected = hotspots.find((h) => h.localId === selectedId);
  const acceptedCount = hotspots.filter((h) => h.accepted !== false).length;
  const proposedCount = hotspots.filter((h) => h.isProposed && !h.accepted).length;

  const onSave = () => {
    const toSave = hotspots
      .filter((h) => h.accepted !== false)
      .map(({ localId: _id, isProposed: _p, accepted: _a, ...rest }) => rest as HotspotInput);
    saveMutation.mutate(toSave);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold">Hyperlink Maps</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Define clickable zones on planner pages that navigate readers to other sections.
          Maps are stamped automatically on every matching page in the exported PDF.
        </p>
      </div>

      {/* Template selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm shrink-0">Page template</Label>
        <Select value={templateKey} onValueChange={(k) => { setTemplateKey(k); setSelectedId(null); setDirty(false); }}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_KEYS.map((t) => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            {acceptedCount} hotspot{acceptedCount !== 1 ? "s" : ""}
            {proposedCount > 0 && ` · ${proposedCount} pending review`}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
        {/* Left: canvas */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant={drawMode ? "default" : "outline"}
              size="sm"
              onClick={() => setDrawMode((d) => !d)}
              className="h-7 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {drawMode ? "Drawing… (click-drag)" : "Draw hotspot"}
            </Button>
            <Button variant="outline" size="sm" onClick={addEmpty} className="h-7 text-xs">
              Add blank
            </Button>
          </div>

          {/* SVG canvas */}
          <div
            className="relative border rounded-md overflow-hidden bg-gray-50"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {bgImage && (
              <img src={bgImage} alt="page art" className="absolute inset-0 w-full h-full object-contain" />
            )}
            <svg
              ref={svgRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="absolute inset-0"
              style={{ cursor: drawMode ? "crosshair" : "default" }}
              onMouseDown={onSvgMouseDown}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
            >
              {/* Existing hotspots */}
              {hotspots.filter((h) => h.accepted !== false || h.isProposed).map((h) => {
                const rx = h.x * CANVAS_W;
                const ry = h.y * CANVAS_H;
                const rw = h.w * CANVAS_W;
                const rh = h.h * CANVAS_H;
                const isSel = h.localId === selectedId;
                return (
                  <g key={h.localId} onClick={(e) => { e.stopPropagation(); setSelectedId(isSel ? null : h.localId); }}>
                    <rect
                      x={rx} y={ry} width={rw} height={rh}
                      fill={hotspotColor(h, isSel)}
                      stroke={isSel ? "#1d4ed8" : h.isProposed && !h.accepted ? "#ca8a04" : "#3b82f6"}
                      strokeWidth={isSel ? 2 : 1}
                      rx={2}
                      style={{ cursor: "pointer" }}
                    />
                    {rw > 40 && rh > 16 && (
                      <text
                        x={rx + 4} y={ry + 12}
                        fontSize={9} fill={isSel ? "#fff" : "#1e3a8a"}
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {TARGET_TYPES.find((t) => t.value === h.targetType)?.label ?? h.targetType}
                      </text>
                    )}
                    {h.isProposed && !h.accepted && (
                      <text x={rx + rw - 3} y={ry + 11} fontSize={9} textAnchor="end" fill="#92400e" style={{ pointerEvents: "none" }}>
                        ?
                      </text>
                    )}
                  </g>
                );
              })}

              {/* In-progress draw rect */}
              {draw.active && (
                <rect
                  x={Math.min(draw.startX, draw.curX) * CANVAS_W}
                  y={Math.min(draw.startY, draw.curY) * CANVAS_H}
                  width={Math.abs(draw.curX - draw.startX) * CANVAS_W}
                  height={Math.abs(draw.curY - draw.startY) * CANVAS_H}
                  fill="rgba(59,130,246,0.25)"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  rx={2}
                  style={{ pointerEvents: "none" }}
                />
              )}
            </svg>
            {!bgImage && (
              <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
                <span className="text-[10px] text-muted-foreground/60">Page canvas (no art uploaded)</span>
              </div>
            )}
          </div>

          {/* Auto-detect */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              Upload your page art for AI hotspot suggestions
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => fileRef.current?.click()}
                disabled={detecting}
              >
                <Wand2 className="w-3.5 h-3.5" />
                {detecting ? "Detecting…" : bgImage ? "Re-detect" : "Upload & auto-detect"}
              </Button>
              {bgImage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setBgImage(null)}
                >
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Right: list + detail */}
        <div className="space-y-3 overflow-y-auto" style={{ maxHeight: CANVAS_H + 60 }}>
          {hotspots.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
              No hotspots yet.
              <br />
              <span className="text-xs">Draw on the canvas or click "Add blank".</span>
            </div>
          )}

          {hotspots.map((h) => (
            <div key={h.localId} onClick={() => setSelectedId(h.localId === selectedId ? null : h.localId)}>
              {h.localId === selectedId ? (
                <HotspotDetail
                  hotspot={h}
                  onChange={(patch) => updateOne(h.localId, patch)}
                  onDelete={() => deleteOne(h.localId)}
                />
              ) : (
                <div className={`flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/40 text-sm ${h.isProposed && !h.accepted ? "border-amber-300 bg-amber-50/40" : ""}`}>
                  <div className="flex items-center gap-2">
                    {h.isProposed && !h.accepted
                      ? <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      : <Crosshair className="w-3.5 h-3.5 text-blue-500" />}
                    <span className="text-xs">{TARGET_TYPES.find((t) => t.value === h.targetType)?.label ?? h.targetType}</span>
                    {h.confidence !== undefined && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {Math.round(h.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {h.isProposed && !h.accepted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => { e.stopPropagation(); updateOne(h.localId, { accepted: true }); }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); deleteOne(h.localId); }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <Button
          onClick={onSave}
          disabled={!dirty || saveMutation.isPending}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "Saving…" : `Save map (${acceptedCount} hotspot${acceptedCount !== 1 ? "s" : ""})`}
        </Button>
        {dirty && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
        {!dirty && !saveMutation.isPending && savedHotspots && savedHotspots.length > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Saved
          </span>
        )}
        <div className="ml-auto">
          <p className="text-xs text-muted-foreground">
            Maps are stamped on every <strong>{TEMPLATE_KEYS.find((t) => t.key === templateKey)?.label}</strong> page when you export.
          </p>
        </div>
      </div>
    </div>
  );
}
