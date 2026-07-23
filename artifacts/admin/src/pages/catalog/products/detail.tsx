import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import {
  useGetProduct, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useListEditions, getListProductsQueryKey, getGetProductQueryKey,
  type RelatedProductInput, type RelatedProductUpdate, type Edition
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

const productSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  kind: z.string().min(1, 'Kind is required'),
  price: z.coerce.number().min(0).default(0),
  matches: z.string().default(''),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function ProductDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const isNew = !params.id || params.id === 'new';
  const id = isNew ? '' : params.id!;

  const { data: product, isLoading } = useGetProduct(id, { query: { enabled: !isNew, queryKey: getGetProductQueryKey(id) } });
  const { data: editions } = useListEditions();
  
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { id: '', name: '', kind: '', price: 0, matches: '' }
  });

  const initializedForId = useRef<string | null>(null);

  useEffect(() => {
    if (product && initializedForId.current !== id) {
      initializedForId.current = id;
      form.reset({
        id: product.id,
        name: product.name,
        kind: product.kind || '',
        price: product.price || 0,
        matches: (product.matches || []).join(', '),
      });
    }
  }, [product, id, form]);

  const onSubmit = (data: ProductFormValues) => {
    const matches = data.matches ? data.matches.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (isNew) {
      const payload: RelatedProductInput = { id: data.id, name: data.name, kind: data.kind, price: data.price, matches };
      createProduct.mutate({ data: payload }, {
        onSuccess: (res) => {
          toast({ title: 'Product created' });
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setLocation(`/catalog/products/${res.id}`);
        },
        onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' })
      });
    } else {
      const payload: RelatedProductUpdate = { name: data.name, kind: data.kind, price: data.price, matches };
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
  const editionList = (editions || []) as Edition[];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/products"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{isNew ? 'New Product' : product?.name}</h1>
            {!isNew && <p className="text-xs text-muted-foreground font-mono">{id}</p>}
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
            <CardHeader><CardTitle>Product Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isNew && (
                <FormField control={form.control} name="id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID <span className="text-xs text-muted-foreground">(e.g. r-notes-companion)</span></FormLabel>
                    <FormControl><Input {...field} placeholder="r-my-product" className="font-mono" /></FormControl>
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
              <FormField control={form.control} name="kind" render={({ field }) => (
                <FormItem>
                  <FormLabel>Kind</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Notebook · notes" /></FormControl>
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
              <FormField control={form.control} name="matches" render={({ field }) => (
                <FormItem>
                  <FormLabel>Matches (Edition IDs)</FormLabel>
                  <FormControl><Input {...field} placeholder="e-student-2024, e-pro" /></FormControl>
                  <FormDescription>
                    Comma-separated edition IDs this product works best with.
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
