import { useListInserts, useUpdateInsert, getListInsertsQueryKey, type Insert, type CatalogStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Globe, EyeOff, FileImage } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function InsertsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: inserts, isLoading } = useListInserts();
  
  const updateInsert = useUpdateInsert();

  const togglePublish = (id: string, status: string) => {
    const newStatus = status === 'live' ? 'draft' : 'live';
    updateInsert.mutate({ id, data: { status: newStatus as CatalogStatus } }, {
      onSuccess: () => {
        toast({ title: 'Status updated' });
        queryClient.invalidateQueries({ queryKey: getListInsertsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Inserts</h1>
          <p className="text-muted-foreground mt-1">Manage extra pages and PDF inserts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/catalog/inserts/new">
              <Plus className="w-4 h-4 mr-2" />
              New Insert
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Insert</TableHead>
              <TableHead>Collection</TableHead>
              <TableHead>Planners</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : (inserts as Insert[])?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No inserts found.</TableCell></TableRow>
            ) : (
              (inserts as Insert[])?.map(insert => (
                <TableRow key={insert.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center border"><FileImage className="w-5 h-5 text-muted-foreground" /></div>
                      <div>
                        <div className="font-medium text-foreground">{insert.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{insert.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {insert.collection ? <Badge variant="outline">{insert.collection}</Badge> : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {(insert.planners as string[] || ['all']).join(', ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={insert.status === 'live' ? 'default' : 'secondary'} className={insert.status === 'live' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : ''}>
                      {insert.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => togglePublish(insert.id, insert.status)} title={insert.status === 'live' ? 'Unpublish' : 'Publish'}>
                        {insert.status === 'live' ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/catalog/inserts/${insert.id}`}>
                          <FileImage className="w-4 h-4" />
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
