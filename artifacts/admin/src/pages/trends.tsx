import { useAiChat } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, Lightbulb, Target, Palette } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const TREND_SYSTEM_PROMPT = `You are a market research expert for digital planner products. When given a niche or audience, analyze current trends and respond with a JSON object in this exact format:
{
  "summary": "2-3 sentence overview of the opportunity",
  "keyTrends": ["trend 1", "trend 2", "trend 3"],
  "marketingAngles": ["angle 1", "angle 2", "angle 3"],
  "suggestedThemes": ["theme concept 1", "theme concept 2", "theme concept 3"],
  "suggestedEditions": ["edition idea 1", "edition idea 2"]
}
Respond ONLY with the JSON object.`;

type TrendResults = {
  summary: string;
  keyTrends: string[];
  marketingAngles: string[];
  suggestedThemes: string[];
  suggestedEditions: string[];
};

export default function TrendsPage() {
  const { toast } = useToast();
  const aiChat = useAiChat();

  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState('');
  const [season, setSeason] = useState('');
  const [results, setResults] = useState<TrendResults | null>(null);
  const [rawResponse, setRawResponse] = useState('');

  const handleResearch = () => {
    if (!query.trim()) return;
    setResults(null);
    setRawResponse('');
    
    const userMessage = [
      `Niche/Topic: ${query}`,
      audience ? `Target Audience: ${audience}` : '',
      season ? `Season/Time: ${season}` : '',
    ].filter(Boolean).join('\n');

    aiChat.mutate({ 
      data: { 
        systemPrompt: TREND_SYSTEM_PROMPT, 
        messages: [{ role: 'user', content: userMessage }] 
      } 
    }, {
      onSuccess: (res) => {
        const text = res.text;
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text];
          const parsed = JSON.parse(jsonMatch[1] || text) as TrendResults;
          setResults(parsed);
        } catch {
          setRawResponse(text);
          toast({ title: 'Note', description: 'Response was not JSON, showing raw text.' });
        }
      },
      onError: (err: any) => {
        toast({ title: 'Research failed', description: err.message, variant: 'destructive' });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Trend Research</h1>
        <p className="text-muted-foreground mt-1">AI-powered market analysis for planner niches.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-500" />
            Research a Niche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3 space-y-2">
              <Label>Niche or Topic *</Label>
              <Input 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. ADHD productivity planners, student wellness, morning routine..."
                onKeyDown={e => e.key === 'Enter' && handleResearch()}
              />
            </div>
            <div className="space-y-2">
              <Label>Target Audience</Label>
              <Input
                value={audience}
                onChange={e => setAudience(e.target.value)}
                placeholder="e.g. college students"
              />
            </div>
            <div className="space-y-2">
              <Label>Season / Time</Label>
              <Input
                value={season}
                onChange={e => setSeason(e.target.value)}
                placeholder="e.g. fall 2024"
              />
            </div>
            <div className="flex items-end">
              <Button 
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                onClick={handleResearch}
                disabled={aiChat.isPending || !query.trim()}
              >
                {aiChat.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
                Research
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {rawResponse && (
        <Card>
          <CardHeader><CardTitle>AI Response</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded-md border">{rawResponse}</pre>
          </CardContent>
        </Card>
      )}

      {results && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-500" /> Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{results.summary}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" /> Key Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {results.keyTrends?.map((trend, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <Badge variant="secondary" className="shrink-0">{i + 1}</Badge>
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
                  {results.marketingAngles?.map((angle, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
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
                  {results.suggestedThemes?.map((theme, i) => (
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
                  {results.suggestedEditions?.map((edition, i) => (
                    <div key={i} className="p-3 bg-muted/50 rounded-md border text-sm text-foreground/80">
                      {edition}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
