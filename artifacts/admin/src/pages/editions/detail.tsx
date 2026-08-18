import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetEdition, useCreateEdition, useUpdateEdition, useDeleteEdition,
  useListThemes, useListStickerPacks, useListInserts, useListProducts,
  getListEditionsQueryKey, getGetEditionQueryKey,
  type Edition, type EditionInput, type EditionUpdate,
  type Theme, type StickerPack, type Insert, type RelatedProduct
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2, Save } from 'lucide-react';
import { Link } from 'wouter';
import { type EditionInputTier } from '@workspace/api-client-react';

const PRODUCT_TYPES = ['planner', 'notebook', 'journal', 'memory-keeping'] as const;
const BINDING_TYPES   = ['', 'coil', 'twin-loop', 'discs', '3-ring', 'none'] as const;
const BINDING_FINISHES = ['', 'gold', 'rose gold', 'silver', 'matte black', 'white'] as const;

const editionSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  tier: z.enum(['basic', 'advanced']),
  productType: z.enum(PRODUCT_TYPES).default('planner'),
  sections: z.string().default(''),
  bindingType:   z.string().default(''),
  bindingFinish: z.string().default(''),
  priceLow: z.coerce.number().optional(),
  priceHigh: z.coerce.number().optional(),
  world: z.string().default(''),
});

type EditionFormValues = z.infer<typeof editionSchema>;

function MultiSelectPicker({
  title,
  items,
  selected,
  onSave,
  isSaving,
}: {
  title: string;
  items: { id: string; name: string }[];
  selected: string[];
  onSave: (ids: string[]) => void;
  isSaving: boolean;
}) {
  const [local, setLocal] = useState<string[]>(selected);
  useEffect(() => { setLocal(selected); }, [selected]);

  const toggle = (id: string) => {
    setLocal(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => onSave(local)} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
          Save
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {title.toLowerCase()} available.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {items.map(item => (
              <label key={item.id} className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-md p-2">
                <Checkbox
                  checked={local.includes(item.id)}
                  onCheckedChange={() => toggle(item.id)}
                />
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{item.id}</div>
                </div>
              </label>
            ))}
          </div>
        )}
        {local.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {local.map(id => (
              <Badge key={id} variant="secondary" className="text-xs font-mono">{id}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EditionDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? '' : params.id!;

  const { data: edition, isLoading } = useGetEdition(id, { query: { enabled: !isNew, queryKey: getGetEditionQueryKey(id) } });
  
  const { data: themesData } = useListThemes();
  const { data: packsData } = useListStickerPacks();
  const { data: insertsData } = useListInserts();
  const { data: productsData } = useListProducts();
  
  const themes = (themesData || []) as Theme[];
  const packs = (packsData || []) as StickerPack[];
  const inserts = (insertsData || []) as Insert[];
  const products = (productsData || []) as RelatedProduct[];
  
  const createEdition = useCreateEdition();
  const updateEdition = useUpdateEdition();
  const deleteEdition = useDeleteEdition();
  
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const form = useForm<EditionFormValues>({
    resolver: zodResolver(editionSchema),
    defaultValues: { id: '', name: '', tier: 'basic', productType: 'planner', sections: '', bindingType: '', bindingFinish: '', priceLow: 0, priceHigh: 0, world: '' }
  });

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (edition && initializedForId.current !== id) {
      initializedForId.current = id;
      const binding = (edition as any).binding as { type?: string; finish?: string } | undefined;
      form.reset({
        id: edition.id,
        name: edition.name,
        tier: edition.tier as 'basic' | 'advanced',
        productType: ((edition as any).productType ?? 'planner') as 'planner' | 'notebook' | 'journal' | 'memory-keeping',
        sections: (edition.sections || []).join(', '),
        bindingType:   binding?.type   ?? '',
        bindingFinish: binding?.finish ?? '',
        priceLow: edition.priceLow ?? 0,
        priceHigh: edition.priceHigh ?? 0,
        world: ((edition as any).world ?? '') as string,
      });
    }
  }, [edition, id, form]);

  const onSubmit = (data: EditionFormValues) => {
    const sections = data.sections ? data.sections.split(',').map(s => s.trim()).filter(Boolean) : [];
    const tier = data.tier as EditionInputTier;

    const bindingPayload = data.bindingType && data.bindingType !== ''
      ? { type: data.bindingType as "coil" | "twin-loop" | "discs" | "3-ring" | "none", finish: (data.bindingFinish || 'gold') as "gold" | "rose gold" | "silver" | "matte black" | "white" }
      : null;

    const worldValue = data.world.trim().toUpperCase() || null;

    if (isNew) {
      const payload: EditionInput = {
        id: data.id,
        name: data.name,
        tier,
        sections,
        priceLow: data.priceLow || undefined,
        priceHigh: data.priceHigh || undefined,
      };
      createEdition.mutate({ data: { ...payload, productType: data.productType, world: worldValue, ...(bindingPayload ? { binding: bindingPayload } : {}) } as EditionInput }, {
        onSuccess: (res) => {
          toast({ title: 'Edition created' });
          queryClient.invalidateQueries({ queryKey: getListEditionsQueryKey() });
          setLocation(`/editions/${res.id}`);
        },
        onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
      });
    } else {
      const payload: EditionUpdate = {
        name: data.name,
        tier,
        sections,
        priceLow: data.priceLow ?? null,
        priceHigh: data.priceHigh ?? null,
        ...(data.productType ? { productType: data.productType } : {}),
        ...(bindingPayload ? { binding: bindingPayload } : {}),
        world: worldValue,
      };
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

  const patchArray = (field: keyof Pick<EditionUpdate, 'themes' | 'packs' | 'inserts' | 'products'>, ids: string[]) => {
    setSavingSection(field);
    const payload: EditionUpdate = { [field]: ids };
    updateEdition.mutate({ id, data: payload }, {
      onSuccess: () => {
        toast({ title: `${field} updated` });
        queryClient.invalidateQueries({ queryKey: getGetEditionQueryKey(id) });
        setSavingSection(null);
      },
      onError: (err: Error) => {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
        setSavingSection(null);
      }
    });
  };

  if (!isNew && isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const isSaving = createEdition.isPending || updateEdition.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/editions"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Edition' : edition?.name}</h1>
            {!isNew && <p className="text-xs text-muted-foreground font-mono">{id}</p>}
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
        <form>
          <Tabs defaultValue="details" className="space-y-6">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              {!isNew && <TabsTrigger value="content">Content</TabsTrigger>}
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Edition Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {isNew && (
                    <FormField control={form.control} name="id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>ID <span className="text-xs text-muted-foreground">(e.g. e-student-2024)</span></FormLabel>
                        <FormControl><Input {...field} placeholder="e-my-edition" className="font-mono" /></FormControl>
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
                  <FormField control={form.control} name="tier" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tier</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="basic">Basic — PDF only</SelectItem>
                          <SelectItem value="advanced">Advanced — Full live item</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="productType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select product type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="planner">Planner — dated spreads, calendar</SelectItem>
                          <SelectItem value="notebook">Notebook — note sections, no dates</SelectItem>
                          <SelectItem value="journal">Journal — reflection prompts, mood</SelectItem>
                          <SelectItem value="memory-keeping">Memory keeping — photos, mementos</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Controls which studio modes and generator spreads are available.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="world" render={({ field }) => (
                    <FormItem>
                      <FormLabel>World code <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl><Input {...field} placeholder="VGJ" className="font-mono uppercase" /></FormControl>
                      <FormDescription>Link this edition to a WorldSmith world. Use the world's code (e.g. VGJ). Saved in uppercase.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sections" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sections</FormLabel>
                      <FormControl><Input {...field} placeholder="weekly, daily, notes, habit-tracker" /></FormControl>
                      <FormDescription>Comma-separated section names.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="bindingType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Binding type <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="None / unset" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">None / unset</SelectItem>
                            <SelectItem value="coil">Coil</SelectItem>
                            <SelectItem value="twin-loop">Twin-loop wire-o</SelectItem>
                            <SelectItem value="discs">Disc / Arc</SelectItem>
                            <SelectItem value="3-ring">3-ring binder</SelectItem>
                            <SelectItem value="none">Perfect / glue</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="bindingFinish" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Binding finish</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Gold (default)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Gold (default)</SelectItem>
                            <SelectItem value="gold">Gold</SelectItem>
                            <SelectItem value="rose gold">Rose gold</SelectItem>
                            <SelectItem value="silver">Silver</SelectItem>
                            <SelectItem value="matte black">Matte black</SelectItem>
                            <SelectItem value="white">White</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Pricing (USD)</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <FormField control={form.control} name="priceLow" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price Low</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="priceHigh" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price High</FormLabel>
                        <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {!isNew && (
              <TabsContent value="content" className="space-y-4">
                <p className="text-sm text-muted-foreground">Attach catalog items to this edition. Changes are saved per section.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <MultiSelectPicker
                    title="Themes"
                    items={themes.map(t => ({ id: t.id, name: t.name }))}
                    selected={edition?.themes || []}
                    onSave={(ids) => patchArray('themes', ids)}
                    isSaving={savingSection === 'themes'}
                  />
                  <MultiSelectPicker
                    title="Sticker Packs"
                    items={packs.map(p => ({ id: p.id, name: p.name }))}
                    selected={edition?.packs || []}
                    onSave={(ids) => patchArray('packs', ids)}
                    isSaving={savingSection === 'packs'}
                  />
                  <MultiSelectPicker
                    title="Inserts"
                    items={inserts.map(i => ({ id: i.id, name: i.name }))}
                    selected={edition?.inserts || []}
                    onSave={(ids) => patchArray('inserts', ids)}
                    isSaving={savingSection === 'inserts'}
                  />
                  <MultiSelectPicker
                    title="Related Products"
                    items={products.map(p => ({ id: p.id, name: p.name }))}
                    selected={edition?.products || []}
                    onSave={(ids) => patchArray('products', ids)}
                    isSaving={savingSection === 'products'}
                  />
                </div>
              </TabsContent>
            )}
          </Tabs>
        </form>
      </Form>
    </div>
  );
}
