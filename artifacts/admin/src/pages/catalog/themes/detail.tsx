import { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetTheme, useCreateTheme, useUpdateTheme, useDeleteTheme,
  getListThemesQueryKey, getGetThemeQueryKey,
  type Theme, type ThemeInput, type ThemeUpdate
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { Link } from 'wouter';

const COLOR_SLOTS = [
  { key: 'accent', label: 'Accent' },
  { key: 'accent-dark', label: 'Accent Dark' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'tertiary', label: 'Tertiary' },
  { key: 'ink', label: 'Ink' },
  { key: 'paper', label: 'Paper' },
];

const themeSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  desc: z.string().optional(),
  price: z.coerce.number().min(0).default(0),
  color0: z.string().default('#3B82F6'),
  color1: z.string().default('#1D4ED8'),
  color2: z.string().default('#93C5FD'),
  color3: z.string().default('#DBEAFE'),
  color4: z.string().default('#1E3A5F'),
  color5: z.string().default('#F0F9FF'),
});

type ThemeFormValues = z.infer<typeof themeSchema>;

export default function ThemeDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? '' : params.id!;

  const { data: theme, isLoading } = useGetTheme(id, { query: { enabled: !isNew, queryKey: getGetThemeQueryKey(id) } });
  
  const createTheme = useCreateTheme();
  const updateTheme = useUpdateTheme();
  const deleteTheme = useDeleteTheme();

  const form = useForm<ThemeFormValues>({
    resolver: zodResolver(themeSchema),
    defaultValues: {
      id: '', name: '', desc: '', price: 0,
      color0: '#3B82F6', color1: '#1D4ED8', color2: '#93C5FD',
      color3: '#DBEAFE', color4: '#1E3A5F', color5: '#F0F9FF',
    }
  });

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (theme && initializedForId.current !== id) {
      initializedForId.current = id;
      const colors: string[] = theme.colors || [];
      form.reset({
        id: theme.id,
        name: theme.name,
        desc: theme.desc || '',
        price: theme.price || 0,
        color0: colors[0] || '#3B82F6',
        color1: colors[1] || '#1D4ED8',
        color2: colors[2] || '#93C5FD',
        color3: colors[3] || '#DBEAFE',
        color4: colors[4] || '#1E3A5F',
        color5: colors[5] || '#F0F9FF',
      });
    }
  }, [theme, id, form]);

  const onSubmit = (data: ThemeFormValues) => {
    const colors = [data.color0, data.color1, data.color2, data.color3, data.color4, data.color5];

    if (isNew) {
      const payload: ThemeInput = { id: data.id, name: data.name, desc: data.desc, price: data.price, colors };
      createTheme.mutate({ data: payload }, {
        onSuccess: (res) => {
          toast({ title: 'Theme created' });
          queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
          setLocation(`/catalog/themes/${res.id}`);
        },
        onError: (err: Error) => {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
      });
    } else {
      const payload: ThemeUpdate = { name: data.name, desc: data.desc, price: data.price, colors };
      updateTheme.mutate({ id, data: payload }, {
        onSuccess: () => {
          toast({ title: 'Theme updated' });
          queryClient.invalidateQueries({ queryKey: getGetThemeQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
        }
      });
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this theme?')) {
      deleteTheme.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Theme deleted' });
          queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
          setLocation('/catalog/themes');
        }
      });
    }
  };

  if (!isNew && isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const isSaving = createTheme.isPending || updateTheme.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/themes"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Theme' : theme?.name}</h1>
            {!isNew && <p className="text-xs text-muted-foreground font-mono">{id}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete} disabled={deleteTheme.isPending}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isNew && (
                  <FormField control={form.control} name="id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID <span className="text-xs text-muted-foreground">(e.g. t-autumn-2024)</span></FormLabel>
                      <FormControl><Input {...field} placeholder="t-my-theme" className="font-mono" /></FormControl>
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
                <FormField control={form.control} name="desc" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea className="resize-none h-20" {...field} /></FormControl>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Color Palette</CardTitle>
                <CardDescription>6 slots: accent, accent-dark, secondary, tertiary, ink, paper</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {COLOR_SLOTS.map((slot, i) => {
                  const fieldName = `color${i}` as keyof ThemeFormValues;
                  return (
                    <FormField key={slot.key} control={form.control} name={fieldName} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{slot.label}</FormLabel>
                        <div className="flex gap-2">
                          <Input type="color" className="w-12 h-9 p-1 cursor-pointer" {...field} value={field.value as string} />
                          <Input className="flex-1 font-mono text-sm" {...field} value={field.value as string} placeholder="#000000" />
                        </div>
                      </FormItem>
                    )} />
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </form>
      </Form>
    </div>
  );
}
