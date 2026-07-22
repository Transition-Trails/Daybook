import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetStickerPack, useCreateStickerPack, useUpdateStickerPack, useDeleteStickerPack, getListStickerPacksQueryKey, getGetStickerPackQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { Link } from 'wouter';

const packSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  stickerCount: z.coerce.number().min(0).optional(),
  previewImageUrl: z.string().url().optional().or(z.literal('')),
});

export default function PackDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? 0 : parseInt(params.id!);

  const { data: pack, isLoading } = useGetStickerPack(id, { query: { enabled: !isNew, queryKey: getGetStickerPackQueryKey(id) } });
  
  const createPack = useCreateStickerPack();
  const updatePack = useUpdateStickerPack();
  const deletePack = useDeleteStickerPack();

  const form = useForm<z.infer<typeof packSchema>>({
    resolver: zodResolver(packSchema),
    defaultValues: { name: '', slug: '', description: '', category: '', stickerCount: 0, previewImageUrl: '' }
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (pack && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        name: pack.name,
        slug: pack.slug,
        description: pack.description || '',
        category: pack.category || '',
        stickerCount: pack.stickerCount || 0,
        previewImageUrl: pack.previewImageUrl || ''
      });
    }
  }, [pack, id, form]);

  const onSubmit = (data: z.infer<typeof packSchema>) => {
    if (isNew) {
      createPack.mutate({ data }, {
        onSuccess: (res) => {
          toast({ title: 'Pack created' });
          queryClient.invalidateQueries({ queryKey: getListStickerPacksQueryKey() });
          setLocation(`/catalog/packs/${res.id}`);
        }
      });
    } else {
      updatePack.mutate({ id, data }, {
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

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/packs"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Pack' : pack?.name}</h1>
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
            <CardHeader>
              <CardTitle>Pack Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="slug" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl><Input {...field} placeholder="auto-generated" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea className="resize-none h-24" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="stickerCount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sticker Count</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="previewImageUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Preview Image URL</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  {field.value && <img src={field.value} alt="Preview" className="w-48 h-48 object-cover rounded-md mt-2 border bg-muted" />}
                </FormItem>
              )} />
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}