import { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetTheme, useCreateTheme, useUpdateTheme, useDeleteTheme, getListThemesQueryKey, getGetThemeQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { Link } from 'wouter';

const themeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  coverColor: z.string().optional(),
  accentColor: z.string().optional(),
  palette: z.string().optional(),
  previewImageUrl: z.string().url().optional().or(z.literal('')),
});

export default function ThemeDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? 0 : parseInt(params.id!);

  const { data: theme, isLoading } = useGetTheme(id, { query: { enabled: !isNew, queryKey: getGetThemeQueryKey(id) } });
  
  const createTheme = useCreateTheme();
  const updateTheme = useUpdateTheme();
  const deleteTheme = useDeleteTheme();

  const form = useForm<z.infer<typeof themeSchema>>({
    resolver: zodResolver(themeSchema),
    defaultValues: {
      name: '', slug: '', description: '', category: '', coverColor: '#ffffff', accentColor: '#000000', palette: '{\n  "colors": {}\n}', previewImageUrl: ''
    }
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (theme && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        name: theme.name,
        slug: theme.slug,
        description: theme.description || '',
        category: theme.category || '',
        coverColor: theme.coverColor || '#ffffff',
        accentColor: theme.accentColor || '#000000',
        palette: theme.palette ? JSON.stringify(theme.palette, null, 2) : '{\n  "colors": {}\n}',
        previewImageUrl: theme.previewImageUrl || ''
      });
    }
  }, [theme, id, form]);

  const onSubmit = (data: z.infer<typeof themeSchema>) => {
    let parsedPalette = {};
    try {
      if (data.palette) parsedPalette = JSON.parse(data.palette);
    } catch (e) {
      toast({ title: 'Invalid JSON', description: 'Palette must be valid JSON', variant: 'destructive' });
      return;
    }

    const payload = {
      ...data,
      palette: parsedPalette,
    };

    if (isNew) {
      createTheme.mutate({ data: payload }, {
        onSuccess: (res) => {
          toast({ title: 'Theme created' });
          queryClient.invalidateQueries({ queryKey: getListThemesQueryKey() });
          setLocation(`/catalog/themes/${res.id}`);
        }
      });
    } else {
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
                    <FormControl><Input {...field} placeholder="auto-generated if left blank" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea className="resize-none h-24" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Visuals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <FormField control={form.control} name="coverColor" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Cover Color</FormLabel>
                        <div className="flex gap-2">
                          <Input type="color" className="w-12 h-10 p-1" {...field} />
                          <Input className="flex-1 font-mono" {...field} />
                        </div>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="accentColor" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Accent Color</FormLabel>
                        <div className="flex gap-2">
                          <Input type="color" className="w-12 h-10 p-1" {...field} />
                          <Input className="flex-1 font-mono" {...field} />
                        </div>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="previewImageUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preview Image URL</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      {field.value && <img src={field.value} alt="Preview" className="w-full h-32 object-cover rounded-md mt-2 border" />}
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Palette JSON</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField control={form.control} name="palette" render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea className="font-mono text-sm h-48 resize-none bg-muted/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}