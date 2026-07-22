import { useState } from 'react';
import { useTrendResearch } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Search, TrendingUp, Palette, Target, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function TrendsResearch() {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState('');
  const [season, setSeason] = useState('');
  
  const research = useTrendResearch();
  
  const [results, setResults] = useState<any>(null);

  const handleSearch = () => {
    if (!query.trim()) return;
    research.mutate({ data: { query, audience, season } }, {
      onSuccess: (data) => {
        setResults(data);
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="text-center py-12 bg-indigo-950 text-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-100 rounded-2xl shadow-inner border border-indigo-900/20">
        <Lightbulb className="w-12 h-12 mx-auto mb-4 text-amber-400" />
        <h1 className="text-4xl font-display font-bold tracking-tight mb-2">Trend Research</h1>
        <p className="text-indigo-200 max-w-xl mx-auto">Use AI to discover emerging niches, color palettes, and structural needs for digital planners.</p>
      </div>

      <Card className="shadow-lg border-primary/20">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-3">
              <Label className="text-base font-semibold">What are you looking for?</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="e.g. Planners for neurodivergent students..." 
                  className="text-lg py-6"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Button size="lg" className="px-8 h-auto" onClick={handleSearch} disabled={research.isPending || !query.trim()}>
                  {research.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Target Audience (Optional)</Label>
              <Input placeholder="e.g. Freelancers, Moms" value={audience} onChange={e => setAudience(e.target.value)} />
            </div>
            
            <div className="space-y-2">
              <Label>Season / Context (Optional)</Label>
              <Input placeholder="e.g. Back to school 2024" value={season} onChange={e => setSeason(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {research.isPending && (
        <div className="py-24 text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground animate-pulse">Analyzing market trends and search data...</p>
        </div>
      )}

      {results && !research.isPending && (
        <div className="grid gap-6 md:grid-cols-2 animate-in slide-in-from-bottom-8 duration-700">
          {results.summary && (
            <Card className="md:col-span-2 bg-gradient-to-r from-muted/50 to-transparent">
              <CardContent className="p-6">
                <p className="text-lg leading-relaxed text-foreground/90">{results.summary}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" /> Key Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {results.trends?.map((trend: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                    <span className="text-muted-foreground">{trend}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-500" /> Marketing Angles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {results.marketingAngles?.map((angle: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                    <span className="text-muted-foreground">{angle}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-500" /> Suggested Themes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {results.suggestedThemes?.map((theme: string, i: number) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20">{theme}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-rose-500" /> Suggested Editions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {results.suggestedEditions?.map((edition: string, i: number) => (
                  <div key={i} className="p-3 bg-muted/50 rounded-md border text-sm text-foreground/80">
                    {edition}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}