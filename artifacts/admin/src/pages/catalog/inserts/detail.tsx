import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetInsert, useCreateInsert, useUpdateInsert, useDeleteInsert,
  useListEditions, getListInsertsQueryKey, getGetInsertQueryKey,
  type InsertInput, type InsertUpdate, type Edition
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { Link } from 'wouter';

const insertSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  collection: z.string().optional(),
  planners: z.string().default('all'),
});

type InsertFormValues = z.infer<typeof insertSchema>;

export default function InsertDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? '' : params.id!;

  const { data: insert, isLoading } = useGetInsert(id, { query: { enabled: !isNew, queryKey: getGetInsertQueryKey(id) } });
  const { data: editions } = useListEditions();
  
  const createInsert = useCreateInsert();
  const updateInsert = useUpdateInsert();
  const deleteInsert = useDeleteInsert();

  const form = useForm<InsertFormValues>({
    resolver: zodResolver(insertSchema),
    defaultValues: { id: '', name: '', collection: '', planners: 'all' }
  });

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (insert && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        id: insert.id,
        name: insert.name,
        collection: insert.collection || '',
        planners: (insert.planners || ['all']).join(', '),
      });
    }
  }, [insert, id, form]);

  const parsePlanners = (val: string): string[] =>
    val.toLowerCase().trim() === 'all' ? ['all'] : val.split(',').map(t => t.trim()).filter(Boolean);

  const onSubmit = (data: InsertFormValues) => {
    const planners = parsePlanners(data.planners || 'all');

    if (isNew) {
      const payload: InsertInput = { id: data.id, name: data.name, collection: data.collection, planners };
      createInsert.mutate({ data: payload }, {
        onSuccess: (res) => {
          toast({ title: 'Insert created' });
          queryClient.invalidateQueries({ queryKey: getListInsertsQueryKey() });
          setLocation(`/catalog/inserts/${res.id}`);
        },
        onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
      });
    } else {
      const payload: InsertUpdate = { name: data.name, collection: data.collection, planners };
      updateInsert.mutate({ id, data: payload }, {
        onSuccess: () => {
          toast({ title: 'Insert updated' });
          queryClient.invalidateQueries({ queryKey: getGetInsertQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListInsertsQueryKey() });
        }
      });
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this insert?')) {
      deleteInsert.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Insert deleted' });
          queryClient.invalidateQueries({ queryKey: getListInsertsQueryKey() });
          setLocation('/catalog/inserts');
        }
      });
    }
  };

  if (!isNew && isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const isSaving = createInsert.isPending || updateInsert.isPending;
  const editionList = (editions || []) as Edition[];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/inserts"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Insert' : insert?.name}</h1>
            {!isNew && <p className="text-xs text-muted-foreground font-mono">{id}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete} disabled={deleteInsert.isPending}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          )}
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Insert Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isNew && (
                <FormField control={form.control} name="id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID <span className="text-xs text-muted-foreground">(e.g. i-habit-tracker)</span></FormLabel>
                    <FormControl><Input {...field} placeholder="i-my-insert" className="font-mono" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="collection" render={({ field }) => (
                <FormItem>
                  <FormLabel>Collection</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. productivity, wellness" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="planners" render={({ field }) => (
                <FormItem>
                  <FormLabel>Planners</FormLabel>
                  <FormControl><Input {...field} placeholder="all" /></FormControl>
                  <FormDescription>
                    Enter "all" for all editions, or comma-separated edition IDs.
                    {editionList.length > 0 && (
                      <span className="block mt-1 text-xs">Available: {editionList.map(e => e.id).join(', ')}</span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
