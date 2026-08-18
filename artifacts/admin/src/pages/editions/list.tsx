import { useListEditions, useUpdateEdition, useAiChat, getListEditionsQueryKey, type Edition, type CatalogStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Sparkles, Globe, EyeOff, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const EDITION_SYSTEM_PROMPT = `You are a product designer for a digital planner app. When given a concept, respond with a JSON object describing a planner edition. Example:
{
  "id": "e-student-2024",
  "name": "Student Planner 2024",
  "tier": "basic",
  "sections": ["weekly", "daily", "notes", "habit-tracker"],
  "priceLow": 0,
  "priceHigh": 9.99
}
Tiers: "basic" = PDF-only, "advanced" = full live item. Respond ONLY with the JSON object.`;

export default function EditionsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: editions, isLoading } = useListEditions();
  
  const updateEdition = useUpdateEdition();
  const aiChat = useAiChat();

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTier, setAiTier] = useState<'basic' | 'advanced'>('basic');
  const [aiResult, setAiResult] = useState('');

  const togglePublish = (id: string, status: string) => {
    const newStatus = status === 'live' ? 'draft' : 'live';
    updateEdition.mutate({ id, data: { status: newStatus as CatalogStatus } }, {
      onSuccess: () => {
        toast({ title: 'Status updated' });
        queryClient.invalidateQueries({ queryKey: getListEditionsQueryKey() });
      }
    });
  };

  const handleAiDraft = () => {
    if (!aiPrompt.trim()) return;
    setAiResult('');
    const prompt = `${aiPrompt} (tier: ${aiTier})`;
    aiChat.mutate({ data: { systemPrompt: EDITION_SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] } }, {
      onSuccess: (res) => setAiResult(res.text),
      onError: (err) => toast({ title: 'Generation Failed', description: (err as any).message, variant: 'destructive' })
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Editions</h1>
          <p className="text-muted-foreground mt-1">Manage planner editions and their assets.</p>
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
                <DialogTitle>Draft Edition with AI</DialogTitle>
                <DialogDescription>Describe the edition to generate sections and pricing.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div>
                  <Label>Concept</Label>
                  <Input 
                    value={aiPrompt} 
                    onChange={e => setAiPrompt(e.target.value)} 
                    placeholder="e.g. Minimalist ADHD planner..."
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Tier</Label>
                  <Select value={aiTier} onValueChange={(v: 'basic' | 'advanced') => setAiTier(v)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic (PDF only)</SelectItem>
                      <SelectItem value="advanced">Advanced (Live items)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {aiResult && (
                  <div className="bg-muted/50 rounded-md p-3 font-mono text-xs whitespace-pre-wrap border max-h-48 overflow-auto">{aiResult}</div>
                )}
              </div>
              <DialogFooter>
                {aiResult && (
                  <Button variant="outline" asChild onClick={() => setIsAiModalOpen(false)}>
                    <Link href="/editions/new">Use to Create</Link>
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
            <Link href="/editions/new">
              <Plus className="w-4 h-4 mr-2" />
              New Edition
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Edition</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>World</TableHead>
              <TableHead>Price Range</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : (editions as Edition[])?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No editions found.</TableCell></TableRow>
            ) : (
              (editions as Edition[])?.map(edition => (
                <TableRow key={edition.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center border"><BookOpen className="w-5 h-5 text-muted-foreground" /></div>
                      <div>
                        <div className="font-medium text-foreground">{edition.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{edition.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={edition.tier === 'advanced' ? 'border-primary text-primary' : ''}>
                      {edition.tier}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(edition as any).world ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {(edition as any).world}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground font-mono">
                      {edition.priceLow != null && edition.priceHigh != null
                        ? `$${edition.priceLow.toFixed(2)}–$${edition.priceHigh.toFixed(2)}`
                        : edition.priceLow != null ? `$${edition.priceLow.toFixed(2)}`
                        : 'Free'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={edition.status === 'live' ? 'default' : 'secondary'} className={edition.status === 'live' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : ''}>
                      {edition.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => togglePublish(edition.id, edition.status)} title={edition.status === 'live' ? 'Unpublish' : 'Publish'}>
                        {edition.status === 'live' ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/editions/${edition.id}`}>
                          <BookOpen className="w-4 h-4" />
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
