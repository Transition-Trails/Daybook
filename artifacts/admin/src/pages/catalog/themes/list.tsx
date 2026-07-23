import { useListThemes, useUpdateTheme, useAiChat, getListThemesQueryKey, type Theme, type CatalogStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Sparkles, Paintbrush, Globe, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const THEME_SYSTEM_PROMPT = `You are a design assistant for a digital planner app. When given a concept, respond with a JSON object describing a theme. Example format:
{
  "id": "t-autumn-cozy",
  "name": "Autumn Cozy",
  "desc": "Warm earthy tones for fall productivity",
  "colors": ["#C8602D","#8B3A1A","#D4956A","#F2D9C0","#2C1810","#FFF8F0"],
  "price": 0
}
Colors order: accent, accent-dark, secondary, tertiary, ink, paper. Respond ONLY with the JSON object.`;

export default function ThemesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: themes, isLoading } = useListThemes();
  
  const updateTheme = useUpdateTheme();
  const aiChat = useAiChat();

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');

  const togglePublish = (id: string, status: string) => {
    const newStatus = status === 'live' ? 'draft' : 'live';
    updateTheme.mutate({ id, data: { status: newStatus as CatalogStatus } }, {
      onSuccess: () => {
        toast({ title: 'Status updated' });
        queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
      }
    });
  };

  const handleAiDraft = () => {
    if (!aiPrompt.trim()) return;
    setAiResult('');
    aiChat.mutate({ data: { systemPrompt: THEME_SYSTEM_PROMPT, messages: [{ role: 'user', content: aiPrompt }] } }, {
      onSuccess: (res) => {
        setAiResult(res.text);
      },
      onError: (err) => {
        toast({ title: 'Generation Failed', description: (err as any).message, variant: 'destructive' });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Themes</h1>
          <p className="text-muted-foreground mt-1">Manage color palettes and aesthetics.</p>
        </div>
        <div className="flex items-center gap-3">
          <Dialog open={isAiModalOpen} onOpenChange={(open) => { setIsAiModalOpen(open); if (!open) { setAiResult(''); setAiPrompt(''); } }}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="bg-indigo-100 text-indigo-900 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-100">
                <Sparkles className="w-4 h-4 mr-2" />
                AI Draft
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Theme with AI</DialogTitle>
                <DialogDescription>Describe the aesthetic, season, or audience.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div>
                  <Label>Concept</Label>
                  <Input 
                    value={aiPrompt} 
                    onChange={e => setAiPrompt(e.target.value)} 
                    placeholder="e.g. Dark academia, warm autumn for students..."
                    className="mt-2"
                  />
                </div>
                {aiResult && (
                  <div className="bg-muted/50 rounded-md p-3 font-mono text-xs whitespace-pre-wrap border max-h-48 overflow-auto">
                    {aiResult}
                  </div>
                )}
              </div>
              <DialogFooter className="flex gap-2">
                {aiResult && (
                  <Button variant="outline" asChild onClick={() => setIsAiModalOpen(false)}>
                    <Link href="/catalog/themes/new">Use to Create</Link>
                  </Button>
                )}
                <Button disabled={aiChat.isPending || !aiPrompt.trim()} onClick={handleAiDraft}>
                  {aiChat.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Generate
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button asChild>
            <Link href="/catalog/themes/new">
              <Plus className="w-4 h-4 mr-2" />
              New Theme
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Theme</TableHead>
              <TableHead>Colors</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : (themes as Theme[])?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No themes found.</TableCell></TableRow>
            ) : (
              (themes as Theme[])?.map(theme => (
                <TableRow key={theme.id} className="group">
                  <TableCell>
                    <div className="font-medium text-foreground">{theme.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{theme.id}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(theme.colors as string[] || []).slice(0, 4).map((c: string, i: number) => (
                        <div key={i} className="w-5 h-5 rounded shadow-sm border" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{theme.price ? `$${theme.price.toFixed(2)}` : 'Free'}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={theme.status === 'live' ? 'default' : 'secondary'} className={theme.status === 'live' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : ''}>
                      {theme.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => togglePublish(theme.id, theme.status)} title={theme.status === 'live' ? 'Unpublish' : 'Publish'}>
                        {theme.status === 'live' ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/catalog/themes/${theme.id}`}>
                          <Paintbrush className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
