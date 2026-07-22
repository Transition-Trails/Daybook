import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetProduct, useCreateProduct, useUpdateProduct, useDeleteProduct, getListProductsQueryKey, getGetProductQueryKey } from '@workspace/api-client-react';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import { Link } from 'wouter';

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['notes-only', 'to-do', 'tracker', 'mixed']),
  price: z.coerce.number().min(0).optional(),
  previewImageUrl: z.string().url().optional().or(z.literal('')),
});

export default function ProductDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? 0 : parseInt(params.id!);

  const { data: product, isLoading } = useGetProduct(id, { query: { enabled: !isNew, queryKey: getGetProductQueryKey(id) } });
  
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', slug: '', description: '', type: 'notes-only', price: 0, previewImageUrl: '' }
  });

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (product && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        name: product.name,
        slug: product.slug,
        description: product.description || '',
        type: product.type,
        price: product.price ? product.price / 100 : 0,
        previewImageUrl: product.previewImageUrl || ''
      });
    }
  }, [product, id, form]);

  const onSubmit = (data: z.infer<typeof productSchema>) => {
    const payload = {
      ...data,
      price: data.price ? Math.round(data.price * 100) : 0,
    };

    if (isNew) {
      createProduct.mutate({ data: payload }, {
        onSuccess: (res) => {
          toast({ title: 'Product created' });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setLocation(`/catalog/products/${res.id}`);
        }
      });
    } else {
      updateProduct.mutate({ id, data: payload }, {
        onSuccess: () => {
          toast({ title: 'Product updated' });
          queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        }
      });
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this product?')) {
      deleteProduct.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Product deleted' });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setLocation('/catalog/products');
        }
      });
    }
  };

  if (!isNew && isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const isSaving = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/products"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Product' : product?.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDelete} disabled={deleteProduct.isPending}>
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
              <CardTitle>Product Details</CardTitle>
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
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="notes-only">Notes Only</SelectItem>
                        <SelectItem value="to-do">To-Do</SelectItem>
                        <SelectItem value="tracker">Tracker</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (USD)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
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