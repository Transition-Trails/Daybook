import { useListStickerPacks, useUpdateStickerPack, useAiChat, getListStickerPacksQueryKey, type StickerPack, type CatalogStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Sparkles, Globe, EyeOff, Sticker } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const PACK_SYSTEM_PROMPT = `You are a design assistant for a digital planner app. When given a concept for a sticker pack, respond with a JSON object. Example:
{
  "id": "p-cozy-coffee",
  "name": "Cozy Coffee",
  "tags": ["coffee", "cozy", "warm"],
  "price": 0
}
Respond ONLY with the JSON object.`;

export default function PacksList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: packs, isLoading } = useListStickerPacks();
  
  const updatePack = useUpdateStickerPack();
  const aiChat = useAiChat();

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');

  const togglePublish = (id: string, status: string) => {
    const newStatus = status === 'live' ? 'draft' : 'live';
    updatePack.mutate({ id, data: { status: newStatus as CatalogStatus } }, {
      onSuccess: () => {
        toast({ title: 'Status updated' });
        queryClient.invalidateQueries({ queryKey: getListStickerPacksQueryKey() });
      }
    });
  };

  const handleAiDraft = () => {
    if (!aiPrompt.trim()) return;
    setAiResult('');
    aiChat.mutate({ data: { systemPrompt: PACK_SYSTEM_PROMPT, messages: [{ role: 'user', content: aiPrompt }] } }, {
      onSuccess: (res) => setAiResult(res.text),
      onError: (err) => toast({ title: 'Generation Failed', description: (err as any).message, variant: 'destructive' })
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Sticker Packs</h1>
          <p className="text-muted-foreground mt-1">Manage reusable graphic elements.</p>
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
                <DialogTitle>Generate Sticker Pack Ideas</DialogTitle>
                <DialogDescription>Describe a concept for stickers.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div>
                  <Label>Concept</Label>
                  <Input 
                    value={aiPrompt} 
                    onChange={e => setAiPrompt(e.target.value)} 
                    placeholder="e.g. Cozy coffee shop, fitness motivation..."
                    className="mt-2"
                  />
                </div>
                {aiResult && (
                  <div className="bg-muted/50 rounded-md p-3 font-mono text-xs whitespace-pre-wrap border max-h-48 overflow-auto">{aiResult}</div>
                )}
              </div>
              <DialogFooter>
                {aiResult && (
                  <Button variant="outline" asChild onClick={() => setIsAiModalOpen(false)}>
                    <Link href="/catalog/packs/new">Use to Create</Link>
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
            <Link href="/catalog/packs/new">
              <Plus className="w-4 h-4 mr-2" />
              New Pack
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Pack</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : (packs as StickerPack[])?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No packs found.</TableCell></TableRow>
            ) : (
              (packs as StickerPack[])?.map(pack => (
                <TableRow key={pack.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center border"><Sticker className="w-5 h-5 text-muted-foreground" /></div>
                      <div>
                        <div className="font-medium text-foreground">{pack.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{pack.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(pack.tags as string[] || []).slice(0, 3).map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{pack.price ? `$${pack.price.toFixed(2)}` : 'Free'}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pack.status === 'live' ? 'default' : 'secondary'} className={pack.status === 'live' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : ''}>
                      {pack.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => togglePublish(pack.id, pack.status)} title={pack.status === 'live' ? 'Unpublish' : 'Publish'}>
                        {pack.status === 'live' ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/catalog/packs/${pack.id}`}>
                          <Sticker className="w-4 h-4" />
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
