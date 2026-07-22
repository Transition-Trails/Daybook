import { useListEditions, usePublishEdition, useUnpublishEdition, useAiDraftEdition, getListEditionsQueryKey } from '@workspace/api-client-react';
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

export default function EditionsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: editions, isLoading } = useListEditions();
  
  const publish = usePublishEdition();
  const unpublish = useUnpublishEdition();
  const aiDraft = useAiDraftEdition();

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTier, setAiTier] = useState<'basic'|'advanced'>('basic');

  const togglePublish = (id: number, status: string) => {
    const action = status === 'live' ? unpublish : publish;
    action.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Status updated' });
        queryClient.invalidateQueries({ queryKey: getListEditionsQueryKey() });
      }
    });
  };

  const handleAiDraft = () => {
    aiDraft.mutate({ data: { concept: aiPrompt, tier: aiTier } }, {
      onSuccess: (result) => {
        toast({ title: 'Edition Generated', description: `Drafted: ${result.name}` });
        setIsAiModalOpen(false);
        setAiPrompt('');
        queryClient.invalidateQueries({ queryKey: getListEditionsQueryKey() });
      },
      onError: (err) => {
        toast({ title: 'Generation Failed', description: err.message, variant: 'destructive' });
      }
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
          <Dialog open={isAiModalOpen} onOpenChange={setIsAiModalOpen}>
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
                  <Select value={aiTier} onValueChange={(v: 'basic'|'advanced') => setAiTier(v)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic (PDF only)</SelectItem>
                      <SelectItem value="advanced">Advanced (Live items)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={aiDraft.isPending} onClick={handleAiDraft}>
                  {aiDraft.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
              <TableHead>Prices</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : editions?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No editions found.</TableCell></TableRow>
            ) : (
              editions?.map(edition => (
                <TableRow key={edition.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {edition.previewImageUrl ? (
                        <img src={edition.previewImageUrl} alt={edition.name} className="w-10 h-10 rounded-md object-cover border bg-muted" />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center border"><BookOpen className="w-5 h-5 text-muted-foreground" /></div>
                      )}
                      <div>
                        <div className="font-medium text-foreground">{edition.name}</div>
                        <div className="text-xs text-muted-foreground">{edition.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={edition.tier === 'advanced' ? 'border-primary text-primary' : ''}>
                      {edition.tier}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs text-muted-foreground">
                      {edition.oneTimePrice ? <span>One-time: ${(edition.oneTimePrice/100).toFixed(2)}</span> : null}
                      {edition.yearlyPrice ? <span>Yearly: ${(edition.yearlyPrice/100).toFixed(2)}</span> : null}
                      {edition.lifetimePrice ? <span>Lifetime: ${(edition.lifetimePrice/100).toFixed(2)}</span> : null}
                      {!edition.oneTimePrice && !edition.yearlyPrice && !edition.lifetimePrice && <span>Free</span>}
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