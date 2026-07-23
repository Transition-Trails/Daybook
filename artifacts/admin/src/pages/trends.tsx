import { useAiChat } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, Lightbulb, Target, Palette, ShoppingBag, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const TREND_SYSTEM_PROMPT = `You are a market research expert for digital planner products sold on Etsy and Amazon. When given a niche or audience, analyze current trends and respond with a JSON object in this exact format:
{
  "summary": "2-3 sentence overview of the opportunity",
  "keyTrends": ["trend 1", "trend 2", "trend 3"],
  "marketingAngles": ["angle 1", "angle 2", "angle 3"],
  "suggestedThemes": ["theme concept 1", "theme concept 2", "theme concept 3"],
  "suggestedEditions": ["edition idea 1", "edition idea 2"],
  "topSellers": [
    {
      "title": "Product name as it appears in the listing",
      "platform": "Etsy",
      "url": "https://www.etsy.com/search?q=<relevant+search+query>",
      "seller": "Shop or seller name if known, otherwise omit",
      "whyItWorks": "1-2 sentences explaining what makes this product successful and why it resonates with this niche audience"
    }
  ]
}
For topSellers: provide exactly 5 entries representing real best-selling or highly-reviewed planners in this niche or a closely related niche currently available on Etsy or Amazon. Use real Etsy search URLs (https://www.etsy.com/search?q=...) or Amazon search URLs (https://www.amazon.com/s?k=...) with relevant search terms when you cannot provide a direct product URL. Focus on what makes each one work for the niche.
Respond ONLY with the JSON object.`;

type TopSeller = {
  title: string;
  platform: string;
  url: string;
  seller?: string;
  whyItWorks: string;
};

type TrendResults = {
  summary: string;
  keyTrends: string[];
  marketingAngles: string[];
  suggestedThemes: string[];
  suggestedEditions: string[];
  topSellers?: TopSeller[];
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
                    <Badge key={i} variant="secondary" className="px-3 py-1 text-sm bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 whitespace-normal break-words h-auto">{theme}</Badge>
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

          {results.topSellers && results.topSellers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-teal-500" /> Top Sellers in This Niche
                </CardTitle>
                <p className="text-sm text-muted-foreground">Planners already selling well — and why they work for your audience.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.topSellers.map((item, i) => (
                    <div key={i} className="flex gap-4 p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 font-semibold text-sm mt-0.5">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start gap-2 flex-wrap">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sm text-foreground hover:text-teal-600 dark:hover:text-teal-400 underline underline-offset-2 decoration-muted-foreground/40 hover:decoration-teal-500 transition-colors flex items-center gap-1 break-words"
                          >
                            {item.title}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                            {item.platform}
                          </Badge>
                          {item.seller && (
                            <span className="text-xs text-muted-foreground shrink-0">by {item.seller}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.whyItWorks}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
