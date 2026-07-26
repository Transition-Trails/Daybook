/**
 * Planner Studio — six-mode shell for store admins to build, style, and
 * export store-owned planner PDFs.
 *
 * Modes:
 *  1. Build a planner   — setup (dating mode, dates, orientation, weekStart)
 *  2. Editions          — link an edition to the planner
 *  3. Inserts & widgets — browse + AI-generate inserts and widgets
 *  4. Cover             — cover type, title, texture
 *  5. Dividers & tabs   — tab shape, position, sections
 *  6. Paper & binding   — paper colour, size, render style, binding hardware
 *
 * Right dock: AI Assistant | Live Preview (gated on aiEnabled)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import HotspotEditor from "./HotspotEditor";

/**
 * Client-side SVG sanitizer: strips script tags, event handlers, foreignObject,
 * and javascript: URIs from AI-generated SVG before rendering.
 * Defence-in-depth alongside server-side sanitisation.
 */
function sanitizeSvg(svgString: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    // Abort on parse error
    if (doc.querySelector("parsererror")) return "";

    // Remove dangerous elements
    const DANGEROUS_TAGS = ["script", "foreignObject", "iframe", "object", "embed"];
    DANGEROUS_TAGS.forEach((tag) => {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    });

    // Strip event handlers and javascript: URIs from every element
    doc.querySelectorAll("*").forEach((el) => {
      const toRemove: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        if (
          attr.name.toLowerCase().startsWith("on") ||
          attr.value.toLowerCase().includes("javascript:")
        ) {
          toRemove.push(attr.name);
        }
      }
      toRemove.forEach((name) => el.removeAttribute(name));
    });

    return doc.documentElement.outerHTML;
  } catch {
    return "";
  }
}
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  BookOpen,
  Layout,
  Layers,
  FileText,
  Printer,
  MapPin,
  Bot,
  Eye,
  Plus,
  RefreshCw,
  Download,
  Lock,
  Unlock,
  ChevronRight,
  Wand2,
  Sparkles,
  X as CloseIcon,
  PanelRight,
} from "lucide-react";
import { SuperAdminAiBanner } from "./AiDisabledState";
import {
  storePlannersApi,
  widgetsApi,
  studioGenerateApi,
  storeStudiosApi,
  type StorePlannerConfig,
  type StorePlannerSetup,
  type StorePlannerStyle,
  type StorePlannerOutput,
  type Widget,
} from "@/lib/api";

interface Props {
  storeId: string;
  role: string;
  aiEnabled: boolean;
}

type StudioMode = "build" | "editions" | "inserts" | "cover" | "dividers" | "paper" | "hotspots";
type DockTab = "ai" | "preview";

const MODES: { id: StudioMode; label: string; icon: React.ElementType; description: string }[] = [
  { id: "build",     label: "Build a planner",   icon: CalendarDays, description: "Dating mode, dates & orientation" },
  { id: "editions",  label: "Editions",           icon: BookOpen,     description: "Link an edition layout" },
  { id: "inserts",   label: "Inserts & widgets",  icon: Layers,       description: "AI-generated inserts and functional overlays" },
  { id: "cover",     label: "Cover",              icon: Layout,       description: "Cover art, title & texture" },
  { id: "dividers",  label: "Dividers & tabs",    icon: FileText,     description: "Tab shape, position & sections" },
  { id: "paper",     label: "Paper & binding",    icon: Printer,      description: "Colour, size & hardware finish" },
  { id: "hotspots",  label: "Hyperlink maps",     icon: MapPin,       description: "Define clickable zones that navigate readers between sections" },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Planner selector ───────────────────────────────────────────────────────────

function PlannerSelector({
  storeId,
  onSelect,
  onCreate,
}: {
  storeId: string;
  onSelect: (p: StorePlannerConfig) => void;
  onCreate: () => void;
}) {
  const { data: planners = [], isLoading } = useQuery({
    queryKey: ["store-planners", storeId],
    queryFn: () => storePlannersApi.list(storeId),
  });

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-12 gap-6">
      <div className="text-center max-w-sm">
        <CalendarDays className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold mb-2">Planner Studio</h2>
        <p className="text-sm text-muted-foreground">
          Build, style, and export store-branded digital planners. Each planner is a standalone PDF
          generated for your store.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="w-4 h-4 mr-2" /> New Planner
      </Button>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading planners…</p>
      ) : planners.length > 0 ? (
        <div className="w-full max-w-lg space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Your planners ({planners.length})
          </p>
          {planners.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium">
                  {p.setup.datingMode === "dated" ? `${p.setup.startYear} Planner` : `${p.setup.datingMode ?? "Dated"} Planner`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.setup.orientation} · {p.setup.weekStart === "mon" ? "Mon" : "Sun"} start ·{" "}
                  {p.generatedAt ? (
                    <span className="text-green-600">Generated</span>
                  ) : (
                    <span className="text-amber-600">Not generated</span>
                  )}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Setup form (for "New Planner" creation) ────────────────────────────────────

function NewPlannerForm({
  storeId,
  onCreated,
  onCancel,
}: {
  storeId: string;
  onCreated: (p: StorePlannerConfig) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<StorePlannerSetup>({
    datingMode: "dated",
    weekStart: "mon",
    orientation: "vertical",
    startMonth: new Date().getMonth(),
    startYear: new Date().getFullYear() + 1,
    monthCount: 13,
  });

  const createMutation = useMutation({
    mutationFn: (s: StorePlannerSetup) => storePlannersApi.create(storeId, { setup: s }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, result.id);
      toast({ title: "Planner created", description: `${result.pageCount} pages generated.` });
      onCreated(full);
    },
    onError: (err: Error) => {
      toast({ title: "Creation failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-12">
      <div className="w-full max-w-md space-y-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">New Planner</h2>
          <p className="text-sm text-muted-foreground">Setup fields are locked after first generation.</p>
        </div>

        {/* Dating mode */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Dating mode</label>
          <Select value={setup.datingMode ?? "dated"} onValueChange={(v) => setSetup((s) => ({ ...s, datingMode: v as StorePlannerSetup["datingMode"] }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dated">Dated — calendar links enabled</SelectItem>
              <SelectItem value="undated">Undated — no date links, fill-in boxes</SelectItem>
              <SelectItem value="perpetual">Perpetual — reusable year-round</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Orientation */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Orientation</label>
          <Select value={setup.orientation} onValueChange={(v) => setSetup((s) => ({ ...s, orientation: v as "landscape" | "vertical" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">Vertical (portrait)</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Week start */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Week starts</label>
          <Select value={setup.weekStart} onValueChange={(v) => setSetup((s) => ({ ...s, weekStart: v as "sun" | "mon" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mon">Monday</SelectItem>
              <SelectItem value="sun">Sunday</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {setup.datingMode === "dated" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start month</label>
                <Select value={String(setup.startMonth)} onValueChange={(v) => setSetup((s) => ({ ...s, startMonth: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start year</label>
                <Input
                  type="number"
                  min={2025}
                  max={2035}
                  value={setup.startYear}
                  onChange={(e) => setSetup((s) => ({ ...s, startYear: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Month count</label>
              <Select value={String(setup.monthCount)} onValueChange={(v) => setSetup((s) => ({ ...s, monthCount: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[6, 12, 13, 14, 18, 24].map((n) => <SelectItem key={n} value={String(n)}>{n} months</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button
            className="flex-1"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate(setup)}
          >
            {createMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
            ) : (
              <><CalendarDays className="w-4 h-4 mr-2" /> Create & Generate</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Build mode (setup summary + re-export) ────────────────────────────────────

function BuildMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isLocked = !!planner.generatedAt;

  const reexportMutation = useMutation({
    mutationFn: () => storePlannersApi.reexport(storeId, planner.id, {}),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, result.id);
      onUpdated(full);
      toast({ title: "Re-exported", description: `${result.pageCount} pages · ${result.fileName}` });
    },
    onError: (err: Error) => toast({ title: "Re-export failed", description: err.message, variant: "destructive" }),
  });

  const setup = planner.setup;

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-lg font-semibold">Planner Setup</h2>
        {isLocked ? (
          <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Locked</Badge>
        ) : (
          <Badge variant="outline" className="gap-1"><Unlock className="w-3 h-3" /> Editable</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Dating mode</p>
          <p className="font-medium capitalize">{setup.datingMode ?? "dated"}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Orientation</p>
          <p className="font-medium capitalize">{setup.orientation}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Week start</p>
          <p className="font-medium">{setup.weekStart === "mon" ? "Monday" : "Sunday"}</p>
        </div>
        {setup.datingMode !== "undated" && setup.datingMode !== "perpetual" && (
          <>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Start</p>
              <p className="font-medium">{MONTHS[setup.startMonth]} {setup.startYear}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Month count</p>
              <p className="font-medium">{setup.monthCount} months</p>
            </div>
          </>
        )}
      </div>

      {isLocked && (
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <Lock className="w-4 h-4 inline mr-2" />
          Setup fields are locked after first generation. Use <strong>Re-export</strong> to regenerate with updated style settings from other tabs.
        </div>
      )}

      {planner.drive.pdfFileId && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => reexportMutation.mutate()}
            disabled={reexportMutation.isPending}
          >
            {reexportMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Re-exporting…</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" /> Re-export PDF</>
            )}
          </Button>
        </div>
      )}

      {!planner.drive.pdfFileId && (
        <p className="text-sm text-amber-600">No PDF generated yet. Create the planner to generate the first export.</p>
      )}
    </div>
  );
}

// ── Editions mode ──────────────────────────────────────────────────────────────

function EditionsMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { data: owned } = useQuery({
    queryKey: ["store-owned", storeId],
    queryFn: () => storeStudiosApi.list(storeId),
  });
  const { toast } = useToast();
  const qc = useQueryClient();
  const editions = (owned as { editions?: { id: string; name: string; status: string }[] })?.editions ?? [];

  const patchMutation = useMutation({
    mutationFn: (editionId: string | null) =>
      storePlannersApi.patch(storeId, planner.id, { editionId }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, planner.id);
      onUpdated(full);
      toast({ title: "Edition linked" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Edition</h2>
        <p className="text-sm text-muted-foreground">Link an edition to define the page layout, sections, and included packs.</p>
      </div>

      {planner.editionId ? (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {editions.find((e) => e.id === planner.editionId)?.name ?? planner.editionId}
          </span>
          <Badge variant="secondary" className="ml-auto">Linked</Badge>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No edition linked. Select one below.</p>
      )}

      <div className="space-y-2">
        {editions.map((ed) => (
          <button
            key={ed.id}
            onClick={() => patchMutation.mutate(ed.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
              planner.editionId === ed.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{ed.name}</p>
              <p className="text-xs text-muted-foreground">{ed.status}</p>
            </div>
            {planner.editionId === ed.id && (
              <Badge className="ml-auto shrink-0">Selected</Badge>
            )}
          </button>
        ))}
        {editions.length === 0 && (
          <p className="text-sm text-muted-foreground">No editions found. Create one in Edition Studio first.</p>
        )}
      </div>
    </div>
  );
}

// ── Inserts & Widgets mode ─────────────────────────────────────────────────────

function InsertsMode({ storeId, aiEnabled, isSuperAdmin }: { storeId: string; aiEnabled: boolean; isSuperAdmin?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [generateType, setGenerateType] = useState<"insert" | "widget">("insert");
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [sizeVariant, setSizeVariant] = useState<"7-day" | "30-day" | "month">("7-day");

  const { data: widgets = [] } = useQuery<Widget[]>({
    queryKey: ["widgets", storeId],
    queryFn: () => widgetsApi.list(storeId),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (generateType === "insert") {
        return studioGenerateApi.insert(storeId, { prompt: prompt.trim() });
      } else {
        return studioGenerateApi.widget(storeId, { prompt: prompt.trim(), sizeVariant });
      }
    },
    onSuccess: (result) => {
      setGeneratedSvg(result.svgData);
      toast({ title: "Generated successfully" });
    },
    onError: (err: Error) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const saveWidgetMutation = useMutation({
    mutationFn: () =>
      widgetsApi.create(storeId, {
        name: `Widget — ${new Date().toLocaleDateString()}`,
        sizeVariants: generateType === "widget" ? [sizeVariant] : [],
        svgData: generatedSvg ?? undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["widgets", storeId] });
      setGeneratedSvg(null);
      setPrompt("");
      toast({ title: "Widget saved" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Inserts & Widgets</h2>
        <p className="text-sm text-muted-foreground">AI-generate recolourable vector inserts and functional overlay widgets.</p>
      </div>

      {aiEnabled ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={generateType === "insert" ? "default" : "outline"}
              onClick={() => setGenerateType("insert")}
            >
              Insert page
            </Button>
            <Button
              size="sm"
              variant={generateType === "widget" ? "default" : "outline"}
              onClick={() => setGenerateType("widget")}
            >
              Functional widget
            </Button>
          </div>

          {generateType === "widget" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Size variant</label>
              <Select value={sizeVariant} onValueChange={(v) => setSizeVariant(v as typeof sizeVariant)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7-day">7-day tracker</SelectItem>
                  <SelectItem value="30-day">30-day habit grid</SelectItem>
                  <SelectItem value="month">Monthly overview</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Textarea
            placeholder={
              generateType === "insert"
                ? "Describe the insert page… e.g. 'A full-page reading log with sections for book title, author, rating, and notes'"
                : "Describe the widget… e.g. 'A mood tracker with 5 emoji options and a daily checkbox grid'"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />

          <div className="flex gap-2">
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!prompt.trim() || generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-2" /> Generate SVG</>
              )}
            </Button>
            {generatedSvg && (
              <Button variant="outline" onClick={() => saveWidgetMutation.mutate()} disabled={saveWidgetMutation.isPending}>
                Save widget
              </Button>
            )}
          </div>

          {generatedSvg && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <p className="text-xs font-medium mb-2 text-muted-foreground">SVG Preview</p>
              <div
                className="w-full overflow-auto rounded"
                style={{ maxHeight: "300px" }}
                // sanitizeSvg strips scripts, event handlers, foreignObject and javascript: URIs
                dangerouslySetInnerHTML={{ __html: sanitizeSvg(generatedSvg) }}
              />
            </div>
          )}
        </div>
      ) : isSuperAdmin ? (
        <SuperAdminAiBanner />
      ) : (
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <Sparkles className="w-4 h-4 inline mr-2" />
          AI generation requires the AI add-on. Enable it in store flags.
        </div>
      )}

      {/* Saved widgets */}
      {widgets.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saved widgets</p>
          {widgets.map((w) => (
            <div key={w.id} className="flex items-center gap-3 p-3 rounded-lg border">
              <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{w.name}</p>
                <p className="text-xs text-muted-foreground">{w.sizeVariants.join(", ") || "No variants"}</p>
              </div>
              <Badge variant={w.status === "live" ? "default" : "secondary"}>{w.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cover mode ────────────────────────────────────────────────────────────────

function CoverMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const style = planner.style;
  const [coverType, setCoverType] = useState<string>(style.coverType ?? "solid");
  const [coverTitle, setCoverTitle] = useState(style.coverTitle ?? "");
  const [coverSubtitle, setCoverSubtitle] = useState(style.coverSubtitle ?? "");

  const patchMutation = useMutation({
    mutationFn: () =>
      storePlannersApi.patch(storeId, planner.id, {
        style: { coverType: coverType as StorePlannerStyle["coverType"], coverTitle, coverSubtitle },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, planner.id);
      onUpdated(full);
      toast({ title: "Cover updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <h2 className="text-lg font-semibold">Cover</h2>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Cover type</label>
        <Select value={coverType} onValueChange={setCoverType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid colour</SelectItem>
            <SelectItem value="texture">Texture overlay</SelectItem>
            <SelectItem value="pattern">Pattern</SelectItem>
            <SelectItem value="photo">Photo / illustration</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Cover title</label>
        <Input value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} placeholder="e.g. My 2027 Planner" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Cover subtitle</label>
        <Input value={coverSubtitle} onChange={(e) => setCoverSubtitle(e.target.value)} placeholder="e.g. by Sage Studio" />
      </div>

      <Button onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending}>
        {patchMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save cover settings"}
      </Button>
    </div>
  );
}

// ── Dividers & tabs mode ──────────────────────────────────────────────────────

function DividersMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const style = planner.style;
  const [tabPos, setTabPos] = useState<string>(style.tabPos ?? "right");
  const [tabTheme, setTabTheme] = useState<string>(style.tabTheme ?? "accent");
  const [tabShape, setTabShape] = useState<string>(style.tabShape ?? "rounded");
  const [sections, setSections] = useState<string[]>(style.sections ?? []);
  const [newSection, setNewSection] = useState("");

  const patchMutation = useMutation({
    mutationFn: () =>
      storePlannersApi.patch(storeId, planner.id, {
        style: {
          tabPos: tabPos as StorePlannerStyle["tabPos"],
          tabTheme: tabTheme as StorePlannerStyle["tabTheme"],
          tabShape,
          sections,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, planner.id);
      onUpdated(full);
      toast({ title: "Dividers & tabs updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <h2 className="text-lg font-semibold">Dividers & Tabs</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tab position</label>
          <Select value={tabPos} onValueChange={setTabPos}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="right">Right edge</SelectItem>
              <SelectItem value="top">Top edge</SelectItem>
              <SelectItem value="bottom">Bottom edge</SelectItem>
              <SelectItem value="none">No tabs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tab colour</label>
          <Select value={tabTheme} onValueChange={setTabTheme}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accent">Accent</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Tab shape</label>
        <Select value={tabShape} onValueChange={setTabShape}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="rounded">Rounded</SelectItem>
            <SelectItem value="chevron">Chevron</SelectItem>
            <SelectItem value="square">Square</SelectItem>
            <SelectItem value="arch">Arch</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Custom sections <span className="text-muted-foreground font-normal">(up to 10)</span></label>
        <div className="flex gap-2">
          <Input
            placeholder="Section name"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSection.trim() && sections.length < 10) {
                setSections((s) => [...s, newSection.trim()]);
                setNewSection("");
              }
            }}
          />
          <Button
            size="icon"
            variant="outline"
            disabled={!newSection.trim() || sections.length >= 10}
            onClick={() => { setSections((s) => [...s, newSection.trim()]); setNewSection(""); }}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {sections.map((s, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
            <span className="text-muted-foreground w-5 text-xs">{i + 1}.</span>
            <span className="flex-1">{s}</span>
            <button className="text-muted-foreground hover:text-destructive text-xs" onClick={() => setSections((ss) => ss.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>

      <Button onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending}>
        {patchMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save divider settings"}
      </Button>
    </div>
  );
}

// ── Paper & Binding mode ──────────────────────────────────────────────────────

function PaperMode({ planner, storeId, onUpdated }: { planner: StorePlannerConfig; storeId: string; onUpdated: (p: StorePlannerConfig) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const style = planner.style;
  const [paperColour, setPaperColour] = useState<string>(style.paperColour ?? "white");
  const [size, setSize] = useState<string>(style.size ?? "A5");
  const [renderStyle, setRenderStyle] = useState<string>(style.renderStyle ?? "flat");
  const [bindingType, setBindingType] = useState<string>(style.binding?.type ?? "coil");
  const [bindingFinish, setBindingFinish] = useState<string>(style.binding?.finish ?? "gold");
  const [notePaper, setNotePaper] = useState<string>(style.notePaper ?? "dot");

  const patchMutation = useMutation({
    mutationFn: () =>
      storePlannersApi.patch(storeId, planner.id, {
        style: {
          paperColour: paperColour as StorePlannerStyle["paperColour"],
          size: size as StorePlannerStyle["size"],
          renderStyle: renderStyle as "realistic" | "flat",
          binding: {
            type: bindingType as "coil" | "twin-loop" | "discs" | "3-ring" | "none",
            finish: bindingFinish as "gold" | "rose gold" | "silver" | "matte black" | "white",
          },
          notePaper: notePaper as StorePlannerStyle["notePaper"],
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["store-planners", storeId] });
      const full = await storePlannersApi.get(storeId, planner.id);
      onUpdated(full);
      toast({ title: "Paper & binding updated" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <h2 className="text-lg font-semibold">Paper & Binding</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Paper colour</label>
          <Select value={paperColour} onValueChange={setPaperColour}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="cream">Cream</SelectItem>
              <SelectItem value="ivory">Ivory</SelectItem>
              <SelectItem value="kraft">Kraft ⚠️</SelectItem>
              <SelectItem value="slate">Slate ⚠️</SelectItem>
            </SelectContent>
          </Select>
          {(paperColour === "kraft" || paperColour === "slate") && (
            <p className="text-xs text-amber-600">⚠️ Low contrast — check text readability.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Page size</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["A5", "B6", "Personal", "Half letter", "Letter", "iPad 4:3"].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Render style</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "flat", label: "Flat", desc: "Clean, minimal — smaller file size" },
            { value: "realistic", label: "Realistic", desc: "Ring art, grain & gutter shading — larger file size" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRenderStyle(opt.value as string)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                renderStyle === opt.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Binding type</label>
          <Select value={bindingType} onValueChange={setBindingType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="coil">Coil</SelectItem>
              <SelectItem value="twin-loop">Twin loop</SelectItem>
              <SelectItem value="discs">Disc binding</SelectItem>
              <SelectItem value="3-ring">3-ring</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Binding finish</label>
          <Select value={bindingFinish} onValueChange={setBindingFinish}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="rose gold">Rose gold</SelectItem>
              <SelectItem value="silver">Silver</SelectItem>
              <SelectItem value="matte black">Matte black</SelectItem>
              <SelectItem value="white">White</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Note paper style</label>
        <Select value={notePaper} onValueChange={setNotePaper}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dot">Dot grid</SelectItem>
            <SelectItem value="graph">Graph</SelectItem>
            <SelectItem value="lined">Lined</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending}>
        {patchMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save paper & binding"}
      </Button>
    </div>
  );
}

// ── Right Dock: AI Assistant ───────────────────────────────────────────────────

function AiAssistant({ storeId, mode, planner }: { storeId: string; mode: StudioMode; planner: StorePlannerConfig }) {
  const { toast } = useToast();
  const [conversation, setConversation] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [userMsg, setUserMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const send = useCallback(async () => {
    if (!userMsg.trim() || isLoading) return;
    const msg = userMsg.trim();
    setUserMsg("");
    setConversation((c) => [...c, { role: "user", content: msg }]);
    setIsLoading(true);

    const context = `Studio mode: ${mode}. Planner setup: dating=${planner.setup.datingMode ?? "dated"}, orientation=${planner.setup.orientation}, weekStart=${planner.setup.weekStart}.`;

    try {
      const res = await fetch(`/api/stores/${storeId}/studios/planner/copilot`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-store-id": storeId },
        body: JSON.stringify({ message: msg, context, history: conversation.slice(-6) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { text?: string; content?: string };
      const reply = data.text ?? data.content ?? "No response.";
      setConversation((c) => [...c, { role: "assistant", content: reply }]);
    } catch (err) {
      toast({ title: "AI error", description: String(err), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [userMsg, isLoading, storeId, mode, planner, conversation, toast]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {conversation.length === 0 && (
          <div className="text-center text-sm text-muted-foreground pt-4">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Ask for styling suggestions, cover copy, or section ideas.
          </div>
        )}
        {conversation.map((msg, i) => (
          <div key={i} className={`text-sm rounded-lg p-2.5 ${msg.role === "user" ? "bg-primary text-primary-foreground ml-4" : "bg-muted mr-4"}`}>
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="bg-muted rounded-lg p-2.5 mr-4 text-sm text-muted-foreground animate-pulse">Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t flex gap-2">
        <Input
          value={userMsg}
          onChange={(e) => setUserMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about this planner…"
          className="text-sm"
        />
        <Button size="icon" onClick={send} disabled={!userMsg.trim() || isLoading}>
          <Bot className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Right Dock: Live Preview ───────────────────────────────────────────────────

function LivePreview({ planner }: { planner: StorePlannerConfig }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/planners/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setup: planner.setup,
          style: planner.style,
          output: planner.output,
          sections: planner.style.sections ?? [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "application/pdf" });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      toast({ title: "Preview failed", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [planner, previewUrl, toast]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Live Preview</p>
        <Button size="sm" variant="outline" onClick={loadPreview} disabled={loading}>
          {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        {previewUrl ? (
          <iframe src={`${previewUrl}#view=FitH`} className="w-full h-full border-0" title="PDF Preview" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground">
            <Eye className="w-8 h-8 mb-2 opacity-40" />
            <p>Click Refresh to generate a preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Planner Studio ────────────────────────────────────────────────────────

export default function PlannerStudio({ storeId, role, aiEnabled }: Props) {
  const [phase, setPhase] = useState<"select" | "create" | "studio">("select");
  const [activePlanner, setActivePlanner] = useState<StorePlannerConfig | null>(null);
  const [mode, setMode] = useState<StudioMode>("build");

  const handlePlannerCreated = (p: StorePlannerConfig) => {
    setActivePlanner(p);
    setPhase("studio");
    setMode("build");
  };

  const handlePlannerSelected = (p: StorePlannerConfig) => {
    setActivePlanner(p);
    setPhase("studio");
    setMode("build");
  };

  const handleUpdated = (p: StorePlannerConfig) => {
    setActivePlanner(p);
  };

  if (phase === "select") {
    return (
      <div className="flex flex-col h-full">
        <PlannerSelector
          storeId={storeId}
          onSelect={handlePlannerSelected}
          onCreate={() => setPhase("create")}
        />
      </div>
    );
  }

  if (phase === "create") {
    return (
      <div className="flex flex-col h-full">
        <NewPlannerForm
          storeId={storeId}
          onCreated={handlePlannerCreated}
          onCancel={() => setPhase("select")}
        />
      </div>
    );
  }

  if (!activePlanner) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mode tab bar */}
      <div className="border-b bg-background z-10">
        <div className="flex items-center px-4 gap-1 overflow-x-auto">
          <button
            className="text-xs text-muted-foreground hover:text-foreground p-2 shrink-0"
            onClick={() => { setPhase("select"); setActivePlanner(null); }}
          >
            ← Planners
          </button>
          <div className="w-px h-4 bg-border mx-1 shrink-0" />
          {/* Mode pills — flex-1 min-w-0 so they never push the dock toggle off screen */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-sm whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                      mode === m.id
                        ? "border-primary text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Center content — full width now that the right dock is removed */}
      <div className="flex-1 overflow-y-auto" style={{ minWidth: 0 }}>
        {mode === "build"     && <BuildMode    planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
        {mode === "editions"  && <EditionsMode planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
        {mode === "inserts"   && <InsertsMode  storeId={storeId} aiEnabled={aiEnabled} isSuperAdmin={role === "super_admin"} />}
        {mode === "cover"     && <CoverMode    planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
        {mode === "dividers"  && <DividersMode planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
        {mode === "paper"     && <PaperMode    planner={activePlanner} storeId={storeId} onUpdated={handleUpdated} />}
        {mode === "hotspots"  && <HotspotEditor storeId={storeId} />}
      </div>
    </div>
  );
}
