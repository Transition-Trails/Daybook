import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetEdition, useCreateEdition, useUpdateEdition, useDeleteEdition, getListEditionsQueryKey, getGetEditionQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { Link } from 'wouter';

const editionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  tier: z.enum(['basic', 'advanced']),
  oneTimePrice: z.coerce.number().optional(),
  yearlyPrice: z.coerce.number().optional(),
  lifetimePrice: z.coerce.number().optional(),
  previewImageUrl: z.string().url().optional().or(z.literal('')),
});

export default function EditionDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? 0 : parseInt(params.id!);

  const { data: edition, isLoading } = useGetEdition(id, { query: { enabled: !isNew, queryKey: getGetEditionQueryKey(id) } });
  
  const createEdition = useCreateEdition();
  const updateEdition = useUpdateEdition();
  const deleteEdition = useDeleteEdition();

  const form = useForm<z.infer<typeof editionSchema>>({
    resolver: zodResolver(editionSchema),
    defaultValues: { name: '', slug: '', description: '', tier: 'basic', oneTimePrice: 0, yearlyPrice: 0, lifetimePrice: 0, previewImageUrl: '' }
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (edition && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        name: edition.name,
        slug: edition.slug,
        description: edition.description || '',
        tier: edition.tier,
        oneTimePrice: edition.oneTimePrice ? edition.oneTimePrice / 100 : 0,
        yearlyPrice: edition.yearlyPrice ? edition.yearlyPrice / 100 : 0,
        lifetimePrice: edition.lifetimePrice ? edition.lifetimePrice / 100 : 0,
        previewImageUrl: edition.previewImageUrl || ''
      });
    }
  }, [edition, id, form]);

  const onSubmit = (data: z.infer<typeof editionSchema>) => {
    const payload = {
      ...data,
      oneTimePrice: data.oneTimePrice ? Math.round(data.oneTimePrice * 100) : undefined,
      yearlyPrice: data.yearlyPrice ? Math.round(data.yearlyPrice * 100) : undefined,
      lifetimePrice: data.lifetimePrice ? Math.round(data.lifetimePrice * 100) : undefined,
    };

    if (isNew) {
      createEdition.mutate({ data: payload }, {
        onSuccess: (res) => {
          toast({ title: 'Edition created' });
          queryClient.invalidateQueries({ queryKey: getListEditionsQueryKey() });
          setLocation(`/editions/${res.id}`);
        }
      });
    } else {
      updateEdition.mutate({ id, data: payload }, {
        onSuccess: () => {
          toast({ title: 'Edition updated' });
          queryClient.invalidateQueries({ queryKey: getGetEditionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListEditionsQueryKey() });
        }
      });
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this edition?')) {
      deleteEdition.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Edition deleted' });
          queryClient.invalidateQueries({ queryKey: getListEditionsQueryKey() });
          setLocation('/editions');
        }
      });
    }
  };

  if (!isNew && isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const isSaving = createEdition.isPending || updateEdition.isPending;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/editions"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Edition' : edition?.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete} disabled={deleteEdition.isPending}>
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
          <Tabs defaultValue="general">
            <TabsList className="mb-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              {!isNew && <TabsTrigger value="assets">Assets</TabsTrigger>}
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Edition Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="tier" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tier</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="basic">Basic (PDF only)</SelectItem>
                            <SelectItem value="advanced">Advanced (Live items)</SelectItem>
                          </SelectContent>
                        </Select>
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
            </TabsContent>

            <TabsContent value="pricing" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pricing (USD)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField control={form.control} name="oneTimePrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>One-Time Price</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="yearlyPrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Yearly Subscription</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="lifetimePrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lifetime Access</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {!isNew && (
              <TabsContent value="assets" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Attached Assets</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">
                      Attach themes, sticker packs, inserts, and related products here. (UI omitted for brevity - to be wired up later).
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </form>
      </Form>
    </div>
  );
}