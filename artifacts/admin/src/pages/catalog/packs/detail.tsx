import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetStickerPack, useCreateStickerPack, useUpdateStickerPack, useDeleteStickerPack,
  useListEditions, getListStickerPacksQueryKey, getGetStickerPackQueryKey,
  type StickerPack, type StickerPackInput, type StickerPackUpdate
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
import type { Edition } from '@workspace/api-client-react';

const packSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  tags: z.string().default(''),
  price: z.coerce.number().min(0).default(0),
  planners: z.string().default('all'),
});

type PackFormValues = z.infer<typeof packSchema>;

export default function PackDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? '' : params.id!;

  const { data: pack, isLoading } = useGetStickerPack(id, { query: { enabled: !isNew, queryKey: getGetStickerPackQueryKey(id) } });
  const { data: editions } = useListEditions();
  
  const createPack = useCreateStickerPack();
  const updatePack = useUpdateStickerPack();
  const deletePack = useDeleteStickerPack();

  const form = useForm<PackFormValues>({
    resolver: zodResolver(packSchema),
    defaultValues: { id: '', name: '', tags: '', price: 0, planners: 'all' }
  });

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (pack && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        id: pack.id,
        name: pack.name,
        tags: (pack.tags || []).join(', '),
        price: pack.price || 0,
        planners: (pack.planners || ['all']).join(', '),
      });
    }
  }, [pack, id, form]);

  const parsePlanners = (val: string): string[] =>
    val.toLowerCase().trim() === 'all' ? ['all'] : val.split(',').map(t => t.trim()).filter(Boolean);

  const onSubmit = (data: PackFormValues) => {
    const tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    const planners = parsePlanners(data.planners);

    if (isNew) {
      const payload: StickerPackInput = { id: data.id, name: data.name, tags, price: data.price, planners };
      createPack.mutate({ data: payload }, {
        onSuccess: (res) => {
          toast({ title: 'Pack created' });
          queryClient.invalidateQueries({ queryKey: getListStickerPacksQueryKey() });
          setLocation(`/catalog/packs/${res.id}`);
        },
        onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
      });
    } else {
      const payload: StickerPackUpdate = { name: data.name, tags, price: data.price, planners };
      updatePack.mutate({ id, data: payload }, {
        onSuccess: () => {
          toast({ title: 'Pack updated' });
          queryClient.invalidateQueries({ queryKey: getGetStickerPackQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListStickerPacksQueryKey() });
        }
      });
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this pack?')) {
      deletePack.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Pack deleted' });
          queryClient.invalidateQueries({ queryKey: getListStickerPacksQueryKey() });
          setLocation('/catalog/packs');
        }
      });
    }
  };

  if (!isNew && isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const isSaving = createPack.isPending || updatePack.isPending;
  const editionList = (editions || []) as Edition[];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/packs"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Pack' : pack?.name}</h1>
            {!isNew && <p className="text-xs text-muted-foreground font-mono">{id}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete} disabled={deletePack.isPending}>
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
            <CardHeader><CardTitle>Pack Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isNew && (
                <FormField control={form.control} name="id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID <span className="text-xs text-muted-foreground">(e.g. p-cozy-coffee)</span></FormLabel>
                    <FormControl><Input {...field} placeholder="p-my-pack" className="font-mono" /></FormControl>
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
              <FormField control={form.control} name="tags" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl><Input {...field} placeholder="coffee, cozy, warm" /></FormControl>
                  <FormDescription>Comma-separated tags.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Price (USD)</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
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
