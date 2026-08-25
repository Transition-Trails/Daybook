import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/shared';
import { ordersApi } from '@/lib/api';

export default function OrderDetail() {
  const { id } = useParams();
  const orderId = id ?? '';
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['support-order', orderId],
    queryFn: () => ordersApi.get(orderId),
    enabled: !!orderId,
  });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return <ErrorState message="Couldn’t load this order." onRetry={() => refetch()} />;
  }

  const order = data?.order;
  if (!order) return <EmptyState title="Order not found" description="This order may have been removed." />;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/users"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Order {order.id}</h1>
          <p className="text-sm text-muted-foreground">
            Created {new Date(order.createdAt).toLocaleString()} · platform subscription
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Order summary</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{order.buyerName || order.buyerEmail}</p>
          </div>
          <Badge variant="outline">{order.currency.toUpperCase()}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y divide-border rounded-lg border border-border">
            {order.items.map((item) => (
              <div key={`${item.name}-${item.priceCents}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>{item.name}</span>
                <span className="font-medium tabular-nums">
                  {(item.priceCents / 100).toLocaleString(undefined, { style: 'currency', currency: order.currency.toUpperCase() })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 px-4 py-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {(order.totalCents / 100).toLocaleString(undefined, { style: 'currency', currency: order.currency.toUpperCase() })}
              </span>
            </div>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Store</span><div className="font-mono mt-1">{order.storeId}</div></div>
            <div><span className="text-muted-foreground">Receipt</span><div className="mt-1">{order.receiptSentAt ? `Sent ${new Date(order.receiptSentAt).toLocaleDateString()}` : 'Not sent'}</div></div>
          </div>
          <a href={`mailto:${order.buyerEmail}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            Contact customer <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}