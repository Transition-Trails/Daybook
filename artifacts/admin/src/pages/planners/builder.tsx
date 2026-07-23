/**
 * Planner Builder — Phase 1 (new planners only)
 * Two-panel layout: config on left, live PDF preview on right.
 * Preview debounces 500 ms after any config change and calls
 * POST /api/planners/preview (same PDF engine, subset of pages, no Drive save).
 * The "Generate & Save" button calls POST /api/planners (full render, saves to Drive).
 */
import { useState, useEffect, useRef } from 'react';
import {
  useListEditions, useListThemes, useListStickerPacks, useListInserts,
  type Edition, type Theme, type StickerPack, type Insert,
} from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, CheckCircle2, AlertCircle, Wand2, Eye, PenLine } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

type CalMode = 'none' | 'overlay' | 'link';

interface GenerateResult {
  id: string;
  drive: { pdfFileId: string; configFileId: string };
  pageCount: number;
}

// Build the request body from current form state
function buildBody(params: {
  editionId: string; startYear: number; startMonth: number; monthCount: number;
  weekStart: 'sun'|'mon'; orientation: 'landscape'|'vertical';
  themeId: string; selectedPacks: string[]; selectedInserts: string[];
  calMode: CalMode; aiInPdf: boolean;
}) {
  return {
    editionId: params.editionId || undefined,
    year: params.startYear,
    setup: {
      weekStart: params.weekStart,
      orientation: params.orientation,
      startMonth: params.startMonth,
      startYear: params.startYear,
      monthCount: params.monthCount,
    },
    style: {
      themeId: params.themeId || undefined,
      packs: params.selectedPacks,
      inserts: params.selectedInserts,
    },
    output: { calMode: params.calMode, eventMins: 60, aiInPdf: params.aiInPdf },
  };
}

export default function PlannerBuilder() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Catalog data
  const { data: allEditions = [] } = useListEditions();
  const { data: allThemes = [] }   = useListThemes();
  const { data: allPacks = [] }    = useListStickerPacks();
  const { data: allInserts = [] }  = useListInserts();

  // Form state
  const [editionId, setEditionId]     = useState('');
  const [startYear, setStartYear]     = useState(new Date().getFullYear());
  const [startMonth, setStartMonth]   = useState(0);
  const [monthCount, setMonthCount]   = useState(12);
  const [weekStart, setWeekStart]     = useState<'sun'|'mon'>('mon');
  const [orientation, setOrientation] = useState<'landscape'|'vertical'>('vertical');
  const [themeId, setThemeId]         = useState('');
  const [selectedPacks, setSelectedPacks]     = useState<string[]>([]);
  const [selectedInserts, setSelectedInserts] = useState<string[]>([]);
  const [calMode, setCalMode]   = useState<CalMode>('none');
  const [aiInPdf, setAiInPdf]   = useState(false);

  // Preview state
  const [previewUrl, setPreviewUrl]       = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPages, setPreviewPages]   = useState<number | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  // Generate (full save) state
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult]             = useState<GenerateResult | null>(null);
  const [genError, setGenError]         = useState('');

  // Derived catalog items for the selected edition
  const selectedEdition = (allEditions as Edition[]).find(e => e.id === editionId);
  const editionThemes  = selectedEdition
    ? (allThemes as Theme[]).filter(t => (selectedEdition.themes as string[])?.includes(t.id))
    : [];
  const editionPacks   = selectedEdition
    ? (allPacks as StickerPack[]).filter(p => {
        const pl = p.planners as string[];
        return pl?.includes('all') || pl?.includes(editionId);
      })
    : [];
  const editionInserts = selectedEdition
    ? (allInserts as Insert[]).filter(i => {
        const pl = i.planners as string[];
        return pl?.includes('all') || pl?.includes(editionId);
      })
    : [];

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const YEARS  = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i);

  function toggleMulti(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }

  // ── Live Preview — debounced 500 ms ──────────────────────────────────────────
  useEffect(() => {
    if (!editionId) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        prevUrlRef.current = null;
      }
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const body = buildBody({
          editionId, startYear, startMonth, monthCount, weekStart, orientation,
          themeId, selectedPacks, selectedInserts, calMode, aiInPdf,
        });
        const res = await fetch('/api/planners/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
        const pages = parseInt(res.headers.get('x-preview-pages') ?? '0', 10);
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        // Revoke previous blob URL after creating the new one
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        setPreviewUrl(url);
        if (pages > 0) setPreviewPages(pages);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Silently suppress preview errors — don't block the user
      } finally {
        setPreviewLoading(false);
      }
    }, 500);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [editionId, startYear, startMonth, monthCount, weekStart, orientation,
      themeId, selectedPacks, selectedInserts, calMode, aiInPdf]);

  // Cleanup blob URL on unmount
  useEffect(() => () => { if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current); }, []);

  // ── Full Generate & Save ──────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!editionId) { toast({ title: 'Select an edition first', variant: 'destructive' }); return; }
    setIsGenerating(true);
    setResult(null);
    setGenError('');
    try {
      const res = await customFetch<GenerateResult>('/api/planners', {
        method: 'POST',
        body: JSON.stringify(buildBody({
          editionId, startYear, startMonth, monthCount, weekStart, orientation,
          themeId, selectedPacks, selectedInserts, calMode, aiInPdf,
        })),
      });
      setResult(res);
      toast({ title: `Planner saved — ${res.pageCount} pages` });
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? 'Generation failed';
      setGenError(msg);
      toast({ title: 'Generation failed', description: msg, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Planner Builder</h1>
        <p className="text-muted-foreground mt-1">Configure a new planner — the preview updates live as you adjust settings.</p>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6 items-start">

        {/* ── LEFT: Config panels ───────────────────────────────────────────── */}
        <div className="w-[400px] shrink-0 space-y-4">

          {/* Step 1 — Edition */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1 · Edition</CardTitle>
              <CardDescription>Choose the planner edition to build from.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={editionId}
                onValueChange={v => { setEditionId(v); setThemeId(''); setSelectedPacks([]); setSelectedInserts([]); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select edition…" />
                </SelectTrigger>
                <SelectContent>
                  {(allEditions as Edition[]).filter(e => e.status === 'live').map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      <span>{e.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">{e.tier}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Step 2 — Setup */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2 · Date &amp; Layout</CardTitle>
              <CardDescription>Locked after generation.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Year</Label>
                <Select value={String(startYear)} onValueChange={v => setStartYear(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start Month</Label>
                <Select value={String(startMonth)} onValueChange={v => setStartMonth(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Duration</Label>
                <Select value={String(monthCount)} onValueChange={v => setMonthCount(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{[1,3,6,9,12,18,24].map(n => <SelectItem key={n} value={String(n)}>{n} months</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Week Starts</Label>
                <Select value={weekStart} onValueChange={v => setWeekStart(v as 'sun'|'mon')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mon">Monday</SelectItem>
                    <SelectItem value="sun">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Orientation</Label>
                <Select value={orientation} onValueChange={v => setOrientation(v as 'landscape'|'vertical')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertical">Vertical (portrait)</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Step 3 — Style */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3 · Style</CardTitle>
              <CardDescription>Theme and add-ons for the selected edition.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Theme</Label>
                {editionThemes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Select an edition above.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {editionThemes.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setThemeId(themeId === t.id ? '' : t.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all ${themeId === t.id ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50'}`}
                      >
                        <span className="flex gap-0.5">
                          {(t.colors as string[] || []).slice(0, 3).map((c, i) => (
                            <span key={i} className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c }} />
                          ))}
                        </span>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {editionPacks.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Sticker Packs</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {editionPacks.map(p => (
                      <button
                        key={p.id}
                        onClick={() => toggleMulti(p.id, selectedPacks, setSelectedPacks)}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-all ${selectedPacks.includes(p.id) ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50'}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editionInserts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Inserts</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {editionInserts.map(ins => (
                      <button
                        key={ins.id}
                        onClick={() => toggleMulti(ins.id, selectedInserts, setSelectedInserts)}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-all ${selectedInserts.includes(ins.id) ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50'}`}
                      >
                        {ins.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 4 — Output */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">4 · Output Options</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Calendar Links</Label>
                <Select value={calMode} onValueChange={v => setCalMode(v as CalMode)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="link">Deep-link</SelectItem>
                    <SelectItem value="overlay">Overlay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">AI Blocks</Label>
                <Select value={aiInPdf ? 'yes' : 'no'} onValueChange={v => setAiInPdf(v === 'yes')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Disabled</SelectItem>
                    <SelectItem value="yes">Include</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="border-t bg-muted/20 px-4 py-3 flex flex-col gap-2">
              <div className="w-full text-xs text-muted-foreground">
                {selectedEdition
                  ? `${selectedEdition.name} · ${monthCount} months from ${MONTHS[startMonth]} ${startYear}`
                  : 'Select an edition to continue'}
              </div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !editionId}
                className="w-full"
              >
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                  : <><Wand2 className="w-4 h-4 mr-2" />Generate &amp; Save to Drive</>}
              </Button>
            </CardFooter>
          </Card>

          {/* Result / Error */}
          {result && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="pt-4 pb-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Saved — {result.pageCount} pages
                  </p>
                  <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                    <div>ID: {result.id}</div>
                    <div>PDF: {result.drive.pdfFileId}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 gap-2 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => navigate(`/planners/${result.id}/ink`)}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    Open in Ink ✦
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {genError && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="pt-4 pb-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Generation failed</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{genError}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── RIGHT: Live preview panel ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0 sticky top-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
              <Eye className="w-4 h-4 text-primary" />
              Live Preview
              {previewPages !== null && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {previewPages} sample pages
                </Badge>
              )}
            </div>
            {previewLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Rendering…
              </span>
            )}
          </div>

          {/* Preview frame */}
          <div
            className="relative rounded-lg border bg-muted/20 overflow-hidden"
            style={{ height: 'calc(100vh - 12rem)', minHeight: '500px' }}
          >
            {/* Placeholder when no edition selected */}
            {!previewUrl && !previewLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-20 rounded border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
                  <FileText className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground/60">
                  {editionId ? 'Generating preview…' : 'Select an edition to see a live preview'}
                </p>
              </div>
            )}

            {/* Loading shimmer overlay — shown over existing preview while re-rendering */}
            {previewLoading && previewUrl && (
              <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex items-center justify-center z-10 pointer-events-none">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Rendering…</span>
                </div>
              </div>
            )}

            {/* PDF iframe */}
            {previewUrl && (
              <iframe
                key={previewUrl}
                src={previewUrl}
                className="w-full h-full border-0"
                title="Planner Preview"
              />
            )}
          </div>

          <p className="text-xs text-muted-foreground/50 mt-1.5 text-center">
            Preview shows ~{previewPages ?? '8–9'} representative pages · final planner renders all {monthCount * 30}+ pages
          </p>
        </div>
      </div>
    </div>
  );
}
