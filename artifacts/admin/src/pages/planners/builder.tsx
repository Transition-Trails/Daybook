import { useState } from 'react';
import { useListEditions, useListThemes, useListStickerPacks, useListInserts, type Edition, type Theme, type StickerPack, type Insert } from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, CheckCircle2, AlertCircle, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type CalMode = 'none' | 'overlay' | 'link';

interface GenerateResult {
  id: string;
  drive: { pdfFileId: string; configFileId: string };
  pageCount: number;
}

export default function PlannerBuilder() {
  const { toast } = useToast();

  // Catalog data from API
  const { data: allEditions = [] } = useListEditions();
  const { data: allThemes = [] } = useListThemes();
  const { data: allPacks = [] } = useListStickerPacks();
  const { data: allInserts = [] } = useListInserts();

  // Edition selection
  const [editionId, setEditionId] = useState('');

  // Setup fields
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(0); // 0 = Jan
  const [monthCount, setMonthCount] = useState(12);
  const [weekStart, setWeekStart] = useState<'sun' | 'mon'>('mon');
  const [orientation, setOrientation] = useState<'landscape' | 'vertical'>('vertical');

  // Style fields
  const [themeId, setThemeId] = useState('');
  const [selectedPacks, setSelectedPacks] = useState<string[]>([]);
  const [selectedInserts, setSelectedInserts] = useState<string[]>([]);

  // Output fields
  const [calMode, setCalMode] = useState<CalMode>('none');
  const [aiInPdf, setAiInPdf] = useState(false);

  // Result
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState('');

  // Derive available items from the selected edition
  const selectedEdition = (allEditions as Edition[]).find(e => e.id === editionId);
  const editionThemes = selectedEdition
    ? (allThemes as Theme[]).filter(t => (selectedEdition.themes as string[])?.includes(t.id))
    : [];
  const editionPacks = selectedEdition
    ? (allPacks as StickerPack[]).filter(p => {
        const planners = p.planners as string[];
        return planners?.includes('all') || planners?.includes(editionId);
      })
    : [];
  const editionInserts = selectedEdition
    ? (allInserts as Insert[]).filter(i => {
        const planners = i.planners as string[];
        return planners?.includes('all') || planners?.includes(editionId);
      })
    : [];

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i);

  function toggleMulti(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }

  async function handleGenerate() {
    if (!editionId) { toast({ title: 'Select an edition first', variant: 'destructive' }); return; }

    setIsGenerating(true);
    setResult(null);
    setGenError('');

    try {
      const res = await customFetch<GenerateResult>('/api/planners', {
        method: 'POST',
        body: JSON.stringify({
          editionId,
          year: startYear,
          setup: { weekStart, orientation, startMonth, startYear, monthCount },
          style: {
            themeId: themeId || undefined,
            packs: selectedPacks,
            inserts: selectedInserts,
          },
          output: { calMode, eventMins: 60, aiInPdf },
        }),
      });
      setResult(res);
      toast({ title: `Planner generated — ${res.pageCount} pages` });
    } catch (err: any) {
      const msg = err?.data?.error ?? err?.message ?? 'Generation failed';
      setGenError(msg);
      toast({ title: 'Generation failed', description: msg, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Planner Builder</h1>
        <p className="text-muted-foreground mt-1">Configure and generate a personalised PDF planner.</p>
      </div>

      {/* Step 1 — Edition */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Edition</CardTitle>
          <CardDescription>Choose the planner edition to build from.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={editionId} onValueChange={v => { setEditionId(v); setThemeId(''); setSelectedPacks([]); setSelectedInserts([]); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select edition…" />
            </SelectTrigger>
            <SelectContent>
              {(allEditions as Edition[]).filter(e => e.status === 'live').map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                  <Badge variant="outline" className="ml-2 text-xs">{e.tier}</Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Step 2 — Setup */}
      <Card>
        <CardHeader>
          <CardTitle>2 · Setup</CardTitle>
          <CardDescription>Date range and layout options. These are locked after generation.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Start Year</Label>
            <Select value={String(startYear)} onValueChange={v => setStartYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start Month</Label>
            <Select value={String(startMonth)} onValueChange={v => setStartMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month Count</Label>
            <Select value={String(monthCount)} onValueChange={v => setMonthCount(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1,3,6,9,12,18,24].map(n => <SelectItem key={n} value={String(n)}>{n} months</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Week Starts</Label>
            <Select value={weekStart} onValueChange={v => setWeekStart(v as 'sun' | 'mon')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mon">Monday</SelectItem>
                <SelectItem value="sun">Sunday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Orientation</Label>
            <Select value={orientation} onValueChange={v => setOrientation(v as 'landscape' | 'vertical')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
        <CardHeader>
          <CardTitle>3 · Style</CardTitle>
          <CardDescription>Theme and add-ons available for the selected edition.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme */}
          <div className="space-y-3">
            <Label>Theme</Label>
            {editionThemes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Select an edition above to see available themes.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {editionThemes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(themeId === t.id ? '' : t.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all ${themeId === t.id ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50'}`}
                  >
                    <div className="flex gap-0.5">
                      {(t.colors as string[] || []).slice(0, 3).map((c, i) => (
                        <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Packs */}
          <div className="space-y-3">
            <Label>Sticker Packs</Label>
            {editionPacks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packs available for this edition.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {editionPacks.map(p => (
                  <button
                    key={p.id}
                    onClick={() => toggleMulti(p.id, selectedPacks, setSelectedPacks)}
                    className={`px-3 py-1.5 rounded-full border text-sm transition-all ${selectedPacks.includes(p.id) ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Inserts */}
          <div className="space-y-3">
            <Label>Inserts</Label>
            {editionInserts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inserts available for this edition.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {editionInserts.map(ins => (
                  <button
                    key={ins.id}
                    onClick={() => toggleMulti(ins.id, selectedInserts, setSelectedInserts)}
                    className={`px-3 py-1.5 rounded-full border text-sm transition-all ${selectedInserts.includes(ins.id) ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50'}`}
                  >
                    {ins.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 4 — Output */}
      <Card>
        <CardHeader>
          <CardTitle>4 · Output</CardTitle>
          <CardDescription>Calendar links and AI assistant options.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Calendar Links in PDF</Label>
            <Select value={calMode} onValueChange={v => setCalMode(v as CalMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="link">Deep-link (Google + Apple)</SelectItem>
                <SelectItem value="overlay">Overlay events on pages</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>AI Assistant Blocks</Label>
            <Select value={aiInPdf ? 'yes' : 'no'} onValueChange={v => setAiInPdf(v === 'yes')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Disabled</SelectItem>
                <SelectItem value="yes">Include AI assistant links</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="border-t bg-muted/20 px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedEdition ? (
              <span>{selectedEdition.name} · {monthCount} months from {MONTHS[startMonth]} {startYear}</span>
            ) : (
              <span>Select an edition to continue</span>
            )}
          </div>
          <Button onClick={handleGenerate} disabled={isGenerating || !editionId} className="min-w-32">
            {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</> : <><Wand2 className="w-4 h-4 mr-2" />Generate PDF</>}
          </Button>
        </CardFooter>
      </Card>

      {/* Result */}
      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-6 flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                Planner generated — {result.pageCount} pages
              </p>
              <div className="text-sm text-muted-foreground space-y-1 font-mono">
                <div>ID: {result.id}</div>
                <div>PDF: {result.drive.pdfFileId}</div>
                <div>Config: {result.drive.configFileId}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {genError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-destructive">Generation failed</p>
              <p className="text-sm text-muted-foreground mt-1">{genError}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
