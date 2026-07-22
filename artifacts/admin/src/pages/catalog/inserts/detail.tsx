import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetInsert, useCreateInsert, useUpdateInsert, useDeleteInsert, getListInsertsQueryKey, getGetInsertQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { Link } from 'wouter';

const insertSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  isTransparent: z.boolean().default(false),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

export default function InsertDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? 0 : parseInt(params.id!);

  const { data: insert, isLoading } = useGetInsert(id, { query: { enabled: !isNew, queryKey: getGetInsertQueryKey(id) } });
  
  const createInsert = useCreateInsert();
  const updateInsert = useUpdateInsert();
  const deleteInsert = useDeleteInsert();

  const form = useForm<z.infer<typeof insertSchema>>({
    resolver: zodResolver(insertSchema),
    defaultValues: { name: '', slug: '', description: '', category: '', isTransparent: false, imageUrl: '' }
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (insert && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        name: insert.name,
        slug: insert.slug,
        description: insert.description || '',
        category: insert.category || '',
        isTransparent: insert.isTransparent || false,
        imageUrl: insert.imageUrl || ''
      });
    }
  }, [insert, id, form]);

  const onSubmit = (data: z.infer<typeof insertSchema>) => {
    if (isNew) {
      createInsert.mutate({ data }, {
        onSuccess: (res) => {
          toast({ title: 'Insert created' });
          queryClient.invalidateQueries({ queryKey: getListInsertsQueryKey() });
          setLocation(`/catalog/inserts/${res.id}`);
        }
      });
    } else {
      updateInsert.mutate({ id, data }, {
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

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/inserts"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Insert' : insert?.name}</h1>
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
            <CardHeader>
              <CardTitle>Insert Details</CardTitle>
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
              </div>
              
              <FormField control={form.control} name="isTransparent" render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Transparent Background</FormLabel>
                    <FormDescription>Check this if the insert is a transparent PNG meant to be overlaid.</FormDescription>
                  </div>
                </FormItem>
              )} />

              <FormField control={form.control} name="imageUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  {field.value && <img src={field.value} alt="Preview" className="w-full max-w-sm h-auto rounded-md mt-2 border bg-muted" />}
                </FormItem>
              )} />
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}