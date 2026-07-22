import { useListThemes, usePublishTheme, useUnpublishTheme, useAiDraftTheme, getListThemesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Sparkles, Paintbrush, Globe, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function ThemesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: themes, isLoading } = useListThemes();
  
  const publish = usePublishTheme();
  const unpublish = useUnpublishTheme();
  const aiDraft = useAiDraftTheme();

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const togglePublish = (id: number, status: string) => {
    const action = status === 'live' ? unpublish : publish;
    action.mutate({ id }, {
      onSuccess: () => {
        toast({ title: 'Status updated' });
        queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
      }
    });
  };

  const handleAiDraft = () => {
    aiDraft.mutate({ data: { concept: aiPrompt } }, {
      onSuccess: (result) => {
        toast({ title: 'Theme Generated', description: `Drafted: ${result.name}` });
        setIsAiModalOpen(false);
        setAiPrompt('');
        queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
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
          <h1 className="text-3xl font-display font-bold tracking-tight">Themes</h1>
          <p className="text-muted-foreground mt-1">Manage color palettes and aesthetics.</p>
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
                <DialogTitle>Generate Theme with AI</DialogTitle>
                <DialogDescription>Describe the aesthetic, season, or audience.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label>Concept</Label>
                <Input 
                  value={aiPrompt} 
                  onChange={e => setAiPrompt(e.target.value)} 
                  placeholder="e.g. Dark academia, warm autumn for students..."
                  className="mt-2"
                />
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
              <TableHead>Category</TableHead>
              <TableHead>Colors</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : themes?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No themes found.</TableCell></TableRow>
            ) : (
              themes?.map(theme => (
                <TableRow key={theme.id} className="group">
                  <TableCell>
                    <div className="font-medium text-foreground">{theme.name}</div>
                    <div className="text-xs text-muted-foreground">{theme.slug}</div>
                  </TableCell>
                  <TableCell>
                    {theme.category ? <Badge variant="outline">{theme.category}</Badge> : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {theme.coverColor && <div className="w-6 h-6 rounded-md shadow-sm border" style={{ backgroundColor: theme.coverColor }} title={`Cover: ${theme.coverColor}`} />}
                      {theme.accentColor && <div className="w-6 h-6 rounded-md shadow-sm border" style={{ backgroundColor: theme.accentColor }} title={`Accent: ${theme.accentColor}`} />}
                    </div>
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