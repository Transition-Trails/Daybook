import { useListProducts, useUpdateProduct, getListProductsQueryKey, type RelatedProduct, type CatalogStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Globe, EyeOff, Package2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ProductsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: products, isLoading } = useListProducts();
  
  const updateProduct = useUpdateProduct();

  const togglePublish = (id: string, status: string) => {
    const newStatus = status === 'live' ? 'draft' : 'live';
    updateProduct.mutate({ id, data: { status: newStatus as CatalogStatus } }, {
      onSuccess: () => {
        toast({ title: 'Status updated' });
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Related Products</h1>
          <p className="text-muted-foreground mt-1">Companion notebooks and accessory PDFs.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/catalog/products/new">
              <Plus className="w-4 h-4 mr-2" />
              New Product
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Product</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : (products as RelatedProduct[])?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No products found.</TableCell></TableRow>
            ) : (
              (products as RelatedProduct[])?.map(product => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center border"><Package2 className="w-5 h-5 text-muted-foreground" /></div>
                      <div>
                        <div className="font-medium text-foreground">{product.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{product.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase tracking-wider text-[10px]">{product.kind}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-sm">{product.price ? `$${product.price.toFixed(2)}` : 'Free'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.status === 'live' ? 'default' : 'secondary'} className={product.status === 'live' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : ''}>
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => togglePublish(product.id, product.status)} title={product.status === 'live' ? 'Unpublish' : 'Publish'}>
                        {product.status === 'live' ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/catalog/products/${product.id}`}>
                          <Package2 className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
